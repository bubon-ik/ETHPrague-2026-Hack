//! Crypto — Hardware random number generation demo.
//!
//! Demonstrates using the hardware RNG through the GoTEE syscall interface.
//! The random bytes come from the i.MX6 CAAM or DCP crypto engine.
//!
//! To build: cp examples/crypto/main.rs src/main.rs && make

#![no_std]
#![no_main]

use gotee_syscall::{self, log};

#[no_mangle]
pub extern "C" fn _start() -> ! {
    log!("Crypto example — hardware random number generation");

    // Generate random bytes in various sizes
    for size in [4, 16, 32, 64] {
        let mut buf = [0u8; 64];
        gotee_syscall::getrandom(&mut buf[..size]);
        log!("{:>2} random bytes: {:02x?}", size, &buf[..size]);
    }

    // Generate a 256-bit key
    let mut key = [0u8; 32];
    gotee_syscall::getrandom(&mut key);
    log!("256-bit random key: {:02x?}", key);

    // Verify randomness: two calls should produce different output
    let mut a = [0u8; 16];
    let mut b = [0u8; 16];
    gotee_syscall::getrandom(&mut a);
    gotee_syscall::getrandom(&mut b);

    if a == b {
        log!("WARNING: two consecutive getrandom calls returned identical bytes!");
    } else {
        log!("Randomness check passed: consecutive calls differ");
    }

    log!("Crypto example complete");
    gotee_syscall::exit();
}
