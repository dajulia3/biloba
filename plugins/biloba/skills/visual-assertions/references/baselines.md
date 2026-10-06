## The baseline workflow

A baseline is a golden master. The workflow exists to establish a deliberately reviewed expected rendering. Respect the user’s existing authorization for baseline changes; do not infer a new permission requirement from this workflow.

**Creating one**

1. Write the assertion, run the suite normally. **The first run FAILS** — a missing baseline is a loud failure that writes the captured image to the artifacts dir and prints its path. Biloba never writes-and-passes (a spec that has never compared anything reads green in CI).
2. **Open the `.actual.png` with the available image viewer and decide whether it is correct.** This is the sign-off on the golden master, and the one moment anyone is guaranteed to look at the image. Don't skip it on the user's behalf — look, then say what you saw.
3. Write the baseline:
   ```bash
   BILOBA_UPDATE_SCREENSHOTS=1 ginkgo --focus="the affected spec"
   ```
   **This is not instantaneous** — see *Update mode settles first* below. Budget ~0.5s per assertion, up to ~2.2s of waiting when a page is slow to settle. Don't treat a slow update run as a hang.
4. Include the baseline in the change. Without the committed file, a fresh clone fails with a missing-baseline error; Biloba does not regenerate it automatically.

**Updating one after an intentional change**

1. The normal run fails with the diagnosis. Read it (and the `.diff.png`) and confirm the change is the one that was intended.
2. Re-run with `BILOBA_UPDATE_SCREENSHOTS=1`.
3. It prints one line saying what changed. Put that line in the PR description — git shows a changed PNG as a binary blob, so the sentence is the only reviewable part:
   ```
   screenshot "home-desktop" updated — 38,160 of 1,017,600 pixels changed (3.75%), one box at (0,14)-(1272,44)
   ```

**Three operational facts**

- **Update mode is suite-wide.** It rewrites every baseline the run touches, not just the one you were looking at. Scope an intentional update with `ginkgo --focus="…"` or a label instead of rewriting everything.
- **Never set `BILOBA_UPDATE_SCREENSHOTS` in CI.** With it set every visual assertion captures and passes, so the whole visual suite goes green without comparing anything. → `biloba:flaky-specs` §7
- **Nothing prunes orphaned baselines.** Biloba reads and writes baselines by name and never deletes one. A removed spec leaves its PNG in the repo forever, and a rename produces a *second* baseline rather than moving the first. Delete the old file by hand.

**Spelling the variable.** `1/t/true/y/yes/on` turn it on; `0/f/false/n/no/off` and unset turn it off. Case-insensitive, whitespace trimmed. Anything else is treated as off **and warns** — `BILOBA_UPDATE_SCREENSHOTS is set to "sure", which Biloba does not recognise as a boolean - treating it as off.` If an update run wrote nothing, check that line before anything else.

**Never pre-write baselines blindly** — no scripted "just run update until green", no committing whatever the first run produced without opening it. That recreates the vacuous assertion the first-run failure exists to prevent.

### Update mode settles first

Ordinary assertions settle because the `Eventually` polls. Update mode has no `Eventually` behind it — it passes on the first attempt — so it does its own settling: it captures repeatedly until **three captures in a row compare equal** (under the configured tolerance) and writes that one. Otherwise a baseline caught mid font-load gets baked in, and every later run polls for a rendering that never returns.

The pauses between captures grow and are all different lengths (100ms, 140, 200, 280, 380, 500, 640), bounded at 8 captures. A *fixed* cadence is the problem: sample a 160ms animation every 160ms and every pair matches. Same "consecutive equal reads" rule Biloba uses to decide an element has stopped moving in realistic mode.

**A "never settled" warning is actionable, not noise.** If the streak never happens Biloba writes the last capture anyway and prints:

```
The screenshot for home-desktop never settled: no 3 captures in a row matched, across 8 captures over 2.6s.
Biloba wrote the last one, but a baseline captured from a page that is still changing will fail on every later run.
Mask the changing region with b.Mask(...), or track down what is still moving.
```

Do what it says — add a `b.Mask(...)` for the moving region (or fix the page) and re-run the update. **Do not just re-run the update hoping for a clean pass**: the baseline it wrote is unsettled, and the next normal run will fail against it. It's a warning rather than a failure because that next run is the right place to enforce it; the warning is the part that explains *why* it will fail.

## Two directories

| | Where | Lifecycle |
|---|---|---|
| **Baselines** `<name>.png` | `./biloba-baselines` (`BilobaConfigScreenshotBaselinesDir` / `BILOBA_SCREENSHOT_BASELINES_DIR`) | few, small, reviewed, **committed** |
| **Artifacts** `<name>.actual.png`, `<name>.diff.png` | the failure-screenshots dir, `./biloba-screenshots` (`BILOBA_SCREENSHOTS_DIR`) | written on failure, **gitignored** |

```
# .gitignore
biloba-screenshots/
```

Baseline names may contain `/` (`"checkout/step-2"` → `biloba-baselines/checkout/step-2.png`); artifact filenames are flat (`checkout_step-2.actual.png`).
