package engine

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"
)

type BrowserConfig struct {
	ExecutablePath string
	WindowWidth    int
	WindowHeight   int
	ArtifactDir    string
}

// Browser owns one supplied Chrome process and opens isolated runner-neutral sessions within it.
type Browser struct {
	ctx         context.Context
	cancel      context.CancelFunc
	artifactDir string
	mu          sync.Mutex
	sessions    map[*Session]struct{}
	closed      bool
}

// StartBrowser starts exactly one Chrome process using the supplied executable.
func StartBrowser(ctx context.Context, config BrowserConfig) (*Browser, error) {
	if config.ExecutablePath == "" {
		return nil, &Error{Code: CodeBrowserStart, Operation: "start browser", Message: "ExecutablePath is required"}
	}
	width, height := config.WindowWidth, config.WindowHeight
	if width <= 0 {
		width = 1920
	}
	if height <= 0 {
		height = 1080
	}
	profile, err := os.MkdirTemp("", "biloba-engine-profile-")
	if err != nil {
		return nil, typedError(CodeIO, "start browser", err)
	}
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(config.ExecutablePath),
		chromedp.WindowSize(width, height),
		chromedp.UserDataDir(profile),
		chromedp.WSURLReadTimeout(60*time.Second),
	)
	allocCtx, cancelAllocator := chromedp.NewExecAllocator(ctx, opts...)
	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	cancel := func() {
		cancelBrowser()
		cancelAllocator()
		_ = os.RemoveAll(profile)
	}
	if err := chromedp.Run(browserCtx, chromedp.Evaluate("1", nil)); err != nil {
		cancel()
		return nil, typedError(CodeBrowserStart, "start browser", err)
	}
	return &Browser{
		ctx: browserCtx, cancel: cancel, artifactDir: config.ArtifactDir,
		sessions: map[*Session]struct{}{},
	}, nil
}

func (b *Browser) OpenSession(ctx context.Context) (*Session, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil, &Error{Code: CodeSessionClosed, Operation: "open session", Message: "browser is closed"}
	}
	opCtx, cancel := executorContext(b.ctx, ctx)
	defer cancel()
	var browserContextID cdp.BrowserContextID
	var targetID target.ID
	err := chromedp.Run(opCtx, chromedp.ActionFunc(func(runCtx context.Context) error {
		chrome := chromedp.FromContext(runCtx)
		browserExecutor := cdp.WithExecutor(runCtx, chrome.Browser)
		var createErr error
		browserContextID, createErr = target.CreateBrowserContext().WithDisposeOnDetach(true).Do(browserExecutor)
		if createErr != nil {
			return createErr
		}
		targetID, createErr = target.CreateTarget("about:blank").
			WithBrowserContextID(browserContextID).
			WithNewWindow(true).
			Do(browserExecutor)
		return createErr
	}))
	if err != nil {
		return nil, contextError("open session", err)
	}
	tabCtx, cancelTab := chromedp.NewContext(b.ctx, chromedp.WithTargetID(targetID))
	attachDone := make(chan error, 1)
	go func() {
		// The first Run owns chromedp's target executor for the session lifetime. It must use the
		// persistent tab context; binding it to a request deadline tears the executor down afterward.
		attachDone <- chromedp.Run(tabCtx, chromedp.Evaluate("1", nil))
	}()
	select {
	case err = <-attachDone:
	case <-ctx.Done():
		cancelTab()
		err = ctx.Err()
	}
	if err != nil {
		cancelTab()
		return nil, contextError("open session", err)
	}
	session := &Session{
		browser: b, ctx: tabCtx, cancel: cancelTab, browserContextID: browserContextID,
		artifactDir: b.artifactDir,
	}
	b.sessions[session] = struct{}{}
	return session, nil
}

func (b *Browser) Close() error {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil
	}
	b.closed = true
	sessions := make([]*Session, 0, len(b.sessions))
	for session := range b.sessions {
		sessions = append(sessions, session)
	}
	b.mu.Unlock()
	for _, session := range sessions {
		_ = session.Close()
	}
	b.cancel()
	return nil
}

func (b *Browser) removeSession(session *Session) {
	b.mu.Lock()
	delete(b.sessions, session)
	b.mu.Unlock()
}

func executorContext(executorCtx, requestCtx context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(executorCtx)
	if deadline, ok := requestCtx.Deadline(); ok {
		var deadlineCancel context.CancelFunc
		ctx, deadlineCancel = context.WithDeadline(ctx, deadline)
		baseCancel := cancel
		cancel = func() { deadlineCancel(); baseCancel() }
	}
	go func() {
		select {
		case <-requestCtx.Done():
			cancel()
		case <-ctx.Done():
		}
	}()
	return ctx, cancel
}

func typedError(code ErrorCode, operation string, err error) *Error {
	return &Error{Code: code, Operation: operation, Message: err.Error(), Cause: err}
}

func contextError(operation string, err error) *Error {
	code := CodeJavaScript
	if errors.Is(err, context.Canceled) {
		code = CodeCanceled
	} else if errors.Is(err, context.DeadlineExceeded) {
		code = CodeDeadline
	}
	return typedError(code, operation, err)
}

func artifactPath(dir, prefix, suffix string) string {
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, fmt.Sprintf("%s-%d.%s", prefix, time.Now().UnixNano(), suffix))
}
