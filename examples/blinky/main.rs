//! Blinky — Toggle the USB Armory blue LED via RPC to the Trusted OS.
//!
//! Exposes a single dispatch method over the bridge:
//!   {"Method":"Blink","Input":"3"} → toggles blue LED 3 times, replies "ok"
//!
//! Upload to the device with `examples/square/upload.ts` — does not
//! need a `make qemu` re-flash:
//!
//!   cp examples/blinky/main.rs src/main.rs
//!   make applet
//!   node --experimental-strip-types examples/square/upload.ts \
//!     target/armv7a-none-eabi/release/trusted_applet
//!
//! Then:
//!   printf '{"Method":"Blink","Input":"3"}\n' | nc 10.0.0.1 4000

#![no_std]
#![no_main]

use gotee_syscall::{self, log};

const ON_REQ: &[u8] = br#"{"method":"RPC.LED","params":[{"Name":"blue","On":true}],"id":1}"#;
const OFF_REQ: &[u8] = br#"{"method":"RPC.LED","params":[{"Name":"blue","On":false}],"id":2}"#;

fn handle(method: &str, input: &[u8], out: &mut [u8]) -> usize {
    match method {
        "Blink" => {
            let s = core::str::from_utf8(input).unwrap_or("");
            let n: u32 = s.trim().parse().unwrap_or(0);

            let mut resp = [0u8; 256];
            for _ in 0..n {
                gotee_syscall::rpc_request(ON_REQ);
                let _ = gotee_syscall::rpc_response(&mut resp);
                for _ in 0..5_000_000u32 {
                    core::hint::spin_loop();
                }
                gotee_syscall::rpc_request(OFF_REQ);
                let _ = gotee_syscall::rpc_response(&mut resp);
                for _ in 0..5_000_000u32 {
                    core::hint::spin_loop();
                }
            }

            let msg = b"ok";
            let k = msg.len().min(out.len());
            out[..k].copy_from_slice(&msg[..k]);
            k
        }
        _ => 0,
    }
}

#[no_mangle]
pub extern "C" fn _start() -> ! {
    log!("Blinky example ready");
    gotee_syscall::serve(handle)
}
