#!/usr/bin/env bash
# Sets up a codespace (or any dev container) to try ProofGate, and records how long each phase takes.
# No AWS tool or credential is installed or read. Versions come from what the repository pins:
# Node.js from devcontainer.json (.nvmrc), pnpm from the packageManager field, Lean from packages/cdk-plugin/lean/lean-toolchain.
set -euo pipefail

TIMES=/tmp/proofgate-setup-times.txt
NPM_DEMO="$HOME/proofgate-npm-demo"
: > "$TIMES"
phase() {
  local name="$1"
  shift
  local start
  start=$(date +%s)
  echo "== $name"
  "$@"
  echo "$name: $(($(date +%s) - start)) s" | tee -a "$TIMES"
}

cd "$(dirname "$0")/.."
echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$TIMES"

# devcontainer.json installs pnpm at the packageManager version (tests/devcontainer.test.ts keeps them equal).
echo "node $(node --version), pnpm $(pnpm --version)" | tee -a "$TIMES"
phase "install elan" bash -c 'curl -sSfL https://elan.lean-lang.org/elan-init.sh | sh -s -- -y --default-toolchain none'
export PATH="$HOME/.elan/bin:$PATH"
grep -q '.elan/bin' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/.elan/bin:$PATH"' >> "$HOME/.bashrc"

phase "pnpm install" pnpm install --frozen-lockfile
phase "pnpm build" pnpm build
phase "pnpm lean:build (downloads the Lean toolchain)" pnpm lean:build

# The published version, for the guide's npm path.
npm_version=$(node -p 'require("./packages/cdk-plugin/package.json").version')
rm -rf "$NPM_DEMO"
phase "prepare the npm demo ($npm_version)" bash -c "node scripts/prepare-npm-demo.mjs '$NPM_DEMO' '$npm_version' && cd '$NPM_DEMO' && npm install --no-audit --no-fund && npx tsc -p tsconfig.json"

echo "finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$TIMES"
echo
echo "Ready. Open docs/GETTING_STARTED.en.md and start at section 4, or run: pnpm demo:fix"
cat "$TIMES"
