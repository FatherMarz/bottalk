// Interactive-mode e2e: drives the TTY chat flow (BOTTALK_TTY=1) through
// pipes. Caller places a call and rings; callee answers with the bare
// passphrase, approves with "y", and the two sides stream messages live.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BOTTALK_BASE ?? "http://localhost:3210";
const CLI = fileURLToPath(new URL("../client/bottalk.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "bottalk-tty-"));

function ok(cond, name, detail = "") {
  if (!cond) {
    console.error(`FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`  ok: ${name}`);
}

function child(state, args) {
  const p = spawn("node", [CLI, ...args], {
    env: { ...process.env, BOTTALK_BASE: BASE, BOTTALK_STATE: join(dir, state), BOTTALK_TTY: "1", BOTTALK_NO_BROWSER: "1" },
  });
  p.buf = "";
  p.stdout.on("data", (d) => (p.buf += d.toString()));
  p.stderr.on("data", (d) => (p.buf += d.toString()));
  p.waitFor = (pattern, ms = 20_000) =>
    new Promise((resolve, reject) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (pattern.test(p.buf)) {
          clearInterval(iv);
          resolve(true);
        } else if (Date.now() - t0 > ms) {
          clearInterval(iv);
          reject(new Error(`timeout waiting for ${pattern} in:\n${p.buf}`));
        }
      }, 100);
    });
  return p;
}

console.log(`interactive e2e against ${BASE}\n`);

// Caller places the call and starts ringing.
const caller = child("caller.json", ["call", "--from", "Lenny"]);
await caller.waitFor(/ {4}([a-z]+ [a-z]+ [a-z]+ [a-z]+)/);
const phrase = caller.buf.match(/ {4}([a-z]+ [a-z]+ [a-z]+ [a-z]+)/)[1];
ok(true, `caller ringing with passphrase "${phrase}"`);
await caller.waitFor(/Ringing/);

// Callee answers with the BARE passphrase (no subcommand) and approves.
const callee = child("callee.json", phrase.split(" "));
await callee.waitFor(/Accept the call\? \(y\/n\)/);
ok(callee.buf.includes("Lenny"), "callee sees who is calling before approving");
callee.stdin.write("y\n");

// Both sides land in the live line.
await caller.waitFor(/Call accepted/);
await caller.waitFor(/Line open/);
await callee.waitFor(/Line open/);
ok(true, "both sides live after y");

// Callee types; the text streams into the caller's session.
callee.stdin.write("hey, streaming works\n");
await caller.waitFor(/\[them\] hey, streaming works/);
ok(true, "callee -> caller streams live");

// Caller types back; streams to callee.
caller.stdin.write("confirmed on this side too\n");
await callee.waitFor(/\[them\] confirmed on this side too/);
ok(true, "caller -> callee streams live");

caller.kill("SIGKILL");
callee.kill("SIGKILL");

// Cleanup the server-side call (state files survived the SIGKILL).
const hang = child("caller.json", ["hangup"]);
await new Promise((r) => hang.on("exit", r));

console.log("\ninteractive e2e passed");
process.exit(0);
