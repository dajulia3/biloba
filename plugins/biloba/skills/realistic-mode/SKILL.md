---
name: realistic-mode
description: Use b.Realistic() for Biloba tests whose contract requires real pointer input, occlusion checks, CSS hover, scrolling, or touch.
---

# Realistic interactions

Two interaction tracks on the **same tab**:

- **Fast track (default `b`)** — atomic JS simulations: a click is `element.click()` after synchronous visibility/enabled checks. No scroll, no occlusion test, no real `:hover`. What you want for the bulk of specs.
- **Realistic track (`b.Realistic()`)** — a `*Biloba` view of the same tab whose interactions run through real Chrome DevTools Protocol input. The default `b` is untouched.

```go
rb := b.Realistic()
rb.Click("#submit")                     // scrolls into view, waits for stability, refuses to click through an overlay, real mouse click
Eventually(".menu").Should(rb.Hover())  // moves the real pointer → CSS :hover activates
```

Docs: <https://onsi.github.io/biloba/#realistic-interactions>.

## When to reach for it

Use it for specs whose contract requires real input or hit-testing. It costs round-trips and can introduce timing sensitivity, so prefer the fast track for assertions that do not depend on those behaviors.

| You need to test | Why the fast track misses it |
|---|---|
| A click must route **around an occluding overlay** | fast `Click` is `el.click()` — it clicks straight through |
| A menu/tooltip opens on **CSS `:hover`** | fast `Hover` fires JS pointer events; CSS `:hover` never activates |
| Element is **off-screen / below the fold** and must scroll in | the fast track never scrolls |
| A **pointer drag** (@dnd-kit, Sortable, custom DnD) | needs real `pointerdown`/`move`/`up` |
| Real **wheel scrolling** of the page, or **touch** | needs trusted CDP input |

To merely *assert* an element isn't occluded, use the cheaper deterministic matcher `Eventually(sel).Should(b.BeClickable())` (visible + enabled + topmost-at-its-center) — no realistic round-trips.

Realistic mode does **not** help with cross-origin frames or geolocation — drop to chromedp via `b.Context` (`biloba:overview`).

## Capability matrix

Selection is track-agnostic (CSS, `>>>`, locators, XPath all work through either handle). The interactions differ:

| Interaction | Fast (`b`) | Realistic (`b.Realistic()`) |
|---|---|---|
| `Click` | `el.click()`, no scroll/occlusion test | scroll to center, wait for stability, verify enabled + **topmost** (no click-through), real mouse press/release. Coords inside same-origin `>>>` iframes are translated |
| `DblClick`/`RightClick`/`MiddleClick` | synthetic `dblclick`/`contextmenu`/`auxclick` | scroll + stability + occlusion + real button input (native context menu fires) |
| `ClickEachImmediately` | clicks all visible+enabled matches | real input, scrolling and re-measuring each in turn; skips hidden/disabled/off-screen/obscured |
| `Hover` | JS pointer/mouse events; **no** CSS `:hover` | real pointer → CSS `:hover` activates |
| `SetValue` | sets value, fires `input`/`change` (no typing) | text inputs: real click → clear → real keystrokes → blur; checkboxes: real click. Native pickers (radio/`<select>`/multi) fall back to fast JS |
| `Type` | real CDP key events already | additionally scrolls the element into view first |
| `SendKeysToWindowImmediately` | real CDP key events already | no target element — nothing to scroll |
| pointer options `b.At(x,y)`/`b.Shift()`… | any option switches a click off native `el.click()` to a synthetic event carrying coords + modifier flags | real CDP input honoring the offset (translated, bounds-checked) + modifier bitmask |
| `DragTo` | `pointerdown`/`move`/`up` events | real CDP mouse drag (scrolls + checks both ends) |
| `ScrollWheel` | synthetic `wheel` + manual ancestor scroll | real CDP wheel — trusted input, scrolls the page |
| `Tap` | synthetic touch/pointer + `click` | real CDP `touchStart`/`touchEnd` |
| `Focus` | plain JS `.focus()` | **same** — real engines focus without a side-effecting click |

Full vocabulary (`DblClick`, `RightClick`, `MiddleClick`, `b.At`/`b.Shift`/`b.Ctrl`/`b.Alt`/`b.Meta`, `DragTo`, `ScrollWheel`, `Tap`, `Type`) → `biloba:write-tests`, `biloba:api`.

**Realistic interactions poll by default too.** `b.Realistic()` is the same shallow `*Biloba`-clone as the poll-config handles, so it composes with them: `b.Realistic().WithTimeout(5*time.Second).Click("#submit")`. A fully-applied `rb.Click(sel)` polls (scroll + stability + occlusion + click) until it succeeds — no `Eventually` wrapper needed. The matcher form is still there when you want to own the poll.

**Scroll-into-view lives only on this track** (plus the focus-bearing `SetValue`/`Type`, whose `.focus()` scrolls). A fast `Click`/`Tap` never moves the page — so if a scroll/layout spec needs the viewport held still, stay fast; and if scroll position shifts around a fast click, the cause is app-side (`biloba:flaky-specs` §8).

## The three composition patterns

There is deliberately **no per-call decorator** — the handle is the one seam, and it flows through helpers and `Eventually` exactly like `b`.

```go
// 1. Inline — the handle is cheap to make
b.Realistic().DragTo("#card", "#done-column")

// 2. Per-spec
It("opens the hover menu", func() {
    rb := b.Realistic()
    Eventually(".nav-item").Should(rb.Hover())
    Eventually(".nav-item .submenu").Should(b.BeVisible())
    Eventually(b.ByRole("menuitem").WithName("Settings")).Should(rb.Click())
})

// 3. Per-suite, gated on a Ginkgo Label
var _ = Describe("checkout (realistic smoke)", Label("realistic"), func() {
    var rb *biloba.Biloba
    BeforeEach(func() { rb = b.Realistic() })
    // ...use rb throughout; rb.Click fails while an overlay covers the target — the guard we want
})
```

`ginkgo --label-filter='realistic'` runs only that lane; `--label-filter='!realistic'` keeps it out of the fast inner loop.

## Pitfalls

- Prefer the fast track for the bulk of a suite. A suite specifically testing real-input behavior may legitimately use realistic mode throughout.
- A realistic interaction scrolls an off-screen target into view; a target that remains occluded or non-actionable **polls and fails** — the feature, but it makes these specs timing-sensitive. Bump `rb.WithTimeout(d)` for a slow scroll/settle; don't drop to `Immediate()`.
- `DragTo` drives **pointer-based** DnD (@dnd-kit, Sortable), **not** native HTML5 `draggable` (a separate drag-event model).
