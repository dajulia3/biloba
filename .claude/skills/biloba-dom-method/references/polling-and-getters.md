### The canonical poll-by-default wiring (`polling.go`)

`polling.go` provides the three helpers every dual/poll method routes through. Build the gcustom matcher **once**, then fork on whether a selector was supplied:

- `b.pollOrImmediate(selector, matcher) bool` — the fully-applied (immediate-looking) branch. By default it runs `Eventually(selector).Should(matcher)` (honoring any `WithTimeout`/`WithPolling`/`WithContext`); under `b.Immediate()` it runs `Expect(selector).To(matcher)` (act once, fail fast). It binds to `b.gt` via `NewWithT` — never the global fail handler — so the failure-capture harness and `Helper()` offsets keep working.
- `b.guardBareMatcher("Method")` — the under-applied (bare-matcher) branch. You configure the `Eventually`/`Expect`, not the matcher, so this rejects every `WithTimeout`/`WithPolling`/`WithContext`/`Immediate` knob with a hard error.
- `b.guardConfig("Method", allowed...)` — for the non-polling buckets (snapshots, waiting commands, one-shot mutations). See the four-bucket model below.

**Dual immediate/matcher** — dispatch on argument count using `args ...any`. Fully-applied POLLS via `pollOrImmediate`; under-applied returns the bare matcher *and* guards it. This is the shape every Cat-1 action shares (`clicks.go pointerInteraction` is the reference impl):
```go
func (b *Biloba) pointerInteraction(verb, matcherMessage string, args []any, act func(...) (bool, error)) types.GomegaMatcher {
	b.gt.Helper()
	selector, cfg, immediate := b.parsePointerArgs(verb, args)
	matcher := gcustom.MakeMatcher(func(selector any) (bool, error) {
		return act(selector, cfg)
	}).WithMessage(matcherMessage)
	if immediate {
		b.pollOrImmediate(selector, matcher)   // fully-applied: POLLS (or Expects under Immediate())
		return nil
	}
	b.guardBareMatcher(verb)                   // under-applied: return bare matcher, reject config knobs
	return matcher
}
```
`SetValue`/`SetProperty`/`DragTo`/`ScrollWheel`/`Focus`/`Blur` etc. follow the same fork directly in `dom.go`. `HaveProperty(property, expected ...any)` (existence-only vs value-matching) is a pure matcher and stays unchanged.

### Value-extracting getters poll-until-found (`Get*`)

A `Get*` getter (`GetProperty`, `GetAttribute`, `GetValue`, `GetInnerText`, `GetTextContent`, `GetProperties`, `GetAttributes`, `InvokeOn`/`InvokeWith`) returns a value but still **polls until the element is found**. Build an **unexported** matcher (not part of the public matcher API) that captures the value into a closure variable, then drive it through `pollOrImmediate` and return the captured value (pattern from `dom.go GetProperty`):
```go
func (b *Biloba) GetProperty(selector any, property any) any {
	b.gt.Helper()
	name := nameOf(property)
	var result any
	matcher := gcustom.MakeMatcher(func(sel any) (bool, error) {
		r := b.runBilobaHandler("getPropertiesP", sel, []any{property})
		if r.Error() != nil {
			return false, r.Error()   // genuine JS error
		}
		if !r.Success {
			return false, nil          // not ready yet → retry
		}
		result = newProperties(r.Result).Get(name)
		return true, nil
	}).WithMessage(fmt.Sprintf("have property %q", name))
	b.pollOrImmediate(selector, matcher)
	return result
}
```
The get-handler is a **single atomic JS op** that returns `found + value` in one round-trip (no `Exist`-then-`get` race). "Success" means "element found"; the value may legitimately be `nil`.

**Optional trailing decode pointer.** A getter whose static type is `any`/`[]any` takes one optional trailing pointer so the caller doesn't have to type-assert: `b.GetProperty("#row", "offsetWidth", &n)`. The pattern is `args ...any` → `target, ok := b.decodeTarget("GetProperty", args)` (hard-errors on more than one arg, or a nil/non-pointer) → `b.decodeResult("GetProperty", target, result)` *after* a successful read. `decodeResult` routes through the same `decodeCapture` as `ValueMatcher.Capture`, so the coercion rules are identical, and the value is still returned as before. It's wired into `GetProperty`/`GetAttribute`/`GetValue` and their `CurrentPropertyForEach`/`CurrentAttributeForEach`/`CurrentValueForEach` snapshots. A getter that already returns a concrete type (`GetBoundingBox` → `Box`, `GetInnerText` → `string`) doesn't need one.

