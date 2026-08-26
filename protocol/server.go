package protocol

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	bilobav1 "github.com/onsi/biloba/protocol/internal/bilobav1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const Version = "1"

var Capabilities = []string{
	"locator.css", "locator.test_id", "locator.text", "locator.role", "locator.first",
	"session.prepare", "navigation", "cookies", "action.click", "action.set_value",
	"evaluate", "assert.visible", "assert.text", "assert.count", "assert.attribute",
	"assert.value", "assert.url", "assert.evaluate", "poll.server_side", "diagnostics.structured",
}

type Backend interface {
	OpenSession(context.Context) (Session, error)
	Close() error
}

type Session interface {
	Prepare(context.Context) error
	Execute(context.Context, Operation) (Result, error)
	Close() error
}

type OperationKind uint8

const (
	OperationNavigate OperationKind = iota + 1
	OperationSetCookies
	OperationClick
	OperationSetValue
	OperationEvaluate
	OperationAssert
)

type Operation struct {
	Kind          OperationKind
	URL           string
	Cookies       []Cookie
	Locator       Locator
	Poll          PollPolicy
	ValueJSON     string
	Expression    string
	ArgumentsJSON string
	Assertion     Assertion
}

type LocatorKind uint8

const (
	LocatorCSS LocatorKind = iota + 1
	LocatorTestID
	LocatorText
	LocatorRole
)

type MatchMode uint8

const (
	MatchExact MatchMode = iota + 1
	MatchContains
)

type Locator struct {
	Kind  LocatorKind
	Value string
	Role  string
	Name  string
	Match MatchMode
	First bool
}

type PollPolicy struct {
	Timeout  time.Duration
	Interval time.Duration
}

type Cookie struct {
	Name, Value, Domain, Path, SameSite string
	Secure, HTTPOnly                    bool
	ExpiresUnix                         float64
}

type AssertionKind uint8

const (
	AssertionVisible AssertionKind = iota + 1
	AssertionText
	AssertionCount
	AssertionAttribute
	AssertionValue
	AssertionURL
	AssertionEvaluate
)

type Assertion struct {
	Kind           AssertionKind
	Locator        Locator
	Attribute      string
	Expression     string
	ExpectedString string
	ExpectedCount  int64
	ExpectedJSON   string
	Match          MatchMode
}

type Result struct {
	Matched      bool
	ObservedJSON string
	Attempts     uint32
	Trajectory   []Observation
	StartedAt    time.Time
	Elapsed      time.Duration
	Diagnostics  Diagnostics
}

type Observation struct {
	Attempt      uint32
	Elapsed      time.Duration
	ObservedJSON string
	RetryReason  string
}

type Diagnostics struct {
	Locator, Expected, DOMOutline, ScreenshotPath, DaemonDetail string
}

type Server struct {
	bilobav1.UnimplementedBilobaDriverServer
	backend  Backend
	mu       sync.Mutex
	sessions map[string]*sessionEntry
}

type sessionEntry struct {
	mu      sync.Mutex
	session Session
}

func NewServer(backend Backend) *Server {
	return &Server{backend: backend, sessions: map[string]*sessionEntry{}}
}

// RegisterServer registers the internal generated transport without exposing it to callers.
func RegisterServer(registrar grpc.ServiceRegistrar, server *Server) {
	bilobav1.RegisterBilobaDriverServer(registrar, server)
}

func BearerAuthInterceptor(token string) grpc.UnaryServerInterceptor {
	expected := []byte("Bearer " + token)
	return func(ctx context.Context, request any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		values := metadata.ValueFromIncomingContext(ctx, "authorization")
		if len(values) != 1 || len(values[0]) != len(expected) || subtle.ConstantTimeCompare([]byte(values[0]), expected) != 1 {
			return nil, status.Error(codes.Unauthenticated, "a valid bearer token is required")
		}
		return handler(ctx, request)
	}
}

func (s *Server) Handshake(_ context.Context, request *bilobav1.HandshakeRequest) (*bilobav1.HandshakeResponse, error) {
	if request.GetProtocolVersion() != Version {
		return nil, status.Errorf(codes.FailedPrecondition, "protocol version mismatch: client=%q daemon=%q", request.GetProtocolVersion(), Version)
	}
	return &bilobav1.HandshakeResponse{ProtocolVersion: Version, Capabilities: append([]string(nil), Capabilities...)}, nil
}

func (s *Server) OpenSession(ctx context.Context, _ *bilobav1.OpenSessionRequest) (*bilobav1.OpenSessionResponse, error) {
	session, err := s.backend.OpenSession(ctx)
	if err != nil {
		return nil, rpcError(err)
	}
	id, err := randomID()
	if err != nil {
		_ = session.Close()
		return nil, status.Error(codes.Internal, "generate session id")
	}
	s.mu.Lock()
	s.sessions[id] = &sessionEntry{session: session}
	s.mu.Unlock()
	return &bilobav1.OpenSessionResponse{SessionId: id}, nil
}

