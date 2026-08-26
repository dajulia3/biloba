package main

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"os"
	"testing"
	"time"

	"github.com/onsi/biloba/protocol"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

func TestBilobad(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Bilobad Suite")
}

var _ = Describe("bilobad", func() {
	It("parses daemon flags", func() {
		parsed, err := parseConfig([]string{
			"-chrome-path", "/opt/chrome",
			"-token", "secret",
			"-listen", "127.0.0.1:4321",
			"-artifact-dir", "/tmp/artifacts",
		})
		Expect(err).NotTo(HaveOccurred())
		Expect(parsed).To(Equal(config{
			chromePath: "/opt/chrome", token: "secret", listen: "127.0.0.1:4321", artifactDir: "/tmp/artifacts",
		}))
	})

	It("writes one machine-readable ready object", func() {
		line, err := marshalReady("127.0.0.1:1234", "secret", 42)
		Expect(err).NotTo(HaveOccurred())
		var ready readyMessage
		Expect(json.Unmarshal(line, &ready)).To(Succeed())
		Expect(ready).To(Equal(readyMessage{
			Address: "127.0.0.1:1234", Token: "secret", ProtocolVersion: protocol.Version, PID: 42,
		}))
	})

	Describe("evaluation arguments", func() {
		It("preserves an expression for an empty argument array", func() {
			plain, err := evaluationScript("document.title", `[]`)
			Expect(err).NotTo(HaveOccurred())
			Expect(plain).To(Equal("document.title"))
		})

		It("applies a JSON argument array", func() {
			script, err := evaluationScript("(left, right) => left + right", `[2,3]`)
			Expect(err).NotTo(HaveOccurred())
			Expect(script).To(Equal(`((left, right) => left + right)(...[2,3])`))
		})

		It("rejects a non-array argument value", func() {
			_, err := evaluationScript("value => value", `{}`)
			Expect(err).To(HaveOccurred())
		})
	})

	It("compares value assertions against expected JSON", func() {
		Expect(matchesExpectedJSON("selected", `"selected"`)).To(BeTrue())
		Expect(matchesExpectedJSON("selected", `"other"`)).To(BeFalse())
	})

	It("shuts down when its parent closes stdin", func() {
		chromePath := os.Getenv("BILOBA_CHROME_HEADLESS_SHELL")
		if chromePath == "" {
			Skip("BILOBA_CHROME_HEADLESS_SHELL is required for the daemon lifecycle spec")
		}
		stdinReader, stdinWriter := io.Pipe()
		stdoutReader, stdoutWriter := io.Pipe()
		done := make(chan error, 1)
		go func() {
			defer GinkgoRecover()
			done <- run(context.Background(), []string{
				"--listen=127.0.0.1:0", "--token=secret", "--chrome-path=" + chromePath,
			}, stdoutWriter, stdinReader)
		}()
		scanner := bufio.NewScanner(stdoutReader)
		Expect(scanner.Scan()).To(BeTrue())
		Expect(stdinWriter.Close()).To(Succeed())
		Eventually(done, 5*time.Second).Should(Receive(Succeed()))
		Expect(stdoutWriter.Close()).To(Succeed())
		Expect(stdoutReader.Close()).To(Succeed())
		Expect(stdinReader.Close()).To(Succeed())
	})
})
