## 2. Actions that don't poll

**Don't reach for `b.Immediate()`.** It acts once and fails fast; fire a frame early and the spec fails *downstream* (a timed-out `Eventually`, or the app's own `null is not an object`) with nothing pointing back. If the default wait is short, widen it — don't drop to `Immediate`.

```go
b.Click("#go")                                // polls until clickable, clicks once, stops
b.WithTimeout(5*time.Second).Click("#go")     // tune the wait
Eventually("#out").Should(b.HaveClass("open"))// assert the observable outcome
```

The matcher form (`Eventually(sel).Should(b.Click())`) lets you own the poll. `Eventually` stops at the first successful action, so it is safe on a toggle. `Consistently` keeps evaluating the matcher and would repeat the action; use it for observations, not toggle clicks.

**The one sanctioned `Immediate()`: set-and-confirm.** Inside a polling closure the action must be `Immediate()`, or you get a poll inside a poll (wasteful, and the inner timeout muddies the failure output):

```go
Eventually(func(g Gomega) {
    b.Immediate().SetValue("#qty", 3)      // acts once per iteration…
    g.Expect("#qty").To(b.HaveValue("3"))  // …until the value sticks against an optimistic revert
}).Should(Succeed())
```

Rule: **action inside a polling closure ⇒ `Immediate()`; action outside one ⇒ neither closure nor `Immediate()`.**

**A conditional interaction is a spec smell.** `if collapsed { click }`, a `HasElement` branch before an action — it means the spec doesn't know its own state, and a check-then-act loop re-clicks every tick and oscillates a toggle. Fix determinism upstream: create your own element in a known state instead of inheriting one from an earlier `Ordered` spec, or barrier on app state ([response reconciliation](reconciliation.md)) before interacting. (Idempotence corollary: set-and-confirm re-fires its action, so it's correct for `SetValue` and a flake for a toggle click. There is deliberately no `ClickWhen` primitive.)

**Fast `Click` is occlusion-blind by design.** It polls on visible + enabled, then calls `element.click()` — it will click straight through a modal scrim. When an overlay is possible:

```go
Eventually("#submit").Should(b.BeClickable())   // + topmost-at-center
b.Click("#submit")
// or: b.Realistic().Click("#submit")           // refuses to click through
```

The click records a hit-test and names the occluder in the failure artifacts, but only *after* a spec fails — it never changes whether one passes.

**Two verbs genuinely can't poll — gate them by hand.** `b.SendKeysToWindowImmediately(...)` (focus-free; only you know what should be focused) and the `*Immediately` plural verbs (`ClickEachImmediately`, `SetPropertyForEachImmediately`):

```go
Eventually("input.search").Should(b.BeFocused())
b.SendKeysToWindowImmediately(biloba.Keys.Enter)
```

To send keys into a specific element use `b.Type(sel, ...)` — it focuses first and polls.
