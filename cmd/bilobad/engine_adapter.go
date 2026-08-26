package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/onsi/biloba/engine"
	"github.com/onsi/biloba/protocol"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type engineBackend struct{ browser *engine.Browser }

func (b *engineBackend) OpenSession(ctx context.Context) (protocol.Session, error) {
	session, err := b.browser.OpenSession(ctx)
	if err != nil {
		return nil, engineRPCError(err)
	}
	return &engineSession{session: session}, nil
}

func (b *engineBackend) Close() error { return b.browser.Close() }

type engineSession struct{ session *engine.Session }

func (s *engineSession) Prepare(ctx context.Context) error { return s.session.Prepare(ctx) }
func (s *engineSession) Close() error                      { return s.session.Close() }

func (s *engineSession) Execute(ctx context.Context, operation protocol.Operation) (protocol.Result, error) {
	started := time.Now()
	switch operation.Kind {
	case protocol.OperationNavigate:
		return oneAttempt(started, s.session.Navigate(ctx, operation.URL))
	case protocol.OperationSetCookies:
		cookies := make([]engine.Cookie, len(operation.Cookies))
		for i, cookie := range operation.Cookies {
			cookies[i] = engine.Cookie{Name: cookie.Name, Value: cookie.Value, Domain: cookie.Domain, Path: cookie.Path, Secure: cookie.Secure, HTTPOnly: cookie.HTTPOnly, SameSite: cookie.SameSite}
			if cookie.ExpiresUnix != 0 {
				cookies[i].Expires = time.UnixMilli(int64(cookie.ExpiresUnix * 1000))
			}
		}
		return oneAttempt(started, s.session.SetCookies(ctx, cookies))
	case protocol.OperationClick:
		selector, err := selectorFromProtocol(operation.Locator)
		if err != nil {
			return protocol.Result{}, err
		}
		return s.poll(ctx, operation, func(ctx context.Context) (engine.Observation, bool, error) {
			err := s.session.Click(ctx, selector)
			return engine.Observation{}, err == nil, err
		})
	case protocol.OperationSetValue:
		selector, err := selectorFromProtocol(operation.Locator)
		if err != nil {
			return protocol.Result{}, err
		}
		var value any
		if err := json.Unmarshal([]byte(operation.ValueJSON), &value); err != nil {
			return protocol.Result{}, status.Errorf(codes.InvalidArgument, "value_json: %v", err)
		}
		return s.poll(ctx, operation, func(ctx context.Context) (engine.Observation, bool, error) {
			err := s.session.SetValue(ctx, selector, value)
			return engine.Observation{}, err == nil, err
		})
	case protocol.OperationEvaluate:
		script, err := evaluationScript(operation.Expression, operation.ArgumentsJSON)
		if err != nil {
			return protocol.Result{}, err
		}
		value, err := s.session.Evaluate(ctx, script)
		if err != nil {
			return protocol.Result{}, engineRPCError(err)
		}
		return observedResult(started, value), nil
	case protocol.OperationAssert:
		assertion, err := s.assertion(operation.Assertion)
		if err != nil {
			return protocol.Result{}, err
		}
		return s.poll(ctx, operation, assertion)
	default:
		return protocol.Result{}, status.Error(codes.InvalidArgument, "unsupported operation")
	}
}

func evaluationScript(expression, argumentsJSON string) (string, error) {
	if strings.TrimSpace(argumentsJSON) == "" {
		return expression, nil
	}
	var arguments []any
	if err := json.Unmarshal([]byte(argumentsJSON), &arguments); err != nil {
		return "", status.Errorf(codes.InvalidArgument, "arguments_json must be a JSON array: %v", err)
	}
	if len(arguments) == 0 {
		return expression, nil
	}
	encoded, err := json.Marshal(arguments)
	if err != nil {
		return "", status.Errorf(codes.InvalidArgument, "arguments_json: %v", err)
	}
	return fmt.Sprintf("(%s)(...%s)", expression, encoded), nil
}

