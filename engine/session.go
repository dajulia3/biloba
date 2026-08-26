package engine

import (
	"context"
	_ "embed"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/storage"
	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"
)

//go:generate cp ../biloba.js biloba.js
//go:embed biloba.js
var bilobaJS string

type Cookie struct {
	Name     string
	Value    string
	Domain   string
	Path     string
	Expires  time.Time
	Secure   bool
	HTTPOnly bool
	SameSite string
}

type Diagnostics struct {
	DOMOutline     string
	ScreenshotPath string
}

// Session is an isolated root tab. Operations on one session are serialized.
type Session struct {
	browser          *Browser
	ctx              context.Context
	cancel           context.CancelFunc
	browserContextID cdp.BrowserContextID
	artifactDir      string
	mu               sync.Mutex
	closed           bool
	installed        bool
}

func (s *Session) Close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	var disposeErr error
	if s.browser != nil {
		ctx, cancel := context.WithTimeout(s.browser.ctx, 5*time.Second)
		disposeErr = s.withBrowserExecutor(ctx, func(browserCtx context.Context) error {
			return target.DisposeBrowserContext(s.browserContextID).Do(browserCtx)
		})
		cancel()
	}
	s.cancel()
	s.mu.Unlock()
	if s.browser != nil {
		s.browser.removeSession(s)
	}
	if disposeErr != nil && !errors.Is(disposeErr, context.Canceled) {
		return contextError("close session", disposeErr)
	}
	return nil
}

func (s *Session) Prepare(ctx context.Context) error {
	return s.serial(ctx, "prepare", func(opCtx context.Context) error {
		// Clear storage while the tab still has its current origin. about:blank has an opaque
		// origin, so navigating first would leave localStorage behind for the next spec.
		_ = EvaluateContext(opCtx, `try { window.localStorage.clear(); window.sessionStorage.clear(); } catch (e) {}`, false, nil)
		if err := s.withBrowserExecutor(opCtx, func(browserCtx context.Context) error {
			return storage.ClearCookies().WithBrowserContextID(s.browserContextID).Do(browserCtx)
		}); err != nil {
			return err
		}
		if err := chromedp.Run(opCtx, chromedp.ActionFunc(func(runCtx context.Context) error {
			_, _, _, _, err := page.Navigate("about:blank").Do(runCtx)
			return err
		})); err != nil {
			return err
		}
		s.installed = false
		return nil
	})
}

// Navigate loads a URL and requires the main document response to have HTTP status 200.
func (s *Session) Navigate(ctx context.Context, destination string) error {
	return s.serial(ctx, "navigate", func(opCtx context.Context) error {
		var status int64
		var statusMu sync.Mutex
		listenCtx, cancelListen := context.WithCancel(opCtx)
		defer cancelListen()
		chromedp.ListenTarget(listenCtx, func(event any) {
			if response, ok := event.(*network.EventResponseReceived); ok && response.Type == network.ResourceTypeDocument {
				statusMu.Lock()
				status = response.Response.Status
				statusMu.Unlock()
			}
		})
		var navigationErrorText string
		err := chromedp.Run(opCtx, chromedp.ActionFunc(func(runCtx context.Context) error {
			var navigationErr error
			_, _, navigationErrorText, _, navigationErr = page.Navigate(destination).Do(runCtx)
			return navigationErr
		}))
		s.installed = false
		isHTTPError := err != nil && strings.Contains(err.Error(), "ERR_HTTP_RESPONSE_CODE_FAILURE")
		if err != nil && !isHTTPError {
			return err
		}
		if navigationErrorText != "" && !strings.Contains(navigationErrorText, "ERR_HTTP_RESPONSE_CODE_FAILURE") {
			return &Error{Code: CodeNavigation, Operation: "navigate", Message: navigationErrorText}
		}
		for {
			var readyState string
			if err := chromedp.Run(opCtx, chromedp.Evaluate("document.readyState", &readyState)); err == nil && (readyState == "interactive" || readyState == "complete") {
				break
			}
			select {
			case <-opCtx.Done():
				return opCtx.Err()
			case <-time.After(5 * time.Millisecond):
			}
		}
		statusMu.Lock()
		observedStatus := status
		statusMu.Unlock()
		if observedStatus != 0 && observedStatus != http.StatusOK {
			return &Error{Code: CodeNavigation, Operation: "navigate", Message: "expected HTTP status 200", Observed: observedStatus}
		}
		if err != nil {
			return &Error{Code: CodeNavigation, Operation: "navigate", Message: err.Error()}
		}
		return nil
	})
}

func (s *Session) SetCookies(ctx context.Context, cookies []Cookie) error {
	return s.serial(ctx, "set cookies", func(opCtx context.Context) error {
		var location string
		if err := chromedp.Run(opCtx, chromedp.Location(&location)); err != nil {
			return err
		}
		params := make([]*network.CookieParam, len(cookies))
		for index, cookie := range cookies {
			param := &network.CookieParam{Name: cookie.Name, Value: cookie.Value, Domain: cookie.Domain, Path: cookie.Path, Secure: cookie.Secure, HTTPOnly: cookie.HTTPOnly, SameSite: network.CookieSameSite(cookie.SameSite)}
			if cookie.Domain == "" {
				parsed, err := url.Parse(location)
				if err != nil || parsed.Host == "" {
					return &Error{Code: CodeActionFailed, Operation: "set cookies", Message: "cookie needs a Domain or a session navigated to an HTTP origin"}
				}
				param.URL = location
			}
			if !cookie.Expires.IsZero() {
				expires := cdp.TimeSinceEpoch(cookie.Expires)
				param.Expires = &expires
			}
			params[index] = param
		}
		return s.withBrowserExecutor(opCtx, func(browserCtx context.Context) error {
			return storage.SetCookies(params).WithBrowserContextID(s.browserContextID).Do(browserCtx)
		})
	})
}

