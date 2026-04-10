//! HTTP Client — Fetch data from the internet and process it.
//!
//! Demonstrates making outbound HTTP requests from within TrustZone.
//!
//! Prerequisites:
//!   - USB Armory connected to host
//!   - Host enables IP forwarding for the USB Armory interface:
//!     ```
//!     # Linux
//!     sudo sysctl net.ipv4.ip_forward=1
//!     sudo iptables -t nat -A POSTROUTING -s 10.0.0.1 -o eth0 -j MASQUERADE
//!
//!     # macOS
//!     sudo sysctl -w net.inet.ip.forwarding=1
//!     echo "nat on en0 from 10.0.0.0/24 to any -> (en0)" | sudo pfctl -ef -
//!     ```
//!
//! To build: cp examples/http_client/main.rs src/main.rs && make

#![no_std]
#![no_main]

use gotee_syscall::{self, http, log};

#[no_mangle]
pub extern "C" fn _start() -> ! {
    log!("HTTP Client example");

    // --- Simple GET request ---
    log!("Fetching http://httpbin.org/get ...");
    let mut buf = [0u8; 4096];
    let resp = http::get("http://httpbin.org/get", &mut buf);

    if resp.ok() {
        log!("Status: {}", resp.status);
        log!("Body ({} bytes): {}", resp.body.len(), resp.body);
    } else if !resp.error.is_empty() {
        log!("Request failed: {}", resp.error);
    } else {
        log!("HTTP error: {}", resp.status);
    }

    // --- GET with data processing ---
    log!("Fetching http://httpbin.org/uuid ...");
    let resp = http::get("http://httpbin.org/uuid", &mut buf);

    if resp.ok() {
        // Simple parsing: find the UUID in the JSON response
        // Response looks like: {"uuid": "abc-123-..."}
        if let Some(start) = resp.body.find("\"uuid\"") {
            log!("Extracted UUID field: {}", &resp.body[start..]);
        }
    }

    // --- POST request ---
    log!("Posting data to http://httpbin.org/post ...");
    let resp = http::post(
        "http://httpbin.org/post",
        "application/json",
        r#"{"message":"Hello from TrustZone!","secure":true}"#,
        &mut buf,
    );

    if resp.ok() {
        log!("POST response ({} bytes)", resp.body.len());
    } else {
        log!("POST failed: {} {}", resp.status, resp.error);
    }

    log!("HTTP Client example complete");
    gotee_syscall::exit();
}
