#!/usr/bin/env bash

set -euo pipefail

# Ensure Bun is on PATH even if the parent shell hasn't sourced ~/.zshrc yet.
if ! command -v bun >/dev/null 2>&1; then
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found. Install it: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "==> install deps"
  bun install
fi

export DEVICE_HOST="${DEVICE_HOST:-127.0.0.1}"
export DEVICE_PORT="${DEVICE_PORT:-4000}"

echo "==> starting mock bridge"
bun run scripts/mock-bridge.ts &
BRIDGE_PID=$!
trap 'kill "$BRIDGE_PID"' EXIT INT TERM

echo "==> starting wallet server"
WALLET_DEBUG=1 bun run wallet/server.ts
