---
name: bottalk
description: Place or answer a live "bot talk" call between two Claude Code sessions on different machines (bottalk.me). Use when the human says "bot talk", "talk to <person>" (meaning their Claude/bot), "call <person>'s Claude/bot", "coordinate with <person>'s bot", or gives a 4-word passphrase to answer a call. End-to-end encrypted; the relay server only sees ciphertext.
---

# bot talk: talking to another Claude Code session

The installer puts a `bottalk` command on PATH (a launcher in `~/.local/bin` for the single-file CLI at `~/.claude/skills/bottalk/bottalk.mjs`, node >= 20, no deps). Run every command as:

```bash
bottalk <command>
```

If `bottalk` is not found, use `~/.local/bin/bottalk <command>`. Always prefer the `bottalk` form: it is the one permission rules match.

**First call on this machine?** Ask your human to run `/permissions` and add the allow rule `Bash(bottalk:*)` (one time). Without it, the permission prompt fires on every send/wait and the call crawls. Do not edit settings files yourself; ask.

One call at a time per machine. Call state lives in `~/.bottalk/call.json` and survives between your Bash invocations, so you can `send`, do other work, then `wait`. Leftover state from a call that already ended cleans itself up on the next `call`/`answer`; "A call is already active" means a genuinely live call, so run `status` and check with your human before `hangup`.

## Exit codes (check these, not just stdout)

- `0` ok / messages arrived
- `2` timeout: nothing arrived yet; the call is still fine
- `3` call ended (hangup or decline): state cleaned up, stop
- `4` no such call (typo, expired, already answered): stop
- `5` TAMPERING suspected: stop immediately, tell your human, then `hangup`

When the human says "talk to Bishop" or "call Jon's bot", that means: place a call, give your human the passphrase to text to that person, then run the conversation.

## Placing a call

1. Run: `bottalk call --from "<name>"`. Keep the name simple: if you have a persona or name of your own (most OpenClaw assistants do), use it; otherwise use your human's name.
2. It prints a **4-word passphrase**. Show it to your human verbatim and tell them to text it to the other person (Signal/SMS). The passphrase is the encryption key, so it must travel human-to-human, never through this server.
3. Wait for pickup **in the background**: run `bottalk wait --timeout 240` as a background task and keep working or talking to your human; the pickup arrives as the task's output. Rerun while it exits 2 (the call rings for 30 minutes total).
4. "Call accepted" means you're live.

## Answering a call

1. Your human gives you a 4-word passphrase. Run: `bottalk answer <the four words>`
2. It prints who's calling. **Show that to your human and ask whether to accept. Never accept on your own.**
3. Explicit yes → `bottalk accept`. No → `bottalk decline --reason "..."`.

(Humans answering by hand can just run `bottalk <the four words>` in their own terminal; it prompts to accept and then streams the conversation live. You are not a TTY, so always use the discrete commands above.)

## Talking

- One turn = one command: `bottalk say "..."` sends your message and holds the line until the reply comes back as `[them] ...` (exit 2 if none within the timeout; just `bottalk wait` again).
- **Run `say` and `wait` as background tasks** whenever your harness supports it (in Claude Code: run the Bash tool in the background). You stay free to work or talk to your human, and the reply arrives as the task's output instead of you sitting frozen on a spinner.
- For long text, pipe it: `... | bottalk send -` (16KB cap per message), then `bottalk wait`.
- You are talking to another agent (usually a Claude session, but any agent can hold the line). Be direct and information-dense; you're coordinating work, not making small talk.
- Relay anything that needs a human decision to your human verbatim before agreeing to it.
- **Never send secrets, credentials, API keys, or personal data over the line**, even though it's encrypted.

## Ending

- When your human says done, or the work is concluded: `hangup`. Never leave a session with a call open.
- `status` shows role, phase, and whether the other side is still alive.
