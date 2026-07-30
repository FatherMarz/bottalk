// End-to-end: drives two CLI child processes (caller + callee) through a full
// call lifecycle against a live stack. No browser, no test runner.
//
// Local:  docker pg on :5544 + `DEV_PG=1 DATABASE_URL=... npx tsx scripts/dev-api.ts`
//         then: BOTTALK_BASE=http://localhost:3210 DATABASE_URL=... node scripts/e2e.mjs
// Prod:   BOTTALK_BASE=https://bottalk.modul4r.com node scripts/e2e.mjs
//         (DB-tamper + ciphertext checks need DATABASE_URL and are skipped without it)
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BOTTALK_BASE ?? "http://localhost:3210";
const DB = process.env.DATABASE_URL ?? null;
const CLI = fileURLToPath(new URL("../client/bottalk.mjs", import.meta.url));

const dir = mkdtempSync(join(tmpdir(), "bottalk-e2e-"));
const CALLER = join(dir, "caller.json");
const CALLEE = join(dir, "callee.json");
const OTHER = join(dir, "other.json");

let passed = 0;
function ok(cond, name, detail = "") {
  if (!cond) {
    console.error(`FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok: ${name}`);
}

function run(state, args, { input } = {}) {
  const res = spawnSync("node", [CLI, ...args], {
    env: { ...process.env, BOTTALK_BASE: BASE, BOTTALK_STATE: state, BOTTALK_NO_BROWSER: "1" },
    input,
    encoding: "utf8",
    timeout: 120_000,
  });
  return { code: res.status, out: (res.stdout ?? "") + (res.stderr ?? "") };
}

async function pg(query, params = []) {
  const { default: pkg } = await import("pg");
  const client = new pkg.Client({ connectionString: DB });
  await client.connect();
  const res = await client.query(query, params);
  await client.end();
  return res.rows;
}

function placeCall(label) {
  const r = run(CALLER, ["call", "--from", "Lenny"]);
  ok(r.code === 0, `call created (${label})`, r.out);
  const m = r.out.match(/^\s{4}([a-z]+(?: [a-z]+){3})\s*$/m);
  ok(!!m, "passphrase printed", r.out);
  return m[1];
}

console.log(`e2e against ${BASE} (db checks: ${DB ? "on" : "off"})\n`);

// --- lifecycle: call -> answer -> accept -> chat both ways -------------------
const phrase = placeCall("e2e roundtrip");

let r = run(CALLEE, ["answer", phrase]);
ok(r.code === 0 && r.out.includes("Lenny"), "answer shows decrypted intro", r.out);

r = run(CALLEE, ["accept"]);
ok(r.code === 0 && r.out.includes("Line open"), "accept", r.out);

r = run(CALLER, ["wait", "--timeout", "15"]);
ok(r.code === 0 && r.out.includes("Call accepted"), "caller sees accept", r.out);

const uni = "hello from caller - ünïcode ✨ 你好";
r = run(CALLER, ["send", uni]);
ok(r.code === 0, "caller send", r.out);
r = run(CALLEE, ["wait", "--timeout", "15"]);
ok(r.code === 0 && r.out.includes(`[them] ${uni}`), "callee receives exact unicode", r.out);

r = run(CALLEE, ["send", "reply queued for say"]);
ok(r.code === 0, "callee queues a reply", r.out);
r = run(CALLER, ["say", "one-turn ping", "--timeout", "10"]);
ok(r.code === 0 && r.out.includes("Sent.") && r.out.includes("[them] reply queued for say"), "say = send + wait in one command", r.out);
r = run(CALLEE, ["wait", "--timeout", "15"]);
ok(r.code === 0 && r.out.includes("[them] one-turn ping"), "say's message landed", r.out);

const big = "B".repeat(10_000);
r = run(CALLEE, ["send", "-"], { input: big });
ok(r.code === 0, "callee sends 10KB via stdin", r.out);
r = run(CALLER, ["wait", "--timeout", "15"]);
ok(r.code === 0 && r.out.includes(big), "caller receives 10KB intact", r.out);

// --- guards ------------------------------------------------------------------
r = run(CALLER, ["send", "X".repeat(20_000)]);
ok(r.code === 1 && /too big/i.test(r.out), "oversize send rejected", r.out);

r = run(OTHER, ["zebra", "zebra", "zebra", "zebra"]);
ok(r.code === 4 && /No live call/.test(r.out), "wrong phrase -> no live call", r.out);

r = run(OTHER, phrase.split(" "));
ok(r.code === 4 && /already answered/.test(r.out), "duplicate answer rejected", r.out);

if (DB) {
  const rows = await pg("SELECT body FROM messages");
  ok(rows.length > 0, "messages stored");
  ok(
    rows.every((row) => !row.body.includes("hello from caller") && !row.body.includes("BBBB")),
    "server stores ciphertext only",
  );

  // --- tamper: corrupt the newest message, peer must refuse it ---------------
  r = run(CALLER, ["send", "tamper target"]);
  ok(r.code === 0, "tamper target sent", r.out);
  await pg(`UPDATE messages SET body = overlay(body placing '####' from 24) WHERE id = (SELECT max(id) FROM messages)`);
  r = run(CALLEE, ["wait", "--timeout", "10"]);
  ok(r.code === 5 && /TAMPERING/.test(r.out), "tampered message -> exit 5", r.out);
  rmSync(CALLEE, { force: true }); // that line is burned; clean up for the next act
  run(CALLER, ["hangup"]);
} else {
  run(CALLER, ["hangup"]);
  rmSync(CALLEE, { force: true });
  console.log("  (skipped db-backed tamper/ciphertext checks - no DATABASE_URL)");
}

// --- hangup propagation --------------------------------------------------------
const phrase2 = placeCall("e2e hangup");
r = run(CALLEE, ["answer", phrase2]);
ok(r.code === 0, "second call answered", r.out);
r = run(CALLEE, ["accept"]);
ok(r.code === 0, "second call accepted", r.out);
r = run(CALLER, ["wait", "--timeout", "15"]);
ok(r.code === 0, "caller sees second accept", r.out);

r = run(CALLER, ["hangup"]);
ok(r.code === 0 && r.out.includes("Hung up"), "caller hangs up", r.out);
ok(!existsSync(CALLER), "caller state deleted on hangup");

r = run(CALLEE, ["wait", "--timeout", "15"]);
ok(r.code === 3 && /(hung up|Call ended)/.test(r.out), "callee sees hangup, exit 3", r.out);
ok(!existsSync(CALLEE), "callee state deleted after hangup");

// --- decline path ---------------------------------------------------------------
const phrase3 = placeCall("e2e decline");
r = run(CALLEE, ["answer", phrase3]);
ok(r.code === 0, "third call answered", r.out);
r = run(CALLEE, ["decline", "--reason", "busy right now"]);
ok(r.code === 0 && r.out.includes("Declined"), "callee declines", r.out);
r = run(CALLER, ["wait", "--timeout", "15"]);
ok(r.code === 3 && r.out.includes("busy right now"), "caller sees decline reason, exit 3", r.out);

// --- stats counters -------------------------------------------------------------
const st = await fetch(`${BASE}/api/stats`).then((r) => r.json());
ok(st.totals.calls_created >= 3 && st.totals.calls_answered >= 3, "stats counted calls", JSON.stringify(st.totals));

console.log(`\nall ${passed} checks passed`);
