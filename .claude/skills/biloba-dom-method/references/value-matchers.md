### Value-bearing matchers return `*ValueMatcher` (`capture.go`)

A matcher that **reads a value off the page** returns `*ValueMatcher` rather than a bare `types.GomegaMatcher`, so callers can chain `.Capture(&x)` and keep the value from the winning read. This exists to kill gate-then-re-read: asserting with a matcher and *then* calling a getter is two reads of a page that may have changed in between. Wrap the gcustom matcher on the way out:

```go
func (b *Biloba) HaveProperty(property string, expected ...any) *ValueMatcher {
	data := map[string]any{}
	// ...
	return capturableResult(gcustom.MakeMatcher(func(selector any) (bool, error) {
		// ...
		data["Result"] = r.Result       // the same slot the failure template renders
		return matcher.Match(data["Result"])
	}).WithTemplate(..., data), data)
}
```

- `capturableResult(matcher, data)` is the common case: the matcher already stashes what it observed in `data["Result"]` so its template can render it, and `Capture` reads that same slot. **Stash the observed value in `data["Result"]` and the matcher is capturable for free.**
- `capturable(matcher, observed func() any)` is for a matcher whose value doesn't live in `data` — e.g. the existence-only `HaveLocalStorageItem` has no sub-matcher (and so no `Result` for its template) and closes over a local instead (`storage.go`).

**Capturable vs. bare is part of the API — the type is the documentation.** `.Capture` must not compile on a matcher with nothing to hand back. Keep returning `types.GomegaMatcher` for:
- matchers that read no value — `Exist`, `BeVisible`, `BeEnabled`, `BeClickable`, `BeFocused`, `BeChecked`, `BeInViewport`, and the relational geometry matchers (`BeAbove`/`Encloses`/`Overlaps`/`BePrecededBy`/…);
- the actions-as-matchers (`Click`, `SetValue`, `Type`, `DragTo`, `SelectText`, …) — including the under-applied form of every dual method.

Sharp edges the existing code already handles — copy them:
- **An existence-only form should capture too — teach the handler to return the value it already had in hand.** A "is it there?" matcher usually *has* to touch the value to answer, so make the round-trip carry it back and `.Capture` works uniformly across both forms of the same matcher. All three do this now: `HaveProperty(name)` (no expected) calls `getPropertiesP` rather than the boolean `hasProperty`, keeping presence-not-truthiness semantics while making the value available; `HaveAttribute(name)` likewise; and `eachHasProperty` returns `{count, values}` — `count` drives the fail-on-empty message, `values` is the very same `[]any` the value-matching form produces — so `EachHaveProperty(name)` (and the no-arg `EachHaveInnerText()`/`EachHaveTextContent()` that route through it) hand back the whole slice. **A `*ValueMatcher` whose `Capture` leaves the target at zero is a bug, not a signature convenience** — if you find yourself about to document that a form "returns a ValueMatcher for consistency but captures nothing," go make the JS return the value instead.
- **`Capture` writes only on a successful match**, so `ShouldNot`/`NotTo` captures nothing; while polling, the target is overwritten on each successful attempt.
- **`Capture` returns a new matcher and leaves the receiver alone.** Both `ValueMatcher.Capture` and `CookieMatcher.Capture` copy the receiver before setting the target. Preserve this behavior so a matcher can be reused with different capture targets; cookie refinements also copy and preserve the capture target.
- **Decoding is `decodeCapture`**: direct assign when the types already line up (the typed results — `Box`, `ScrollOffset`, `BoxDelta`, `Cookie`, `[]string`), otherwise a JSON round-trip, which is what makes a JS number land in an `*int` as `3` rather than `float64(3)`. A mismatch JSON can't honestly bridge returns `gomega.StopTrying` — a wrong target type is a spec bug, not a not-yet condition, so it must not wait out the timeout. Decoding one concrete Go struct into a *different* concrete Go struct is tightened with `DisallowUnknownFields` (`structToStruct`), because those structs share field names, carry no json tags, and would otherwise half-fill in silence.
- **`null`/`undefined` zeroes the target, on purpose, with one guaranteed exception.** A JS `null`/`undefined` decodes to the Go zero value for any target — except a `**T` (pointer-to-pointer), which `decodeCapture` leaves `nil` instead of allocating a zeroed `*T`. That's what lets a caller decode into `**T` to tell "absent" apart from "present but empty" (`var key *string; b.GetAttribute(sel, b.AllowMissing("data-key"), &key)`). This is guaranteed behavior, not an accident of the JSON round-trip — keep it working for every target type if you touch `decodeCapture`.
- **A query matcher with its own builder chain grows its own `Capture`.** `CookieMatcher` (`cookie_matchers.go`) carries `.WithValue/.WithPath/.WithSecure/…`, so it can't be a `*ValueMatcher`; it defines `Capture(&cookie)` that composes with the refinements in either order and calls the same `decodeCapture`. Follow that shape for a new builder-style matcher rather than forcing it into `ValueMatcher`.
