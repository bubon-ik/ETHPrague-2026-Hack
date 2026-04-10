//! HTTP helpers for the Trusted Applet.
//!
//! Provides ergonomic wrappers around JSON-RPC calls to the Trusted OS HTTP
//! services. No allocator needed — all data uses caller-provided buffers.
//!
//! # Outbound HTTP (applet → internet)
//!
//! ```no_run
//! use gotee_syscall::http;
//!
//! let mut buf = [0u8; 4096];
//! let resp = http::get("http://example.com/api/data", &mut buf);
//! if resp.status == 200 {
//!     // resp.body contains the response
//! }
//! ```
//!
//! # Inbound HTTP (serve requests)
//!
//! ```no_run
//! use gotee_syscall::http;
//!
//! http::serve(|req, resp| {
//!     resp.status = 200;
//!     resp.set_body(b"Hello from TrustZone!");
//! });
//! ```

use core::fmt::Write;

use crate::{rpc_request, rpc_response};

// ---------------------------------------------------------------------------
// Shared buffer for RPC communication
// ---------------------------------------------------------------------------

// Max size for RPC request/response payloads
const RPC_BUF_SIZE: usize = 65536;

// ---------------------------------------------------------------------------
// JSON helpers (minimal, no-alloc)
// ---------------------------------------------------------------------------

/// A fixed-size buffer that implements `core::fmt::Write` for building JSON strings.
struct JsonBuf {
    buf: [u8; 2048],
    pos: usize,
}

impl JsonBuf {
    fn new() -> Self {
        Self {
            buf: [0u8; 2048],
            pos: 0,
        }
    }

    fn as_bytes(&self) -> &[u8] {
        &self.buf[..self.pos]
    }
}

impl Write for JsonBuf {
    fn write_str(&mut self, s: &str) -> core::fmt::Result {
        let bytes = s.as_bytes();
        if self.pos + bytes.len() > self.buf.len() {
            return Err(core::fmt::Error);
        }
        self.buf[self.pos..self.pos + bytes.len()].copy_from_slice(bytes);
        self.pos += bytes.len();
        Ok(())
    }
}

/// Escapes a string for JSON (handles `"`, `\`, and control characters).
fn write_json_string(w: &mut JsonBuf, s: &str) -> core::fmt::Result {
    w.write_str("\"")?;
    for b in s.bytes() {
        match b {
            b'"' => w.write_str("\\\"")?,
            b'\\' => w.write_str("\\\\")?,
            b'\n' => w.write_str("\\n")?,
            b'\r' => w.write_str("\\r")?,
            b'\t' => w.write_str("\\t")?,
            0x00..=0x1f => write!(w, "\\u{:04x}", b)?,
            _ => {
                let ch = b as char;
                w.write_char(ch)?;
            }
        }
    }
    w.write_str("\"")
}

// ---------------------------------------------------------------------------
// HTTP Response parsing
// ---------------------------------------------------------------------------

/// An HTTP response returned from outbound requests.
pub struct HttpResponse<'a> {
    /// HTTP status code (e.g. 200, 404).
    pub status: u16,
    /// Response body as a UTF-8 string slice.
    pub body: &'a str,
    /// Error message if the request failed (empty on success).
    pub error: &'a str,
}

impl<'a> HttpResponse<'a> {
    /// Returns `true` if the request succeeded (status 200–299).
    pub fn ok(&self) -> bool {
        self.error.is_empty() && self.status >= 200 && self.status < 300
    }
}

/// Parses a JSON-RPC response containing an HTTPResponse result.
/// Expected format: `{"id":N,"result":{"Status":200,"StatusText":"...","Body":"...","Error":"..."}}`
fn parse_http_response(buf: &[u8], len: usize) -> HttpResponse<'_> {
    let s = core::str::from_utf8(&buf[..len]).unwrap_or("");

    // Extract error field first
    let error = extract_json_string(s, "\"Error\":");
    if !error.is_empty() {
        return HttpResponse {
            status: 0,
            body: "",
            error,
        };
    }

    // Extract status
    let status = extract_json_number(s, "\"Status\":");

    // Extract body
    let body = extract_json_string(s, "\"Body\":");

    HttpResponse {
        status: status as u16,
        body,
        error: "",
    }
}

