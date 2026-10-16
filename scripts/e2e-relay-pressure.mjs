// Bounded pressure test for a disposable local database; never use the live relay.
import assert from "node:assert/strict";
import { randomBytes, createHash, createHmac } from "node:crypto";
const base = process.env.BOTTALK_BASE;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use an isolated local API.");
const hex = (n) => randomBytes(n).toString("hex");
const started = Date.now();
let requests = 0;
async function api(path, body) {
  requests++;
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, body: await response.json() };
}
const wall = (body) => api("/api/wall", body);
const id = hex(12);
assert.equal((await wall({ action: "create", id })).status, 200);
assert.equal(
  (
    await wall({
      action: "post",
      id: hex(12),
      notes: [{ client_id: hex(16), ct: "fixture" }],
    })
  ).status,
  404,
);
const batches = Array.from({ length: 51 }, () =>
  Array.from({ length: 100 }, () => ({
    client_id: hex(16),
    ct: "opaque bounded pressure fixture",
  })),
);
const results = await Promise.all(
  batches.map((notes) => wall({ action: "post", id, notes })),
);
assert.equal(
  results.filter((r) => r.status === 200).length,
  50,
  "Exactly 5,000 notes may fit under concurrent writes",
);
assert.equal(
  results.filter((r) => r.status === 413).length,
  1,
  "The extra batch must be rejected atomically",
);
const history = await wall({ action: "fetch", id });
assert.equal(history.body.notes.length, 5000);
const stored = history.body.notes[0];
assert.equal(
  (await wall({ action: "post", id, notes: [stored] })).status,
  200,
  "A retry at capacity is idempotent",
);
assert.equal(
  (await wall({ action: "delete", id, client_id: stored.client_id })).status,
  200,
);
assert.equal((await wall({ action: "post", id, notes: [stored] })).status, 200);
assert.equal(
  (await wall({ action: "fetch", id })).body.notes.find(
    (n) => n.client_id === stored.client_id,
  ).ct,
  null,
);
assert.equal(
  (
    await wall({
      action: "post",
      id,
      notes: [{ client_id: hex(16), ct: "another" }],
    })
  ).status,
  413,
  "Deleting cannot reclaim a replayable ID slot",
);
assert.equal(
  (
    await wall({
      action: "post",
      id,
      notes: [...batches[0], { client_id: hex(16), ct: "extra" }],
    })
  ).status,
  413,
);
assert.equal(
  (await wall({ action: "post", id, notes: [stored, stored] })).status,
  400,
);
console.log(
  "PASS: 51 concurrent batches, exactly 5,000 immutable notes, atomic capacity rejection, retries at capacity, durable tombstones, bounded batches.",
);
const approvalId = hex(16),
  token = hex(32),
  decline = hex(32),
  hash = (s) => createHash("sha256").update(s).digest("hex");
assert.equal(
  (
    await api("/api/approval", {
      action: "create",
      id: approvalId,
      roomId: id,
      ct: "encrypted approval fixture",
      tokenHash: hash(token),
      declineHash: hash(decline),
      expiresAt: Date.now() + 60000,
    })
  ).status,
  200,
);
assert.equal(
  (
    await api("/api/approval", {
      action: "decide",
      id: approvalId,
      decision: "approved",
      token: hex(32),
    })
  ).status,
  403,
);
assert.equal(
  (
    await api("/api/approval", {
      action: "decide",
      id: approvalId,
      decision: "approved",
      token: decline,
    })
  ).status,
  403,
  "Decline links cannot approve",
);
const races = await Promise.all(
  Array.from({ length: 80 }, (_, i) =>
    api("/api/approval", {
      action: "decide",
      id: approvalId,
      decision: i % 2 ? "approved" : "declined",
      token: i % 2 ? token : decline,
    }),
  ),
);
assert.ok(races.every((r) => r.status === 200));
const decisions = new Set(races.map((r) => r.body.status));
assert.equal(
  decisions.size,
  1,
  "All concurrent decisions must observe the same winner",
);
const final = (await api("/api/approval", { action: "get", id: approvalId }))
  .body;
assert.equal(
  final.receipt,
  createHmac("sha256", final.status === "approved" ? token : decline)
    .update(`${approvalId}|${final.status}`)
    .digest("hex"),
);
assert.equal(
  (
    await api("/api/approval", {
      action: "decide",
      id: approvalId,
      decision: final.status === "approved" ? "declined" : "approved",
      token: final.status === "approved" ? decline : token,
    })
  ).body.status,
  final.status,
);
console.log(
  `PASS: 80 competing approval decisions, one verifiable winner, wrong-token rejection. ${requests} local requests in ${((Date.now() - started) / 1000).toFixed(2)}s.`,
);
