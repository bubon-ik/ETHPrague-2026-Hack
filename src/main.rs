//! Your Trusted Applet — edit this file!
//!
//! This runs in ARM TrustZone Secure World (user mode), supervised by the
//! GoTEE Trusted OS. Use the `gotee_syscall` crate to interact with the OS.

#![no_std]
#![no_main]

use gotee_syscall::{self, log, println};

/// Entry point. Called by the Trusted OS after loading the applet ELF.
#[no_mangle]
pub extern "C" fn _start() -> ! {
    log!("Hello from Rust Trusted Applet!");

    // --- Hardware random number generation ---
    let mut buf = [0u8; 16];
    gotee_syscall::getrandom(&mut buf);
    log!("Random bytes from hardware RNG: {:02x?}", buf);

    // --- System time ---
    let ns = gotee_syscall::nanotime();
    log!("Current nanotime: {} ns", ns);

    // --- Your code here! ---
    // Use gotee_syscall::{print, println, log} for output.
    // Use gotee_syscall::getrandom() for secure randomness.
    // Use gotee_syscall::rpc_request() / rpc_response() for RPC to the Trusted OS.

    log!("Applet finished, exiting.");
    gotee_syscall::exit();
}
