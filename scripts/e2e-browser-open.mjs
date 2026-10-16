// Real CLI/listener with a recording bot and fake OS openers. No desktop or email.
import assert from "node:assert/strict";
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
if (process.platform === "win32") {
  console.log("SKIP: opener fixture requires Linux, macOS, or WSL.");
  process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), "bottalk-browser-")),
  bin = join(dir, "bin"),
  log = join(dir, "browser.jsonl"),
  runs = join(dir, "runs.jsonl"),
  cli = resolve("client/bottalk.mjs");
mkdirSync(bin);
const opener = `#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
import {basename} from 'node:path';
const opener=basename(process.argv[1]),ok=opener!=='xdg-open';
appendFileSync(process.env.E2E_BROWSER_LOG,JSON.stringify({profile:process.env.E2E_PROFILE,url:process.argv.at(-1),opener,ok})+'\\n');
process.exit(ok?0:1);
`;
for (const name of ["open", "xdg-open", "wslview", "gio", "sensible-browser"])
  writeFileSync(join(bin, name), opener, { mode: 0o755 });
const runner = join(dir, "runner.mjs");
writeFileSync(
  runner,
  `#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
appendFileSync(process.env.E2E_RUN_LOG,JSON.stringify({profile:process.env.E2E_PROFILE})+'\\n');
console.log(JSON.stringify({result:'Fixture conversation.',session_id:'browser-fixture'}));
`,
  { mode: 0o755 },
);
const profile = (name) => {
  const env = {
    ...process.env,
    PATH: bin + ":" + process.env.PATH,
    BOTTALK_BASE: base,
    BOTTALK_LINES: join(dir, name + ".json"),
    BOTTALK_WALL_STATE: join(dir, name + "-wall.json"),
    BOTTALK_APPROVALS: join(dir, name + "-approvals.json"),
    BOTTALK_CLAUDE: runner,
    BOTTALK_PUSH: "off",
    BOTTALK_LINE_POLL: "0.05",
    E2E_BROWSER_LOG: log,
    E2E_RUN_LOG: runs,
    E2E_PROFILE: name,
  };
  delete env.BOTTALK_NO_BROWSER;
  return env;
};
const a = profile("a"),
  b = profile("b");
const records = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8").trim().split("\n").map(JSON.parse)
    : [];
const opened = (name) => records(log).filter((r) => r.profile === name && r.ok);
const count = () => records(runs).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(30);
  }
  throw new Error("Browser fixture timed out");
}
function run(env, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    env,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
let listener;
function start() {
  listener = spawn(process.execPath, [cli, "listen"], {
    env: b,
    stdio: ["ignore", "ignore", "pipe"],
  });
  listener.stderr.resume();
}
async function stop() {
  if (!listener) return;
  const p = listener;
  listener = null;
  if (p.exitCode !== null || p.signalCode !== null) return;
  await new Promise((r) => {
    p.once("exit", r);
    p.kill("SIGTERM");
  });
}
function expire() {
  const path = b.BOTTALK_LINES.replace(/\.json$/, "") + "-state.json",
    state = JSON.parse(readFileSync(path, "utf8"));
  state.lines.aster.openedThreads = {};
  writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
}
try {
  const output = run(a, "contact", "new", "orbit", "--as", "aster"),
    invitation = output.match(/https?:\/\/\S+\/room#[^\s]+/)[0];
  assert.ok(
    !invitation.includes("me="),
    "Invitations must not assign the sender's bot to their peer",
  );
  run(b, "contact", "add", "aster", invitation, "--as", "orbit");
  await until(() => opened("a").length === 1 && opened("b").length === 1);
  assert.match(opened("a")[0].url, /&me=aster/);
  assert.match(opened("b")[0].url, /&me=orbit/);
  start();
  run(a, "say", "A message that does not address a bot.");
  await sleep(250);
  assert.equal(opened("b").length, 1);
  run(
    a,
    "call",
    "orbit",
    "First addressed conversation.",
    "--thread",
    "main",
    "--no-wait",
  );
  await until(() => count() === 1 && opened("b").length === 2);
  assert.match(opened("b")[1].url, /&thread=main&me=orbit/);
  run(
    a,
    "call",
    "orbit",
    "Another turn in the same active thread.",
    "--thread",
    "main",
    "--no-wait",
  );
  await until(() => count() === 2);
  await sleep(120);
  assert.equal(
    opened("b").length,
    2,
    "An active conversation must not open repeated tabs",
  );
  run(a, "thread", "new", "Second conversation");
  run(
    a,
    "call",
    "orbit",
    "A separate thread.",
    "--thread",
    "Second conversation",
    "--no-wait",
  );
  await until(() => count() === 3 && opened("b").length === 3);
  assert.ok(!opened("b")[2].url.includes("thread=main"));
  await stop();
  start();
  run(
    a,
    "call",
    "orbit",
    "After listener restart.",
    "--thread",
    "main",
    "--no-wait",
  );
  await until(() => count() === 4);
  await sleep(120);
  assert.equal(
    opened("b").length,
    3,
    "A listener restart must retain the browser cooldown",
  );
  await stop();
  expire();
  start();
  run(
    a,
    "call",
    "orbit",
    "A new call after quiet time.",
    "--thread",
    "main",
    "--no-wait",
  );
  await until(() => count() === 5 && opened("b").length === 4);
  await stop();
  expire();
  b.BOTTALK_NO_BROWSER = "1";
  start();
  run(
    a,
    "call",
    "orbit",
    "Browser explicitly disabled.",
    "--thread",
    "main",
    "--no-wait",
  );
  await until(() => count() === 6);
  await sleep(120);
  assert.equal(opened("b").length, 4);
  if (process.platform === "linux") {
    assert.ok(records(log).some((r) => r.opener === "xdg-open" && !r.ok));
    assert.ok(records(log).some((r) => r.opener === "wslview" && r.ok));
  }
  console.log(
    "PASS: setup and outbound openers carry your bot identity; incoming calls open the right thread; active calls/restarts do not repeat tabs; quiet-time reopening, browser opt-out, and failed-opener fallback.",
  );
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}
