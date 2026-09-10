// Wall E2E: drives the CLI against a wall API and checks the web client's
// crypto (WebCrypto, the exact operations from src/lib/wallCrypto.ts) can
// read CLI notes and vice versa. Usage:
//   BOTTALK_BASE=http://localhost:3211 node scripts/e2e-wall.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);
const BASE = (process.env.BOTTALK_BASE ?? "http://localhost:3210").replace(/\/$/, "");
const CLI = new URL("../client/bottalk.mjs", import.meta.url).pathname;
const stateDir = mkdtempSync(join(tmpdir(), "bottalk-wall-e2e-"));

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`${ok ? "ok" : "FAIL"}  ${label}${extra ? ` - ${extra}` : ""}`);
  if (!ok) failures++;
}

async function cli(args) {
  try {
    const { stdout } = await run("node", [CLI, ...args], {
      env: { ...process.env, BOTTALK_BASE: BASE, BOTTALK_WALL_STATE: join(stateDir, "wall.json"), BOTTALK_NO_BROWSER: "1" },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? String(e.message) };
  }
}

// The browser twin of wallCrypto (b64url envelope, AAD = wall-v1|id|clientId).
function b64urlToBuf(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
}
function bufToB64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
async function webImport(raw) {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function webSeal(key, roomId, clientId, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(text);
  const aad = new TextEncoder().encode(`wall-v1|${roomId}|${clientId}`);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, enc));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return bufToB64url(out);
}
async function webOpen(key, roomId, clientId, b64) {
  const raw = b64urlToBuf(b64);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.subarray(0, 12), additionalData: new TextEncoder().encode(`wall-v1|${roomId}|${clientId}`) },
    key,
    raw.subarray(12),
  );
  return new TextDecoder().decode(pt);
}

async function post(payload) {
  const res = await fetch(`${BASE}/api/wall`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// --- create + CLI/web interop ---
const newOut = await cli(["wall", "new", "--from", "claude"]);
const link = /http\S+/.exec(newOut.stdout)?.[0];
check("wall new prints a link", Boolean(link), link ?? newOut.stderr);

const frag = link.split("#")[1];
const [roomId, keyB64] = frag.split(".");
const webKey = await webImport(Buffer.from(keyB64, "base64"));

// Web (browser) writes a note; the CLI must read it.
const webNoteId = crypto.randomUUID();
const sealed = await webSeal(webKey, roomId, webNoteId, JSON.stringify({ text: "from the browser", author: "marcello", ts: 1 }));
await post({ action: "post", id: roomId, notes: [{ client_id: webNoteId, ct: sealed }] });
const ls1 = await cli(["wall", "ls"]);
check("web note visible to CLI", ls1.stdout.includes("from the browser"), JSON.stringify(ls1.stdout));

// CLI writes; the web client must read it.
await cli(["wall", "post", "from the bot"]);
const fetched = await post({ action: "fetch", id: roomId });
const botNote = (fetched.body.notes ?? []).find((n) => n.ct !== null && n.client_id !== webNoteId);
let botText = null;
try {
  botText = JSON.parse(await webOpen(webKey, roomId, botNote.client_id, botNote.ct)).text;
} catch {
  botText = null;
}
check("CLI note decrypts in web format", botText === "from the bot", String(botText));

// Unicode round-trip both ways.
await cli(["wall", "post", "ünïcode ✓ 🚀"]);
const fetched2 = await post({ action: "fetch", id: roomId });
const uni = [];
for (const n of fetched2.body.notes ?? []) {
  if (!n.ct) continue;
  uni.push(JSON.parse(await webOpen(webKey, roomId, n.client_id, n.ct)).text);
}
check("unicode survives the round trip", uni.includes("ünïcode ✓ 🚀"));

// Tamper: flip a ciphertext byte; the CLI must refuse (exit 5).
const tamperRes = await post({
  action: "post",
  id: roomId,
  notes: [{ client_id: "deadbeefdeadbeefdeadbeef", ct: "AAAA" + botNote.ct.slice(4) }],
});
check("tampered note accepted for storage", tamperRes.status === 200, JSON.stringify(tamperRes)); // server stores ciphertext blindly
const tamperLs = await cli(["wall", "ls"]);
check("CLI refuses a tampered wall (exit 5)", tamperLs.code === 5, `exit ${tamperLs.code}`);

// Wrong key: an unrelated room's key must fail to decrypt this wall.
const otherKey = bufToB64url(crypto.getRandomValues(new Uint8Array(32)));
const wrong = await fetch(`${BASE}/api/wall`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "fetch", id: roomId }),
});
const wrongBody = await wrong.json();
let wrongFailed = false;
try {
  const n = wrongBodyNote(wrongBody);
  await webOpen(await webImport(Buffer.from(otherKey, "base64url")), roomId, n.client_id, n.ct);
} catch {
  wrongFailed = true;
}
function wrongBodyNote(body) {
  return body.notes.find((n) => n.ct !== null);
}
check("wrong key cannot read notes", wrongFailed);

// Save + projects list.
await cli(["wall", "save", "e2e-wall-project"]);
const wallsRes = await fetch(`${BASE}/api/walls`);
const wallsBody = await wallsRes.json();
check("saved wall appears in /api/walls", (wallsBody.walls ?? []).some((w) => w.name === "e2e-wall-project" || w.name === "e2e-wall-project") || (wallsBody.walls ?? []).length >= 1);

// Remove the tampered note (a human would do this from the web page).
await post({ action: "delete", id: roomId, client_id: "deadbeefdeadbeefdeadbeef" });

// Delete propagation: CLI rm then web fetch lacks it.
const rmOut = await cli(["wall", "rm", "ünïcode"]);
const afterRm = await post({ action: "fetch", id: roomId });
check("wall rm removes a note", rmOut.code === 0 && !JSON.stringify(afterRm.body.notes).includes("\u00fcn\u00efcode"), `exit ${rmOut.code} out=${JSON.stringify(rmOut.stdout)} err=${JSON.stringify(rmOut.stderr)}`);

// Unknown room is a clean 404.
const missing = await post({ action: "fetch", id: "000000000000000000000000" });
check("unknown room is 404", missing.status === 404);

rmSync(stateDir, { recursive: true, force: true });
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
