---
name: debug-failures
description: Inspect Biloba failure artifacts or configure their output. Use for a failing spec, a hang, or missing diagnostic evidence.
---

# Debugging Biloba failures

Biloba automatically emits DOM outlines and screenshot files under CI or an AI agent. Interactive humans get inline screenshots when the terminal supports them. `BILOBA_SCREENSHOTS_DIR` redirects the artifact directory from `./biloba-screenshots`. Explicit `ConnectToChrome` settings override these defaults per knob.

Use the evidence relevant to the failure rather than collecting every artifact:

| Evidence | What to inspect |
|---|---|
| JS crash or error boundary | Console errors replayed at the top of the failure block |
| `⚠` diagnostic note | Named occluder, replaced node, or shadowed network handler |
| Timed-out read | Poll trajectory: stable mismatch, progress, or reflow; validate the expected value too |
| Screenshot mismatch | Text diagnosis and changed region; open the actual/diff image when pixels matter |
| Selector mismatch | DOM outline, or `b.A11yOutline()` for role/name evidence |
| Hang | Ginkgo progress report and its screenshot; SIGUSR2 on Linux, SIGINFO on macOS |

Read [artifact interpretation](references/artifacts.md) for trajectory output, visual diagnoses, warnings, and self-explaining errors. These are diagnostic clues, not proof of a single cause; a flat value can be a wrong expectation or fixture as well as an app bug.

Open image files with the agent’s available image viewer. If an outline is truncated, raise `BILOBA_OUTLINE_MAX` (for example `131072`), or use `0`/`off` to disable truncation.

Read [page inspection and headless quirks](references/page-and-headless.md) when adding app-state evidence or investigating stale `innerText` and unscheduled rAF. A failure-state snapshot should preserve meaningful absence (`b.Run("window.__APP_STATE__ ?? null")`); `GetJSValue` is a wait, not a snapshot.

Read [artifact configuration](references/configuration.md) only when changing env vars, config knobs, or using a headed interactive run. `BILOBA_INTERACTIVE=true` requires a display and pauses failures until interrupted; use a focused serial run when that environment is available.

For races, response ordering, or assertions that pass vacuously, use `biloba:flaky-specs`. For baseline review and update workflows, use `biloba:visual-assertions`.
