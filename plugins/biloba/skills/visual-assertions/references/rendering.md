## Determinism: which tool for which hazard

| Hazard | Tool |
|---|---|
| A region that legitimately changes every run (relative timestamp, avatar, ad slot, build hash) | `b.Mask(sel...)` |
| CSS animation / transition / blinking caret / smooth scroll | **automatic** — Biloba freezes rendering for the capture, inside open shadow roots too |
| A page still moving when a baseline is written | **automatic in update mode** — three consecutive equal captures before the write |
| A web font swapping in late | **automatic** — every capture awaits `document.fonts.ready` |
| Unstable pixels that belong to no element (a composited shadow, a dithered gradient) | `b.ChannelTolerance(n)` — `b.Mask` takes selectors and cannot express this |
| You are asserting *on* an animation and made it deterministic yourself | `b.Animated()` opts out of the freeze |
| Antialiasing wobble between runs on the same machine | `b.ChannelTolerance(n)` (suite-wide: `BilobaConfigScreenshotChannelTolerance`) |
| A handful of pixels anywhere | `b.Tolerance(fraction)` (suite-wide: `BilobaConfigScreenshotTolerance`) |
| Light and dark themes | `b.InColorSchemes("light", "dark")` |
| A JS pulse with only 2–3 distinct renderings | **not solved** — see below |
| A subject scrolled out of an inner `overflow:auto` pane | **refused** — scroll the pane first, see below |
| A late one-shot change that is *not* a font (lazy image decode, late `ResizeObserver`) | **not solved** — gate it yourself before generating |
| Closed shadow roots | **not solved** — unreachable from script by design |
| Scrollbars | **not solved** — see below |
| Fonts across machines | **not solved** — see below |

```go
Eventually(b).Should(b.HaveScreenshot("dashboard", b.Mask(".relative-timestamp", b.ByTestID("avatar"))))
```

Masking paints the matched elements flat gray **before the baseline is written and before every comparison**, so both sides are masked identically. A mask selector that matches nothing is a no-op. Any Biloba selector works (CSS, `XPath`, `Locator`).

