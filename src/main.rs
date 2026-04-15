//! Your Trusted Applet — edit this file!
//!
//! Runs in ARM TrustZone Secure World (user mode). The Trusted OS dispatches
//! requests to `handle`; your job is to fill in the match arms with the
//! functions you want to run inside the Trusted Computing Base.
//!
//! Anything that does NOT need to be trusted (HTTP servers, file I/O, UI,
//! etc.) belongs in a separate program — not in here.

#![no_std]
#![no_main]

use gotee_syscall::{self, log};

/// The one function you edit. Called once per incoming request.
///
/// - `method` — which trusted operation the caller asked for
/// - `input`  — request payload
/// - `out`    — write your response bytes here
///
/// Return the number of bytes written to `out`. Return `0` to signal an
/// unknown method or empty reply.
fn handle(method: &str, input: &[u8], out: &mut [u8]) -> usize {
    match method {
        "Echo" => {
            let n = input.len().min(out.len());
            out[..n].copy_from_slice(&input[..n]);
            n
        }

        // Add your trusted methods here, for example:
        //
        //   "Sign" => {
        //       let mut key = [0u8; 32];
        //       gotee_syscall::getrandom(&mut key); // hardware RNG
        //       // ... compute signature over `input`, write to `out` ...
        //       signature_len
        //   }
        //
        // See examples/square/main.rs for a worked end-to-end example
        // (applet + host webserver + uploader) with integer and byte
        // handlers and a no-alloc formatter.
        _ => 0,
    }
}

#[no_mangle]
pub extern "C" fn _start() -> ! {
    log!("Trusted applet ready");
    gotee_syscall::serve(handle)
}
