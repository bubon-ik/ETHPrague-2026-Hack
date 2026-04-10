// HTTP services for the Trusted Applet.
//
// Provides two capabilities:
//   1. Outbound HTTP: applet can make GET/POST requests to the internet
//      (requires host to enable IP forwarding for the USB Armory)
//   2. Inbound HTTP: applet can serve HTTP requests via a long-poll pattern
//      (the Trusted OS runs the HTTP server, applet handles requests via RPC)

package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Maximum HTTP response body size returned to the applet.
const maxHTTPBody = 65536

// ---------------------------------------------------------------------------
// Outbound HTTP (applet → internet)
// ---------------------------------------------------------------------------

// HTTPRequest represents an outbound HTTP request from the applet.
type HTTPRequest struct {
	URL         string
	Method      string // GET, POST, PUT, DELETE (default: GET)
	ContentType string // for POST/PUT
	Body        string // request body for POST/PUT
	TimeoutSecs int    // request timeout (default: 30)
}

// HTTPResponse is returned to the applet for both outbound and inbound HTTP.
type HTTPResponse struct {
	Status     int
	StatusText string
	Body       string
	Error      string
}

// HTTPGet makes an outbound HTTP GET request.
func (r *RPC) HTTPGet(url string, result *HTTPResponse) error {
	return r.HTTPDo(HTTPRequest{URL: url, Method: "GET"}, result)
}

// HTTPPost makes an outbound HTTP POST request.
func (r *RPC) HTTPPost(req HTTPRequest, result *HTTPResponse) error {
	if req.Method == "" {
		req.Method = "POST"
	}
	return r.HTTPDo(req, result)
}

// HTTPDo makes an outbound HTTP request with full control.
func (r *RPC) HTTPDo(req HTTPRequest, result *HTTPResponse) error {
	timeout := time.Duration(req.TimeoutSecs) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	client := &http.Client{Timeout: timeout}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	method := req.Method
	if method == "" {
		method = "GET"
	}

	httpReq, err := http.NewRequest(method, req.URL, bodyReader)
	if err != nil {
		result.Error = fmt.Sprintf("request creation failed: %v", err)
		return nil
	}

	if req.ContentType != "" {
		httpReq.Header.Set("Content-Type", req.ContentType)
	}

	httpReq.Header.Set("User-Agent", "GoTEE-TrustedApplet/1.0")

	log.Printf("SM HTTP %s %s", method, req.URL)

	resp, err := client.Do(httpReq)
	if err != nil {
		result.Error = fmt.Sprintf("request failed: %v", err)
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHTTPBody))
	if err != nil {
		result.Error = fmt.Sprintf("body read failed: %v", err)
		return nil
	}

	result.Status = resp.StatusCode
	result.StatusText = resp.Status
	result.Body = string(body)

	log.Printf("SM HTTP %s %s → %d (%d bytes)", method, req.URL, resp.StatusCode, len(body))

	return nil
}

// ---------------------------------------------------------------------------
// Inbound HTTP server (internet → applet)
// ---------------------------------------------------------------------------

// IncomingRequest is sent to the applet when an HTTP request arrives.
type IncomingRequest struct {
	ID          uint64
	Method      string
	Path        string
	Query       string
	ContentType string
	Body        string
	RemoteAddr  string
}

// OutgoingResponse is sent by the applet to respond to an HTTP request.
type OutgoingResponse struct {
	ID          uint64
	Status      int
	ContentType string
	Body        string
}

// pendingRequest holds a request waiting for the applet to respond.
type pendingRequest struct {
	req    IncomingRequest
	respCh chan OutgoingResponse
}

var (
	requestQueue = make(chan pendingRequest, 1)
	requestID    uint64
	requestMu    sync.Mutex
)

// WaitForRequest blocks until an HTTP request arrives on the built-in server.
// Returns the request details to the applet.
func (r *RPC) WaitForRequest(_ bool, result *IncomingRequest) error {
	pending := <-requestQueue
	*result = pending.req
	return nil
}

// SendResponse sends the applet's HTTP response back to the waiting client.
func (r *RPC) SendResponse(resp OutgoingResponse, _ *bool) error {
	// Find the pending request by ID and send the response.
	// Since we process one request at a time, the response channel is
	// stored in the most recent pending request.
	pendingResponseMu.Lock()
	ch, ok := pendingResponses[resp.ID]
	if ok {
		delete(pendingResponses, resp.ID)
	}
	pendingResponseMu.Unlock()

	if !ok {
		return fmt.Errorf("no pending request with ID %d", resp.ID)
	}

	ch <- resp
	return nil
}

var (
	pendingResponses  = make(map[uint64]chan OutgoingResponse)
	pendingResponseMu sync.Mutex
)

// httpHandler dispatches incoming HTTP requests to the applet via RPC.
func httpHandler(w http.ResponseWriter, r *http.Request) {
	// Read request body
	var body string
	if r.Body != nil {
		b, err := io.ReadAll(io.LimitReader(r.Body, maxHTTPBody))
		if err == nil {
			body = string(b)
		}
		r.Body.Close()
	}

	// Assign request ID
	requestMu.Lock()
	requestID++
	id := requestID
	requestMu.Unlock()

	incoming := IncomingRequest{
		ID:          id,
		Method:      r.Method,
		Path:        r.URL.Path,
		Query:       r.URL.RawQuery,
		ContentType: r.Header.Get("Content-Type"),
		Body:        body,
		RemoteAddr:  r.RemoteAddr,
	}

	// Create response channel
	respCh := make(chan OutgoingResponse, 1)
	pendingResponseMu.Lock()
	pendingResponses[id] = respCh
	pendingResponseMu.Unlock()

	log.Printf("SM HTTP server: %s %s from %s (id:%d)", r.Method, r.URL.Path, r.RemoteAddr, id)

	// Send request to applet (blocks until applet calls WaitForRequest)
	requestQueue <- pendingRequest{req: incoming, respCh: respCh}

	// Wait for applet response (with timeout)
	select {
	case resp := <-respCh:
		if resp.ContentType != "" {
			w.Header().Set("Content-Type", resp.ContentType)
		}
		status := resp.Status
		if status == 0 {
			status = 200
		}
		w.WriteHeader(status)
		w.Write([]byte(resp.Body))
	case <-time.After(30 * time.Second):
		// Cleanup
		pendingResponseMu.Lock()
		delete(pendingResponses, id)
		pendingResponseMu.Unlock()

		http.Error(w, "applet response timeout", http.StatusGatewayTimeout)
		log.Printf("SM HTTP server: request %d timed out", id)
	}
}

// startHTTPServer starts the HTTP server on the given listener.
// All requests are forwarded to the applet via the RPC long-poll mechanism.
func startHTTPServer(listener net.Listener) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", httpHandler)

	server := &http.Server{
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 35 * time.Second, // > applet timeout
	}

	log.Printf("SM HTTP server listening on port %d", httpPort)

	if err := server.Serve(listener); err != nil {
		log.Printf("SM HTTP server error: %v", err)
	}
}
