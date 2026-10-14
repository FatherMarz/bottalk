// End-to-end check for lines: two people on one machine, a stand-in for
// Claude Code, and the listener. Needs a running API (BOTTALK_BASE).
//   BOTTALK_BASE=http://localhost:3210 node scripts/e2e-line.mjs
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "bottalk.mjs");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "bottalk-line-")));
// E2E_PUSH=1 tests the real ntfy wake-up: the slow poll is set too long to help.
const base = process.env.E2E_PUSH
  ? { ...process.env, BOTTALK_NO_BROWSER: "1", BOTTALK_LINE_POLL: "600" }
  : { ...process.env, BOTTALK_NO_BROWSER: "1", BOTTALK_PUSH: "off", BOTTALK_LINE_POLL: "1" };
const A = { ...base, BOTTALK_LINES: join(tmp, "a", "lines.json") };
const B = { ...base, BOTTALK_LINES: join(tmp, "b", "lines.json") };

const project = join(tmp, "demo");
mkdirSync(project);

// Stand-in for `claude -p`: posts one action, then answers with its folder.
const fake = join(tmp, "fake-claude.mjs");
writeFileSync(
  fake,
  `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2);
const prompt = args[args.indexOf("-p") + 1];
const mode = args[args.indexOf("--permission-mode") + 1];
const resume = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : "none";
execFileSync(process.execPath, [${JSON.stringify(CLI)}, "line", "post", "edited README.md"], { stdio: "ignore" });
const msg = prompt.split("\\n").at(-1);
console.log(JSON.stringify({ result: "answer to: " + msg + " | cwd=" + process.cwd() + " | mode=" + mode + " | resume=" + resume, session_id: "sess-1", is_error: false }));
`,
);
chmodSync(fake, 0o755);

const run = (env, ...args) => execFileSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" });
let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     ${detail}`}`);
  if (!ok) failed++;
};

const created = run(A, "line", "new", "--me", "aster", "--name", "orbit");
const link = /https?:\/\/\S+\/room#\S+/.exec(created)?.[0];
check("line new prints a link", Boolean(link), created);
run(B, "line", "join", link, "--me", "orbit", "--name", "aster");
run(A, "line", "share", "demo", project);
check("share is recorded", JSON.parse(readFileSync(A.BOTTALK_LINES, "utf8")).lines.orbit.projects.demo.path === project);

const listener = spawn(process.execPath, [CLI, "line", "listen"], { env: { ...A, BOTTALK_CLAUDE: fake }, stdio: "pipe" });
let listenLog = "";
listener.stdout.on("data", (d) => (listenLog += d));
listener.stderr.on("data", (d) => (listenLog += d));
await new Promise((r) => setTimeout(r, 2500)); // let it prime on the old notes

try {
  const out1 = run(B, "line", "ask", "aster", "what is in the readme?", "--timeout", "30");
  check("bot starts", out1.includes('started on "demo"'), out1);
  check("bot posts its action", out1.includes("edited README.md"), out1);
  check("bot answers from the shared folder", out1.includes("answer to: what is in the readme?") && out1.includes(`cwd=${project}`), out1);
  check("default mode is auto", out1.includes("mode=auto"), out1);

  const out2 = run(B, "line", "ask", "aster", "second question", "--timeout", "30");
  check("second ask resumes the same bot session", out2.includes("resume=sess-1"), out2);

  const out3 = run(B, "line", "ask", "aster", "read the secrets", "--project", "private", "--timeout", "30");
  check("unshared project is refused", out3.includes('has not shared "private"') && out3.includes("Shared projects: demo"), out3);

  // A human on the web page writes "@aster demo: ..." with no fields.
  run(B, "line", "post", "@aster demo: from the web page");
  await new Promise((r) => setTimeout(r, 4000));
  check("web-style @ note is answered", listenLog.includes("from the web page"), listenLog);

  const out4 = run(B, "line", "ask", "orbit", "talk to yourself", "--timeout", "4") ;
  check("an ask to someone else is ignored", false, out4);
} catch (e) {
  // The last ask must time out (exit 2): nobody runs a listener for orbit here.
  check("an ask to someone else is ignored", e.status === 2, String(e.stdout ?? e));
} finally {
  listener.kill();
}

console.log(failed ? `\n${failed} failed` : "\nall line checks passed");
process.exit(failed ? 1 : 0);
