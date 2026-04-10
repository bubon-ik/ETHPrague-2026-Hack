# GoTEE Rust Starter — Project Context

## What This Is

A boilerplate for writing Rust Trusted Applets that run in ARM TrustZone Secure World on the USB Armory MK II device, using the GoTEE framework.

## Architecture

Three execution contexts on ARM TrustZone:

1. **Trusted OS** (`trusted_os/`) — Go/TamaGo unikernel in Secure World system mode. Handles hardware init, TrustZone config, syscall dispatch, remote attestation. Users should NOT modify this.
2. **Trusted Applet** (`src/main.rs`) — Rust `#![no_std]` binary in Secure World user mode. This is what users edit.
3. **Normal World** — Not used in this starter (available for Linux or other OS).

## Build Pipeline

1. `cargo build --release` compiles `src/main.rs` + `gotee_syscall` crate → `target/armv7a-none-eabi/release/trusted_applet` (ELF)
2. Makefile copies ELF → `trusted_os/assets/trusted_applet.elf`
3. TamaGo builds `trusted_os/` with `//go:embed assets/trusted_applet.elf` → `bin/trusted_os.elf`
4. Optional: `objcopy` + `mkimage` → `bin/trusted_os.imx` (flashable image)

## Memory Layout

| Region | Address | Size | Description |
|--------|---------|------|-------------|
| Applet (virtual) | `0x10000000` | 32 MB | BEE alias region, text starts at `0x10010000` |
| Applet (physical) | `0x96000000` | 32 MB | Physical backing, BEE encrypted on i.MX6UL |
| Non-Secure | `0x80000000` | 256 MB | Normal World (unused in this starter) |
| Trusted OS | `0x90000000` | 95 MB | Secure World system mode, text at `0x90010000` |
| Secure DMA | `0x95f00000` | 1 MB | DMA region for Trusted OS |

## Syscall ABI

ARM `swi 0` instruction. Register convention:
- `r0` = syscall number
- `r1`–`r3` = arguments
- Return values in `r0`–`r1`

| Number | Name | Args | Description |
|--------|------|------|-------------|
| 0 | `SYS_EXIT` | none | Terminate applet |
| 1 | `SYS_WRITE` | r1=byte | Write byte to console |
| 2 | `SYS_NANOTIME` | none | Returns ns in r0(low), r1(high) |
| 3 | `SYS_GETRANDOM` | r1=ptr, r2=len | Fill buffer with random bytes |
| 4 | `SYS_RPC_REQ` | r1=ptr, r2=len | Send RPC request |
| 5 | `SYS_RPC_RES` | r1=ptr, r2=len | Read RPC response, returns len in r0 |

## HTTP-over-RPC

The applet can make HTTP requests and serve HTTP via the Trusted OS:

### Outbound (applet → internet)
- `gotee_syscall::http::get(url, buf)` → `HttpResponse { status, body, error }`
- `gotee_syscall::http::post(url, content_type, body, buf)` → `HttpResponse`
- Go side: `RPC.HTTPGet`, `RPC.HTTPPost`, `RPC.HTTPDo` in `trusted_os/http.go`
- Requires host IP forwarding (USB Armory at 10.0.0.1, host at 10.0.0.2)
- Max response body: 64 KB (`maxHTTPBody` in `trusted_os/http.go`)

### Inbound (internet → applet)
- `gotee_syscall::http::serve(|req, resp| { ... })` enters an infinite request loop
- Go side: HTTP server on port 8080, forwards to applet via `RPC.WaitForRequest` / `RPC.SendResponse`
- Long-poll pattern: one request at a time (single-threaded applet)
- 30-second timeout per request

### Rust HTTP module internals
- `gotee_syscall/src/http.rs` builds JSON-RPC payloads using `core::fmt::Write` into stack buffers (no allocator)
- JSON parsing is minimal: `extract_json_string()` / `extract_json_number()` do simple key search
- `JsonBuf` is a 2 KB stack buffer for building RPC requests
- `Response::body_buf` is 64 KB for server response bodies

## Key Files

### Files users edit
- `src/main.rs` — Trusted Applet entry point

### Files users may read but shouldn't edit
- `gotee_syscall/src/lib.rs` — Syscall wrappers, macros, panic handler
- `gotee_syscall/src/http.rs` — HTTP client/server helpers
- `applet.ld` — Linker script (applet memory layout)
- `.cargo/config.toml` — Cargo target/linker config
- `Makefile` — Build orchestration

### Files users should not touch
- `trusted_os/*.go` — Trusted OS source (Go/TamaGo)
- `trusted_os/go.mod` — Go module dependencies

## Dependencies

- **Rust**: nightly with `armv7a-none-eabi` target (pinned in `rust-toolchain.toml`)
- **Go**: 1.26+ with TamaGo compiler (`TAMAGO` env var)
- **Linker**: `arm-none-eabi-ld`
- **QEMU**: `qemu-system-arm` with `mcimx6ul-evk` machine (for testing)

## Upstream References

This project is based on:
- [GoTEE-example](https://github.com/usbarmory/GoTEE-example) — `trusted_os_usbarmory/` and `trusted_applet_rust/`
- [GoTEE](https://github.com/usbarmory/GoTEE) — Monitor, syscall, and exec packages
- [TamaGo](https://github.com/usbarmory/tamago) — Bare metal Go runtime and board support

## Common Tasks

### Adding a new RPC method
1. Add method to `RPC` struct in `trusted_os/rpc.go`
2. Call it from Rust via `rpc_request` with JSON-RPC payload
3. Rebuild with `make`

### Changing applet memory size
1. Update `AppletSize` in `trusted_os/mem.go`
2. Update region in `applet.ld` if needed
3. Rebuild with `make`

### Testing without hardware
```bash
make qemu
```
Uses `qemu-system-arm -machine mcimx6ul-evk`. Attestation/crypto features that require real hardware will report errors gracefully.
