package engine_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/onsi/biloba/engine"
)

func TestEngine(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Engine Suite")
}

var _ = Describe("runner-neutral engine primitives", func() {
	It("embeds the canonical Biloba browser runtime without drift", func() {
		canonical, err := os.ReadFile("../biloba.js")
		Expect(err).NotTo(HaveOccurred())
		embedded, err := os.ReadFile("biloba.js")
		Expect(err).NotTo(HaveOccurred())
		Expect(string(embedded)).To(Equal(string(canonical)))
	})

	It("encodes the pilot locator forms for biloba.js", func() {
		Expect(engine.CSS("main > button").Encoded()).To(Equal("smain > button"))
		Expect(engine.TestID("save").Encoded()).To(HavePrefix("a"))
		Expect(engine.Text("Saved", engine.Contains).First().Encoded()).To(ContainSubstring(`"nth":0`))
		Expect(engine.Role("button", "Submit", engine.Exact).Encoded()).To(ContainSubstring(`"nameMode":"exact"`))
		Expect(engine.Role("button", "Submit", engine.Exact).First().Description()).To(Equal(`getByRole("button", name="Submit", exact).first()`))
	})

	It("polls entirely in Go and returns the attempt trajectory", func() {
		attempt := 0
		result, err := engine.Poll(context.Background(), engine.PollPolicy{
			Timeout:  250 * time.Millisecond,
			Interval: time.Millisecond,
		}, func(context.Context) (engine.Observation, bool, error) {
			attempt++
			observation := engine.Observation{Value: attempt}
			return observation, attempt == 3, nil
		})

		Expect(err).NotTo(HaveOccurred())
		Expect(result.Final.Value).To(Equal(3))
		Expect(result.AttemptCount).To(Equal(3))
		Expect(result.Attempts).To(HaveLen(3))
	})

	It("preserves the final observation and typed cancellation failure", func() {
		ctx, cancel := context.WithCancel(context.Background())
		attempt := 0
		_, err := engine.Poll(ctx, engine.PollPolicy{Interval: time.Millisecond}, func(context.Context) (engine.Observation, bool, error) {
			attempt++
			cancel()
			return engine.Observation{Value: "still loading"}, false, errors.New("transient read")
		})

		var engineErr *engine.Error
		Expect(errors.As(err, &engineErr)).To(BeTrue())
		Expect(engineErr.Code).To(Equal(engine.CodeCanceled))
		Expect(engineErr.Observed).To(Equal("still loading"))
		Expect(engineErr.AttemptCount).To(Equal(1))
	})
})

var (
	browser *engine.Browser
	server  *httptest.Server
)

var _ = BeforeSuite(func() {
	server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/not-found" {
			response.WriteHeader(http.StatusNotFound)
			return
		}
		fmt.Fprint(response, `<!doctype html><button aria-label="Save">Save</button><input data-testid="name"><div id="status">loading</div><script>document.querySelector('button').onclick=()=>{document.querySelector('#status').textContent='saved'};setTimeout(()=>document.querySelector('#status').textContent='ready',30)</script>`)
	}))
	var err error
	browser, err = engine.StartBrowser(context.Background(), engine.BrowserConfig{
		ExecutablePath: os.Getenv("BILOBA_CHROME_HEADLESS_SHELL"),
		ArtifactDir:    GinkgoT().TempDir(),
	})
	Expect(err).NotTo(HaveOccurred())
})

var _ = AfterSuite(func() {
	if browser != nil {
		Expect(browser.Close()).To(Succeed())
	}
	if server != nil {
		server.Close()
	}
})

