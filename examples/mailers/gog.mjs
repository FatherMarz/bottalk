#!/usr/bin/env node
// Optional Gmail adapter. Authentication stays in the operator's gog setup.
import { spawn } from "node:child_process";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const account = process.env.BOTTALK_EMAIL_ACCOUNT;
if (!account || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account))
  throw new Error("Set BOTTALK_EMAIL_ACCOUNT to the sending account.");
if (
  !message.to ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to) ||
  typeof message.subject !== "string" ||
  typeof message.html !== "string"
)
  throw new Error("The approval email is incomplete.");
const child = spawn(
  process.env.BOTTALK_GOG_BIN || "gog",
  [
    "gmail",
    "send",
    "--account",
    account,
    "--to",
    message.to,
    "--subject",
    message.subject,
    "--body-html",
    message.html,
    "--json",
    "--no-input",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
child.stderr.resume();
child.on("error", () => {
  console.error("Could not start the configured email tool.");
  process.exitCode = 1;
});
child.on("close", (code) => {
  if (code !== 0) {
    console.error(
      "The email tool could not deliver the approval request. Check its local authentication.",
    );
    process.exitCode = 1;
  }
});
