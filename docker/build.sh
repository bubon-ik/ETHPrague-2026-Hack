#!/usr/bin/env bash
#
# GoTEE Rust Starter — one-shot build.
#
# Builds the Rust applet on the host (fast), then runs the Trusted OS +
# mkimage pipeline inside a Docker container that has TamaGo preinstalled.
# Output: bin/trusted_os.imx
#
# Usage:
#   ./docker/build.sh
#
# On first run the Docker image is built (~5 min — TamaGo compiles from
# source). Subsequent runs reuse the cached image (~30 s).

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[x]${NC} $*" >&2; exit 1; }

IMAGE=gotee-starter-builder

# Run from repo root so relative paths (docker/, bin/, Makefile) resolve.
cd "$(dirname "$0")/.."

command -v docker >/dev/null 2>&1 || fail "docker not installed — install Docker Desktop (Mac) or docker-engine (Linux)."
command -v cargo  >/dev/null 2>&1 || fail "cargo not installed — install via https://rustup.rs (the repo pins nightly via rust-toolchain.toml)."

info "Building Rust applet on host"
make applet

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    warn "$IMAGE image not found — building it now (~5 min, one-time)"
    docker build -t "$IMAGE" docker/
fi

info "Running Trusted OS build inside $IMAGE"
docker run --rm \
    -v "$PWD:/work" \
    -w /work \
    -e TAMAGO=/opt/tamago-go/bin/go \
    "$IMAGE" make imx

[[ -f bin/trusted_os.imx ]] || fail "bin/trusted_os.imx was not produced — check errors above."

SIZE=$(wc -c < bin/trusted_os.imx | tr -d ' ')
info "Build complete: bin/trusted_os.imx ($SIZE bytes)"
echo
echo "Next: flash to SD with"
echo "  ./scripts/flash-sd.sh /dev/diskN"
