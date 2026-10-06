---
name: visual-assertions
description: Write Biloba screenshot assertions, review or update their baselines, and diagnose visual comparison failures.
---

# Biloba screenshot assertions

Use `HaveScreenshot` when rendered appearance is the contract: charts, canvas/WebGL, clipping, contrast, or a layout that DOM assertions cannot establish. Prefer element captures when the contract is local; continue using ordinary matchers for text, counts, and state.

```go
Eventually(".chart").WithTimeout(10*time.Second).Should(b.HaveScreenshot("revenue-chart"))
Eventually(b).WithTimeout(10*time.Second).Should(b.HaveScreenshot("home", b.Mask(".timestamp")))
```

The matcher re-captures on each `Eventually` attempt, tolerating rendering that has not reached the expected appearance yet. A passing attempt proves a match at that instant, not that the page can never change afterward. Configure the `Eventually`, not `b.WithTimeout(...).HaveScreenshot(...)`.

## Baseline workflow

1. Run normally. A missing baseline fails and writes an `.actual.png` rather than blessing the current rendering.
2. Open the image and assess it against the requested appearance. Report what was reviewed and any uncertainty. Respect the user’s existing authorization for creating or updating baselines.
3. Generate the reviewed baseline with a scoped run:

   ```bash
   BILOBA_UPDATE_SCREENSHOTS=1 ginkgo --focus="revenue chart"
   ```

4. Run normally to verify the comparison, and include the baseline in the change. Record the update diagnosis in the PR when it helps explain the PNG change.

Keep `biloba-baselines/` committed and `biloba-screenshots/` gitignored. Never leave `BILOBA_UPDATE_SCREENSHOTS` enabled in CI: update mode passes without comparing. It rewrites every baseline touched by the run, so scope updates. Do not refresh a baseline merely to silence an unexplained failure.

Read [baseline details](references/baselines.md) for directory overrides, orphan cleanup, boolean env syntax, and update-mode settling. A never-settled warning requires investigating or masking the moving region before trusting the baseline.

## Rendering decisions

| Need | Guidance |
|---|---|
| Dynamic timestamps, avatars, or ads | Mask the changing region with `b.Mask` |
| CSS animation, transitions, caret, or web fonts | Biloba freezes animations and awaits fonts automatically; `b.Animated()` opts out |
| Known rasterization noise | Tune `ChannelTolerance` using measured differences; keep tolerance narrow |
| Light/dark appearance | `b.InColorSchemes`; put the app in its follow-system state first |
| Subject inside an inner scrolling pane | Scroll it into view and gate with `BeInViewport(b.Fully())` before capturing |
| macOS versus Linux font rendering | Generate baselines on the CI platform or separate them by platform |

Capturing content beyond the viewport can expand it, trigger responsive re-layout, and replace the subject. Prefer subjects already fully in view. Closed shadow roots, JS animation pulses, and late non-font changes may need app-specific stabilization.

Read [rendering, tolerance, and theme details](references/rendering.md) for those hazards. Read [failure diagnosis](references/diagnosis.md) for interpreting diff regions and shifts; investigate whether a change is intended before updating the baseline.
