package protocol_test

import (
	"net"

	"github.com/onsi/biloba/protocol"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("protocol listener", func() {
	It("only accepts loopback addresses", func() {
		listener, err := protocol.Listen("127.0.0.1:0")
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(listener.Close)
		Expect(listener.Addr().(*net.TCPAddr).IP.String()).To(Equal("127.0.0.1"))

		for _, address := range []string{"0.0.0.0:0", ":0", "192.0.2.1:0"} {
			listener, err := protocol.Listen(address)
			Expect(err).To(HaveOccurred(), address)
			if listener != nil {
				Expect(listener.Close()).To(Succeed())
			}
		}
	})
})
