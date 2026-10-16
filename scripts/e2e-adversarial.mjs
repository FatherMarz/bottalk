// Adversarial regression probes. Never run against the public relay or a real worker.
import assert from "node:assert/strict";
import { randomBytes, createCipheriv } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
const base = process.env.BOTTALK_BASE;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use an isolated local API.");
const root = mkdtempSync(join(tmpdir(), "bottalk-adversarial-"));
const cli = resolve("client/bottalk.mjs");
const runner = join(root, "runner.mjs");
writeFileSync(
  runner,
  `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args=process.argv.slice(2);
appendFileSync(process.env.E2E_LOG,JSON.stringify({args,cwd:process.cwd(),prompt:args[args.indexOf('-p')+1],resume:args.includes('--resume')})+'\\n');
console.log(JSON.stringify({result:'Recorded test turn.',session_id:'isolated-session'}));
`,
  { mode: 0o755 },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const processes = new Set();
async function probe(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (e) {
    failures.push(name);
    console.error(`FAIL: ${name}: ${e.message}`);
  }
}
async function api(path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const wall = (body) => api("/api/wall", body);
async function room() {
  const l = {
    id: randomBytes(12).toString("hex"),
    key: randomBytes(32).toString("base64url"),
    me: "orbit",
    projects: {},
  };
  assert.equal((await wall({ action: "create", id: l.id })).status, 200);
  return l;
}
function seal(l, id, obj) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", Buffer.from(l.key, "base64url"), iv);
  c.setAAD(Buffer.from(`wall-v1|${l.id}|${id}`));
  return Buffer.concat([
    iv,
    c.update(JSON.stringify(obj)),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
async function note(l, data, id = randomBytes(16).toString("hex")) {
  const ct = seal(l, id, { author: "aster", ts: Date.now(), ...data });
  assert.equal(
    (await wall({ action: "post", id: l.id, notes: [{ client_id: id, ct }] }))
      .status,
    200,
  );
  return { id, ct };
}
const turn = (text) => ({
  kind: "turn",
  protocol: 2,
  to: "orbit",
  text,
  intent: "conversation",
  thread: "main",
});
function profile(name, lines) {
  const dir = join(root, name);
  mkdirSync(dir);
  const env = {
    ...process.env,
    BOTTALK_BASE: base,
    BOTTALK_LINES: join(dir, "lines.json"),
    BOTTALK_WALL_STATE: join(dir, "wall.json"),
    BOTTALK_APPROVALS: join(dir, "approvals.json"),
    BOTTALK_CLAUDE: runner,
    BOTTALK_PUSH: "off",
    BOTTALK_LINE_POLL: "0.05",
    BOTTALK_NO_BROWSER: "1",
    E2E_LOG: join(dir, "runs.jsonl"),
  };
  const save = (lines) =>
    writeFileSync(
      env.BOTTALK_LINES,
      JSON.stringify({ v: 1, identity: { name: "orbit" }, lines }),
    );
  save(lines);
  return {
    env,
    save,
    dir,
    records: () =>
      existsSync(env.E2E_LOG)
        ? readFileSync(env.E2E_LOG, "utf8").trim().split("\n").map(JSON.parse)
        : [],
  };
}
function command(p, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    env: p.env,
    encoding: "utf8",
    timeout: 15000,
  });
}
function start(p) {
  const child = spawn(process.execPath, [cli, "listen"], {
    env: p.env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.resume();
  processes.add(child);
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((r) => {
    child.once("exit", r);
    child.kill("SIGTERM");
  });
  processes.delete(child);
}
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(40);
  }
  throw new Error("condition timed out");
}
try {
  await probe(
    "concurrent access changes preserve every grant and revocation",
    async () => {
      const l = await room();
      l.projects.removed = { path: root, mode: "auto" };
      l.email = "owner@example.com";
      const p = profile("concurrent-config", { aster: l });
      const commands = Array.from({ length: 20 }, (_, i) => [
        "share",
        `project-${i}`,
        root,
        "--contact",
        "aster",
      ]);
      commands.push(["unshare", "removed", "--contact", "aster"]);
      await Promise.all(
        commands.map(
          (args) =>
            new Promise((resolve, reject) => {
              const child = spawn(process.execPath, [cli, ...args], {
                env: p.env,
                stdio: ["ignore", "ignore", "pipe"],
              });
              let err = "";
              child.stderr.on("data", (chunk) => (err += chunk));
              child.on("error", reject);
              child.on("exit", (code) =>
                code === 0 ? resolve() : reject(new Error(err)),
              );
            }),
        ),
      );
      const saved = JSON.parse(readFileSync(p.env.BOTTALK_LINES, "utf8")).lines
        .aster;
      assert.equal(Object.keys(saved.projects).length, 20);
      assert.ok(!Object.hasOwn(saved.projects, "removed"));
      assert.equal(saved.email, l.email);
    },
  );
  await probe("note IDs cannot be overwritten or resurrected", async () => {
    const l = await room(),
      id = randomBytes(16).toString("hex");
    await note(l, turn("Original"), id);
    const original = (await wall({ action: "fetch", id: l.id })).body.notes[0]
      .ct;
    await wall({
      action: "post",
      id: l.id,
      notes: [{ client_id: id, ct: "replacement" }],
    });
    assert.equal(
      (await wall({ action: "fetch", id: l.id })).body.notes[0].ct,
      original,
      "relay overwrote an existing note",
    );
    await wall({ action: "delete", id: l.id, client_id: id });
    await wall({
      action: "post",
      id: l.id,
      notes: [{ client_id: id, ct: original }],
    });
    assert.equal(
      (await wall({ action: "fetch", id: l.id })).body.notes[0].ct,
      null,
      "relay resurrected a tombstone",
    );
  });
  await probe("deleted work cannot execute a second time", async () => {
    const l = await room();
    l.projects.site = { path: root, mode: "auto" };
    const p = profile("replay", { aster: l });
    const n = await note(l, {
      ...turn("Count this delegated job once."),
      intent: "task",
      project: "site",
    });
    const child = start(p);
    await until(() => p.records().length === 1);
    await sleep(180);
    await wall({ action: "delete", id: l.id, client_id: n.id });
    await sleep(260);
    await wall({
      action: "post",
      id: l.id,
      notes: [{ client_id: n.id, ct: n.ct }],
    });
    await sleep(450);
    await stop(child);
    assert.equal(p.records().length, 1, "same delegated request ran twice");
  });
  await probe(
    "replacing a contact never resumes the previous contact's session",
    async () => {
      const l = await room(),
        replacement = await room(),
        p = profile("sessions", { aster: l });
      let child = start(p);
      await note(l, turn("First contact's private context."));
      await until(() => p.records().length === 1);
      await sleep(180);
      await stop(child);
      p.save({ aster: replacement });
      await note(replacement, turn("New unrelated contact."));
      child = start(p);
      await until(() => p.records().length === 2);
      await stop(child);
      assert.equal(
        p.records()[1].resume,
        false,
        "old session passed to a different room",
      );
    },
  );
  await probe(
    "duplicate contact aliases cannot execute a job twice",
    async () => {
      const l = await room(),
        p = profile("aliases", { aster: l, alias: l }),
        child = start(p);
      await note(l, turn("One request across two aliases."));
      await until(() => p.records().length > 0);
      await sleep(500);
      await stop(child);
      assert.equal(
        p.records().length,
        1,
        "same room executed through two contact names",
      );
    },
  );
  await probe(
    "re-pairing a contact keeps its durable execution ledger",
    async () => {
      const l = await room(),
        p = profile("re-pair", { aster: { ...l, pairing: "first" } });
      await note(l, turn("Already answered turn."));
      let child = start(p);
      await until(() => p.records().length === 1);
      await sleep(180);
      await stop(child);
      p.save({ renamed: { ...l, pairing: "second" } });
      child = start(p);
      await sleep(350);
      await stop(child);
      assert.equal(
        p.records().length,
        1,
        "re-pairing replayed the old room history",
      );
    },
  );
  await probe(
    "encrypted payloads cannot replace transport request IDs",
    async () => {
      const l = await room(),
        p = profile("transport-ids", { aster: l });
      await note(l, {
        ...turn("First request."),
        clientId: "forged-shared-id",
      });
      await note(l, {
        ...turn("Second distinct request."),
        clientId: "forged-shared-id",
      });
      const child = start(p);
      await until(() => p.records().length === 2);
      await stop(child);
    },
  );
  await probe(
    "conversation workers have a restricted tool configuration",
    async () => {
      const l = await room(),
        p = profile("runner-policy", { aster: l });
      await note(l, turn("Discuss only."));
      const child = start(p);
      await until(() => p.records().length === 1);
      await stop(child);
      const args = p.records()[0].args;
      for (const flag of [
        "--restricted",
        "--safe-mode",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--permission-prompts",
        "--no-chrome",
      ])
        assert.ok(args.includes(flag), `Missing ${flag}`);
      assert.equal(args[args.indexOf("--tools") + 1], "");
      assert.equal(args[args.indexOf("--mcp-config") + 1], '{"mcpServers":{}}');
    },
  );
  await probe("a poisoned room cannot stop a healthy contact", async () => {
    const bad = await room(),
      good = await room(),
      p = profile("poison", { bad, good });
    await wall({
      action: "post",
      id: bad.id,
      notes: [
        { client_id: randomBytes(16).toString("hex"), ct: "bad ciphertext" },
      ],
    });
    await note(good, turn("Healthy contact still answers."));
    const child = start(p);
    try {
      await until(() => p.records().length === 1, 2500);
    } finally {
      await stop(child);
    }
  });
  await probe(
    "ciphertext is bound to its room and transport note ID",
    async () => {
      const source = await room(),
        payload = await note(source, turn("PRIVATE CRYPTO FIXTURE"));
      const target = await room();
      target.key = source.key;
      await wall({
        action: "post",
        id: target.id,
        notes: [{ client_id: payload.id, ct: payload.ct }],
      });
      const crossRoom = profile("cross-room-crypto", { aster: target });
      assert.equal(
        command(crossRoom, "read", "--contact", "aster").status,
        5,
        "Ciphertext replayed into another room must fail verification",
      );
      await wall({
        action: "post",
        id: source.id,
        notes: [{ client_id: randomBytes(16).toString("hex"), ct: payload.ct }],
      });
      const crossId = profile("cross-note-crypto", { aster: source });
      assert.equal(
        command(crossId, "read", "--contact", "aster").status,
        5,
        "Ciphertext replayed under another note ID must fail verification",
      );
    },
  );
  await probe("approval shows its full continuation in the email", async () => {
    const l = await room();
    l.projects.site = { path: root, mode: "auto" };
    const p = profile("email", { aster: l });
    const r = command(
      p,
      "approval",
      "Review the draft",
      "--resume",
      "EXACT CONTINUATION CANARY",
      "--project",
      "site",
      "--contact",
      "aster",
    );
    assert.equal(r.status, 0, r.stderr);
    const email = JSON.parse(r.stdout).email;
    assert.ok(
      email.text.includes("EXACT CONTINUATION CANARY") &&
        email.html.includes("EXACT CONTINUATION CANARY"),
      "executable continuation is hidden",
    );
  });
  for (const change of ["room", "folder", "mode", "grant", "pairing", "action"])
    await probe(`approval cannot follow a changed ${change}`, async () => {
      const l = await room();
      l.projects.site = { path: root, mode: "auto" };
      const p = profile("approval-" + change, { aster: l });
      const r = command(
        p,
        "approval",
        "A specific test action",
        "--resume",
        "Record the approved test action.",
        "--project",
        "site",
        "--contact",
        "aster",
      );
      assert.equal(r.status, 0, r.stderr);
      const entry = JSON.parse(
        readFileSync(p.env.BOTTALK_APPROVALS, "utf8"),
      )[0];
      assert.equal(
        (
          await api("/api/approval", {
            action: "decide",
            id: entry.id,
            token: entry.token,
            decision: "approved",
          })
        ).status,
        200,
      );
      const replacement = change === "room" ? await room() : structuredClone(l);
      replacement.projects = {
        site: {
          path: change === "folder" ? p.dir : root,
          mode: change === "mode" ? "plan" : "auto",
        },
      };
      if (change === "grant")
        replacement.projects.site.grant = "replacement-access-grant";
      if (change === "pairing") replacement.pairing = "replacement-pairing";
      if (change === "action")
        writeFileSync(
          p.env.BOTTALK_APPROVALS,
          JSON.stringify([
            { ...entry, resume: "A different unreviewed action." },
          ]),
        );
      p.save({ aster: replacement });
      const child = start(p);
      await sleep(650);
      await stop(child);
      assert.equal(
        p.records().length,
        0,
        "approval executed against changed local authorization",
      );
    });
  await probe(
    "approved continuation has a fresh session and no room history",
    async () => {
      const l = await room();
      l.projects.site = { path: root, mode: "auto" };
      const p = profile("approval-context", { aster: l });
      await note(l, {
        ...turn("OLD ROOM INSTRUCTION CANARY"),
        intent: "task",
        project: "site",
      });
      let child = start(p);
      await until(() => p.records().length === 1);
      await sleep(180);
      await stop(child);
      const r = command(
        p,
        "approval",
        "Reviewed action",
        "--resume",
        "EXACT REVIEWED CONTINUATION",
        "--project",
        "site",
        "--contact",
        "aster",
      );
      assert.equal(r.status, 0, r.stderr);
      const entry = JSON.parse(
        readFileSync(p.env.BOTTALK_APPROVALS, "utf8"),
      )[0];
      await api("/api/approval", {
        action: "decide",
        id: entry.id,
        token: entry.token,
        decision: "approved",
      });
      child = start(p);
      await until(() => p.records().length === 2);
      await stop(child);
      assert.equal(p.records()[1].resume, false);
      assert.ok(!p.records()[1].prompt.includes("OLD ROOM INSTRUCTION CANARY"));
      assert.ok(p.records()[1].prompt.includes("EXACT REVIEWED CONTINUATION"));
    },
  );
  await probe("malformed JSON values return client errors", async () => {
    for (const path of ["/api/wall", "/api/approval", "/api/stats"])
      for (const body of [null, "null", [], "{", 42]) {
        const result = await api(path, body);
        assert.ok(
          result.status >= 400 && result.status < 500,
          `${path}: ${JSON.stringify(body)} returned ${result.status}`,
        );
      }
  });
} finally {
  for (const child of processes) await stop(child);
  rmSync(root, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`${failures.length} adversarial probes failed.`);
  process.exitCode = 1;
} else
  console.log(
    "All adversarial probes passed using isolated rooms and a recording worker.",
  );
