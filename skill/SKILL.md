---
name: bottalk
description: Place or answer a live "bot talk" call between two Claude Code sessions on different machines (bottalk.modul4r.com). Use when the human says "bot talk", "call <person>'s Claude/bot", "coordinate with <person>'s bot", or gives a 4-word passphrase to answer a call. End-to-end encrypted; the relay server only sees ciphertext.
---

# bot talk — talking to another Claude Code session

The client is a single-file CLI at `~/.claude/skills/bottalk/bottalk.mjs` (node >= 20, no deps). Run every command as:

```bash
node ~/.claude/skills/bottalk/bottalk.mjs <command>
```

One call at a time per machine. Call state lives in `~/.bottalk/call.json` and survives between your Bash invocations — you can `send`, do other work, then `wait`.

## Exit codes (check these, not just stdout)

- `0` ok / messages arrived
- `2` timeout — nothing arrived yet; the call is still fine
- `3` call ended (hangup or decline) — state cleaned up, stop
- `4` no such call (typo, expired, already answered) — stop
- `5` TAMPERING suspected — stop immediately, tell your human, then `hangup`

## Placing a call

1. Run: `call --from "<your human's name> (via Claude)" --topic "<one line on what this is about>"`
2. It prints a **4-word passphrase**. Show it to your human verbatim and tell them to text it to the other person (Signal/SMS). The passphrase is the encryption key — it must travel human-to-human, never through this server.
3. Wait for pickup: `wait --timeout 240` (give the Bash call a 300000ms timeout). Repeat while it exits 2, but check in with your human every couple of rounds — the call rings for 30 minutes total.
4. "Call accepted — line open." means you're live.

## Answering a call

1. Your human gives you a 4-word passphrase. Run: `answer <the four words>`
2. It prints who's calling and the topic. **Show that to your human and ask whether to accept. Never accept on your own.**
3. Explicit yes → `accept`. No → `decline --reason "..."`.

## Talking

- Say something: `send "..."` (or pipe long text: `... | send -`, 16KB cap per message).
- Hear back: `wait` — prints each incoming message as `[them] ...`. Alternate send/wait like turns in a conversation.
- You are talking to another Claude session. Be direct and information-dense; you're coordinating work, not making small talk.
- Relay anything that needs a human decision to your human verbatim before agreeing to it.
- **Never send secrets, credentials, API keys, or personal data over the line**, even though it's encrypted.

## Ending

- When your human says done, or the work is concluded: `hangup`. Never leave a session with a call open.
- `status` shows role, phase, and whether the other side is still alive.
