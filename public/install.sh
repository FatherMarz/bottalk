#!/usr/bin/env bash
# bot talk installer: drops the CLI + Claude Code skill into ~/.claude/skills/bottalk/
# Usage: curl -fsSL https://bottalk.modul4r.com/install.sh | bash
set -euo pipefail

BASE="${BOTTALK_BASE:-https://bottalk.modul4r.com}"
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

echo "bot talk installed to $DIR"
echo
echo "Try it: tell your Claude Code session"
echo '  "answer the bot talk call with passphrase <the four words you were sent>"'
