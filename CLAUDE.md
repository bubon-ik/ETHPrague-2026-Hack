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

## Applet Dispatch Loop

The applet is a pure request/response function. The Trusted Computing Base
contains the trusted computation and nothing else — no HTTP, no networking,
no I/O beyond the syscall ABI above.

`src/main.rs` defines a `handle(method, input, out) -> usize` function and
calls `gotee_syscall::serve(handle)`, which loops forever:

1. Applet sends `RPC.Recv` and blocks. The Trusted OS dequeues the next
   `AppletCall{Method, Input}` from `appletRequestCh` and returns it.
2. `serve()` invokes the user's `handle()` with the decoded method and input.
3. Applet sends `RPC.Send` with the output bytes. The Trusted OS pushes the
   reply onto `appletReplyCh`, unblocking the original caller.
4. A request with method `"__exit"` causes `serve()` to call `exit()` —
   the sentinel used when the applet should terminate cleanly.

### Calling the applet from inside the Trusted OS
```go
reply := CallApplet("Echo", "hello")
```
`CallApplet` lives in `trusted_os/rpc.go`. It's the single entry point the
bridge (or any other in-TOS caller) uses to hand a request to the applet's
`serve()` loop.

## USB bridge (host ↔ applet)

On hardware, the Trusted OS exposes a single TCP JSON bridge over USB
networking (`10.0.0.1:4000`) so Normal World tools on the laptop can call
the applet. The bridge and its on-device helpers live in:

- `trusted_os/bridge.go` — TCP listener and the newline-delimited JSON
  protocol. One applet call is in flight at a time (applet RPC channels
  are depth 1); concurrent host connections serialize on `CallApplet`.
- `trusted_os/applet_store.go` — raw SD-block read/write for a persisted
  applet ELF. Magic `GTA1`, length + CRC32 header at LBA 0, payload from
  LBA 1. Boot path in `main.go` reads this region and falls back to the
  embedded default ELF on any failure.
- `trusted_os/reset.go` — `triggerReset` wrapper around `imx6ul.Reset`
  used by the upload path.

The protocol on `:4000` has exactly two commands, both newline-delimited
JSON with Go-style field casing:

1. **Applet call.** Any `Method` other than `__upload` is forwarded verbatim
   to `CallApplet(Method, Input)`, with the reply returned as `Output`.

   ```json
   {"Method":"Square","Input":"7"}   → {"Output":"49"}
   ```

2. **Applet upload.** `Method:"__upload"` carries a base64 ELF in `Input`;
   the Trusted OS validates the ELF header (ELF32/EM_ARM), persists it to
   the SD region, replies `{"Output":"ok, rebooting"}`, and triggers a
   platform reset. The next boot re-reads the SD region and runs the new
   applet. This lets iteration happen without re-flashing firmware.

See `examples/square/server.ts` and `examples/square/upload.ts`
for a zero-dependency Node webserver and uploader that use the protocol.

### TCB size note
Net new in the trusted base: ~60 lines of `encoding/json` in `bridge.go`,
~100 lines of raw-block SDHCI I/O in `applet_store.go`, ~10 lines of reset
in `reset.go`. `encoding/json` is already in the TCB via GoTEE's RPC
machinery, so there is no new dependency surface.

## Key Files

### Files users edit
- `src/main.rs` — Trusted Applet entry point

### Files users may read but shouldn't edit
- `gotee_syscall/src/lib.rs` — Syscall wrappers, `serve()` loop, macros, panic handler
- `applet.ld` — Linker script (applet memory layout)
- `.cargo/config.toml` — Cargo target/linker config
- `Makefile` — Build orchestration

### Files users should not touch
- `trusted_os/*.go` — Trusted OS source (Go/TamaGo), including the USB
  bridge in `bridge.go`, SD storage in `applet_store.go`, and reset
  wrapper in `reset.go`
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
