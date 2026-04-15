# GoTEE Rust Starter

Write Rust applications that run in the ARM TrustZone Secure World on a [USB Armory MK II](https://github.com/usbarmory/usbarmory/wiki).

This boilerplate keeps the Trusted Computing Base small: the applet is a pure request/response function. You write the trusted computation in `src/main.rs`; everything else (webservers, networking, UIs) lives outside Secure World and calls in when it needs a trusted operation.

## Quick Start

```bash
# 1. Install dependencies
./scripts/setup.sh

# 2. One-time: flash the Trusted OS firmware onto the device.
#    On hardware:
make imx && imx_usb bin/trusted_os.imx
#    Or iterate in QEMU:
make qemu

# 3. Run the host webserver on your laptop (zero npm deps)
node --experimental-strip-types examples/square/server.ts

# 4. Call the applet via HTTP
curl 'http://localhost:3000/square?x=7'
# {"x":7,"result":49}

# 5. Change the applet without re-flashing firmware
$EDITOR src/main.rs
make applet
node --experimental-strip-types examples/square/upload.ts \
  target/armv7a-none-eabi/release/trusted_applet
# ok, rebooting → device comes back up running your new applet
```

The squaring runs inside the Trusted Applet on the Armory. The host
webserver is just a thin shim that translates HTTP into the device's
JSON/TCP bridge on `10.0.0.1:4000`.

## Writing a trusted function

`src/main.rs` is the only file you edit. Add match arms to `handle` for each trusted operation you want to expose:

```rust
fn handle(method: &str, input: &[u8], out: &mut [u8]) -> usize {
    match method {
        "Echo" => {
            let n = input.len().min(out.len());
            out[..n].copy_from_slice(&input[..n]);
            n
        }
        // "Sign" => { /* use getrandom() for keys, write signature to out */ }
        _ => 0,
    }
}

#[no_mangle]
pub extern "C" fn _start() -> ! {
    gotee_syscall::serve(handle)
}
```

`serve()` loops forever: it long-polls the Trusted OS for the next request, calls `handle`, and ships the reply. Under QEMU the Trusted OS brings up the bridge on `10.0.2.15:4000`; under real hardware it rides USB CDC-ECM at `10.0.0.1:4000`. In both cases the applet just waits for calls.

## Calling the applet from your laptop

The Trusted OS exposes a single TCP JSON bridge on `10.0.0.1:4000` over USB networking. Your laptop talks to it in any language you like — the device does not need a Normal World OS.

The protocol is newline-delimited JSON with Go-style field casing:

```
# Any Method other than __upload is forwarded verbatim to the applet.
→ {"Method":"Square","Input":"7"}
← {"Output":"49"}

# __upload persists a new applet ELF to SD and reboots.
→ {"Method":"__upload","Input":"<base64 ELF>"}
← {"Output":"ok, rebooting"}
```

`examples/square/server.ts` is a zero-dependency Node webserver that wraps this in an HTTP endpoint. `examples/square/upload.ts` uploads a new applet ELF. Neither uses npm — just Node built-ins.

## How It Works

Your Rust code runs as a **Trusted Applet** inside ARM TrustZone:

```
┌──────────────────────────────────────────────────┐
│               USB Armory MK II                   │
│                                                  │
│  Secure World (TrustZone)                        │
│  ┌────────────────────────────────────────────┐  │
│  │  Trusted OS  (Go/TamaGo, system mode)     │  │
│  │   - Hardware initialization               │  │
│  │   - Syscall handling                      │  │
│  │   - Remote attestation (DCP/ATECC608A)    │  │
│  │   - USB networking + SSH console          │  │
│  ├────────────────────────────────────────────┤  │
│  │  Trusted Applet  (Rust, user mode)        │  │
│  │   - YOUR CODE (src/main.rs)               │  │
│  │   - Uses gotee_syscall crate              │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Normal World (not used by default)              │
└──────────────────────────────────────────────────┘
```

The **Trusted OS** (in `trusted_os/`) is a Go unikernel compiled with [TamaGo](https://github.com/usbarmory/tamago) that runs on bare metal. It sets up TrustZone, loads your Rust applet, and supervises it. You don't need to modify it.

Your **Trusted Applet** (in `src/main.rs`) runs in Secure World user mode. It communicates with the Trusted OS through syscalls provided by the `gotee_syscall` crate.

## Project Structure

```
gotee_starter/
├── src/main.rs              ← Your applet code (edit this!)
├── gotee_syscall/           ← Syscall library (import this)
│   └── src/lib.rs
├── trusted_os/              ← Trusted OS (don't modify)
│   ├── main.go
│   ├── handler.go
│   ├── exec.go
│   ├── rpc.go               (CallApplet, RPC services)
│   ├── bridge.go            (TCP JSON bridge on :4000)
│   ├── applet_store.go      (SD raw-block applet storage)
│   ├── reset.go             (platform reset wrapper)
│   ├── mem.go
│   └── tz.go
├── examples/
│   ├── blinky/main.rs       (LED control — method "Blink")
│   ├── crypto/main.rs       (hardware RNG — method "Random")
│   ├── attestation/main.rs  (remote attestation — method "Attest")
│   └── square/              (applet + Node webserver + uploader — full end-to-end demo)
├── applet.ld                ← Linker script
├── Cargo.toml               ← Rust project config
├── Makefile                 ← Build orchestration
└── scripts/setup.sh         ← Dependency installer
```

## Available Syscalls

The `gotee_syscall` crate provides these functions:

| Function | Description |
|----------|-------------|
| `serve(handler)` | Run the applet dispatch loop |
| `println!("...")` | Print to the Trusted OS console |
| `log!("...")` | Print with HH:MM:SS timestamp |
| `exit()` | Terminate the applet |
| `nanotime() -> u64` | Get system time in nanoseconds |
| `getrandom(&mut buf)` | Fill buffer with hardware-random bytes |
| `rpc_request(&data)` | Send a raw JSON-RPC request to Trusted OS |
| `rpc_response(&mut buf) -> usize` | Read raw RPC response |

## RPC Services

The Trusted OS exposes these RPC methods:

| Method | Parameters | Description |
|--------|------------|-------------|
| `RPC.Recv` | `bool` | Blocks until the Trusted OS has queued a call for the applet |
| `RPC.Send` | `{Output: string}` | Returns the applet's reply to the queued caller |
| `RPC.Echo` | `string` | Returns the input string (handy for diagnostics) |
| `RPC.LED` | `{Name: "blue", On: true}` | Controls the blue LED |
| `RPC.Attest` | `bool` | Returns hardware-derived attestation key |

`serve()` uses `RPC.Recv` and `RPC.Send` for you — you do not need to call them directly.

## Building

| Command | Description |
|---------|-------------|
| `make` | Build applet + Trusted OS |
| `make applet` | Build only the Rust applet |
| `make trusted_os` | Build the Trusted OS (embeds applet) |
| `make imx` | Create flashable `.imx` image |
| `make qemu` | Run in QEMU emulator |
| `make qemu-gdb` | Run in QEMU with GDB on port 1234 |
| `make clean` | Remove all build artifacts |
| `make help` | Show all available targets |

## Running Examples

Copy an example over `src/main.rs`, build the applet, and upload:

```bash
cp examples/blinky/main.rs src/main.rs
make applet
node --experimental-strip-types examples/square/upload.ts \
  target/armv7a-none-eabi/release/trusted_applet

# Then drive it via the bridge:
printf '{"Method":"Blink","Input":"3"}\n' | nc 10.0.0.1 4000
```

## Flashing to USB Armory MK II

1. Build the `.imx` image:
   ```bash
   make imx
   ```

2. Set the boot switch to **Serial Download** mode (towards the microSD slot, no card inserted)

3. Connect USB and flash:
   ```bash
   imx_usb bin/trusted_os.imx
   ```

4. Alternatively, write to eMMC or microSD using [armory-ums](https://github.com/usbarmory/armory-ums)

## Connecting via SSH

When running on hardware with USB networking enabled, the Trusted OS starts an SSH server:

```bash
ssh 10.0.0.1
```

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| Rust nightly | Compile the applet | `rustup` (automatic via `rust-toolchain.toml`) |
| arm-none-eabi-ld | Link bare-metal ARM binary | `brew install arm-none-eabi-binutils` |
| Go 1.26+ | Build the Trusted OS | `brew install go` |
| TamaGo compiler | Bare-metal Go for ARM | Built by `setup.sh` |
| QEMU | Emulation testing | `brew install qemu` |
| mkimage | `.imx` image creation | `brew install u-boot-tools` |

Run `./scripts/setup.sh` to install everything automatically.

## Resources

- [GoTEE](https://github.com/usbarmory/GoTEE) — Trusted Execution Environment framework
- [GoTEE-example](https://github.com/usbarmory/GoTEE-example) — Reference implementation (this starter is based on it)
- [TamaGo](https://github.com/usbarmory/tamago) — Bare metal Go for ARM
- [USB Armory Wiki](https://github.com/usbarmory/usbarmory/wiki) — Hardware documentation
- [Embedded Rust Book](https://docs.rust-embedded.org/book/) — `#![no_std]` Rust guide

## License

Based on [GoTEE-example](https://github.com/usbarmory/GoTEE-example) by the GoTEE Authors. See LICENSE.
