// Thread isolation against an isolated local relay. No real model or email.
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
const dir = mkdtempSync(join(tmpdir(), "bottalk-threads-"));
const cli = resolve("client/bottalk.mjs");
const log = join(dir, "runner.jsonl");
const runner = join(dir, "runner.mjs");
writeFileSync(
  runner,
  `#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
const args = process.argv.slice(2);
const value = {thread:process.env.BOTTALK_THREAD, prompt:args[args.indexOf('-p')+1], mode:args[args.indexOf('--permission-mode')+1], resume:args.includes('--resume') ? args[args.indexOf('--resume')+1] : null};
appendFileSync(process.env.E2E_LOG, JSON.stringify({...value,type:'start',ts:Date.now()})+'\\n');
await new Promise(resolve => setTimeout(resolve,1200));
appendFileSync(process.env.E2E_LOG,JSON.stringify({...value,type:'finish',ts:Date.now()})+'\\n');
console.log(JSON.stringify({result:'Reply in '+value.thread,session_id:'session-'+value.thread}));
`,
  { mode: 0o755 },
);
const config = (name) => ({
  ...process.env,
  BOTTALK_BASE: base,
  BOTTALK_NO_BROWSER: "1",
  BOTTALK_PUSH: "off",
  BOTTALK_LINE_POLL: "0.08",
  BOTTALK_CLAUDE: runner,
  E2E_LOG: log,
  BOTTALK_LINES: join(dir, `${name}.json`),
  BOTTALK_WALL_STATE: join(dir, `${name}-wall.json`),
  BOTTALK_APPROVALS: join(dir, `${name}-approvals.json`),
});
const a = config("a"),
  b = config("b");
