// RPC services exposed to the Trusted Applet.
//
// The applet can call these via gotee_syscall::rpc_request() / rpc_response().
// Add your own methods here to extend the applet ↔ OS interface.

package main

import (
	"crypto/aes"
	"errors"

	usbarmory "github.com/usbarmory/tamago/board/usbarmory/mk2"
	"github.com/usbarmory/tamago/soc/nxp/imx6ul"
)

// RPC is the receiver for Trusted Applet ↔ Trusted OS RPC calls.
type RPC struct{}

// Echo returns the input string back to the applet.
func (r *RPC) Echo(in string, out *string) error {
	*out = in
	return nil
}

// LEDStatus represents an LED state request.
type LEDStatus struct {
	Name string
	On   bool
}

// LED controls the USB Armory blue LED. The white LED is reserved for the
// Secure World.
func (r *RPC) LED(led LEDStatus, _ *bool) error {
	switch led.Name {
	case "blue", "Blue", "BLUE":
		return usbarmory.LED(led.Name, led.On)
	case "white", "White", "WHITE":
		return errors.New("white LED is reserved for Secure World")
	default:
		return errors.New("invalid LED name")
	}
}

// AttestationResult holds a derived key for remote attestation.
type AttestationResult struct {
	DerivedKey []byte
	Error      string
}

// Attest performs hardware key derivation using the on-chip crypto engine.
// This provides a device-unique key that can be used for remote attestation.
func (r *RPC) Attest(_ bool, result *AttestationResult) error {
	if !imx6ul.Native {
		result.Error = "attestation unavailable under emulation"
		return nil
	}

	var k []byte
	var err error

	switch {
	case imx6ul.CAAM != nil:
		imx6ul.CAAM.SetOwner(true)
		k = make([]byte, 32)
		err = imx6ul.CAAM.DeriveKey(make([]byte, 32), k)
	case imx6ul.DCP != nil:
		k, err = imx6ul.DCP.DeriveKey(
			make([]byte, aes.BlockSize),
			make([]byte, aes.BlockSize),
			-1,
		)
	default:
		result.Error = "no crypto engine available"
		return nil
	}

	if err != nil {
		result.Error = err.Error()
	} else {
		result.DerivedKey = k
	}

	return nil
}