func (s *Server) PrepareSession(ctx context.Context, request *bilobav1.PrepareSessionRequest) (*bilobav1.Empty, error) {
	entry, err := s.session(request.GetSessionId())
	if err != nil {
		return nil, err
	}
	entry.mu.Lock()
	defer entry.mu.Unlock()
	if err := entry.session.Prepare(ctx); err != nil {
		return nil, rpcError(err)
	}
	return &bilobav1.Empty{}, nil
}

func (s *Server) CloseSession(_ context.Context, request *bilobav1.CloseSessionRequest) (*bilobav1.Empty, error) {
	s.mu.Lock()
	entry, exists := s.sessions[request.GetSessionId()]
	if exists {
		delete(s.sessions, request.GetSessionId())
	}
	s.mu.Unlock()
	if !exists {
		return nil, status.Error(codes.NotFound, "session not found")
	}
	entry.mu.Lock()
	defer entry.mu.Unlock()
	if err := entry.session.Close(); err != nil {
		return nil, rpcError(err)
	}
	return &bilobav1.Empty{}, nil
}

func (s *Server) Navigate(ctx context.Context, request *bilobav1.NavigateRequest) (*bilobav1.OperationResult, error) {
	if request.GetUrl() == "" {
		return nil, status.Error(codes.InvalidArgument, "url is required")
	}
	return s.execute(ctx, request.GetSessionId(), Operation{Kind: OperationNavigate, URL: request.GetUrl()})
}

func (s *Server) SetCookies(ctx context.Context, request *bilobav1.SetCookiesRequest) (*bilobav1.OperationResult, error) {
	cookies := make([]Cookie, len(request.GetCookies()))
	for i, cookie := range request.GetCookies() {
		if cookie.GetName() == "" {
			return nil, status.Errorf(codes.InvalidArgument, "cookies[%d].name is required", i)
		}
		cookies[i] = Cookie{Name: cookie.GetName(), Value: cookie.GetValue(), Domain: cookie.GetDomain(), Path: cookie.GetPath(), Secure: cookie.GetSecure(), HTTPOnly: cookie.GetHttpOnly(), ExpiresUnix: cookie.GetExpiresUnix(), SameSite: cookie.GetSameSite()}
	}
	return s.execute(ctx, request.GetSessionId(), Operation{Kind: OperationSetCookies, Cookies: cookies})
}

func (s *Server) Click(ctx context.Context, request *bilobav1.ClickRequest) (*bilobav1.OperationResult, error) {
	locator, err := locatorFromProto(request.GetLocator())
	if err != nil {
		return nil, err
	}
	return s.execute(ctx, request.GetSessionId(), Operation{Kind: OperationClick, Locator: locator, Poll: pollFromProto(request.GetPoll())})
}

func (s *Server) SetValue(ctx context.Context, request *bilobav1.SetValueRequest) (*bilobav1.OperationResult, error) {
	locator, err := locatorFromProto(request.GetLocator())
	if err != nil {
		return nil, err
	}
	return s.execute(ctx, request.GetSessionId(), Operation{Kind: OperationSetValue, Locator: locator, Poll: pollFromProto(request.GetPoll()), ValueJSON: request.GetValueJson()})
}

func (s *Server) Evaluate(ctx context.Context, request *bilobav1.EvaluateRequest) (*bilobav1.OperationResult, error) {
	if request.GetExpression() == "" {
		return nil, status.Error(codes.InvalidArgument, "expression is required")
	}
	return s.execute(ctx, request.GetSessionId(), Operation{Kind: OperationEvaluate, Expression: request.GetExpression(), ArgumentsJSON: request.GetArgumentsJson()})
}

func (s *Server) Assert(ctx context.Context, request *bilobav1.AssertRequest) (*bilobav1.OperationResult, error) {
	assertion, err := assertionFromProto(request.GetAssertion())
	if err != nil {
		return nil, err
	}
	return s.execute(ctx, request.GetSessionId(), Operation{Kind: OperationAssert, Assertion: assertion, Poll: pollFromProto(request.GetPoll())})
}

func (s *Server) execute(ctx context.Context, sessionID string, operation Operation) (*bilobav1.OperationResult, error) {
	entry, err := s.session(sessionID)
	if err != nil {
		return nil, err
	}
	entry.mu.Lock()
	defer entry.mu.Unlock()
	result, err := entry.session.Execute(ctx, operation)
	if err != nil {
		return nil, rpcError(err)
	}
	return resultToProto(result), nil
}

