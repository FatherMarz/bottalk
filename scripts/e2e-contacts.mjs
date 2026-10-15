// Address-book persistence and project-free conversation. Isolated relay and stub worker only.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
const base = process.env.BOTTALK_BASE;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Set BOTTALK_BASE to the isolated local test API.");
const dir = mkdtempSync(join(tmpdir(), "bottalk-contacts-"));
const cli = resolve("client/bottalk.mjs"),
  log = join(dir, "runs.jsonl"),
  runner = join(dir, "runner.mjs");
writeFileSync(
  runner,
  `#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
const args=process.argv.slice(2);
appendFileSync(process.env.E2E_LOG,JSON.stringify({mode:args[args.indexOf('--permission-mode')+1],cwd:process.cwd(),prompt:args[args.indexOf('-p')+1],resume:args.includes('--resume')})+'\\n');
console.log(JSON.stringify({result:'Contact conversation answered.',session_id:'contact-session'}));
`,
  { mode: 0o755 },
);
const env = (name) => ({
  ...process.env,
  BOTTALK_BASE: base,
  BOTTALK_NO_BROWSER: "1",
  BOTTALK_PUSH: "off",
  BOTTALK_LINE_POLL: "0.08",
  BOTTALK_CLAUDE: runner,
  E2E_LOG: log,
  BOTTALK_LINES: join(dir, name + ".json"),
  BOTTALK_WALL_STATE: join(dir, name + "-wall.json"),
  BOTTALK_APPROVALS: join(dir, name + "-approvals.json"),
});
const a = env("a"),
  b = env("b"),
  c = env("c");
const run = (env, ...args) => {
  const r = spawnSync(process.execPath, [cli, ...args], {
    env,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const fail = (env, ...args) => {
  const r = spawnSync(process.execPath, [cli, ...args], {
    env,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.notEqual(r.status, 0);
  return r.stderr;
};
const records = () =>
  existsSync(log)
    ? readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
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
  await new Promise((resolve) => {
    p.once("exit", resolve);
    p.kill("SIGTERM");
  });
}
async function call(text, ...args) {
  const p = spawn(
    process.execPath,
    [cli, "call", "orbit", text, "--timeout", "8", ...args],
    { env: a, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  p.stdout.on("data", (chunk) => (output += chunk));
  p.stderr.on("data", (chunk) => (output += chunk));
  const code = await new Promise((resolve) => p.on("exit", resolve));
  assert.equal(code, 0, output);
  return output;
}
try {
  const created = run(a, "contact", "new", "orbit", "--as", "aster");
  const invitation = created.match(/https?:\/\/\S+\/room#[^\s]+/)[0];
  run(b, "contact", "add", invitation, "--as", "orbit");
  assert.match(run(b, "contacts"), /aster/);
  assert.match(run(a, "contact", "list"), /orbit/);
  assert.equal(statSync(a.BOTTALK_LINES).mode & 0o777, 0o600);
  start();
  assert.match(await call("Say hello."), /Contact conversation answered/);
  assert.equal(records()[0].mode, "plan");
  assert.match(records()[0].cwd, /conversations/);
  assert.match(records()[0].prompt, /No project folder is shared/);
  await stop();
  start();
  assert.match(
    await call("Continue our conversation."),
    /Contact conversation answered/,
  );
  assert.equal(
    records()[1].resume,
    true,
    "conversation survives listener restart",
  );
  const count = records().length;
  await call("Do work without project access.", "--work");
  assert.equal(
    records().length,
    count,
    "saving a contact must not grant work access",
  );
  run(b, "share", "site", dir, "--contact", "aster");
  const configured = JSON.parse(readFileSync(b.BOTTALK_LINES, "utf8"));
  configured.lines.aster.email = "owner@example.com";
  configured.lines.aster.mailer = "/example/local-mailer";
  writeFileSync(b.BOTTALK_LINES, JSON.stringify(configured), { mode: 0o600 });
  run(b, "contact", "add", "ASTER", invitation);
  const restored = JSON.parse(readFileSync(b.BOTTALK_LINES, "utf8"));
  assert.deepEqual(
    restored.lines.aster.projects,
    configured.lines.aster.projects,
  );
  assert.equal(restored.lines.aster.email, configured.lines.aster.email);
  assert.equal(restored.lines.aster.mailer, configured.lines.aster.mailer);
  assert.equal(restored.identity.name, "orbit");
  assert.equal(
    Object.keys(restored.lines).length,
    1,
    "same invitation does not duplicate a contact",
  );
  const other = run(c, "contact", "new", "aster", "--as", "nova").match(
    /https?:\/\/\S+\/room#[^\s]+/,
  )[0];
  const before = readFileSync(b.BOTTALK_LINES, "utf8"),
    wallBefore = readFileSync(b.BOTTALK_WALL_STATE, "utf8");
  assert.match(
    fail(b, "contact", "add", "aster", other),
    /already saved with another invitation/,
  );
  assert.equal(readFileSync(b.BOTTALK_LINES, "utf8"), before);
  assert.equal(readFileSync(b.BOTTALK_WALL_STATE, "utf8"), wallBefore);
  assert.match(fail(a, "contact", "new", "ORBIT"), /already saved/);
  run(a, "contact", "new", "nova");
  const book = JSON.parse(readFileSync(a.BOTTALK_LINES, "utf8"));
  assert.equal(book.lines.orbit.me, "aster");
  assert.equal(book.lines.nova.me, "aster");
  assert.notEqual(
    book.lines.orbit.id,
    book.lines.nova.id,
    "contacts keep separate invitations",
  );
  run(a, "contact", "remove", "NOVA");
  assert.match(run(a, "contacts"), /orbit/);
  assert.doesNotMatch(run(a, "contacts"), /nova/);
  console.log(
    "PASS: persistent contacts, remembered identity, invitation-only peer discovery, no-project conversation, read-only permissions, session restart, no implicit project access, idempotent import, protected existing contacts, multiple contacts, explicit removal.",
  );
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}
