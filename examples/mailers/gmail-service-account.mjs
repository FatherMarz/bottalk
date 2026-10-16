#!/usr/bin/env node
// Optional Gmail adapter for Google Workspace service accounts with
// domain-wide delegation. No dependencies. The key file never leaves this machine.
//
// Key file: BOTTALK_SA_KEY, then GOOGLE_APPLICATION_CREDENTIALS,
// then ~/.bottalk/google-service-account.json.
// Sender: BOTTALK_EMAIL_ACCOUNT, or the recipient (the owner emails themself).
// The service account needs the https://www.googleapis.com/auth/gmail.send scope.
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
if (
  !EMAIL.test(message.to || "") ||
  typeof message.subject !== "string" ||
  typeof message.text !== "string"
)
  throw new Error("The approval email is incomplete.");

const keyFile = [
  process.env.BOTTALK_SA_KEY,
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  join(homedir(), ".bottalk", "google-service-account.json"),
].find((file) => file && existsSync(file));
if (!keyFile) throw new Error("No service account key file was found.");
const key = JSON.parse(readFileSync(keyFile, "utf8"));
const sender = process.env.BOTTALK_EMAIL_ACCOUNT || message.to;
if (!EMAIL.test(sender)) throw new Error("The sending account is not an email address.");

const b64url = (value) => Buffer.from(value).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
  JSON.stringify({
    iss: key.client_email,
    sub: sender,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 600,
  }),
)}`;
const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${unsigned}.${signature}`,
  }),
});
if (!tokenResponse.ok) {
  console.error(`Google refused the service account (${tokenResponse.status}). Check domain-wide delegation and the gmail.send scope.`);
  process.exit(1);
}
const { access_token } = await tokenResponse.json();

// Encoded headers keep non-ASCII subjects intact.
const mime = [
  `From: ${sender}`,
  `To: ${message.to}`,
  `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`,
  "MIME-Version: 1.0",
  'Content-Type: text/plain; charset="UTF-8"',
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from(message.text).toString("base64"),
].join("\r\n");
const sendResponse = await fetch(
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
  {
    method: "POST",
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: b64url(mime) }),
  },
);
if (!sendResponse.ok) {
  console.error(`Gmail did not send the approval request (${sendResponse.status}).`);
  process.exit(1);
}
