//! Wallet applet — holds a device key and returns it on request.

#![no_std]
#![no_main]

use gotee_syscall::{self, log};

const HARDCODED_KEY: [u8; 32] = [
    0x37, 0xe1, 0x97, 0x27, 0x33, 0xa2, 0x03, 0xe0,
    0x09, 0x2f, 0xd3, 0x08, 0x63, 0x9c, 0x44, 0xc5,
    0x5f, 0xa9, 0xb2, 0x5d, 0x36, 0x0e, 0xc2, 0xc8,
    0x0d, 0x6b, 0x13, 0x1f, 0x8f, 0xbf, 0x98, 0x61,
];
static mut KEY: [u8; 32] = HARDCODED_KEY;
static mut KEY_READY: bool = false;

fn handle(method: &str, _input: &[u8], out: &mut [u8]) -> usize {
    match method {
        "Wallet.Init" => {
            if key_ready() {
                write_bytes(out, b"exists")
            } else {
                init_hardcoded_key();
                write_bytes(out, b"ok")
            }
        }
        "Wallet.Rotate" => {
            rotate_key();
            write_bytes(out, b"ok")
        }
        "Wallet.Key" => {
            if !key_ready() {
                return write_bytes(out, b"not_initialized");
            }
            let key = key_copy();
            hex_encode(&key, out)
        }
        _ => 0,
    }
}

#[no_mangle]
pub extern "C" fn _start() -> ! {
    log!("Wallet applet ready");
    gotee_syscall::serve(handle)
}

fn key_ready() -> bool {
    unsafe { KEY_READY }
}

fn init_hardcoded_key() {
    unsafe {
        KEY_READY = true;
    }
}

fn rotate_key() {
    let mut buf = [0u8; 32];
    gotee_syscall::getrandom(&mut buf);
    unsafe {
        KEY = buf;
        KEY_READY = true;
    }
}

fn key_copy() -> [u8; 32] {
    unsafe { KEY }
}

fn write_bytes(out: &mut [u8], data: &[u8]) -> usize {
    let n = data.len().min(out.len());
    out[..n].copy_from_slice(&data[..n]);
    n
}

fn hex_encode(src: &[u8], out: &mut [u8]) -> usize {
    let mut o = 0usize;
    for &b in src {
        if o + 1 >= out.len() {
            break;
        }
        out[o] = nibble_hex(b >> 4);
        out[o + 1] = nibble_hex(b & 0x0f);
        o += 2;
    }
    o
}

fn nibble_hex(n: u8) -> u8 {
    match n {
        0..=9 => b'0' + n,
        _ => b'a' + (n - 10),
    }
}
