// Integration verification: isolated local API, fictional contacts, stub agent, no email.
import assert from "node:assert/strict";
import {
  mkdtempSync,
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
  throw new Error("Set BOTTALK_BASE to the isolated local test API.");
const directory = mkdtempSync(join(tmpdir(), "bottalk-e2e-v2-"));
const cli = resolve("client/bottalk.mjs");
const project = directory;
const runner = join(directory, "runner.mjs");
const runsFile = join(directory, "runs.txt");
writeFileSync(
  runner,
  `#!/usr/bin/env node\nimport {appendFileSync} from 'node:fs';\nappendFileSync(process.env.E2E_RUNS, process.argv[process.argv.indexOf('--permission-mode') + 1] + '\\n');\nconsole.log(JSON.stringify({result:'The requested work is complete.',session_id:'test-session'}));\n`,
  { mode: 0o755 },
);
const config = (name) => ({
  ...process.env,
  BOTTALK_BASE: base,
  BOTTALK_PUSH: "off",
  BOTTALK_LINE_POLL: "0.15",
  BOTTALK_NO_BROWSER: "1",
  BOTTALK_CLAUDE: runner,
  E2E_RUNS: runsFile,
  BOTTALK_LINES: join(directory, `${name}.json`),
  BOTTALK_WALL_STATE: join(directory, `${name}-wall.json`),
  BOTTALK_APPROVALS: join(directory, `${name}-approvals.json`),
});
const a = config("a");
const b = config("b");
function run(env, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    env,
    encoding: "utf8",
    timeout: 25000,
  });
  assert.equal(
    result.status,
    0,
    `${args[0]} failed: ${result.stderr || result.error}`,
  );
  return result.stdout;
}
const request = async (path, body) => {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test, label) {
  for (let i = 0; i < 80; i++) {
    if (await test()) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
const count = () =>
  existsSync(runsFile)
    ? readFileSync(runsFile, "utf8").trim().split("\n").length
    : 0;
let listener;
const listeners = [];
function start() {
  const child = spawn(process.execPath, [cli, "listen"], {
    env: b,
    stdio: ["ignore", "pipe", "pipe"],
  });
  listeners.push(child);
  let output = "";
  child.stderr.on("data", (data) => (output += data));
  child.on("exit", (code) => {
    if (code !== null && code !== 0 && code !== 143) console.error(output);
  });
  return child;
}
function approval(text = "Deploy the reviewed change.", hours) {
  const args = [
    "approval",
    text,
    "--project",
    "demo",
    "--resume",
    "Perform only the approved change.",
  ];
  if (hours) args.push("--hours", hours);
  return JSON.parse(run(b, ...args));
}
function parts(mail, decision = "Approve") {
  const line = mail.email.text
    .split("\n")
    .find((line) => line.startsWith(decision + ": "));
  const [id, room, key, token] = new URL(line.slice(decision.length + 2)).hash
    .slice(1)
    .split(".");
  return { id, room, key, token };
}
try {
  const created = run(
    a,
    "new",
    "Integration room",
    "--as",
    "aster",
    "--contact",
    "orbit",
  );
  const link = created.match(/https?:\/\/\S+\/room#[^\s]+/)[0];
  run(
    b,
    "join",
    link,
    "--as",
    "orbit",
    "--contact",
    "aster",
    "--project",
    "demo",
    "--folder",
    project,
  );
  assert.match(run(a, "contacts"), /orbit/);
  listener = start();
  await sleep(250);
  // The CLI wait runs in a separate process so the test can keep serving async work.
  const call = spawn(
    process.execPath,
    [
      cli,
      "call",
      "orbit",
      "Read the project.",
      "--project",
      "demo",
      "--timeout",
      "8",
    ],
    { env: a },
  );
  let answer = "";
  call.stdout.on("data", (chunk) => (answer += chunk));
  const exit = await new Promise((resolve) => call.on("exit", resolve));
  assert.equal(exit, 0, answer);
  assert.match(answer, /requested work is complete/);
  assert.equal(count(), 1);
  assert.equal(
    readFileSync(runsFile, "utf8").trim(),
    "plan",
    "normal calls must use the read-only conversation runner",
  );
  run(a, "say", "@orbit this is context, not an assignment");
  await sleep(500);
  assert.equal(count(), 1, "an informational mention must not execute work");
  run(a, "call", "orbit", "Not shared.", "--project", "private", "--no-wait");
  await sleep(500);
  assert.equal(count(), 1, "unshared projects must not run");
  const mail = approval();
  const approved = parts(mail);
  const declined = parts(mail, "Decline");
  let state = await request("/api/approval", {
    action: "get",
    id: approved.id,
  });
  assert.equal(state.body.status, "pending");
  const original = state.body.ct;
  const duplicate = await request("/api/approval", {
    action: "create",
    id: approved.id,
    roomId: approved.room,
    tokenHash: "a".repeat(64),
    declineHash: "b".repeat(64),
    ct: original,
    expiresAt: Date.now() + 10000,
  });
  assert.equal(duplicate.status, 409);
  const wrong = await request("/api/approval", {
    action: "decide",
    id: approved.id,
    token: declined.token,
    decision: "approved",
  });
  assert.equal(wrong.status, 403, "decline link cannot approve");
  const decision = await request("/api/approval", {
    action: "decide",
    id: approved.id,
    token: approved.token,
    decision: "approved",
  });
  assert.equal(decision.body.status, "approved");
  const repeat = await request("/api/approval", {
    action: "decide",
    id: approved.id,
    token: declined.token,
    decision: "declined",
  });
  assert.equal(repeat.body.status, "approved", "the first decision wins");
  await until(() => count() === 2, "approved continuation");
  await until(
    () =>
      JSON.parse(readFileSync(b.BOTTALK_APPROVALS)).find(
        (item) => item.id === approved.id,
      ).state === "finished",
    "approval consumption",
  );
  state = await request("/api/approval", { action: "get", id: approved.id });
  assert.equal(state.body.ct, original);
  listener.kill("SIGTERM");
  await new Promise((resolve) => listener.once("exit", resolve));
  listener = start();
  await sleep(600);
  assert.equal(
    count(),
    2,
    "listener restart must not replay consumed approval",
  );
  assert.equal(
    readFileSync(runsFile, "utf8").trim(),
    "plan\nauto",
    "only the approved continuation uses execution permissions",
  );
  const no = parts(approval("Do not execute this."), "Decline");
  await request("/api/approval", {
    action: "decide",
    id: no.id,
    token: no.token,
    decision: "declined",
  });
  await until(
    () =>
      JSON.parse(readFileSync(b.BOTTALK_APPROVALS)).find(
        (item) => item.id === no.id,
      ).state === "declined",
    "decline",
  );
  assert.equal(count(), 2);
  const expired = parts(approval("Expired action.", "0.0001"));
  await sleep(500);
  const late = await request("/api/approval", {
    action: "decide",
    id: expired.id,
    token: expired.token,
    decision: "approved",
  });
  assert.equal(late.body.status, "expired");
  await sleep(400);
  assert.equal(count(), 2, "expired requests must not run");
  run(
    a,
    "call",
    "orbit",
    "Perform the explicitly delegated change.",
    "--project",
    "demo",
    "--work",
    "--no-wait",
  );
  await until(() => count() === 3, "explicit delegated task");
  assert.equal(readFileSync(runsFile, "utf8").trim(), "plan\nauto\nauto");
  console.log(
    "PASS: room setup, contacts, named calls, encrypted messages, context-only mentions, project access, immutable approvals, decision-specific tokens, first-decision wins, approval resume, restart replay prevention, decline, expiry.",
  );
} finally {
  for (const child of listeners) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  await sleep(200);
  rmSync(directory, { recursive: true, force: true });
}
