## 7. Assertions that cannot fail

These pass every time, forever, against a completely broken page — and are usually written *as the guard against exactly that breakage*. The tell: the subject can be empty or absent, and the form treats empty-or-absent as success. Ask "what would make this fail?"

**An unresolved locator scope matches nothing**, so every negative assertion on it is satisfied instantly:

```go
// WRONG — passes forever if #published-list never renders (the white screen this guard exists to catch)
Consistently(b.ByTextContains("Draft").Within("#published-list")).ShouldNot(b.Exist())

// RIGHT
Eventually("#published-list").Should(b.Exist())
Consistently(b.ByTextContains("Draft").Within("#published-list")).ShouldNot(b.Exist())
```

**`BeNetworkIdle` means "zero in flight right now"** — no quiet period — so it passes at t=0, before your click's fetch has left the page. Anchor on the request first:

```go
b.Click("#refresh")
Eventually(b).Should(b.HaveMadeRequest(ContainSubstring("/api/refresh")))
Eventually(b).Should(b.BeNetworkIdle())
```

**A `Current*ForEach` snapshot returns an empty slice**, which satisfies a negated collection assertion. These don't poll, so gate presence — the same gate keeps the negative honest:

```go
Eventually(".row").Should(b.HaveCount(3))
Ω(b.CurrentInnerTextForEach(".row")).ShouldNot(ContainElement("Draft"))
```

(Positive collection assertions are safer: Gomega's `HaveEach` errors on an empty slice, and the `Each*` matchers fail on zero matches.)

**Two vacuous negations Biloba now makes loud** — both were satisfied by an element that wasn't there:
- `ShouldNot(b.BeChecked())` on the wrapping `<label>`/`<div>` instead of the `<input>`: an element with no `checked` property is now an **error**.
- `ShouldNot(b.BeInViewport())` and the other geometry matchers on an element that never rendered: a missing element is now an **error** (the pairwise/offset probes name which selector went missing).

**That change costs the wait-for-teardown idiom.** Gomega counts an assertion satisfied only when the matcher gives the desired answer *and* doesn't error, in either direction:

```go
Eventually("#toast").ShouldNot(b.BeInViewport())   // WRONG — now times out
Eventually("#toast").ShouldNot(b.Exist())          // RIGHT
Eventually("#toast").Should(b.HaveCount(0))        // RIGHT
```

Same for `HaveBoundingBox`, `HaveScrollOffset`, `HaveOffsetTopWithin`/`HaveOffsetLeftWithin`, `HaveGapBetween`, the pairwise matchers, and any `Consistently(sel).ShouldNot(...)` on a conditionally-rendered `sel`. **`Exist`/`HaveCount` answer "is it there?"; geometry matchers answer "where is it?" and presuppose it's there** — same as `BeVisible`/`BeEnabled`/`BeClickable` always have.

**A visual baseline that was never reviewed asserts nothing.** If a missing baseline were written on first sight and the spec passed, the very first run would certify whatever the page happened to look like — a broken page included — and the assertion would be green from birth, so nobody would ever open the image. Biloba refuses: a missing baseline is a **failure** that writes the captured `.actual.png` and tells you to re-run with `BILOBA_UPDATE_SCREENSHOTS=1`.

Don't work around it. Pre-writing baselines blind — a scripted "run with update until it's green", or committing whatever the first run produced without looking — recreates exactly the vacuous assertion the refusal exists to prevent. Read the `.actual.png`, then update.

**`BILOBA_UPDATE_SCREENSHOTS` set in CI turns the entire visual suite green.** In update mode every visual assertion captures, writes its baseline, and passes — no comparison happens at all. It's an environment variable, so it gets added to a CI config once, during a legitimate baseline refresh, and then stays. Nothing fails, nothing looks wrong, and the suite reads as coverage while proving nothing. Grep the CI config for it before trusting a green visual run, and keep the variable to local, scoped invocations (`ginkgo --focus=…`).

**And a tolerance widened until nothing can fail is the same bug with pixels.** `b.Tolerance(0.05)` on a small element can absorb an entire component; `b.ChannelTolerance(60)` absorbs a color change. Tune the suite-wide default (`BilobaConfigScreenshotTolerance` / `BilobaConfigScreenshotChannelTolerance`) once against real evidence, and treat a per-assertion tolerance that keeps growing as a signal the subject is nondeterministic — mask the region (`b.Mask`) instead of blurring the whole comparison. → `biloba:visual-assertions`

**A capture used to be able to destroy its own subject.** Reaching content outside the viewport means expanding it, and a responsive page observes that — `matchMedia` flips, `resize` fires, and an app that re-renders on its breakpoint unmounts the subtree being captured, taking component-local state with it. The spec then fails on the line *after* the capture, polling for an element that was there a moment ago. Biloba now expands the viewport only when it has to (a subject outside the viewport, or a document bigger than the viewport) and says so when a subject vanishes across a capture: `the element matching X was present before this capture and gone after it`.

If you see that message, or an intermittent "could not find DOM element" on the line following a capture: **capture something already in view**. `b.ScrollIntoView(sel)`, gate on `b.BeInViewport(b.Fully())`, then capture — Biloba touches nothing.

**A blank capture is a stable capture.** An element capture works below the *document* fold — Biloba expands the main frame's viewport — but an element scrolled out of an **inner** `overflow: auto` pane was never painted, and comes back as a flat rectangle of the pane's background. Baseline that and it matches itself forever. This is the normal shape of any app-shell layout (fixed chrome, inner scrolling pane), so it is not exotic. Biloba now refuses the comparison and names the clipping ancestor; the fix is to scroll the pane first:

```go
b.ScrollIntoView(".figure", b.WithinScroller("#reader-pane"))
Eventually(".figure").Should(b.BeInViewport(b.Fully()))
Eventually(".figure").Should(b.HaveScreenshot("figure"))
```

Every structural gate in front of such a capture (`[data-rendered]` present, `svg` present) passes while the capture is blank — presence is not paintedness.

**Two colour schemes that render identically assert one thing, not two.** `b.InColorSchemes("light","dark")` drives `prefers-color-scheme`, and an app with a manual theme override only follows that media query while it is in its follow-the-system state. A spec that pinned the theme (directly, via a helper, or via a leftover stored preference) writes the same pixels to `home-light.png` and `home-dark.png`. Both look right, both pass, and the dark assertion cannot fail. Biloba warns when two schemes in one assertion capture byte-identical images — treat that warning as a finding, not noise.

Three more vacuous shapes live with their smell and are covered in the related references: the **eagerly-created app-state barrier** ([reconciliation](reconciliation.md)), the **inverted document-order assertion** ([layout](layout.md)), the **shadowed stateful handler** ([handler ordering](network-handlers.md)).
