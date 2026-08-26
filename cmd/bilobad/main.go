package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/onsi/biloba/engine"
	"github.com/onsi/biloba/protocol"
	"google.golang.org/grpc"
)

type config struct {
	chromePath  string
	token       string
	listen      string
	artifactDir string
}

type readyMessage struct {
	Address         string `json:"address"`
	Token           string `json:"token"`
	ProtocolVersion string `json:"protocol_version"`
	PID             int    `json:"pid"`
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Stdout, os.Stdin); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, stdout io.Writer, stdin io.Reader) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	if stdin != nil {
		go func() {
			_, _ = io.Copy(io.Discard, stdin)
			cancel()
		}()
	}
	config, err := parseConfig(args)
	if err != nil {
		return err
	}
	if config.token == "" {
		config.token, err = randomToken()
		if err != nil {
			return fmt.Errorf("generate token: %w", err)
		}
	}
	listener, err := protocol.Listen(config.listen)
	if err != nil {
		return err
	}
	defer listener.Close()

	browser, err := engine.StartBrowser(ctx, engine.BrowserConfig{ExecutablePath: config.chromePath, ArtifactDir: config.artifactDir})
	if err != nil {
		return err
	}
	server := protocol.NewServer(&engineBackend{browser: browser})
	defer server.Close()
	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(protocol.BearerAuthInterceptor(config.token)))
	protocol.RegisterServer(grpcServer, server)

	ready, err := marshalReady(listener.Addr().String(), config.token, os.Getpid())
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintln(stdout, string(ready)); err != nil {
		return fmt.Errorf("write ready message: %w", err)
	}
	serveErrors := make(chan error, 1)
	go func() { serveErrors <- grpcServer.Serve(listener) }()
	select {
	case <-ctx.Done():
		grpcServer.GracefulStop()
		return nil
	case err := <-serveErrors:
		if errors.Is(err, grpc.ErrServerStopped) {
			return nil
		}
		return fmt.Errorf("serve gRPC: %w", err)
	}
}

func parseConfig(args []string) (config, error) {
	flags := flag.NewFlagSet("bilobad", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var result config
	flags.StringVar(&result.chromePath, "chrome-path", "chrome-headless-shell", "Chrome or chrome-headless-shell executable")
	flags.StringVar(&result.token, "token", "", "bearer token (generated when omitted)")
	flags.StringVar(&result.listen, "listen", "127.0.0.1:0", "loopback listen address")
	flags.StringVar(&result.artifactDir, "artifact-dir", "", "failure artifact directory")
	if err := flags.Parse(args); err != nil {
		return config{}, err
	}
	return result, nil
}

func marshalReady(address, token string, pid int) ([]byte, error) {
	return json.Marshal(readyMessage{Address: address, Token: token, ProtocolVersion: protocol.Version, PID: pid})
}

func randomToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
