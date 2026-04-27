// TCP bridge between a host caller and the Trusted Applet.
//
// Exposes a single newline-delimited JSON protocol on the USB networking
// interface: host writes {"Method","Input"} and reads {"Output"|"Error"}.
// This is the only entry point Normal World callers have into the applet —
// CallApplet is what actually drives the dispatch loop in rpc.go.
//
// Method "__upload" is intercepted here to receive a new applet ELF over
// the wire, persist it to the SD card, and trigger a platform reset so the
// next boot loads it (see M2 — applet_store.go / reset.go).

package main

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net"
)

const bridgePort = 4000

type bridgeRequest struct {
	Method string
	Input  string
}

type bridgeReply struct {
	Output string
	Error  string `json:",omitempty"`
}

func startBridge(l net.Listener) {
	log.Printf("SM bridge listening on :%d", bridgePort)

	for {
		conn, err := l.Accept()
		if err != nil {
			continue
		}
		go handleBridgeConn(conn)
	}
}

func handleBridgeConn(conn net.Conn) {
	defer conn.Close()

	dec := json.NewDecoder(conn)
	enc := json.NewEncoder(conn)

	for {
		var req bridgeRequest
		if err := dec.Decode(&req); err != nil {
			return
		}

		switch req.Method {
		case "__upload":
			elf, err := base64.StdEncoding.DecodeString(req.Input)
			if err != nil {
				enc.Encode(bridgeReply{Error: "base64: " + err.Error()})
				continue
			}
			if err := writeAppletToSD(elf); err != nil {
				enc.Encode(bridgeReply{Error: err.Error()})
				continue
			}
			enc.Encode(bridgeReply{Output: "ok, rebooting"})
			conn.Close()
			log.Print("SM applet upload accepted, rebooting")
			triggerReset()
			return
		default:
			enc.Encode(bridgeReply{Output: CallApplet(req.Method, req.Input)})
		}
	}
}
