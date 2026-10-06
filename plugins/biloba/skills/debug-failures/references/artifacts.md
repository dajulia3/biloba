### Poll trajectory

When an `Eventually` over a polled read (`b.Run`/`b.RunAsync`, a value getter, a geometry getter) times out, Biloba attaches the `(elapsed, value)` series. Gomega's `Timed out … Expected <120>` shows only the final value; the shape is the diagnosis:

| Shape | Means | Do |
|---|---|---|
| **flat** (one row, `held ×N`) | a stable mismatch: app state, fixture, or expectation may be wrong | check the expected value and layout reconciliation (`biloba:flaky-specs` §4) before widening the timeout |
| **monotone staircase** | progress toward the expected value, possibly latency | check whether progress should complete, then adjust the timeout if justified |
| **dip-then-rebound** | a late reflow shoved it back | settle layout before asserting |

On by default; `BilobaConfigPollTrajectory(false)` disables it (and the detached-node signal).

### Visual diagnosis (a failed `b.HaveScreenshot`) → `biloba:visual-assertions`

Two extra PNGs land in the screenshots dir — `<name>.actual.png` (what Biloba saw) and `<name>.diff.png` (the actual, washed out, differing pixels in magenta) — and the failure message says what moved:

```
screenshot "home-desktop" differs from baseline
  38,160 of 1,017,600 pixels differ (3.75%), max channel delta 221
  changed region: one box, (0,14)-(1272,44)  [100% of the width, 4% of the height, at its top edge]
  unchanged: everything below y=44
  baseline: /Users/you/app/biloba-baselines/home-desktop.png
  actual:   /Users/you/app/biloba-screenshots/home-desktop.actual.png
  diff:     /Users/you/app/biloba-screenshots/home-desktop.diff.png
```

| Shape line | Means |
|---|---|
| `one box`, full width, top edge | the header/banner changed |
| `one box`, small, mid-image | the component you touched |
| `changed regions: N boxes` (largest first, capped at 5) | several independent changes |
| `scattered — N regions spread across the image` | a web font failed to load or rendered differently |
| `uniform shift of the whole image, 1px down` | something *above* the subject grew or moved — fix that, don't re-baseline. Never reported for an image thinner than ~16px on either axis (thin rule, focus ring, progress bar) — those get the box reading |
| `baseline is 800x600, actual is 800x640 (40px taller)` | the box resized; no per-pixel story |

`unchanged: everything below y=N` is the complement and usually the faster read. `max channel delta` counts every pixel, including those the channel tolerance absorbed — and when it is in the low single digits Biloba adds `every differing pixel differs by <= N — a rasterisation or compositing difference, not a content change`. Use it as a clue to check shadow or gradient compositing; verify against the image before choosing a fix. A **missing** baseline is a different failure — it says to re-run with `BILOBA_UPDATE_SCREENSHOTS=1`; never script your way past it.

Open the `.diff.png` with the available image viewer when the words aren't enough. A human at a terminal that renders images also gets it drawn under the diagnosis; you get the path instead, since inline images are off under an agent.

**"never settled" — printed during an update run, not on a failure.** Update mode captures until three in a row match before writing. When that never happens it writes the last capture anyway and prints:

```
The screenshot for home-desktop never settled: no 3 captures in a row matched, across 8 captures over 2.6s.
Biloba wrote the last one, but a baseline captured from a page that is still changing will fail on every later run.
Mask the changing region with b.Mask(...), or track down what is still moving.
```

The run stays green, so this is easy to scroll past — don't. The baseline just written is unsettled and the next normal run will fail against it. Add a `b.Mask(...)` for the moving region (or stop the page moving), then re-run the update. Re-running the update alone changes nothing. → `biloba:visual-assertions`

**"Failed to clear the emulated prefers-color-scheme"** — a dropped `b.InColorSchemes` teardown. The override is target-level and survives navigation, so `b.Prepare()` clears the leak before the next spec; the spec that printed the warning, though, finished rendering in the emulated scheme. Read any odd-looking screenshot from that spec with that in mind.

### The `⚠` diagnostic notes

**"Selector matched, then stopped matching"** — the detached node. The selector resolved, then its node was replaced (list re-key, portal migration) or its identifying attribute swapped in place. Silent when the selector genuinely never matched.

```
⚠ Selector "#row-4" matched 6× during this poll (+0.00s to +0.41s) then stopped matching
  — the node was likely replaced, or its identifying attribute changed in place.
```

**"Click dispatched onto a covered element"** — fast `Click` stays occlusion-blind by design and still succeeds through an overlay, but records a hit-test so the downstream failure points somewhere. Diagnostic only; never changes whether a spec passes.

```
⚠ Click on "#submit" was dispatched while <div#overlay.modal-scrim> was the topmost
  element at its centre — the click may have been swallowed.
  Consider Eventually("#submit").Should(b.BeClickable()) or b.Realistic().Click("#submit").
```

**"Network handler never ran (shadowed by an earlier handler)"** — handlers are first-match-wins, so one registered for a URL an earlier handler claims is dead code. Deadly across an `Ordered` container, where `Prepare()` doesn't run between `It`s. Both call sites are named.

```
⚠ A ModifyResponse handler registered at network_test.go:231 never ran — an earlier ModifyResponse
  handler (registered at network_test.go:223) claimed 1 matching response(s) first.
```

Reported only when a handler **never fired** *and* was shadowed at least once. **Limit:** it's a failure artifact, so it cannot surface shadowing's other presentation — a leftover *stateful* handler claiming the response, passing it through untouched, spec **green**. Only your own `Eventually(hold.Count).Should(Equal(1))` catches that (`biloba:flaky-specs` §6).

### Two failure *messages* that self-explain

- A two-axis getter timing out because the **property** never became defined says the element was present, names the property, and prints the `b.AllowMissing("disabled")` to paste (`biloba:flaky-specs` §5).
- A failed `BePrecededBy`/`BeFollowedBy` reports the order actually observed (`Actually: #o-first comes BEFORE #o-second.`) — enough to spot an inverted assertion.
