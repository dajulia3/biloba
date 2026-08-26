package protocol

import (
	"fmt"
	"net"
)

// Listen creates a TCP listener only when address resolves to a loopback IP.
func Listen(address string) (net.Listener, error) {
	resolved, err := net.ResolveTCPAddr("tcp", address)
	if err != nil {
		return nil, fmt.Errorf("resolve listen address: %w", err)
	}
	if resolved.IP == nil || !resolved.IP.IsLoopback() {
		return nil, fmt.Errorf("listen address %q is not loopback", address)
	}
	return net.ListenTCP("tcp", resolved)
}