func (s *Session) Evaluate(ctx context.Context, script string) (any, error) {
	var result any
	err := s.serial(ctx, "evaluate", func(opCtx context.Context) error {
		return EvaluateContext(opCtx, script, false, &result)
	})
	return result, err
}

func (s *Session) Click(ctx context.Context, selector Selector) error {
	_, err := s.handler(ctx, "click", selector)
	return err
}

func (s *Session) SetValue(ctx context.Context, selector Selector, value any) error {
	_, err := s.handler(ctx, "setValue", selector, value)
	return err
}

func (s *Session) Visible(ctx context.Context, selector Selector) (Observation, error) {
	response, err := s.handler(ctx, "isVisible", selector)
	return response.observation(response.Success), err
}

func (s *Session) Text(ctx context.Context, selector Selector) (Observation, error) {
	response, err := s.handler(ctx, "getProperty", selector, "innerText")
	return response.observation(response.Result), err
}

func (s *Session) Count(ctx context.Context, selector Selector) (Observation, error) {
	response, err := s.handler(ctx, "count", selector)
	return response.observation(intValue(response.Result)), err
}

func (s *Session) Attribute(ctx context.Context, selector Selector, name string) (Observation, error) {
	response, err := s.handler(ctx, "getAttribute", selector, name)
	return response.observation(response.Result), err
}

func (s *Session) Value(ctx context.Context, selector Selector) (Observation, error) {
	response, err := s.handler(ctx, "getValue", selector)
	return response.observation(response.Result), err
}

func (s *Session) URL(ctx context.Context) (Observation, error) {
	var location string
	err := s.serial(ctx, "read URL", func(opCtx context.Context) error {
		return chromedp.Run(opCtx, chromedp.Location(&location))
	})
	return Observation{Value: location}, err
}

func (s *Session) CaptureDiagnostics(ctx context.Context, prefix string) (Diagnostics, error) {
	var diagnostics Diagnostics
	err := s.serial(ctx, "capture diagnostics", func(opCtx context.Context) error {
		if err := s.ensureBiloba(opCtx); err != nil {
			return err
		}
		response, err := s.runHandler(opCtx, "outline", Selector{})
		if err == nil {
			diagnostics.DOMOutline, _ = response.Result.(string)
		}
		path := artifactPath(s.artifactDir, prefix, "png")
		if path == "" {
			return err
		}
		if mkdirErr := os.MkdirAll(s.artifactDir, 0o755); mkdirErr != nil {
			return mkdirErr
		}
		var image []byte
		if screenshotErr := chromedp.Run(opCtx, chromedp.ActionFunc(func(runCtx context.Context) error {
			var captureErr error
			image, captureErr = page.CaptureScreenshot().WithCaptureBeyondViewport(false).Do(runCtx)
			return captureErr
		})); screenshotErr != nil {
			return screenshotErr
		}
		if writeErr := os.WriteFile(path, image, 0o644); writeErr != nil {
			return writeErr
		}
		diagnostics.ScreenshotPath = path
		return err
	})
	return diagnostics, err
}

func (r HandlerResponse) observation(value any) Observation {
	return Observation{Value: value, Found: r.Found}
}

func (s *Session) handler(ctx context.Context, name string, selector Selector, args ...any) (HandlerResponse, error) {
	var response HandlerResponse
	err := s.serial(ctx, name, func(opCtx context.Context) error {
		var err error
		response, err = s.runHandler(opCtx, name, selector, args...)
		return err
	})
	return response, err
}

func (s *Session) runHandler(ctx context.Context, name string, selector Selector, args ...any) (HandlerResponse, error) {
	if err := s.ensureBiloba(ctx); err != nil {
		return HandlerResponse{}, err
	}
	encodedSelector := selector.Encoded()
	if name == "outline" {
		encodedSelector = ""
	}
	response, err := RunHandlerContext(ctx, name, encodedSelector, args...)
	if err != nil {
		s.installed = false
		if installErr := s.ensureBiloba(ctx); installErr != nil {
			return response, installErr
		}
		response, err = RunHandlerContext(ctx, name, encodedSelector, args...)
		if err != nil {
			return response, err
		}
	}
	if response.Err != "" {
		code := CodeActionFailed
		if name != "click" && name != "setValue" {
			code = CodeNotFound
		}
		return response, &Error{Code: code, Operation: name, Message: response.Err, Observed: response.Result}
	}
	if !response.Success {
		return response, &Error{Code: CodeActionFailed, Operation: name, Message: "operation did not succeed", Observed: response.Result}
	}
	return response, nil
}

func (s *Session) ensureBiloba(ctx context.Context) error {
	if s.installed {
		return nil
	}
	if err := EvaluateContext(ctx, bilobaJS, false, nil); err != nil {
		return err
	}
	s.installed = true
	return nil
}

func (s *Session) serial(requestCtx context.Context, operation string, run func(context.Context) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return &Error{Code: CodeSessionClosed, Operation: operation, Message: "session is closed"}
	}
	opCtx, cancel := executorContext(s.ctx, requestCtx)
	defer cancel()
	err := run(opCtx)
	if err == nil {
		return nil
	}
	var engineErr *Error
	if errors.As(err, &engineErr) {
		return engineErr
	}
	return contextError(operation, err)
}

func (s *Session) withBrowserExecutor(ctx context.Context, run func(context.Context) error) error {
	chrome := chromedp.FromContext(s.ctx)
	return run(cdp.WithExecutor(ctx, chrome.Browser))
}

func intValue(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	default:
		return 0
	}
}
