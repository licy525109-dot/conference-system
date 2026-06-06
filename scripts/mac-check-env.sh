#!/usr/bin/env bash
set -euo pipefail

echo "== macOS =="
sw_vers || true
uname -m || true

echo "
== Xcode Command Line Tools =="
xcode-select -p || echo "Run: xcode-select --install"

echo "
== Homebrew =="
if command -v brew >/dev/null 2>&1; then brew --version; else echo "Homebrew not found"; fi

echo "
== Git =="
git --version || true

echo "
== Node / npm / corepack / pnpm =="
node -v || true
npm -v || true
corepack --version || true
pnpm -v || true

echo "
== Docker =="
docker version --format '{{.Server.Version}}' 2>/dev/null || echo "Docker not running or not installed"
docker compose version || true

echo "
== Project files =="
[ -f AGENTS.md ] && echo "AGENTS.md ok" || echo "Missing AGENTS.md"
[ -f .codex/config.toml ] && echo ".codex/config.toml ok" || echo "Missing .codex/config.toml"
find .agents/skills -maxdepth 2 -name SKILL.md -print 2>/dev/null || echo "No skills found"

echo "
Done."
