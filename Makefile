# GoTEE Rust Trusted Applet Starter — Build System
#
# Usage:
#   make              Build the Rust applet + Trusted OS
#   make applet       Build only the Rust applet
#   make trusted_os   Build only the Trusted OS (requires applet)
#   make imx          Build flashable .imx image
#   make qemu         Run in QEMU emulator
#   make clean        Remove all build artifacts
#
# Prerequisites:
#   - Rust nightly with armv7a-none-eabi target (see rust-toolchain.toml)
#   - arm-none-eabi binutils (linker)
#   - TamaGo Go compiler (TAMAGO env var or `go tool tamago`)
#   - QEMU ARM system emulator (for `make qemu`)

SHELL := /bin/bash

# --- Configuration -----------------------------------------------------------

BUILD_USER ?= $(shell whoami)
BUILD_HOST ?= $(shell hostname)
BUILD_DATE ?= $(shell /bin/date -u "+%Y-%m-%d %H:%M:%S")
BUILD_TAGS  = linkramsize,linkramstart,semihosting

RUST_TARGET   := armv7a-none-eabi
CROSS_COMPILE ?= arm-none-eabi-

# TamaGo compiler: set TAMAGO env var or let it auto-detect
TAMAGO ?= $(shell cd trusted_os && go tool -n github.com/usbarmory/tamago/cmd/tamago 2>/dev/null)

# Memory layout (must match applet.ld and trusted_os/mem.go)
APPLET_START := 0x10010000
OS_TEXT_START := 0x90010000

# --- Derived paths -----------------------------------------------------------

APPLET_ELF   := target/$(RUST_TARGET)/release/trusted_applet
APPLET_DEST  := trusted_os/assets/trusted_applet.elf
OS_ELF       := bin/trusted_os.elf
OS_IMX       := bin/trusted_os.imx

GOENV := GO_EXTLINK_ENABLED=0 CGO_ENABLED=0 GOOS=tamago GOOSPKG=github.com/usbarmory/tamago GOARCH=arm GOARM=7

# QEMU
QEMU_SD ?= bin/sd.img
QEMU_SD_SIZE_MB ?= 16
# QEMU networking: attach SLIRP user-mode to the emulated i.MX6UL ENET1
# MAC and forward host localhost:4000 → guest 10.0.2.15:4000 so the
# Node/TS webserver + uploader can reach the bridge listener inside the
# Trusted OS just like it would over USB CDC-ECM on real hardware.
QEMU ?= qemu-system-arm -machine mcimx6ul-evk -cpu cortex-a7 -m 512M \
	-nographic -monitor none -serial null -serial stdio \
	-semihosting \
	-drive file=$(QEMU_SD),format=raw,if=sd \
	-nic user,model=imx.enet,hostfwd=tcp:127.0.0.1:4000-10.0.2.15:4000

# --- Targets -----------------------------------------------------------------

.PHONY: all applet trusted_os imx qemu clean check_tamago help

all: trusted_os  ## Build everything (applet + Trusted OS)

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

applet:  ## Build the Rust Trusted Applet
	@echo "==> Building Rust Trusted Applet"
	cargo build --release
	@echo "==> Applet built: $(APPLET_ELF)"

$(APPLET_DEST): applet
	@mkdir -p $(dir $(APPLET_DEST))
	cp $(APPLET_ELF) $(APPLET_DEST)

trusted_os: check_tamago $(APPLET_DEST)  ## Build Trusted OS (embeds applet)
	@echo "==> Building Trusted OS with TamaGo"
	@mkdir -p bin
	cd trusted_os && $(GOENV) $(TAMAGO) build \
		-tags "$(BUILD_TAGS)" \
		-trimpath \
		-ldflags "-s -w -T $(OS_TEXT_START) -R 0x1000 \
			-X 'main.Build=$(BUILD_USER)@$(BUILD_HOST) on $(BUILD_DATE)'" \
		-o ../$(OS_ELF) .
	@echo "==> Trusted OS built: $(OS_ELF)"

imx: trusted_os  ## Build flashable .imx image
	@echo "==> Creating .imx image"
	$(CROSS_COMPILE)objcopy -j .text -j .rodata -j .shstrtab -j .typelink \
		-j .itablink -j .gopclntab -j .go.buildinfo -j .noptrdata -j .data \
		-j .bss -j .noptrbss --set-section-flags .bss=alloc,load,contents \
		--set-section-flags .noptrbss=alloc,load,contents \
		$(OS_ELF) $(OS_ELF).bin --output-target=binary
	@# Create IMX image header (DCD-less, for Serial Download Protocol or direct boot)
	mkimage -n /dev/null -T imximage -e $(OS_TEXT_START) -d $(OS_ELF).bin $(OS_IMX)
	@rm -f $(OS_ELF).bin
	@echo "==> Image ready: $(OS_IMX)"

$(QEMU_SD):
	@mkdir -p $(dir $(QEMU_SD))
	@echo "==> Creating blank QEMU SD image ($(QEMU_SD_SIZE_MB) MB) at $(QEMU_SD)"
	dd if=/dev/zero of=$(QEMU_SD) bs=1m count=$(QEMU_SD_SIZE_MB) status=none

qemu: trusted_os $(QEMU_SD)  ## Run in QEMU emulator
	@echo "==> Starting QEMU (Ctrl-A X to exit)"
	$(QEMU) -kernel $(OS_ELF)

qemu-gdb: trusted_os $(QEMU_SD)  ## Run in QEMU with GDB server
	@echo "==> Starting QEMU with GDB on :1234"
	$(QEMU) -kernel $(OS_ELF) -S -s

clean:  ## Remove all build artifacts
	cargo clean
	rm -rf bin/
	rm -f $(APPLET_DEST)

check_tamago:
	@if [ -z "$(TAMAGO)" ] || [ ! -f "$(TAMAGO)" ]; then \
		echo "Error: TamaGo compiler not found."; \
		echo "  Set TAMAGO=/path/to/tamago-go/bin/go"; \
		echo "  or run: ./scripts/setup.sh"; \
		exit 1; \
	fi