func (s *engineSession) poll(ctx context.Context, operation protocol.Operation, assertion engine.Assertion) (protocol.Result, error) {
	policy := engine.PollPolicy{Timeout: operation.Poll.Timeout, Interval: operation.Poll.Interval}
	if policy.Timeout <= 0 {
		policy.Timeout = time.Second
	}
	result, pollErr := engine.Poll(ctx, policy, assertion)
	converted := pollResult(result, pollErr == nil)
	if pollErr == nil {
		return converted, nil
	}
	if errors.Is(pollErr, context.Canceled) && errors.Is(ctx.Err(), context.Canceled) {
		return protocol.Result{}, status.Error(codes.Canceled, ctx.Err().Error())
	}
	if errors.Is(pollErr, context.DeadlineExceeded) && ctx.Err() != nil {
		return protocol.Result{}, status.Error(codes.DeadlineExceeded, ctx.Err().Error())
	}
	diagnosticCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	diagnostics, diagnosticErr := s.session.CaptureDiagnostics(diagnosticCtx, "biloba-failure")
	converted.Diagnostics = protocol.Diagnostics{
		Locator: locatorDescription(operation), Expected: expectedDescription(operation),
		DOMOutline: diagnostics.DOMOutline, ScreenshotPath: diagnostics.ScreenshotPath, DaemonDetail: pollErr.Error(),
	}
	if diagnosticErr != nil {
		converted.Diagnostics.DaemonDetail += "; capture diagnostics: " + diagnosticErr.Error()
	}
	return converted, nil
}

func (s *engineSession) assertion(assertion protocol.Assertion) (engine.Assertion, error) {
	var selector engine.Selector
	var err error
	if assertion.Kind != protocol.AssertionURL && assertion.Kind != protocol.AssertionEvaluate {
		selector, err = selectorFromProtocol(assertion.Locator)
		if err != nil {
			return nil, err
		}
	}
	return func(ctx context.Context) (engine.Observation, bool, error) {
		var observation engine.Observation
		var readErr error
		switch assertion.Kind {
		case protocol.AssertionVisible:
			observation, readErr = s.session.Visible(ctx, selector)
			visible, _ := observation.Value.(bool)
			return observation, visible, readErr
		case protocol.AssertionText:
			observation, readErr = s.session.Text(ctx, selector)
		case protocol.AssertionCount:
			observation, readErr = s.session.Count(ctx, selector)
			return observation, numericEqual(observation.Value, assertion.ExpectedCount), readErr
		case protocol.AssertionAttribute:
			observation, readErr = s.session.Attribute(ctx, selector, assertion.Attribute)
		case protocol.AssertionValue:
			observation, readErr = s.session.Value(ctx, selector)
			return observation, matchesExpectedJSON(observation.Value, assertion.ExpectedJSON), readErr
		case protocol.AssertionURL:
			observation, readErr = s.session.URL(ctx)
		case protocol.AssertionEvaluate:
			var value any
			value, readErr = s.session.Evaluate(ctx, assertion.Expression)
			observation = engine.Observation{Value: value}
			return observation, jsonEqual(value, assertion.ExpectedJSON), readErr
		default:
			return observation, false, status.Error(codes.InvalidArgument, "unsupported assertion")
		}
		return observation, stringMatches(observation.Value, assertion.ExpectedString, assertion.Match), readErr
	}, nil
}

func selectorFromProtocol(locator protocol.Locator) (engine.Selector, error) {
	mode := engine.Exact
	if locator.Match == protocol.MatchContains {
		mode = engine.Contains
	}
	var selector engine.Selector
	switch locator.Kind {
	case protocol.LocatorCSS:
		selector = engine.CSS(locator.Value)
	case protocol.LocatorTestID:
		selector = engine.TestID(locator.Value)
	case protocol.LocatorText:
		selector = engine.Text(locator.Value, mode)
	case protocol.LocatorRole:
		selector = engine.Role(locator.Role, locator.Name, mode)
	default:
		return engine.Selector{}, status.Error(codes.InvalidArgument, "unsupported locator")
	}
	if locator.First {
		selector = selector.First()
	}
	return selector, nil
}

