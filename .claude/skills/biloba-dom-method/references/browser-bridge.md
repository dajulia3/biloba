## Step 1 — add the browser-side primitive in `biloba.js`

Primitives are registered as `b.<name> = ...` inside the `if (!window["_biloba"])` block. Use the existing combinators — match the dense, functional style:

- `one(...chain)` — operates on the **first** element matching the selector. Each step in the chain is `(n, ...args) => r(...)`; the chain short-circuits if a step's `success` is falsy. Use this for single-element actions/checks. Existence is validated for you (`one` returns an error if `sel(s)` is null).
- `poll(...chain)` — the same shape as `one`, but a missing element returns a bare `{success:false}` (retry) instead of an error. Use it for a getter whose *matcher* counterpart should treat "not there yet" as an ordinary non-match. Prefer `one` when the handler also backs a matcher people will negate (see "missing → error" below) — the geometry probes moved from `poll` to `one` for exactly that reason.
- `each(cb)` — operates on **all** matching elements; `cb` receives the node array. Use this for `*ForEach`/`*Each` behavior; returns an empty result when nothing matches rather than erroring.

`one`/`poll` both stamp a **`found`** boolean onto every response (via `withFound`) reporting whether the selector resolved on that attempt, independent of whether the operation then succeeded. The Go side folds it into the poll-trajectory recorder so a failure can tell "matched, then stopped matching" (a replaced node) from "never matched". You get this for free by using the combinators — don't hand-roll a handler that skips them. Nothing branches on `found`; it is purely diagnostic.
- Result helpers: `r(success, guardMessage)` for boolean checks (a falsy `success` yields a failure with `guardMessage`), `rErr(msg)` for hard errors, `rRes(value)` to return a value.
- `dispatchInputChange(n)` fires `input`+`change` events — reuse it for anything that mutates form state.

Typical primitive shapes (the click example omits pointer options and diagnostic recording; use `b.click` in `biloba.js` for the full implementation):
```js
b.isVisible = one(n => r(n.offsetWidth > 0 || n.offsetHeight > 0 || n.offsetParent != null, "DOM element is not visible"))
b.click    = one(b.isVisible, b.isEnabled, n => r(n.click()))   // composes guards then acts
b.count    = each(ns => rRes(ns.length))
```

Keep checks atomic and pragmatic (e.g. visibility = non-zero offset, not occlusion testing). That is a deliberate stability tradeoff, not a shortcut to fix.

## Step 2 — add the Go wrapper

The Go side calls `b.runBilobaHandler("<jsName>", selector, args...)`, which returns a `*bilobaJSResponse`. **Biloba polls by default**. Internally Biloba builds its matcher form and runs it through Gomega for you (`polling.go`), so the fully-applied form *waits* instead of acting once. Pick the shape that matches the API.

Use the typed result getters when returning a value: `r.ResultString()`, `r.ResultInt()`, `r.ResultBool()`, `r.ResultStringSlice()`, `r.ResultAnySlice()`, or `r.Result` (raw `any`).

**Matcher** (poll-friendly, never fails on its own — returns `(bool, error)`):
```go
func (b *Biloba) BeVisible() types.GomegaMatcher {
	return gcustom.MakeMatcher(func(selector any) (bool, error) {
		return b.runBilobaHandler("isVisible", selector).MatcherResult()
	}).WithMessage("be visible")
}
```
For matchers that wrap a sub-matcher or need a rich failure message, stash state in a `data` map and use `.WithTemplate(...)` (see `HaveCount`, `HaveProperty`, `HaveClass`). Use `matcherOrEqual(expected)` to accept either a Gomega matcher or a literal value.

**A failure message with a SIDE EFFECT can't be a template.** A template renders state; it cannot *produce* state. When rendering the message has to do work — `HaveScreenshot` writes the `.actual.png` and `.diff.png` artifacts as it explains the comparison — the matcher stops being a plain `gcustom.MakeMatcher(...)` value and becomes a struct that **embeds `gcustom.CustomGomegaMatcher`** (so `Match` and the negated form come for free) and **overrides `FailureMessage`** (see `screenshotMatcher` in `visual.go`):

```go
type screenshotMatcher struct {
	gcustom.CustomGomegaMatcher
	// …state the failing attempt left behind…
}

func (m *screenshotMatcher) match(actual any) (bool, error) { /* …stash the failing comparison… */ }
func (m *screenshotMatcher) FailureMessage(actual any) string { /* …write artifacts, then render… */ }

m := &screenshotMatcher{...}
m.CustomGomegaMatcher = gcustom.MakeMatcher(m.match)
```

The reason to bother is that `FailureMessage` runs **once**, at the deadline, while `Match` runs on every poll attempt — so the disk write happens for the one comparison that actually failed rather than for each of the dozens that merely hadn't settled yet. Keep the side effect best-effort and quiet (a failing spec should report the assertion, not a disk error) and stash whatever the message needs on the struct during `Match`.

**Decide what a missing element means for your matcher.** `(false, nil)` is "not ready, retry" — which is right under `Eventually`, but it also means `ShouldNot(yourMatcher)` **passes vacuously** against a page that never rendered the element at all. When the matcher's whole point is that the element is there and has some quality, make a genuine not-found an **error** — from the JS side (`one(...)`, or a hand-rolled `sel()` + `notFound(...)` for a two-selector probe, as the geometry handlers do) or from the Go side (`notFoundSelectorError(selector)`, which is how the existence-only `HaveProperty` restores the error its `poll(...)`-backed handler swallows). Make it a deliberate choice, not a default.
