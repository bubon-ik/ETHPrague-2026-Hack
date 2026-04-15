#!/usr/bin/env bash
#
# GoTEE Rust Starter — Dependency Setup
#
# Installs all tools needed to build and run the Trusted Applet:
#   - Rust nightly + armv7a-none-eabi target
#   - arm-none-eabi binutils (cross-linker)
#   - TamaGo Go compiler (bare metal Go for the Trusted OS)
#   - QEMU ARM system emulator (for `make qemu` iteration)
#   - u-boot-tools (mkimage, for .imx image creation)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[x]${NC} $*"; exit 1; }

OS="$(uname -s)"

# ---------------------------------------------------------------------------
# 1. Rust toolchain
# ---------------------------------------------------------------------------

if command -v rustup &>/dev/null; then
    info "Rust found: $(rustc --version)"
else
    info "Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

info "Installing Rust nightly + armv7a-none-eabi target..."
rustup toolchain install nightly
rustup target add armv7a-none-eabi --toolchain nightly
rustup component add rust-src --toolchain nightly
info "Rust target ready"

# ---------------------------------------------------------------------------
# 2. ARM cross-compilation toolchain
# ---------------------------------------------------------------------------

if command -v arm-none-eabi-ld &>/dev/null; then
    info "arm-none-eabi binutils found: $(arm-none-eabi-ld --version | head -1)"
else
    info "Installing arm-none-eabi binutils..."
    case "$OS" in
        Darwin)
            if command -v brew &>/dev/null; then
                brew install arm-none-eabi-binutils
            else
                fail "Homebrew not found. Install it first: https://brew.sh"
            fi
            ;;
        Linux)
            if command -v apt-get &>/dev/null; then
                sudo apt-get update && sudo apt-get install -y binutils-arm-none-eabi
            elif command -v dnf &>/dev/null; then
                sudo dnf install -y arm-none-eabi-binutils-cs
            elif command -v pacman &>/dev/null; then
                sudo pacman -S arm-none-eabi-binutils
            else
                fail "Unsupported package manager. Install arm-none-eabi-binutils manually."
            fi
            ;;
        *)
            fail "Unsupported OS: $OS"
            ;;
    esac
fi

# ---------------------------------------------------------------------------
# 3. Go + TamaGo compiler
# ---------------------------------------------------------------------------

if command -v go &>/dev/null; then
    info "Go found: $(go version)"
else
    info "Installing Go..."
    case "$OS" in
        Darwin)
            brew install go
            ;;
        Linux)
            if command -v apt-get &>/dev/null; then
                sudo apt-get install -y golang
            else
                warn "Install Go 1.26+ manually from https://go.dev/dl/"
            fi
            ;;
    esac
fi

TAMAGO_DIR="${TAMAGO_DIR:-$HOME/.tamago}"

if [ -n "${TAMAGO:-}" ] && [ -f "$TAMAGO" ]; then
    info "TamaGo compiler found: $TAMAGO"
elif [ -f "$TAMAGO_DIR/bin/go" ]; then
    info "TamaGo compiler found: $TAMAGO_DIR/bin/go"
    echo ""
    warn "Add to your shell profile:"
    echo "  export TAMAGO=$TAMAGO_DIR/bin/go"
else
    info "Building TamaGo compiler..."
    info "This compiles a custom Go distribution with GOOS=tamago support."
    info "It may take a few minutes."

    TAMAGO_REPO="https://github.com/usbarmory/tamago-go"
    TAMAGO_TAG="latest"

    mkdir -p "$TAMAGO_DIR"
    cd "$TAMAGO_DIR"

    if [ ! -d "src" ]; then
        info "Downloading tamago-go..."
        curl -sL "$TAMAGO_REPO/archive/refs/tags/$TAMAGO_TAG.tar.gz" | tar xz --strip-components=1
    fi

    cd src
    info "Compiling tamago-go (this takes a few minutes)..."
    ./all.bash

    cd ..
    info "TamaGo compiler built: $TAMAGO_DIR/bin/go"
    echo ""
    warn "Add to your shell profile:"
    echo "  export TAMAGO=$TAMAGO_DIR/bin/go"
fi

# ---------------------------------------------------------------------------
# 4. QEMU ARM system emulator
# ---------------------------------------------------------------------------

if command -v qemu-system-arm &>/dev/null; then
    info "QEMU found: $(qemu-system-arm --version | head -1)"
else
    info "Installing qemu-system-arm..."
    case "$OS" in
        Darwin)
            if command -v brew &>/dev/null; then
                brew install qemu
            else
                fail "Homebrew not found. Install it first: https://brew.sh"
            fi
            ;;
        Linux)
            if command -v apt-get &>/dev/null; then
                sudo apt-get update && sudo apt-get install -y qemu-system-arm
            elif command -v dnf &>/dev/null; then
                sudo dnf install -y qemu-system-arm
            elif command -v pacman &>/dev/null; then
                sudo pacman -S qemu-arch-extra
            else
                fail "Unsupported package manager. Install qemu-system-arm manually."
            fi
            ;;
        *)
            fail "Unsupported OS: $OS"
            ;;
    esac
fi

# ---------------------------------------------------------------------------
# 5. mkimage (optional, for .imx image creation)
# ---------------------------------------------------------------------------

if command -v mkimage &>/dev/null; then
    info "mkimage found"
else
    warn "mkimage not found (optional, needed for 'make imx')"
    case "$OS" in
        Darwin)
            echo "  Install: brew install u-boot-tools"
            ;;
        Linux)
            echo "  Install: sudo apt-get install u-boot-tools"
            ;;
    esac
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
info "Setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Edit src/main.rs with your Trusted Applet code"
echo "    2. Run 'make' to build"
echo "    3. Run 'make qemu' to test in the emulator"
echo "    4. Run 'make imx' to create a flashable image"
echo ""
