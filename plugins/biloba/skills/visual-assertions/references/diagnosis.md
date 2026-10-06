## Reading a failure without opening an image

```
screenshot "home-desktop" differs from baseline
  38,160 of 1,017,600 pixels differ (3.75%), max channel delta 221
  changed region: one box, (0,14)-(1272,44)  [100% of the width, 4% of the height, at its top edge]
  unchanged: everything below y=44
  baseline: /Users/you/app/biloba-baselines/home-desktop.png
  actual:   /Users/you/app/biloba-screenshots/home-desktop.actual.png
  diff:     /Users/you/app/biloba-screenshots/home-desktop.diff.png
```

| Shape line | Means | Do |
|---|---|---|
| `one box`, full width, top edge | the header/banner changed, nothing else | look at the header markup, not the component under test |
| `one box`, small, mid-image | the component you actually touched | read the `.diff.png`; likely a real, intended change |
| `changed regions: N boxes` (each listed, largest first, capped at 5 + `… and N more`) | several independent changes | check whether they share a container |
| `scattered — N regions spread across the image` | every text run moved a little — a web font failed to load or rendered differently | check font loading; if it's Mac↔Linux, see [platform-specific font rendering](rendering.md) |
| `uniform shift of the whole image, 1px down (dx=0, dy=1)` | nothing changed *inside* the subject; something above/before it grew or moved | fix the thing above; don't re-baseline |
| `baseline is 800x600, actual is 800x640 (40px taller)` | the box itself resized — no per-pixel story | a layout change, not a paint change |

- `unchanged: everything below y=44` is the complement and often the faster read. Printed only when a clear majority is untouched; silent on a shift or a scattered change.
- `max channel delta` counts **all** pixels, including ones the channel tolerance absorbed — it tells you whether the tolerance is doing its job or is one notch from hiding a real change.
- **When that number is in the low single digits Biloba says so in words**: `every differing pixel differs by <= 3 — a rasterisation or compositing difference, not a content change`. That suggests rasterization or compositing noise; verify the image and intended appearance before adjusting tolerance. Look for a composited shadow or a dithered gradient bleeding into the capture, and absorb it with `b.ChannelTolerance` at that call site with the measured amplitude written there.
- The `.diff.png` is the actual, washed out, with every differing pixel in magenta. `Read` it when the words aren't enough. A human running this in a terminal that renders images gets that diff drawn under the diagnosis; you get the path, because inline images are off under an agent. The words above are printed to both.
- Every verdict is deliberately conservative — when no signature holds you get the plain box list. The **shift** verdict additionally never fires on an image thinner than ~16px on either axis (a thin rule, a focus ring, a slim progress bar captured as an element), because at that size the search describes itself rather than the page. Those get the box reading.

Same idea as the [poll trajectory](https://onsi.github.io/biloba/#outline): the words are the diagnosis, the image is the evidence. → `biloba:debug-failures`
