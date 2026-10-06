---
name: write-tests
description: Write or review Biloba browser specs in a Ginkgo/Gomega suite. Covers polling, selectors, interactions, and capturing asserted values.
---

# Writing Biloba specs

Use the existing suite setup and fixture strategy. For new wiring use `biloba:setup`; for exact signatures use `biloba:api`. The [DOM docs](https://onsi.github.io/biloba/#working-with-the-dom) are the canonical narrative reference.

## Core API idioms

```go
b.Navigate("http://localhost:8080/search")
Eventually("#results").Should(b.Exist()) // meaningful DOM readiness
b.SetValue(b.ByLabel("Search"), "biloba")
b.Click(b.ByRole("button").WithName("Search"))
Eventually(".result").Should(b.HaveCount(BeNumerically(">", 0)))
```

Fully-applied actions (`b.Click(sel)`, `b.SetValue(sel, value)`) poll until ready and act once. Under-applied forms return matchers (`Eventually(sel).Should(b.Click())`). Getters poll for readiness; use `Have*`/`Be*` matchers under `Eventually` when waiting for an expected value.

Configure a fully-applied call with `b.WithTimeout(d)`, `b.WithPolling(d)`, or `b.WithContext(ctx)`. Configure `Eventually` for a bare matcher; applying these knobs to the matcher is an error. `b.Immediate()` is the explicit act-once/fail-fast option.

- A singular `Get*` reads the first match. `Current*ForEach` reads all current matches without polling. Plural `*Immediately` actions also do not poll.
- `Each*` matchers require at least one match and all matches satisfying the condition. Assert absence with `ShouldNot(b.Exist())` or `HaveCount(0)`.
- Poll changing state with `Eventually`; retain intentional snapshots for pre-action baselines or assertions where absence itself is meaningful. `b.Run` is a synchronous expression and does not poll; use `Eventually(b.Run).WithArguments(expr)` for eventual JS state, and `b.RunAsync` for `await`/`fetch`.
- JS numbers decode to `float64`; use `BeNumerically` rather than `Equal(intLiteral)` on raw JS results.
- A DOM readiness anchor proves a route rendered. The URL alone can change before the destination is ready; assert it separately when navigation is part of the contract.

## Selectors and interactions

Use a semantic locator for role/name/label contracts, or CSS on stable IDs/test hooks for structural state. XPath is useful for axes and text-node queries. Pass the selector into the action so resolution and interaction stay atomic. Anchor a locator’s scope before asserting something is absent within it.

Fast `Click` does not scroll, focus, or check occlusion. Fast `Hover` does not activate CSS `:hover`. `SetValue` sets and dispatches change events; `Type` sends real keystrokes. Use `b.Realistic()` when real input or occlusion matters; use `b.BeClickable()` for a deterministic occlusion assertion.

Read [selector composition](references/selectors.md) for scoping, indexing, shadow roots, or iframes, and [interaction details](references/interactions.md) for pointer options, keyboard modifiers, selection, or framework form behavior.

## Capture a value from the assertion

```go
var blockID string
Eventually(".figure-frame").Should(b.HaveAttribute("data-block-id", Not(BeEmpty())).Capture(&blockID))
```

`.Capture` keeps the value from the successful read, avoiding an assert-then-get race. It returns a new matcher and leaves the receiver alone. `ShouldNot` captures nothing. Read [matchers and capture](references/matchers-and-capture.md) for available matchers, decode targets, and typed-versus-raw collection results.

## Network, state, and multiple tabs

Prefer real backends and the project’s existing fixture strategy. When controlled responses are needed, stub only the relevant endpoints and assert the handler’s `Count()` so a nonmatching stub cannot pass silently. Handlers share a first-match-wins list and accumulate across `Ordered` specs because `Prepare()` is `OncePerOrdered`.

Optimistic DOM state does not prove that a server response was applied. Use a browser-side acknowledgement or the DOM/state produced by that response. `GetJSValue` waits only for definedness: an eagerly-created empty log is not a barrier. `HoldResponse` can force response ordering rather than relying on repeated runs.

Read [network, state, and tab patterns](references/network-and-state.md) when stubbing, holding responses, seeding state, or testing multiple tabs. For intermittent behavior or suspected vacuous assertions use `biloba:flaky-specs`.

For screenshot contracts use `biloba:visual-assertions`; for real input use `biloba:realistic-mode`. For unsupported CDP features use chromedp through the tab’s `b.Context`.
