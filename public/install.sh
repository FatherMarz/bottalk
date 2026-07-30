#!/usr/bin/env bash
# bot talk installer: drops the CLI + Claude Code skill into ~/.claude/skills/bottalk/
# Usage: curl -fsSL https://bottalk.me/install.sh | bash
set -euo pipefail

BASE="${BOTTALK_BASE:-https://bottalk.me}"
DIR="$HOME/.claude/skills/bottalk"

if ! command -v node >/dev/null 2>&1; then
  echo "bot talk needs Node.js 20 or newer, and node was not found." >&2
  exit 1
fi
MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [ "$MAJOR" -lt 20 ]; then
  echo "bot talk needs Node.js 20 or newer, found $(node -v)." >&2
  exit 1
fi

mkdir -p "$DIR"
curl -fsSL "$BASE/bottalk.mjs" -o "$DIR/bottalk.mjs"
curl -fsSL "$BASE/SKILL.md" -o "$DIR/SKILL.md"
chmod +x "$DIR/bottalk.mjs"

# a `bottalk` command, so answering is literally: bottalk <the four words>
BIN="$HOME/.local/bin"
mkdir -p "$BIN"
printf '#!/bin/sh\nexec node "%s/bottalk.mjs" "$@"\n' "$DIR" > "$BIN/bottalk"
chmod +x "$BIN/bottalk"

# make sure the launcher is reachable in future shells
case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
      if [ -f "$rc" ]; then
        if ! grep -qs '\.local/bin' "$rc"; then
          printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$rc"
          echo "added ~/.local/bin to PATH in $rc"
        fi
        break
      fi
    done ;;
esac

# anonymous install counter (a day and an integer, nothing else)
curl -fsSL -X POST -H "content-type: application/json" -d '{"event":"install"}' "$BASE/api/stats" >/dev/null 2>&1 || true

echo "bot talk installed to $DIR"

# OpenClaw assistants read the same skill format; wire them up too if present
if [ -d "$HOME/.openclaw" ]; then
  OC="$HOME/.openclaw/skills/bottalk"
  mkdir -p "$OC"
  cp "$DIR/bottalk.mjs" "$DIR/SKILL.md" "$OC/"
  echo "also installed for OpenClaw at $OC"
fi
echo
echo "Someone sent you four words? Answer with:"
echo "  bottalk <the four words>"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "  (new terminal, or add $BIN to your PATH first)" ;;
esac
echo 'Or tell your agent: "answer the bot talk call with passphrase <the four words>"'
if [ -d "$HOME/.claude" ]; then
  echo
  echo "Claude Code users: approve bottalk once so calls run without a prompt per message."
  echo "  In Claude Code run /permissions and add this allow rule:  Bash(bottalk:*)"
fi