var _ = Describe("browser engine", func() {

	It("drives atomic actions and one-attempt reads in an isolated session", func(ctx SpecContext) {
		session, err := browser.OpenSession(ctx)
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(session.Close)
		Expect(session.Navigate(ctx, server.URL)).To(Succeed())
		Expect(session.SetValue(ctx, engine.TestID("name"), "Biloba")).To(Succeed())
		value, err := session.Value(ctx, engine.TestID("name"))
		Expect(err).NotTo(HaveOccurred())
		Expect(value.Value).To(Equal("Biloba"))
		Expect(session.Click(ctx, engine.Role("button", "Save", engine.Exact))).To(Succeed())
		text, err := session.Text(ctx, engine.CSS("#status"))
		Expect(err).NotTo(HaveOccurred())
		Expect(text.Value).To(Equal("saved"))

		canceled, cancel := context.WithCancel(ctx)
		cancel()
		_, err = session.Evaluate(canceled, "1")
		var engineErr *engine.Error
		Expect(errors.As(err, &engineErr)).To(BeTrue())
		Expect(engineErr.Code).To(Equal(engine.CodeCanceled))
		result, err := session.Evaluate(ctx, "2")
		Expect(err).NotTo(HaveOccurred())
		Expect(result).To(BeNumerically("==", 2))
	})

	It("isolates cookies and storage while allowing sessions to run concurrently", func(ctx SpecContext) {
		first, err := browser.OpenSession(ctx)
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(first.Close)
		second, err := browser.OpenSession(ctx)
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(second.Close)
		Expect(first.Navigate(ctx, server.URL)).To(Succeed())
		Expect(second.Navigate(ctx, server.URL)).To(Succeed())
		Expect(first.SetCookies(ctx, []engine.Cookie{{Name: "owner", Value: "first", Domain: "127.0.0.1", Path: "/"}})).To(Succeed())
		_, err = first.Evaluate(ctx, `localStorage.setItem("owner", "first")`)
		Expect(err).NotTo(HaveOccurred())

		var wait sync.WaitGroup
		values := make([]any, 2)
		errs := make([]error, 2)
		for index, session := range []*engine.Session{first, second} {
			wait.Add(1)
			go func(index int, session *engine.Session) {
				defer GinkgoRecover()
				defer wait.Done()
				values[index], errs[index] = session.Evaluate(ctx, `({storage: localStorage.getItem("owner"), cookies: document.cookie})`)
			}(index, session)
		}
		wait.Wait()
		Expect(errs).To(ConsistOf(BeNil(), BeNil()))
		Expect(values[0]).To(Equal(map[string]any{"storage": "first", "cookies": "owner=first"}))
		Expect(values[1]).To(Equal(map[string]any{"storage": nil, "cookies": ""}))
	})

	It("prepare clears cookies and web storage before returning to about:blank", func(ctx SpecContext) {
		session, err := browser.OpenSession(ctx)
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(session.Close)
		Expect(session.Navigate(ctx, server.URL)).To(Succeed())
		Expect(session.SetCookies(ctx, []engine.Cookie{{Name: "session", Value: "present", Domain: "127.0.0.1", Path: "/"}})).To(Succeed())
		_, err = session.Evaluate(ctx, `localStorage.setItem("session", "present")`)
		Expect(err).NotTo(HaveOccurred())

		Expect(session.Prepare(ctx)).To(Succeed())
		location, err := session.URL(ctx)
		Expect(err).NotTo(HaveOccurred())
		Expect(location.Value).To(Equal("about:blank"))
		Expect(session.Navigate(ctx, server.URL)).To(Succeed())
		state, err := session.Evaluate(ctx, `({storage: localStorage.getItem("session"), cookies: document.cookie})`)
		Expect(err).NotTo(HaveOccurred())
		Expect(state).To(Equal(map[string]any{"storage": nil, "cookies": ""}))
	})

	It("returns a typed navigation failure for a non-200 document", func(ctx SpecContext) {
		session, err := browser.OpenSession(ctx)
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(session.Close)

		err = session.Navigate(ctx, server.URL+"/not-found")

		var engineErr *engine.Error
		Expect(errors.As(err, &engineErr)).To(BeTrue())
		Expect(engineErr.Code).To(Equal(engine.CodeNavigation))
		Expect(engineErr.Observed).To(BeNumerically("==", http.StatusNotFound))
	})

	It("closes owned sessions when the browser closes", func(ctx SpecContext) {
		ownedBrowser, err := engine.StartBrowser(ctx, engine.BrowserConfig{ExecutablePath: os.Getenv("BILOBA_CHROME_HEADLESS_SHELL")})
		Expect(err).NotTo(HaveOccurred())
		session, err := ownedBrowser.OpenSession(ctx)
		Expect(err).NotTo(HaveOccurred())

		Expect(ownedBrowser.Close()).To(Succeed())
		_, err = session.Evaluate(ctx, "1")

		var engineErr *engine.Error
		Expect(errors.As(err, &engineErr)).To(BeTrue())
		Expect(engineErr.Code).To(Equal(engine.CodeSessionClosed))
	})

	It("reinstalls the DOM runtime after the page replaces its JavaScript world", func(ctx SpecContext) {
		session, err := browser.OpenSession(ctx)
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(session.Close)
		Expect(session.Navigate(ctx, server.URL)).To(Succeed())
		_, err = session.Text(ctx, engine.CSS("#status"))
		Expect(err).NotTo(HaveOccurred())
		_, err = session.Evaluate(ctx, "globalThis._biloba = undefined")
		Expect(err).NotTo(HaveOccurred())

		text, err := session.Text(ctx, engine.CSS("#status"))

		Expect(err).NotTo(HaveOccurred())
		Expect(text.Value).To(Or(Equal("loading"), Equal("ready")))
	})

	It("keeps delayed assertion retries in Go and emits diagnostics", func(ctx SpecContext) {
		session, err := browser.OpenSession(ctx)
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(session.Close)
		Expect(session.Navigate(ctx, server.URL)).To(Succeed())
		_, err = session.Evaluate(ctx, `document.querySelector('#status').textContent='loading';setTimeout(()=>document.querySelector('#status').textContent='ready',100)`)
		Expect(err).NotTo(HaveOccurred())
		result, err := engine.Poll(ctx, engine.PollPolicy{Timeout: time.Second, Interval: 5 * time.Millisecond}, func(attemptCtx context.Context) (engine.Observation, bool, error) {
			observed, readErr := session.Text(attemptCtx, engine.CSS("#status"))
			return observed, observed.Value == "ready", readErr
		})
		Expect(err).NotTo(HaveOccurred())
		Expect(result.AttemptCount).To(BeNumerically(">", 1))
		diagnostics, err := session.CaptureDiagnostics(ctx, "engine-test")
		Expect(err).NotTo(HaveOccurred())
		Expect(diagnostics.DOMOutline).To(ContainSubstring(`<div id="status">`))
		Expect(diagnostics.ScreenshotPath).To(BeAnExistingFile())
	})
})