**Readiness can be more than "element found."** A getter may keep polling (`{success:false}` with no error) until the value is *usable*, not just present — the handler adds its own gate on top of finding the element. The two-axis property getters gate on "property defined"; the **geometry getters** (`geometry.go` / `boundingBoxP`/`scrollOffsetP`/`offsetWithinP` in `biloba.js`) gate on a *non-degenerate layout box* (`width`/`height` > 0), so a getter never reads a zero box mid-layout.

**Split the two cases deliberately: missing → error, present-but-not-ready → silent retry.** The geometry handlers are the reference. They're built on `one(...)` (or hand-rolled `sel()` + `notFound(...)` for the two-selector probes) rather than `poll(...)`, so a **missing** element returns an error — which under `Eventually` is still just a failed attempt, but keeps `ShouldNot(b.BeInViewport())` from passing instantly against an element that never rendered. The **degenerate box** stays `{success:false}` with no error, so the positive direction polls through late layout. Same rule elsewhere: `isChecked` errors when the node has no `checked` property at all (the "I selected the label, not the input" bug) instead of coercing `undefined` to `false`. Whenever you write a `poll(...)`-backed handler, ask what a negated assertion on it would do against an empty page. **And say what the negation should be instead:** an error is never a satisfied assertion in *either* direction, so making missing-is-an-error also breaks the legitimate wait-for-teardown spec (`Eventually(sel).ShouldNot(b.BeInViewport())` on a toast that gets removed). Whenever you flip a matcher this way, the docs/skills/changelog entry must name the replacement idiom — assert disappearance with the matchers that are *about* existence, `ShouldNot(b.Exist())` / `Should(b.HaveCount(0))` — not just the vacuous-pass it fixed. They follow this exact `Get*` pattern plus a `Have*`-matcher counterpart (one decodes the struct into a closure var; the other runs a caller-supplied sub-matcher against the decoded struct/value), and they decode the JS map into a typed struct (`Box`/`ScrollOffset`/`BoxDelta`) via a small `newBox`/`newScrollOffset`/`newBoxDelta` à la `newProperties`. **Element-to-element** probes (`relativeBoxesP`, `documentOrderP`) take a *second* selector — Go encodes it with `encodeSelector` and passes the encoded string so the JS `sel()` resolves it directly, and both elements are read in ONE eval so the relation is judged at a single layout instant (the whole point — splitting into two getters loses the atomic frame). They back pure relational matchers (`BeAbove`/`Encloses`/`Overlaps`/`BePrecededBy`/…) plus the `GetGapBetween`/`HaveGapBetween` dual; `BeInViewport` is a single-selector matcher reading the rect against `window.innerWidth/Height`.

**Recording for the poll-trajectory artifact (`probe_trajectory.go`).** Polling getters and `b.Run`/`b.RunAsync` call `b.recordProbe(probeKey(method, sel), value)` once they have a value, so a failing `Eventually` over that read can attach its `(elapsed, value)` trajectory. It's a no-op unless `BilobaConfigPollTrajectory` is on (default on) and costs ~nanoseconds. If you add a new polling getter, call `recordProbe` at the success point (see `geometry.go`).

**Two-axis polling (`GetProperty`/`GetProperties`/`GetAttribute`/`GetAttributes`).** These poll until the element is present **and every named property/attribute is defined**. The name params widen `string`/`...string` → `any`/`...any` so each can be a bare `string` or an `AllowMissing`. `b.AllowMissing("name")` exempts one name from the "defined" axis — it comes back `nil` instead of blocking the poll. **Sharp edge:** a name the element type simply can't have (e.g. `disabled` on a `<div>`) would otherwise block the poll forever; it *must* be wrapped in `AllowMissing`. `GetValue`/`GetInnerText`/`GetTextContent` have no "defined" axis (empty string / unselected radio `""` is a valid value) — element-present only, no `AllowMissing`.