/// Extracts a JSON string value following the given key.
/// Returns the unescaped content between the quotes.
fn extract_json_string<'a>(json: &'a str, key: &str) -> &'a str {
    let Some(key_pos) = json.find(key) else {
        return "";
    };

    let after_key = &json[key_pos + key.len()..];

    // Skip whitespace and find opening quote
    let Some(quote_start) = after_key.find('"') else {
        return "";
    };

    let content = &after_key[quote_start + 1..];

    // Find closing quote (handling escapes)
    let mut end = 0;
    let bytes = content.as_bytes();
    while end < bytes.len() {
        if bytes[end] == b'\\' {
            end += 2; // skip escaped char
        } else if bytes[end] == b'"' {
            return &content[..end];
        } else {
            end += 1;
        }
    }

    ""
}

/// Extracts a JSON number value following the given key.
fn extract_json_number(json: &str, key: &str) -> u32 {
    let Some(key_pos) = json.find(key) else {
        return 0;
    };

    let after_key = &json[key_pos + key.len()..];
    let trimmed = after_key.trim_start();

    let mut n: u32 = 0;
    for b in trimmed.bytes() {
        if b.is_ascii_digit() {
            n = n * 10 + (b - b'0') as u32;
        } else {
            break;
        }
    }
    n
}

// ---------------------------------------------------------------------------
// Outbound HTTP: GET
// ---------------------------------------------------------------------------

