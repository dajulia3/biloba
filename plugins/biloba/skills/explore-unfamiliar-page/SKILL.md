---
name: explore-unfamiliar-page
description: Inspect an unfamiliar page through Biloba and draft a browser spec grounded in its rendered state.
---

# Inspect an unfamiliar page and draft a spec

Ground the test in the rendered page: identify the readiness signal, the controls involved, and the outcome the user wants to verify. Use existing fixtures, tests, or failure artifacts when they already provide that evidence. Inspect through Biloba when runtime state or selectors remain uncertain.

## Inspect only what is missing

- `b.Outline()` gives a structural DOM map with stable IDs and test hooks.
- `b.A11yOutline()` gives roles and accessible names for user-facing controls.
- `b.CaptureScreenshotToFile(path)` supplies rendered evidence when visibility, layout, or pixels matter. Open the image with the agent’s available image viewer.

An existing focused spec can expose these artifacts. If there is no suitable entrypoint, use a temporary scratch spec and remove it when done:

```go
It("inspects the page", func() {
    b.Navigate(targetURL)
    Eventually(readinessSelector).Should(b.Exist())
    fmt.Println(b.Outline())
    fmt.Println(b.A11yOutline())
    fmt.Println(b.CaptureScreenshotToFile("./tmp/scratch.png"))
})
```

The selector should come from the app or observed page. If it is unknown, inspect first and then add a readiness assertion. Use a focused Ginkgo run rather than loading the whole suite for exploration.

## Turn evidence into the test

Use semantic locators for role/name/label contracts, and stable CSS hooks for structural state. Anchor a scope before a negative assertion: an unresolved `Within` scope matches nothing and makes `ShouldNot(b.Exist())` pass vacuously.

```go
b.SetValue(b.ByLabel("Search"), "biloba")
b.Click(b.ByRole("button").WithName("Search"))
Eventually(".result").Should(b.HaveCount(BeNumerically(">", 0)))
```

Prefer the project’s existing backend and fixture strategy. Stub specific dependencies when the test needs controlled responses; use `b.Realistic()` when real input or occlusion is part of the contract. See `biloba:write-tests` for the API idioms relevant to the spec.

Remove any scratch spec and artifacts you created, run the affected specs, and report any unverified assumptions. If essential behavior cannot be established, make that limitation explicit rather than presenting a guessed spec as verified.
