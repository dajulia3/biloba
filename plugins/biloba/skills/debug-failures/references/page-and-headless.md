## Look at the page yourself, any time

```go
fmt.Println(b.Outline())     // indented DOM
fmt.Println(b.A11yOutline()) // accessibility tree: role + accessible name per node
AddReportEntry("DOM before click", b.Outline(), ReportEntryVisibilityFailureOrVerbose)
b.Run("document.querySelectorAll('.card').length")   // quick count probe
```

`b.A11yOutline()` is **not** auto-attached — call it explicitly. It's often more useful than raw HTML for reasoning about what a page *means*.

**Attach app/store state to every failure.** For a state-heavy or optimistic-UI app the store beats the DOM (which may be the pre-confirmation copy):

```go
ReportAfterEach(func(report SpecReport) {
    if !report.Failed() { return }
    AddReportEntry("app state", b.Run(`JSON.stringify(window.__APP_STATE__ ?? null)`))
})
```

Keep the `?? null` so a crashed page doesn't turn the snapshot itself into a failure. (That's a *snapshot*. To **wait** on app state as part of a spec, use `b.GetJSValue` — `biloba:flaky-specs` §3.)

**Page `console.*` streams to the `GinkgoWriter`**, each argument rendered space-separated. Objects come from CDP's **shallow** preview, so nested/large objects log lossily. Build the string yourself when you need the whole value: `console.log('state ' + JSON.stringify(obj))`.

## Two headless quirks that look like Biloba bugs

- **`HaveInnerText`/`GetInnerText` timing out on text that's plainly in the outline.** `innerText` is computed from layout and can return a stale/partial value before a paint settles. Switch to `HaveTextContent`/`GetTextContent` (reads `textContent` off the tree) or to a plain existence assertion.
- **`requestAnimationFrame` never firing.** On a **fully static page**, `chrome-headless-shell` can leave rAF unscheduled after the first scroll (nothing animating ⇒ no frames), wedging app code driven off an rAF loop. Shape: a hang/timeout only in the default headless lane. Confirm with a counter read through a **coalescing `b.Run`** — `b.Run("window.__rafTicks ?? 0")`, **not** `b.GetJSValue`, which would sit waiting for a counter that never appears. Fix: drive the work off a real event, or run that spec under `HighFidelityHeadless()`/`BILOBA_INTERACTIVE=true`.
