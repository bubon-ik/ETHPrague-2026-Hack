//! Remote Attestation — Request a device-unique derived key from the Trusted OS.
//!
//! The Trusted OS uses the on-chip crypto engine (CAAM or DCP) to derive a
//! hardware-bound key. This key can be used for remote attestation to prove
//! the applet is running on genuine hardware in the Secure World.
//!
//! NOTE: Attestation only works on real hardware, not in QEMU.
//!
//! To build: cp examples/attestation/main.rs src/main.rs && make

#![no_std]
#![no_main]

use gotee_syscall::{self, log};

#[no_mangle]
pub extern "C" fn _start() -> ! {
    log!("Attestation example — hardware key derivation via RPC");

    // Call the Attest RPC method on the Trusted OS
    let req = br#"{"method":"RPC.Attest","params":[true],"id":1}"#;

    log!("Sending attestation request to Trusted OS...");
    gotee_syscall::rpc_request(req);

    let mut resp = [0u8; 512];
    let n = gotee_syscall::rpc_response(&mut resp);

    if n > 0 {
        log!("Attestation response ({} bytes):", n);
        log!("  {}", core::str::from_utf8(&resp[..n]).unwrap_or("<invalid UTF-8>"));
    } else {
        log!("No attestation response received");
        log!("(This is expected when running in QEMU — attestation requires real hardware)");
    }

    log!("Attestation example complete");
    gotee_syscall::exit();
}
