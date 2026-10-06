## Env vars

| Var | Effect |
|---|---|
| `BILOBA_SCREENSHOTS_DIR=./artifacts` | where failure screenshots — and the visual `.actual.png`/`.diff.png` artifacts — are written |
| `BILOBA_SCREENSHOT_BASELINES_DIR=./baselines` | where `b.HaveScreenshot`'s **committed** baselines live (default `./biloba-baselines`) |
| `BILOBA_UPDATE_SCREENSHOTS=1` | capture and (re)write every visual baseline the run touches instead of comparing; prints what changed. Accepts `1/t/true/y/yes/on` (off: `0/f/false/n/no/off`), case-insensitive; **any other value warns and is treated as off**. Suite-wide — scope it with `--focus`. **Never set it in CI**: every visual assertion then passes unconditionally |
| `BILOBA_OUTLINE_MAX=131072` | raise the outline byte cap; `0`/`off` = no truncation |
| `BILOBA_INLINE_SCREENSHOTS=iterm\|kitty\|sixel\|none` | force an inline-image protocol, or `none` to disable the blob (the file path is still printed — use `none` in CI and in Claude Code, where base64 is noise) |
| `BILOBA_PROBE_TERMINAL=true` | actively query the TTY for Sixel support when env detection finds nothing |
| `BILOBA_INTERACTIVE=true` | headful high-fidelity run that pauses on failure until `^C` |

Inline images are auto-detected (Kitty, iTerm2, Sixel/VS Code) and only emitted when the terminal supports them.

## Config knobs (`ConnectToChrome`)

Each boolean takes an optional bool (no arg = `true`). **Explicit settings win, per knob** — automation only fills knobs you left untouched.

- `BilobaConfigScreenshotsToDir(dir)` — write each tab's failure screenshot there (prints the absolute path).
- `BilobaConfigFailureOutlines(...bool)` / `BilobaConfigInlineScreenshots(...bool)` — force on/off.
- `BilobaConfigFailureScreenshots(...bool)` (default on) / `BilobaConfigPollTrajectory(...bool)` (default on) / `BilobaConfigProgressReportScreenshots(...bool)` (default on).
- `BilobaConfigFailureScreenshotsSize(w,h)` / `BilobaConfigProgressReportScreenshotSize(w,h)`.
- `BilobaConfigDebugLogging(...bool)` — stream all CDP traffic to the `GinkgoWriter` (verbose).
- `BilobaConfigScreenshotBaselinesDir(dir)` — where `b.HaveScreenshot` reads/writes committed baselines (default `./biloba-baselines`; commit that dir, gitignore the screenshots dir).
- `BilobaConfigScreenshotTolerance(fraction)` / `BilobaConfigScreenshotChannelTolerance(delta)` — suite-wide visual-comparison defaults, both `0` (exact) by default; `b.Tolerance(...)`/`b.ChannelTolerance(...)` override per assertion. → `biloba:visual-assertions`

```go
// CI that only redirects the directory still keeps the automation default of outlines-on:
b = biloba.ConnectToChrome(GinkgoT(), biloba.BilobaConfigScreenshotsToDir("./artifacts"))
```

## Watch it live

```bash
BILOBA_INTERACTIVE=true ginkgo --focus="..."
```

Headful, high fidelity, prints the failure and waits for `^C`. Use a small handful of focused specs, in serial. (`SpinUpChrome(GinkgoT(), biloba.ChromeFlags(chromedp.Flag("headless", false)))` does the same in code.)

## A hang, not a failure

Biloba screenshots Ginkgo [progress reports](https://onsi.github.io/ginkgo/#getting-visibility-into-long-running-specs) — on a spec timeout, a `PollProgressAfter` spec, or on demand: `^T` (SIGINFO) on macOS, `SIGUSR2` on Linux.
