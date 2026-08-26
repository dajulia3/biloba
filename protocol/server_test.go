package protocol_test

import (
	"context"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/onsi/biloba/protocol"
	bilobav1 "github.com/onsi/biloba/protocol/internal/bilobav1"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

func TestProtocol(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Protocol Suite")
}

var _ = Describe("driver protocol", func() {
	It("requires bearer authentication", func() {
		client, cleanup := startTestServer(&fakeBackend{}, "secret")
		DeferCleanup(cleanup)

		_, err := client.Handshake(context.Background(), &bilobav1.HandshakeRequest{ProtocolVersion: protocol.Version})
		Expect(status.Code(err)).To(Equal(codes.Unauthenticated))

		ctx := metadata.AppendToOutgoingContext(context.Background(), "authorization", "Bearer wrong")
		_, err = client.Handshake(ctx, &bilobav1.HandshakeRequest{ProtocolVersion: protocol.Version})
		Expect(status.Code(err)).To(Equal(codes.Unauthenticated))
	})

	It("negotiates the version and advertises capabilities", func() {
		client, cleanup := startTestServer(&fakeBackend{}, "secret")
		DeferCleanup(cleanup)
		ctx := authenticatedContext("secret")

		response, err := client.Handshake(ctx, &bilobav1.HandshakeRequest{ProtocolVersion: protocol.Version})
		Expect(err).NotTo(HaveOccurred())
		Expect(response.ProtocolVersion).To(Equal(protocol.Version))
		Expect(response.Capabilities).NotTo(BeEmpty())

		_, err = client.Handshake(ctx, &bilobav1.HandshakeRequest{ProtocolVersion: "999"})
		Expect(status.Code(err)).To(Equal(codes.FailedPrecondition))
	})

	It("opens, prepares, and closes a session", func() {
		backend := &fakeBackend{}
		client, cleanup := startTestServer(backend, "secret")
		DeferCleanup(cleanup)
		ctx := authenticatedContext("secret")

		opened, err := client.OpenSession(ctx, &bilobav1.OpenSessionRequest{})
		Expect(err).NotTo(HaveOccurred())
		Expect(opened.SessionId).NotTo(BeEmpty())
		_, err = client.PrepareSession(ctx, &bilobav1.PrepareSessionRequest{SessionId: opened.SessionId})
		Expect(err).NotTo(HaveOccurred())
		_, err = client.CloseSession(ctx, &bilobav1.CloseSessionRequest{SessionId: opened.SessionId})
		Expect(err).NotTo(HaveOccurred())
		_, err = client.PrepareSession(ctx, &bilobav1.PrepareSessionRequest{SessionId: opened.SessionId})
		Expect(status.Code(err)).To(Equal(codes.NotFound))
		Expect(backend.opened).To(Equal(1))
		Expect(backend.session.prepared).To(Equal(1))
		Expect(backend.session.closed).To(Equal(1))
	})

	It("propagates request cancellation to the session", func() {
		backend := &fakeBackend{session: &fakeSession{blockNavigate: true, cancelled: make(chan struct{})}}
		client, cleanup := startTestServer(backend, "secret")
		DeferCleanup(cleanup)
		ctx := authenticatedContext("secret")
		opened, err := client.OpenSession(ctx, &bilobav1.OpenSessionRequest{})
		Expect(err).NotTo(HaveOccurred())

		deadlineCtx, cancel := context.WithTimeout(ctx, 25*time.Millisecond)
		DeferCleanup(cancel)
		_, err = client.Navigate(deadlineCtx, &bilobav1.NavigateRequest{SessionId: opened.SessionId, Url: "https://example.test"})
		Expect(status.Code(err)).To(Equal(codes.DeadlineExceeded))
		Eventually(backend.session.cancelled).Should(BeClosed())
	})

	It("reports many internal poll attempts from one RPC", func() {
		backend := &fakeBackend{session: &fakeSession{result: protocol.Result{
			Matched: true, ObservedJSON: `"ready"`, Attempts: 3,
			Trajectory: []protocol.Observation{{Attempt: 1}, {Attempt: 2}, {Attempt: 3}},
		}}}
		client, cleanup := startTestServer(backend, "secret")
		DeferCleanup(cleanup)
		ctx := authenticatedContext("secret")
		opened, err := client.OpenSession(ctx, &bilobav1.OpenSessionRequest{})
		Expect(err).NotTo(HaveOccurred())

		result, err := client.Assert(ctx, &bilobav1.AssertRequest{
			SessionId: opened.SessionId,
			Assertion: &bilobav1.Assertion{
				Kind:           bilobav1.Assertion_TEXT,
				Locator:        &bilobav1.Locator{Kind: bilobav1.LocatorKind_CSS, Value: "#status"},
				ExpectedString: "ready",
			},
		})
		Expect(err).NotTo(HaveOccurred())
		Expect(result.AttemptCount).To(Equal(uint32(3)))
		Expect(result.Trajectory).To(HaveLen(3))
		Expect(result.RpcRequestCount).To(Equal(uint32(1)))
		Expect(result.RpcResponseCount).To(Equal(uint32(1)))
	})

	It("preserves a backend gRPC status", func() {
		backend := &fakeBackend{session: &fakeSession{executeErr: status.Error(codes.InvalidArgument, "bad value")}}
		client, cleanup := startTestServer(backend, "secret")
		DeferCleanup(cleanup)
		ctx := authenticatedContext("secret")
		opened, err := client.OpenSession(ctx, &bilobav1.OpenSessionRequest{})
		Expect(err).NotTo(HaveOccurred())
		_, err = client.Navigate(ctx, &bilobav1.NavigateRequest{SessionId: opened.SessionId, Url: "https://example.test"})
		Expect(status.Code(err)).To(Equal(codes.InvalidArgument))
	})

	It("serializes commands within a session", func() {
		blocking := &blockingSession{entered: make(chan string, 2), release: make(chan struct{}, 2)}
		client, cleanup := startTestServer(&fakeBackend{custom: blocking}, "secret")
		DeferCleanup(cleanup)
		ctx := authenticatedContext("secret")
		opened, err := client.OpenSession(ctx, &bilobav1.OpenSessionRequest{})
		Expect(err).NotTo(HaveOccurred())
		results := make(chan error, 2)
		for _, destination := range []string{"https://example.test/first", "https://example.test/second"} {
			go func(destination string) {
				defer GinkgoRecover()
				_, callErr := client.Navigate(ctx, &bilobav1.NavigateRequest{SessionId: opened.SessionId, Url: destination})
				results <- callErr
			}(destination)
		}

		Eventually(blocking.entered).Should(Receive())
		Consistently(blocking.entered, 50*time.Millisecond).ShouldNot(Receive())
		blocking.release <- struct{}{}
		Eventually(results).Should(Receive(Succeed()))
		Eventually(blocking.entered).Should(Receive())
		blocking.release <- struct{}{}
		Eventually(results).Should(Receive(Succeed()))
		Expect(blocking.maxActive).To(Equal(1))
	})
})

func startTestServer(backend protocol.Backend, token string) (bilobav1.BilobaDriverClient, func()) {
	listener := bufconn.Listen(1024 * 1024)
	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(protocol.BearerAuthInterceptor(token)))
	server := protocol.NewServer(backend)
	bilobav1.RegisterBilobaDriverServer(grpcServer, server)
	go func() {
		defer GinkgoRecover()
		_ = grpcServer.Serve(listener)
	}()
	connection, err := grpc.NewClient("passthrough:///bufnet", grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
		return listener.Dial()
	}), grpc.WithTransportCredentials(insecure.NewCredentials()))
	Expect(err).NotTo(HaveOccurred())
	return bilobav1.NewBilobaDriverClient(connection), func() {
		Expect(connection.Close()).To(Succeed())
		grpcServer.Stop()
		Expect(server.Close()).To(Succeed())
	}
}