func oneAttempt(started time.Time, err error) (protocol.Result, error) {
	if err != nil {
		return protocol.Result{}, engineRPCError(err)
	}
	return protocol.Result{Matched: true, Attempts: 1, StartedAt: started, Elapsed: time.Since(started)}, nil
}

func observedResult(started time.Time, value any) protocol.Result {
	return protocol.Result{Matched: true, ObservedJSON: marshalJSON(value), Attempts: 1, StartedAt: started, Elapsed: time.Since(started)}
}

func pollResult(result engine.PollResult, matched bool) protocol.Result {
	trajectory := make([]protocol.Observation, len(result.Attempts))
	for i, attempt := range result.Attempts {
		trajectory[i] = protocol.Observation{Attempt: uint32(attempt.Number), Elapsed: attempt.StartedAt.Sub(result.StartedAt), ObservedJSON: marshalJSON(attempt.Observation.Value), RetryReason: attempt.Error}
	}
	return protocol.Result{Matched: matched, ObservedJSON: marshalJSON(result.Final.Value), Attempts: uint32(result.AttemptCount), Trajectory: trajectory, StartedAt: result.StartedAt, Elapsed: result.Duration}
}

func stringMatches(value any, expected string, mode protocol.MatchMode) bool {
	observed, ok := value.(string)
	if !ok {
		return false
	}
	if mode == protocol.MatchContains {
		return strings.Contains(observed, expected)
	}
	return observed == expected
}

func numericEqual(value any, expected int64) bool {
	switch value := value.(type) {
	case int:
		return int64(value) == expected
	case int64:
		return value == expected
	case float64:
		return value == float64(expected)
	default:
		return false
	}
}

func jsonEqual(observed any, expectedJSON string) bool {
	var expected any
	if json.Unmarshal([]byte(expectedJSON), &expected) != nil {
		return false
	}
	return reflect.DeepEqual(observed, expected)
}

func matchesExpectedJSON(observed any, expectedJSON string) bool {
	return jsonEqual(observed, expectedJSON)
}

func marshalJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%q", fmt.Sprint(value))
	}
	return string(encoded)
}

func locatorDescription(operation protocol.Operation) string {
	locator := operation.Locator
	if operation.Kind == protocol.OperationAssert {
		locator = operation.Assertion.Locator
	}
	selector, err := selectorFromProtocol(locator)
	if err != nil {
		return ""
	}
	return selector.Description()
}

func expectedDescription(operation protocol.Operation) string {
	if operation.Kind != protocol.OperationAssert {
		return "operation to succeed"
	}
	assertion := operation.Assertion
	switch assertion.Kind {
	case protocol.AssertionVisible:
		return "visible"
	case protocol.AssertionCount:
		return fmt.Sprint(assertion.ExpectedCount)
	case protocol.AssertionValue, protocol.AssertionEvaluate:
		return assertion.ExpectedJSON
	default:
		return assertion.ExpectedString
	}
}

func engineRPCError(err error) error {
	var engineErr *engine.Error
	if !errors.As(err, &engineErr) {
		return status.Error(codes.Internal, err.Error())
	}
	switch engineErr.Code {
	case engine.CodeInvalidSelector:
		return status.Error(codes.InvalidArgument, engineErr.Error())
	case engine.CodeSessionClosed, engine.CodeNotFound:
		return status.Error(codes.NotFound, engineErr.Error())
	case engine.CodeCanceled:
		return status.Error(codes.Canceled, engineErr.Error())
	case engine.CodeDeadline, engine.CodeTimeout:
		return status.Error(codes.DeadlineExceeded, engineErr.Error())
	default:
		return status.Error(codes.Internal, engineErr.Error())
	}
}
