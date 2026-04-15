// QEMU-only TCP bridge path.
//
// On real hardware, the bridge listens on top of imx-usbnet's CDC-ECM gadget.
// QEMU doesn't emulate USB device mode, so we can't use that stack — instead
// we bring up the emulated i.MX6UL ENET MAC (which mcimx6ul-evk does
// emulate) and run a parallel gVisor netstack on it, then expose the same
// bridge listener on :4000 so the host curl → /square cycle works
// identically whether you're on hardware or in QEMU.
//
// This file only runs in !imx6ul.Native builds — on hardware it sits idle.

package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"runtime"

	"github.com/usbarmory/tamago/soc/nxp/enet"
	"github.com/usbarmory/tamago/soc/nxp/imx6ul"

	"gvisor.dev/gvisor/pkg/buffer"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/adapters/gonet"
	"gvisor.dev/gvisor/pkg/tcpip/header"
	"gvisor.dev/gvisor/pkg/tcpip/link/channel"
	"gvisor.dev/gvisor/pkg/tcpip/link/ethernet"
	"gvisor.dev/gvisor/pkg/tcpip/network/arp"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
	"gvisor.dev/gvisor/pkg/tcpip/transport/icmp"
	"gvisor.dev/gvisor/pkg/tcpip/transport/tcp"
	"gvisor.dev/gvisor/pkg/tcpip/transport/udp"
)

const (
	qemuNICID tcpip.NICID = 1
	qemuMTU   uint32      = 1500
)

type qemuNet struct {
	stack *stack.Stack
	link  *channel.Endpoint
	nic   *enet.ENET
	addr  tcpip.Address
}

// startQEMUNet initializes ENET1, attaches it to a gVisor netstack, and
// returns an interface the bridge can bind a listener to. SLIRP in QEMU
// speaks plain Ethernet to the guest so we need the full ARP / L2 path.
func startQEMUNet(ip, deviceMAC string) (*qemuNet, error) {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return nil, errors.New("qemu net: invalid ip")
	}
	parsedIP = parsedIP.To4()
	if parsedIP == nil {
		return nil, errors.New("qemu net: ipv4 required")
	}

	mac, err := net.ParseMAC(deviceMAC)
	if err != nil {
		return nil, fmt.Errorf("qemu net: invalid mac: %w", err)
	}

	nic := imx6ul.ENET1
	if nic == nil {
		return nil, errors.New("qemu net: ENET1 unavailable")
	}
	nic.MAC = mac
	nic.DiscardErrors = true
	nic.Init()
	// rx=false: descriptor rings get set up but Start does not enter the
	// polling loop; our own rxLoop goroutine drives Rx() instead.
	nic.Start(false)

	s := stack.New(stack.Options{
		NetworkProtocols: []stack.NetworkProtocolFactory{
			ipv4.NewProtocol,
			arp.NewProtocol,
		},
		TransportProtocols: []stack.TransportProtocolFactory{
			tcp.NewProtocol,
			icmp.NewProtocol4,
			udp.NewProtocol,
		},
	})

	linkAddr := tcpip.LinkAddress(mac)
	chEP := channel.New(256, qemuMTU, linkAddr)
	linkEP := ethernet.New(chEP)

	if tcpipErr := s.CreateNIC(qemuNICID, linkEP); tcpipErr != nil {
		return nil, fmt.Errorf("qemu net: CreateNIC: %v", tcpipErr)
	}

	addr := tcpip.AddrFromSlice(parsedIP)
	protoAddr := tcpip.ProtocolAddress{
		Protocol:          ipv4.ProtocolNumber,
		AddressWithPrefix: addr.WithPrefix(),
	}
	if tcpipErr := s.AddProtocolAddress(qemuNICID, protoAddr, stack.AddressProperties{}); tcpipErr != nil {
		return nil, fmt.Errorf("qemu net: AddProtocolAddress: %v", tcpipErr)
	}

	s.SetRouteTable([]tcpip.Route{{
		Destination: header.IPv4EmptySubnet,
		NIC:         qemuNICID,
	}})

	q := &qemuNet{
		stack: s,
		link:  chEP,
		nic:   nic,
		addr:  addr,
	}

	go q.rxLoop()
	go q.txLoop()

	return q, nil
}

// rxLoop shuttles Ethernet frames from ENET into gVisor.
func (q *qemuNet) rxLoop() {
	for {
		frame := q.nic.Rx()
		if frame == nil {
			runtime.Gosched()
			continue
		}
		pkt := stack.NewPacketBuffer(stack.PacketBufferOptions{
			Payload: buffer.MakeWithData(frame),
		})
		// The wrapping ethernet.Endpoint consumes the link header and
		// dispatches by EtherType, so the protocol argument is ignored.
		q.link.InjectInbound(0, pkt)
		pkt.DecRef()
	}
}

// txLoop shuttles gVisor's outbound frames out through ENET.
func (q *qemuNet) txLoop() {
	ctx := context.Background()
	for {
		pkt := q.link.ReadContext(ctx)
		if pkt == nil {
			return
		}
		var frame []byte
		for _, v := range pkt.AsSlices() {
			frame = append(frame, v...)
		}
		q.nic.Tx(frame)
		pkt.DecRef()
	}
}

// ListenerTCP4 returns a TCP listener bound to the qemuNet IPv4 address.
func (q *qemuNet) ListenerTCP4(port uint16) (net.Listener, error) {
	fa := tcpip.FullAddress{Addr: q.addr, Port: port, NIC: qemuNICID}
	l, err := gonet.ListenTCP(q.stack, fa, ipv4.ProtocolNumber)
	if err != nil {
		return nil, err
	}
	return l, nil
}
