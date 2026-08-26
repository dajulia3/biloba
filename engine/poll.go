package engine

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type ErrorCode string

const (
	CodeInvalidSelector ErrorCode = "invalid_selector"
	CodeBrowserStart    ErrorCode = "browser_start"
	CodeSessionClosed   ErrorCode = "session_closed"
	CodeNavigation      ErrorCode = "navigation"
	CodeJavaScript      ErrorCode = "javascript"
	CodeNotFound        ErrorCode = "not_found"
	CodeActionFailed    ErrorCode = "action_failed"
	CodeTimeout         ErrorCode = "timeout"
	CodeCanceled        ErrorCode = "canceled"
	CodeDeadline        ErrorCode = "deadline_exceeded"
	CodeIO              ErrorCode = "io"
)

// Error is a stable structured failure returned by engine operations.
type Error struct {
	Code         ErrorCode
	Operation    string
	Message      string
	Cause        error
	Observed     any
	AttemptCount int
	Attempts     []Attempt
	Diagnostics  Diagnostics
}

func (e *Error) Error() string {
	if e.Operation == "" {
		return e.Message
	}
	return fmt.Sprintf("%s: %s", e.Operation, e.Message)
}

func (e *Error) Unwrap() error { return e.Cause }

type Observation struct {
	Value any
	Found *bool
}

type Attempt struct {
	Number      int
	StartedAt   time.Time
	Duration    time.Duration
	Observation Observation
	Error       string
}

type PollPolicy struct {
	Timeout  time.Duration
	Interval time.Duration
}

type PollResult struct {
	Final        Observation
	AttemptCount int
	Attempts     []Attempt
	StartedAt    time.Time
	Duration     time.Duration
}

type Assertion func(context.Context) (Observation, bool, error)

// Poll retries an entire one-attempt assertion in Go until it succeeds or its context expires.
func Poll(ctx context.Context, policy PollPolicy, assertion Assertion) (PollResult, error) {
	started := time.Now()
	if policy.Interval <= 0 {
		policy.Interval = 10 * time.Millisecond
	}
	pollCtx := ctx
	cancel := func() {}
	if policy.Timeout > 0 {
		pollCtx, cancel = context.WithTimeout(ctx, policy.Timeout)
	}
	defer cancel()

	result := PollResult{StartedAt: started}
	for {
		attemptStarted := time.Now()
		observation, matched, attemptErr := assertion(pollCtx)
		attempt := Attempt{
			Number:      len(result.Attempts) + 1,
			StartedAt:   attemptStarted,
			Duration:    time.Since(attemptStarted),
			Observation: observation,
		}
		if attemptErr != nil {
			attempt.Error = attemptErr.Error()
		}
		result.Final = observation
		result.Attempts = append(result.Attempts, attempt)
		result.AttemptCount = len(result.Attempts)
		result.Duration = time.Since(started)
		if matched {
			return result, nil
		}

		timer := time.NewTimer(policy.Interval)
		select {
		case <-pollCtx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			code := CodeCanceled
			if ctx.Err() != nil {
				if errors.Is(ctx.Err(), context.DeadlineExceeded) {
					code = CodeDeadline
				}
			} else if errors.Is(pollCtx.Err(), context.DeadlineExceeded) {
				code = CodeTimeout
			}
			return result, &Error{
				Code:         code,
				Operation:    "poll",
				Message:      pollCtx.Err().Error(),
				Cause:        pollCtx.Err(),
				Observed:     result.Final.Value,
				AttemptCount: result.AttemptCount,
				Attempts:     result.Attempts,
			}
		case <-timer.C:
		}
	}
}
