//! Blinky — Toggle the USB Armory blue LED via RPC to the Trusted OS.
//!
//! To build this example instead of the default applet:
//!   cp examples/blinky/main.rs src/main.rs && make

#![no_std]
#![no_main]

use gotee_syscall::{self, log, println};

#[no_mangle]
pub extern "C" fn _start() -> ! {
    log!("Blinky example — toggling blue LED via RPC");

    // JSON-RPC request to call RPC.LED on the Trusted OS.
    // The Trusted OS registers an RPC{} receiver with methods:
    //   - Echo(string) -> string
    //   - LED(LEDStatus{Name, On}) -> bool
    //   - Attest(bool) -> AttestationResult

    let on_req = br#"{"method":"RPC.LED","params":[{"Name":"blue","On":true}],"id":1}"#;
    let off_req = br#"{"method":"RPC.LED","params":[{"Name":"blue","On":false}],"id":2}"#;

    let mut resp = [0u8; 256];

    for i in 0..5 {
        log!("Blink #{}: ON", i + 1);
        gotee_syscall::rpc_request(on_req);
        let n = gotee_syscall::rpc_response(&mut resp);
        log!("  Response: {}", core::str::from_utf8(&resp[..n]).unwrap_or("?"));

        // Simple busy-wait delay (~500ms at 900MHz)
        for _ in 0..5_000_000u32 {
            core::hint::spin_loop();
        }

        log!("Blink #{}: OFF", i + 1);
        gotee_syscall::rpc_request(off_req);
        let n = gotee_syscall::rpc_response(&mut resp);
        log!("  Response: {}", core::str::from_utf8(&resp[..n]).unwrap_or("?"));

        for _ in 0..5_000_000u32 {
            core::hint::spin_loop();
        }
    }

    log!("Blinky done!");
    gotee_syscall::exit();
}