func authenticatedContext(token string) context.Context {
	return metadata.AppendToOutgoingContext(context.Background(), "authorization", "Bearer "+token)
}

type fakeBackend struct {
	mu      sync.Mutex
	opened  int
	session *fakeSession
	custom  protocol.Session
}

func (b *fakeBackend) OpenSession(context.Context) (protocol.Session, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.opened++
	if b.custom != nil {
		return b.custom, nil
	}
	if b.session == nil {
		b.session = &fakeSession{}
	}
	return b.session, nil
}

type blockingSession struct {
	mu        sync.Mutex
	active    int
	maxActive int
	entered   chan string
	release   chan struct{}
}

func (*blockingSession) Prepare(context.Context) error { return nil }
func (*blockingSession) Close() error                  { return nil }

func (s *blockingSession) Execute(_ context.Context, operation protocol.Operation) (protocol.Result, error) {
	s.mu.Lock()
	s.active++
	if s.active > s.maxActive {
		s.maxActive = s.active
	}
	s.mu.Unlock()
	s.entered <- operation.URL
	<-s.release
	s.mu.Lock()
	s.active--
	s.mu.Unlock()
	return protocol.Result{Matched: true, Attempts: 1}, nil
}

func (b *fakeBackend) Close() error { return nil }

type fakeSession struct {
	prepared      int
	closed        int
	blockNavigate bool
	cancelled     chan struct{}
	result        protocol.Result
	executeErr    error
}

func (s *fakeSession) Prepare(context.Context) error {
	s.prepared++
	return nil
}

func (s *fakeSession) Execute(ctx context.Context, operation protocol.Operation) (protocol.Result, error) {
	if s.executeErr != nil {
		return protocol.Result{}, s.executeErr
	}
	if s.blockNavigate && operation.Kind == protocol.OperationNavigate {
		<-ctx.Done()
		close(s.cancelled)
		return protocol.Result{}, ctx.Err()
	}
	if s.result.Attempts != 0 {
		return s.result, nil
	}
	return protocol.Result{Matched: true, Attempts: 1}, nil
}

func (s *fakeSession) Close() error {
	s.closed++
	return nil
}
