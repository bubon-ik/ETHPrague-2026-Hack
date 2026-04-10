# GoTEE Rust Starter

Write Rust applications that run in the ARM TrustZone Secure World on a [USB Armory MK II](https://github.com/usbarmory/usbarmory/wiki).

This boilerplate handles all the TrustZone complexity for you. You write Rust code in `src/main.rs` — the build system takes care of compiling it, embedding it into the [GoTEE](https://github.com/usbarmory/GoTEE) Trusted OS, and producing a flashable firmware image.

## Quick Start

```bash
# 1. Install dependencies
./scripts/setup.sh

# 2. Edit your applet
$EDITOR src/main.rs

# 3. Build
make

# 4. Test in QEMU
make qemu
```

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
│   ├── rpc.go
│   ├── mem.go
│   └── tz.go
├── examples/                ← Reference applets
│   ├── blinky/main.rs       (LED control via RPC)
│   ├── crypto/main.rs       (hardware RNG)
│   ├── attestation/main.rs  (remote attestation)
│   ├── http_client/main.rs  (outbound HTTP GET/POST)
│   └── webserver/main.rs    (serve HTTP from TrustZone)
├── applet.ld                ← Linker script
├── Cargo.toml               ← Rust project config
├── Makefile                 ← Build orchestration
└── scripts/setup.sh         ← Dependency installer
```

## Available Syscalls

The `gotee_syscall` crate provides these functions:

| Function | Description |
|----------|-------------|
| `println!("...")` | Print to the Trusted OS console |
| `log!("...")` | Print with HH:MM:SS timestamp |
| `exit()` | Terminate the applet |
| `nanotime() -> u64` | Get system time in nanoseconds |
| `getrandom(&mut buf)` | Fill buffer with hardware-random bytes |
| `rpc_request(&data)` | Send JSON-RPC request to Trusted OS |
| `rpc_response(&mut buf) -> usize` | Read RPC response |
| `http::get(url, &mut buf)` | Make an HTTP GET request |
| `http::post(url, ct, body, &mut buf)` | Make an HTTP POST request |
| `http::serve(\|req, resp\| { ... })` | Run an HTTP server loop |

## HTTP Support

The applet can make outbound HTTP requests and serve incoming HTTP requests, all routed through the Trusted OS.

### Outbound HTTP (applet fetches data from the internet)

```rust
use gotee_syscall::http;

let mut buf = [0u8; 4096];
let resp = http::get("http://api.example.com/data", &mut buf);
if resp.ok() {
    log!("Got: {}", resp.body);
}
```

**Requires host-side IP forwarding** — see [Host Networking Setup](#host-networking-setup) below.

### Inbound HTTP (applet serves a web API)

The Trusted OS runs an HTTP server on `10.0.0.1:8080`. Your applet handles requests:

```rust
use gotee_syscall::http;

http::serve(|req, resp| {
    match req.path {
        "/hello" => {
            resp.set_content_type("text/plain");
            resp.set_body(b"Hello from TrustZone!");
        }
        _ => {
            resp.status = 404;
            resp.set_body(b"Not Found");
        }
    }
});
```

From the host: `curl http://10.0.0.1:8080/hello`

## RPC Services

The Trusted OS exposes these RPC methods (call via `rpc_request` or the `http` helpers):

| Method | Parameters | Description |
|--------|------------|-------------|
| `RPC.Echo` | `string` | Returns the input string |
| `RPC.LED` | `{Name: "blue", On: true}` | Controls the blue LED |
| `RPC.Attest` | `bool` | Returns hardware-derived attestation key |
| `RPC.HTTPGet` | `string` (URL) | Outbound HTTP GET |
| `RPC.HTTPPost` | `{URL, Method, ContentType, Body}` | Outbound HTTP POST |
| `RPC.WaitForRequest` | `bool` | Blocks until an HTTP request arrives |
| `RPC.SendResponse` | `{ID, Status, ContentType, Body}` | Responds to a pending request |

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

Copy an example over `src/main.rs` and build:

```bash
cp examples/blinky/main.rs src/main.rs
make qemu
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

## Host Networking Setup

For the applet to make outbound HTTP requests (e.g., `http::get`), the host must forward traffic from the USB Armory's network interface.

**Linux:**
```bash
# Enable IP forwarding
sudo sysctl -w net.ipv4.ip_forward=1

# NAT traffic from the USB Armory (replace eth0 with your internet interface)
sudo iptables -t nat -A POSTROUTING -s 10.0.0.1 -o eth0 -j MASQUERADE

# Add route on the USB Armory (via SSH)
# The Trusted OS uses 10.0.0.1; host is 10.0.0.2
```

**macOS:**
```bash
sudo sysctl -w net.inet.ip.forwarding=1
echo "nat on en0 from 10.0.0.0/24 to any -> (en0)" | sudo pfctl -ef -
```

The inbound HTTP server (`http::serve`) does not require this — it's accessible directly at `10.0.0.1:8080` from the host.

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