func (s *Server) session(id string) (*sessionEntry, error) {
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "session_id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, exists := s.sessions[id]
	if !exists {
		return nil, status.Error(codes.NotFound, "session not found")
	}
	return entry, nil
}

func (s *Server) Close() error {
	s.mu.Lock()
	entries := make([]*sessionEntry, 0, len(s.sessions))
	for id, entry := range s.sessions {
		entries = append(entries, entry)
		delete(s.sessions, id)
	}
	s.mu.Unlock()
	var closeErrors []error
	for _, entry := range entries {
		entry.mu.Lock()
		closeErrors = append(closeErrors, entry.session.Close())
		entry.mu.Unlock()
	}
	closeErrors = append(closeErrors, s.backend.Close())
	return errors.Join(closeErrors...)
}

func randomID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func pollFromProto(poll *bilobav1.PollPolicy) PollPolicy {
	if poll == nil {
		return PollPolicy{}
	}
	return PollPolicy{Timeout: time.Duration(poll.GetTimeoutMs()) * time.Millisecond, Interval: time.Duration(poll.GetIntervalMs()) * time.Millisecond}
}

func locatorFromProto(locator *bilobav1.Locator) (Locator, error) {
	if locator == nil {
		return Locator{}, status.Error(codes.InvalidArgument, "locator is required")
	}
	if locator.GetKind() < bilobav1.LocatorKind_CSS || locator.GetKind() > bilobav1.LocatorKind_ROLE {
		return Locator{}, status.Error(codes.InvalidArgument, "locator kind is required")
	}
	if locator.GetKind() == bilobav1.LocatorKind_ROLE {
		if locator.GetRole() == "" {
			return Locator{}, status.Error(codes.InvalidArgument, "role locator requires role")
		}
	} else if locator.GetValue() == "" {
		return Locator{}, status.Error(codes.InvalidArgument, "locator value is required")
	}
	return Locator{Kind: LocatorKind(locator.GetKind()), Value: locator.GetValue(), Role: locator.GetRole(), Name: locator.GetName(), Match: MatchMode(locator.GetMatch()), First: locator.GetFirst()}, nil
}

func assertionFromProto(assertion *bilobav1.Assertion) (Assertion, error) {
	if assertion == nil || assertion.GetKind() == bilobav1.Assertion_KIND_UNSPECIFIED {
		return Assertion{}, status.Error(codes.InvalidArgument, "assertion kind is required")
	}
	result := Assertion{Kind: AssertionKind(assertion.GetKind()), Attribute: assertion.GetAttribute(), Expression: assertion.GetExpression(), ExpectedString: assertion.GetExpectedString(), ExpectedCount: assertion.GetExpectedCount(), ExpectedJSON: assertion.GetExpectedJson(), Match: MatchMode(assertion.GetMatch())}
	if assertion.GetKind() != bilobav1.Assertion_URL && assertion.GetKind() != bilobav1.Assertion_EVALUATE {
		locator, err := locatorFromProto(assertion.GetLocator())
		if err != nil {
			return Assertion{}, err
		}
		result.Locator = locator
	}
	return result, nil
}

func resultToProto(result Result) *bilobav1.OperationResult {
	trajectory := make([]*bilobav1.PollObservation, len(result.Trajectory))
	for i, observation := range result.Trajectory {
		trajectory[i] = &bilobav1.PollObservation{Attempt: observation.Attempt, ElapsedMs: observation.Elapsed.Milliseconds(), ObservedJson: observation.ObservedJSON, RetryReason: observation.RetryReason}
	}
	return &bilobav1.OperationResult{
		Matched: result.Matched, ObservedJson: result.ObservedJSON, AttemptCount: result.Attempts, Trajectory: trajectory,
		Timings:         &bilobav1.Timings{StartedUnixMs: result.StartedAt.UnixMilli(), ElapsedMs: result.Elapsed.Milliseconds()},
		Diagnostics:     &bilobav1.Diagnostics{Locator: result.Diagnostics.Locator, Expected: result.Diagnostics.Expected, DomOutline: result.Diagnostics.DOMOutline, ScreenshotPath: result.Diagnostics.ScreenshotPath, DaemonDetail: result.Diagnostics.DaemonDetail},
		RpcRequestCount: 1, RpcResponseCount: 1,
	}
}

func rpcError(err error) error {
	if _, ok := status.FromError(err); ok {
		return err
	}
	switch {
	case errors.Is(err, context.Canceled):
		return status.Error(codes.Canceled, err.Error())
	case errors.Is(err, context.DeadlineExceeded):
		return status.Error(codes.DeadlineExceeded, err.Error())
	default:
		return status.Error(codes.Internal, fmt.Sprintf("daemon operation failed: %v", err))
	}
}
