#!/usr/bin/env bash

set -euo pipefail

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
