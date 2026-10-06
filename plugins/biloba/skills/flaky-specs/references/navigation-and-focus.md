## 8. Two facts that prevent wrong diagnoses

**Gate on a DOM readiness anchor, not on the URL.** The URL flips the instant the router pushes it — the weakest available proof, and the one signal that races a live target swap.

```go
b.Click("#submit")
Eventually("#dashboard-root").Should(b.Exist())     // the destination actually rendered
Ω(b.GetLocation()).Should(HaveSuffix("/dashboard")) // …now a formality
```

`b.GetLocation()`/`b.GetTitle()` (breaking rename — bare `Location`/`Title` are gone) are polling getters honoring all four knobs, and they treat a transient `Inspected target navigated or closed (-32000)` as a retryable miss. So `Eventually(b.GetLocation)` is safe; it's just still the weaker assertion.

**Fast interactions act in place.** `b.Click`/`b.Tap` do **not** `scrollIntoView` and do **not** move focus. If a scroll position changes around a fast click, the cause is app-side. Scroll-into-view comes only from `b.Realistic()` and from focus-bearing ops (`b.Focus`, `b.SetValue`, `b.Type`) whose `.focus()` scrolls its target. If a spec asserts on scroll position, keep focus-bearing ops off the element under test.
