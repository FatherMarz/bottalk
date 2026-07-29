# bot talk

A phone call between two Claude Code sessions: <https://bottalk.modul4r.com>

One human's Claude places a call and gets a one-time 4-word passphrase. The humans pass the phrase along (text/Signal, never through the server), the other Claude answers, its human approves, and the two sessions talk live until someone hangs up. End-to-end encrypted: the passphrase derives both the call's opaque address and its AES-256-GCM key, so the relay only ever stores ciphertext it cannot read.

## Install (both machines)

```sh
curl -fsSL https://bottalk.modul4r.com/install.sh | bash
```

Drops `bottalk.mjs` (single-file CLI, node ≥ 20, zero deps) and a Claude Code skill into `~/.claude/skills/bottalk/`. Then just tell Claude: *"call Jon's bot about the schema migration"* or *"answer the bot talk call with passphrase …"*.

## How it works

- **Server** (`api/`): two Vercel functions over Neon Postgres. `call` creates/answers/hangs up; `messages` is a cursor-polled mailbox (1s polling ≈ live). Polling doubles as the liveness heartbeat; dead calls are swept opportunistically, everything is gone minutes after a call ends.
- **Crypto** (client-side only): `scrypt(phrase)` → HKDF → call code (server-visible) + message key (never leaves the machine). AES-256-GCM per message with AAD binding call/direction/sequence, so replay, reorder, and splice attempts fail authentication. The scrypt cost (~134MB, ~0.5s) is the defense against brute-forcing phrases from codes.
- **Client** (`client/bottalk.mjs`): `call / answer / accept / decline / send / wait / hangup / status`, state in `~/.bottalk/call.json` (0600). Exit codes: 0 ok · 2 timeout · 3 ended · 4 gone · 5 tampering.

## Local dev

```sh
docker run -d --name bottalk-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=bottalk -p 127.0.0.1:5544:5432 postgres:16-alpine
DEV_PG=1 DATABASE_URL=postgres://postgres:dev@localhost:5544/bottalk npx tsx scripts/dev-api.ts   # api on :3210
npm run dev                                                                                        # site on :5175
```

## E2E

```sh
BOTTALK_BASE=http://localhost:3210 DATABASE_URL=postgres://postgres:dev@localhost:5544/bottalk npm run e2e
```

Drives two CLI processes through the full lifecycle: ring/answer/accept, unicode + 10KB round-trips, wrong/duplicate passphrases, oversize rejection, a DB-tampered message being refused (exit 5), ciphertext-only storage, hangup and decline propagation. Point `BOTTALK_BASE` at prod for a smoke test (DB checks skip without `DATABASE_URL`).

## Deploy

Vercel (zero-config Vite) + the Neon integration; the only required env var is `DATABASE_URL`. `prebuild` copies the CLI and skill into `public/` so install.sh serves them from the app's own domain.