That sharp edge is now **self-explaining**, and a new two-axis getter must keep it that way. The JS handler's not-ready return carries a diagnostic instead of a value — `{success:false, result:{element, undefined:[names]}}` — and the Go side folds it in with `noteUndefinedAxis` + `undefinedAxisTemplate` (`dom.go`), swapping `.WithMessage` for `.WithTemplate`. The timeout then says the element was present the whole time, that it was the *property* that never appeared, and names the exact `b.AllowMissing("...")` call to copy. `{success:false}` still means "retry" — nothing branches on the diagnostic.

**A polling getter doesn't have to be about an element.** `GetLocation`/`GetTitle` (`navigation.go`) and `GetJSValue` (`javascript.go`) are `Get*` getters that poll the *tab*: build the gcustom matcher over `*Biloba` (or over the expression string) and hand `b` itself to `pollOrImmediate` as the actual. The `Get` prefix tracks "polls and returns a value", not "takes a selector". Crucially, these read through CDP, and **a transient CDP error must be a retryable miss** — returning `(false, err)` — never a `Fatalf`. A `Fatalf` inside a poll is a Ginkgo `Fail`, which *panics out* of the surrounding `Eventually` instead of counting as a failed attempt; that bug is what made `Eventually(b.Location)` unpollable. Any internal caller that needs a single-shot read gets an unguarded `location()`/`title()`-style substrate (cf. `Run`/`run`) so snapshot and failure-rendering paths never poll or fail.

### Atomic JS handler / MatcherResult semantics

Keep the not-found/ready/error distinction inside one round-trip so polling stays clean:
- `(false, nil)` = **not ready** → `Eventually` retries.
- `(false, err)` = **genuine JS error** → Gomega does NOT abort the poll; it retries and surfaces the error inside the "Timed out after…" message at the deadline. True fail-fast on a real error happens only under `Immediate()` (which uses `Expect` = single evaluation). Do **not** special-case errors to abort the poll — that re-introduces the flake.
- `(false, gomega.StopTrying(msg))` = **a condition that can never come true** → stop the poll now and report `msg`. Reserve it for exactly that: a state no amount of waiting can change. The reference cases are `HaveScreenshot`'s **missing baseline file** (the file will not appear because the spec kept asking) and an undecodable PNG, alongside `decodeCapture`'s wrong-target-type. Waiting out a full timeout to say "there is no baseline" would bury the one instruction the user needs. A page that hasn't settled yet is *never* one of these — keep it `(false, nil)`.

### State a method mutates must live in `tabState`

`b.Realistic()`, `b.WithTimeout(d)`, `b.Immediate()` and other poll-config views are **shallow copies** of the `Biloba` struct (`nb := *b; nb.flag = true`). So anything a method reads or writes on the tab has to be reachable through a copy:

- **Maps and pointers are fine** — the copy shares them.
- **Slices and bools declared on `Biloba` are NOT.** An `append` through a copy updates the copy's slice header and nothing else, and a read through a copy sees the list frozen at the moment the copy was made. Both directions fail silently.

So a method that registers or accumulates per-tab state puts that state in **`tabState`** (`biloba.go`), which every view shares by pointer. Its membership rule is "what `Prepare()` resets" — `newTabState()` is both the fresh-tab state and the reset, so a field added there can't be forgotten by `Prepare`. `Prepare` resets *through* the pointer (`*b.state = ...`), never by swapping in a new one, or the views would keep the old.

Fields that stay on `Biloba` itself: identity (`Context`, `targetID`, `root`), suite config (the failure-artifact knobs, `downloadDir`), and the view flags themselves — which is the whole point, since those are *supposed* to differ per view.

`go vet` will not catch a mistake here: its copylocks check is what would otherwise flag `nb := *b`, and `lock` is a `*sync.Mutex` so it stays quiet. **`tab_state_internal_test.go` is the guard** — it reflects over `Biloba` and fails on any field a view copies that isn't classified as `reasonIdentity`, `reasonViewFlag`, or `reasonRootOwned`, so adding one forces the decision. The behavioural test is a spec that registers through a *held* view (`rb := b.Realistic()`) and asserts the bare tab sees it — see "registering through a view of the tab" in `network_test.go` and `dialog_handling_test.go`.