The freeze injects `animation: none; transition: none; caret-color: transparent; scroll-behavior: auto` for the duration of the capture and removes it after — `none`, not paused, because pausing freezes each animation at an arbitrary frame. It goes into **every open shadow root** as well as the document (a `*` rule in a document stylesheet doesn't cross a shadow boundary, so web components would otherwise animate straight through the capture) and is removed from all of them. **Closed** shadow roots can't be reached from script; a component using one is left animating, which is a likely cause when its capture won't settle.

**A JS pulse with 2–3 renderings (not solved).** The three-consecutive-equal-captures rule defeats anything animating on a fixed period, but a page alternating between two frames can match three times by chance, and no sampling schedule fixes that. CSS animations, transitions, and the caret are already frozen, so what's left is a hand-rolled `setInterval`/canvas redraw. The backstop is the never-settled warning plus the next run failing — mask the region, don't re-run the update.

**A capture expands the viewport only when it must — keep it that way.** Reaching outside the viewport means resizing it, and a responsive page observes that: `matchMedia` flips, an app re-renders on its breakpoint, and the subtree being captured can unmount mid-capture. Biloba skips the expansion for a subject already fully in view, and for a full-page capture of a document that fits the viewport (the app-shell case). **Prefer captures of things already on screen** — scroll first, gate on `b.BeInViewport(b.Fully())`, then capture. If a subject vanishes across a capture Biloba says so; treat that message as pointing at the capture, not at the assertion that failed after it.

**A subject inside an inner scroller (refused, with instructions).** An element capture works below the **document** fold — Biloba expands the main frame's viewport. It does nothing for an **inner** `overflow: auto` pane, which is how most app shells scroll. An element outside that pane's visible band was never painted, so the capture is a flat rectangle of pane background — and blank is *stable*, so as a baseline it would pass forever while comparing nothing. Structural gates don't catch it: `[data-rendered]` and `svg` are both present in a blank capture. Biloba refuses the comparison (and refuses to write the baseline), naming the clipping ancestor:

```go
b.ScrollIntoView(".figure", b.WithinScroller("#reader-pane"))
Eventually(".figure").Should(b.BeInViewport(b.Fully()))
Eventually(".figure").Should(b.HaveScreenshot("figure"))
```

A *partly* clipped subject warns and still compares — capturing something that straddles a pane edge is occasionally deliberate. An `overflow: hidden` ancestor that isn't cutting the subject off (a card clipping its own rounded corners) is not reported.

**The poll protects the comparison, not the write.** An assertion re-captures every attempt and rides out a late change; a baseline write passes on the first settled capture and has no second chance. The settle helps with periodic changes but cannot see a one-shot change that hasn't started — three captures agree because nothing has happened yet. Fonts are handled (`document.fonts.ready` is awaited before every capture, on both paths); anything else that lands late is yours to gate before generating.

**Scrollbars (not solved).** Overlay vs classic scrollbars change layout width, and that varies by platform, by OS setting, and on macOS by whether a mouse is attached. Prefer **element** captures over whole-page ones. If you need the page, hide them yourself: `::-webkit-scrollbar { display: none }` in the page, or `emulation.SetScrollbarsHidden(true)` via `b.Context`.

**Fonts across machines (not solved).** Subpixel antialiasing, hinting, and fallback differ between macOS and Linux — the same page produces a scattered diff in every glyph. **A baseline belongs to the platform that produced it.** Either generate baselines on the platform CI runs on, or split the directory:

```go
b = biloba.ConnectToChrome(GinkgoT(),
	biloba.BilobaConfigScreenshotBaselinesDir(filepath.Join("baselines", runtime.GOOS)),
)
```

Tolerance absorbs same-platform antialiasing. It does **not** absorb Mac↔Linux — the tolerance that would is large enough to absorb real changes.

## Tolerance: two independent axes

- `b.ChannelTolerance(delta)` — a pixel counts as differing only when an R/G/B/A channel differs by **more than** `delta`. The antialiasing absorber.
- `b.Tolerance(fraction)` — at most `fraction` (0..1) of the compared pixels may differ.

Both default to `0` (exact). Channel tolerance filters; fraction tolerance counts what's left.

**Set the default suite-wide, override per assertion only where one comparison genuinely needs different slack.** A number repeated at two hundred call sites is a suite nobody can reason about — and a tolerance widened until nothing can fail is an assertion that cannot fail (`biloba:flaky-specs` §7).

```go
b = biloba.ConnectToChrome(GinkgoT(),
	biloba.BilobaConfigScreenshotTolerance(0.001),
	biloba.BilobaConfigScreenshotChannelTolerance(4),
)
Eventually(".prose").Should(b.HaveScreenshot("prose", b.ChannelTolerance(8)))  // this one only
```

## Light + dark in one assertion

```go
Eventually(b).Should(b.HaveScreenshot("home", b.InColorSchemes("light", "dark")))
```

Captures and compares once per scheme with `prefers-color-scheme` emulated, and **all** must match. Baselines are `home-light.png` and `home-dark.png`; a failure names the scheme (`home (prefers-color-scheme: dark)`). Without the option Biloba doesn't emulate `prefers-color-scheme` at all and stores one `home.png`. The emulation is always reset, including on the error path — don't hand-roll a shoot-both-themes helper.

**The emulation drives the media query — your app has to be listening.** An app with a manual theme override (a `system`/`light`/`dark` toggle that sets `data-theme` on `<html>`) only follows `prefers-color-scheme` while it is in its follow-the-system state. A spec that pinned the theme — directly, through a helper, or through a leftover stored preference — captures the same rendering twice and writes it to both baselines. Both look right, both pass, and the dark assertion cannot fail. Biloba warns when two schemes capture byte-identical images; treat it as a finding. → `biloba:flaky-specs` §7

The override is **target-level and survives navigation**, so a dropped teardown would silently leave every later spec rendering in that scheme. Biloba warns when a reset fails (naming the stuck scheme) and `b.Prepare()` clears a leaked override before the next spec. If you see that warning, the leak is already handled — but it means the tab that produced it finished the spec in the emulated scheme.