/// Makes an HTTP GET request to the given URL.
///
/// The response body is written into `buf`. Returns an [`HttpResponse`] with
/// the status code and a reference into `buf` for the body.
///
/// # Example
///
/// ```no_run
/// let mut buf = [0u8; 4096];
/// let resp = gotee_syscall::http::get("http://httpbin.org/get", &mut buf);
/// if resp.ok() {
///     gotee_syscall::log!("Got: {}", resp.body);
/// }
/// ```
pub fn get<'a>(url: &str, buf: &'a mut [u8]) -> HttpResponse<'a> {
    let mut req = JsonBuf::new();
    req.write_str(r#"{"method":"RPC.HTTPGet","params":["#).ok();
    write_json_string(&mut req, url).ok();
    req.write_str(r#"],"id":1}"#).ok();

    rpc_request(req.as_bytes());
    let n = rpc_response(buf);
    parse_http_response(buf, n)
}

// ---------------------------------------------------------------------------
// Outbound HTTP: POST
// ---------------------------------------------------------------------------

/// Makes an HTTP POST request.
///
/// # Example
///
/// ```no_run
/// let mut buf = [0u8; 4096];
/// let resp = gotee_syscall::http::post(
///     "http://httpbin.org/post",
///     "application/json",
///     r#"{"hello":"world"}"#,
///     &mut buf,
/// );
/// ```
pub fn post<'a>(url: &str, content_type: &str, body: &str, buf: &'a mut [u8]) -> HttpResponse<'a> {
    let mut req = JsonBuf::new();
    req.write_str(r#"{"method":"RPC.HTTPPost","params":[{"URL":"#).ok();
    write_json_string(&mut req, url).ok();
    req.write_str(r#","Method":"POST","ContentType":"#).ok();
    write_json_string(&mut req, content_type).ok();
    req.write_str(r#","Body":"#).ok();
    write_json_string(&mut req, body).ok();
    req.write_str(r#","TimeoutSecs":30}],"id":1}"#).ok();

    rpc_request(req.as_bytes());
    let n = rpc_response(buf);
    parse_http_response(buf, n)
}

// ---------------------------------------------------------------------------
// Inbound HTTP server
// ---------------------------------------------------------------------------

/// An incoming HTTP request from a client hitting the built-in HTTP server.
pub struct Request<'a> {
    /// Unique request ID (used internally to match responses).
    pub id: u64,
    /// HTTP method (GET, POST, etc.)
    pub method: &'a str,
    /// Request path (e.g. "/api/data")
    pub path: &'a str,
    /// Query string (e.g. "key=value&foo=bar")
    pub query: &'a str,
    /// Content-Type header value
    pub content_type: &'a str,
    /// Request body
    pub body: &'a str,
}

/// An HTTP response builder for the applet to fill in.
pub struct Response {
    /// HTTP status code (default: 200)
    pub status: u16,
    content_type_buf: [u8; 128],
    content_type_len: usize,
    body_buf: [u8; RPC_BUF_SIZE],
    body_len: usize,
}

impl Response {
    fn new() -> Self {
        Self {
            status: 200,
            content_type_buf: [0u8; 128],
            content_type_len: 0,
            body_buf: [0u8; RPC_BUF_SIZE],
            body_len: 0,
        }
    }

    /// Sets the response Content-Type.
    pub fn set_content_type(&mut self, ct: &str) {
        let len = ct.len().min(self.content_type_buf.len());
        self.content_type_buf[..len].copy_from_slice(&ct.as_bytes()[..len]);
        self.content_type_len = len;
    }

    /// Sets the response body from a byte slice.
    pub fn set_body(&mut self, body: &[u8]) {
        let len = body.len().min(self.body_buf.len());
        self.body_buf[..len].copy_from_slice(&body[..len]);
        self.body_len = len;
    }

    /// Sets the response body from a string.
    pub fn set_body_str(&mut self, body: &str) {
        self.set_body(body.as_bytes());
    }

    fn content_type(&self) -> &str {
        core::str::from_utf8(&self.content_type_buf[..self.content_type_len]).unwrap_or("")
    }

    fn body(&self) -> &str {
        core::str::from_utf8(&self.body_buf[..self.body_len]).unwrap_or("")
    }

    fn reset(&mut self) {
        self.status = 200;
        self.content_type_len = 0;
        self.body_len = 0;
    }
}

/// Runs an HTTP server loop, dispatching incoming requests to the handler.
///
/// This function never returns. It repeatedly:
/// 1. Waits for an HTTP request from the Trusted OS HTTP server (port 8080)
/// 2. Calls your handler with the request and a response builder
/// 3. Sends the response back to the client
///
/// The Trusted OS HTTP server listens on `10.0.0.1:8080`. From the host:
/// ```bash
/// curl http://10.0.0.1:8080/hello
/// ```
///
/// # Example
///
/// ```no_run
/// gotee_syscall::http::serve(|req, resp| {
///     match req.path {
///         "/hello" => {
///             resp.set_content_type("text/plain");
///             resp.set_body(b"Hello from TrustZone!");
///         }
///         _ => {
///             resp.status = 404;
///             resp.set_body(b"Not Found");
///         }
///     }
/// });
/// ```
pub fn serve(mut handler: impl FnMut(&Request, &mut Response)) -> ! {
    let mut rpc_buf: [u8; RPC_BUF_SIZE] = [0u8; RPC_BUF_SIZE];
    let mut resp = Response::new();

    loop {
        // 1. Wait for incoming request
        let wait_req = br#"{"method":"RPC.WaitForRequest","params":[false],"id":1}"#;
        rpc_request(wait_req);
        let n = rpc_response(&mut rpc_buf);

        let json = core::str::from_utf8(&rpc_buf[..n]).unwrap_or("");

        // Parse the incoming request fields
        let id = extract_json_number(json, "\"ID\":");
        let method = extract_json_string(json, "\"Method\":");
        let path = extract_json_string(json, "\"Path\":");
        let query = extract_json_string(json, "\"Query\":");
        let content_type = extract_json_string(json, "\"ContentType\":");
        let body = extract_json_string(json, "\"Body\":");

        let req = Request {
            id: id as u64,
            method,
            path,
            query,
            content_type,
            body,
        };

        // 2. Call the handler
        resp.reset();
        handler(&req, &mut resp);

        // 3. Send response back
        let mut send_buf = JsonBuf::new();
        write!(
            &mut send_buf,
            r#"{{"method":"RPC.SendResponse","params":[{{"ID":{},"Status":{},"ContentType":"#,
            req.id, resp.status
        ).ok();
        write_json_string(&mut send_buf, resp.content_type()).ok();
        send_buf.write_str(r#","Body":"#).ok();
        write_json_string(&mut send_buf, resp.body()).ok();
        send_buf.write_str(r#"}}],"id":2}"#).ok();

        rpc_request(send_buf.as_bytes());
        // Read the RPC ack (discard)
        rpc_response(&mut rpc_buf);
    }
}