### The four-bucket model and `guardConfig`

Not every method polls. `guardConfig(name, allowed...)` enforces which config knobs (`knobTimeout`/`knobPolling`/`knobContext`/`knobImmediate`) a method accepts:

| Bucket | Examples | Allowed knobs |
|---|---|---|
| **Polling** (Cat 1 actions, Cat 2 `Get*`) | `Click`, `SetValue`, `GetProperty` | all four — skip the guard, route through `pollOrImmediate` |
| **Waiting command** (Cat 5a) | `Navigate`, `Capture*Screenshot*` | `guardConfig(name, knobTimeout, knobContext)` — keep own default deadline; `WithPolling`/`Immediate` hard-error |
| **Snapshot** (Cat 3 `Current*ForEach`, `HasElement`/`Count`) | `CurrentPropertyForEach` | `guardConfig(name)` — no knobs |
| **One-shot mutation** (Cat 5b, `Run`/`RunAsync`) | `SetCookie`, `Run` | `guardConfig(name)` — no knobs |

Snapshot/one-shot methods call `b.guardConfig("Name")` (no knobs) right after `b.gt.Helper()`; waiting commands pass `knobTimeout, knobContext`. A bare-matcher method (Cat 6) or the under-applied form of a dual method uses `guardBareMatcher` instead.

**Naming conventions (poll-by-default).**
- `Get*` (singular) → **polls** until the one element/value you asked about is present.
- `Current*ForEach` → **snapshot** plural getter; no poll, `nil` per missing entry, empty slice when nothing matches (`CurrentPropertyForEach`, `CurrentAttributesForEach`, `CurrentValueForEach`, `CurrentInnerTextForEach`, `CurrentTextContentForEach`). Blessed wait pattern: `Eventually(sel).Should(b.HaveCount(n))` *then* read.
- `*Immediately` → **snapshot** plural action; acts on the current set, no-op on zero, no poll (`ClickEachImmediately`, `SetPropertyForEachImmediately`, `InvokeOnEachImmediately`, `InvokeWithEachImmediately`, `SendKeysToWindowImmediately`). The double-suffix length is an intentional "know what you're doing" smell.

**First-vs-all naming.** If you add a first-element polling getter `GetFoo`, consider its snapshot `CurrentFooForEach` (returns a slice, empty when nothing matches) and/or `EachHaveFoo` matcher counterparts, mirroring `GetProperty`/`CurrentPropertyForEach` and `HaveProperty`/`EachHaveProperty`. The name tells the user which it is.

**`*Each` matchers fail on empty.** `EachBeVisible`/`EachBeEnabled`/`EachHaveClass`/`EachHaveProperty`/`EachHaveInnerText`/`EachHaveTextContent` mean "**≥1 match AND all matches satisfy**." Zero matches **fails** (a vacuous pass is a silent false-positive — exactly the footgun class poll-by-default exists to kill). The `each(cb)` JS combinator still returns empty on no match; the fail-on-empty lives in the Go matcher (return `false` with an "at least one element" message).

**Options (offsets & modifiers) are a distinct type, not a named verb.** Trailing pointer/keyboard options — `b.At(x, y)` and the modifiers `b.Shift()`/`b.Ctrl()`/`b.Alt()`/`b.Meta()` (defined in `clicks.go`) — are a separate `any`-typed argument the method peels off, *not* a `ClickAt`/`ShiftClick` method. A method that accepts them takes `args ...any` and splits options from the selector (see `applyPointerOption` in `clicks.go`, and `splitModifiers` for the keyboard side). The modifiers are deliberately shared across both pointer (`Click`/`Tap`/...) and keyboard (`Type`/`SendKeysToWindowImmediately`, in `keyboard.go`) interactions — if you add a new interaction that should honor them, reuse those helpers rather than inventing a parallel option set. (Keyboard methods drop to chromedp's input domain rather than `runBilobaHandler`, since synthetic JS key events can't type into the page.)

**Godoc.** Add a terse comment to every exported symbol, ending with a `Read https://onsi.github.io/biloba/#... ` link to the relevant docs section, matching the existing comments.
