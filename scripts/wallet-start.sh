#!/usr/bin/env bash

set -euo pipefail

APPLET_PATH="target/armv7a-none-eabi/release/trusted_applet"
DEVICE_HOST="${DEVICE_HOST:-10.0.0.1}"
DEVICE_PORT="${DEVICE_PORT:-4000}"

probe_once() {
  local out
  out=$(printf '{"Method":"__probe","Input":""}\n' | nc -w 1 "$DEVICE_HOST" "$DEVICE_PORT" 2>/dev/null || true)
  if [[ -n "$out" ]]; then
    return 0
  fi
  return 1
}

echo "==> make applet"
make applet

echo "==> upload applet"
bun run scripts/upload.ts "$APPLET_PATH"

echo "==> re-arm link"
./scripts/armory-link.sh

echo "==> waiting for device"
while ! probe_once; do
  echo "probe timeout; re-arming link"
  ./scripts/armory-link.sh
  sleep 1
  echo "retrying probe"
done

echo "==> starting keepalive probe (every 5s)"
keepalive() {
  while true; do
    if ! probe_once; then
      echo "keepalive probe failed; re-arming link"
      ./scripts/armory-link.sh
    fi
    sleep 5
  done
}

keepalive &
KEEPALIVE_PID=$!
trap 'kill "$KEEPALIVE_PID"' EXIT INT TERM

echo "==> starting wallet server"
WALLET_DEBUG=1 bun run wallet/server.ts