function run(env, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    env,
    encoding: "utf8",
    timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function records() {
  return existsSync(log)
    ? readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label) {
  for (let i = 0; i < 120; i++) {
    if (predicate()) return;
    await delay(80);
  }
  throw new Error("Timed out: " + label);
}
let listener;
try {
  const link = run(
    a,
    "new",
    "Team room",
    "--as",
    "aster",
    "--contact",
    "orbit",
  ).match(/https?:\/\/\S+\/room#[^\s]+/)[0];
  run(b, "join", link, "--as", "orbit", "--contact", "aster");
  run(b, "share", "site", dir);
  run(b, "share", "app", dir);
  run(a, "thread", "new", "Website", "--project", "site");
  run(a, "say", "SITE_CONTEXT_ONLY");
  run(a, "thread", "new", "Mobile", "--project", "app");
  run(a, "say", "APP_CONTEXT_ONLY");
  const listing = run(a, "threads");
  assert.match(listing, /Website/);
  assert.match(listing, /Mobile/);
  const website = listing
    .split("\n")
    .find((line) => line.includes("  Website"))
    .split(" ")[0];
  const mobile = listing
    .split("\n")
    .find((line) => line.includes("  Mobile"))
    .split(" ")[0];
  const websiteText = run(a, "read", "--thread", "Website");
  assert.match(websiteText, /SITE_CONTEXT_ONLY/);
  assert.doesNotMatch(websiteText, /APP_CONTEXT_ONLY/);
  const appText = run(a, "read", "--thread", "Mobile");
  assert.match(appText, /APP_CONTEXT_ONLY/);
  assert.doesNotMatch(appText, /SITE_CONTEXT_ONLY/);
  run(b, "update", "Website ready.", "--state", "done", "--thread", "Website");
  run(b, "update", "App planning.", "--state", "ready", "--thread", "Mobile");
  assert.doesNotMatch(run(a, "read", "--thread", "Website"), /App planning/);
  run(
    a,
    "call",
    "orbit",
    "Discuss the website.",
    "--project",
    "site",
    "--no-wait",
  );
  run(a, "call", "orbit", "Discuss the app.", "--project", "app", "--no-wait");
  run(b, "thread", "use", "Mobile");
  run(
    { ...b, BOTTALK_LINE: "aster", BOTTALK_THREAD: website },
    "say",
    "Website worker update.",
  );
  assert.match(run(b, "read"), /APP_CONTEXT_ONLY/);
  assert.doesNotMatch(run(b, "read"), /Website worker update/);
  listener = spawn(process.execPath, [cli, "listen"], {
    env: b,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let error = "";
  listener.stderr.on("data", (chunk) => (error += chunk));
  await until(
    () => records().filter((r) => r.type === "start").length === 2,
    "independent conversations start",
  );
  assert.equal(
    records().filter((r) => r.type === "finish").length,
    0,
    "different threads must not wait for the first conversation to finish",
  );
  const initial = records().filter((r) => r.type === "start");
  assert.match(
    initial.find((r) => r.thread === website).prompt,
    /SITE_CONTEXT_ONLY/,
  );
  assert.doesNotMatch(
    initial.find((r) => r.thread === website).prompt,
    /APP_CONTEXT_ONLY/,
  );
  assert.match(
    initial.find((r) => r.thread === mobile).prompt,
    /APP_CONTEXT_ONLY/,
  );
  assert.doesNotMatch(
    initial.find((r) => r.thread === mobile).prompt,
    /SITE_CONTEXT_ONLY/,
  );
  assert.ok(initial.every((r) => r.mode === "plan" && r.resume === null));
  await until(
    () => records().filter((r) => r.type === "finish").length === 2,
    "independent replies",
  );
  await delay(200);
  assert.match(
    run(a, "read", "--thread", "Website"),
    new RegExp("Reply in " + website),
  );
  assert.doesNotMatch(
    run(a, "read", "--thread", "Website"),
    new RegExp("Reply in " + mobile),
  );
  run(
    a,
    "call",
    "orbit",
    "Continue the website discussion.",
    "--project",
    "site",
    "--no-wait",
  );
  await until(
    () => records().filter((r) => r.type === "start").length === 3,
    "resume same thread",
  );
  assert.equal(
    records().filter((r) => r.type === "start")[2].resume,
    "session-" + website,
  );
  await until(
    () => records().filter((r) => r.type === "finish").length === 3,
    "resumed answer",
  );
  await delay(200);
  run(a, "thread", "new", "Website review", "--project", "site");
  run(a, "say", "REVIEW_CONTEXT_ONLY");
  run(
    a,
    "call",
    "orbit",
    "Review only.",
    "--thread",
    "Website review",
    "--project",
    "site",
    "--no-wait",
  );
  await until(
    () => records().filter((r) => r.type === "start").length === 4,
    "new discussion of same project",
  );
  const review = records().filter((r) => r.type === "start")[3];
  assert.equal(review.resume, null);
  assert.match(review.prompt, /REVIEW_CONTEXT_ONLY/);
  assert.doesNotMatch(review.prompt, /SITE_CONTEXT_ONLY/);
  await until(
    () => records().filter((r) => r.type === "finish").length === 4,
    "review answer",
  );
  await delay(200);
  // Same project, different threads: edits must not overlap.
  run(
    a,
    "call",
    "orbit",
    "Do assigned site work.",
    "--thread",
    "Website",
    "--work",
    "--no-wait",
  );
  run(
    a,
    "call",
    "orbit",
    "Do assigned review work.",
    "--thread",
    "Website review",
    "--work",
    "--no-wait",
  );
  await until(
    () => records().filter((r) => r.type === "finish").length === 6,
    "serialized edits",
  );
  const work = records().filter((r) => r.mode === "auto");
  assert.equal(work.length, 4);
  assert.equal(work[0].type, "start");
  assert.equal(work[1].type, "finish");
  assert.equal(work[2].type, "start");
  assert.ok(work[2].ts >= work[1].ts);
  // A decision belongs only to its originating thread, even when the project is shared.
  const mail = JSON.parse(
    run(
      b,
      "approval",
      "Approve the website action.",
      "--project",
      "site",
      "--thread",
      "Website",
      "--resume",
      "Do the approved website action.",
    ),
  );
  const requestId = mail.approvalId;
  const local = JSON.parse(readFileSync(b.BOTTALK_APPROVALS, "utf8")).find(
    (item) => item.id === requestId,
  );
  assert.equal(local.thread, website);
  assert.match(
    run(a, "read", "--thread", "Website"),
    /Approve the website action/,
  );
  assert.doesNotMatch(
    run(a, "read", "--thread", "Mobile"),
    /Approve the website action/,
  );
  const token = new URL(
    mail.email.text
      .split("\n")
      .find((line) => line.startsWith("Approve: "))
      .slice(9),
  ).hash
    .slice(1)
    .split(".")[3];
  await fetch(base + "/api/approval", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "decide",
      id: requestId,
      token,
      decision: "approved",
    }),
  });
  await until(
    () => records().filter((r) => r.type === "start").length === 7,
    "approved action in its thread",
  );
  assert.equal(
    records()
      .filter((r) => r.type === "start")
      .at(-1).thread,
    website,
  );
  await until(
    () => records().filter((r) => r.type === "finish").length === 7,
    "approval complete",
  );
  assert.equal(error, "");
  console.log(
    "PASS: multiple projects per contact, independent histories and status, concurrent conversations, isolated model sessions, same-project discussion threads, serialized edits, thread-scoped approval and resume.",
  );
} finally {
  listener?.kill("SIGTERM");
  await delay(200);
  rmSync(dir, { recursive: true, force: true });
}
