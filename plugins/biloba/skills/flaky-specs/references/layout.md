## 4. Layout, geometry, and document order

`getBoundingClientRect`, `scrollHeight`/`clientHeight`, `getComputedStyle`, and `compareDocumentPosition` on rAF-injected nodes all settle **after** the element exists. Gating on "element exists" then reading geometry races the *measure*.

Use the native, layout-aware expressions — they poll until the element is present **and** has a non-degenerate box:

```go
Eventually("#card").Should(b.HaveBoundingBox(HaveField("Height", BeNumerically("<=", 0.8*viewportH))))
Eventually(".hero .sec").Should(b.HaveOffsetTopWithin(".scroller", BeNumerically("<", 120)))
Eventually(".scroller").Should(b.HaveScrollOffset(HaveField("Top", BeNumerically("==", 0))))
Eventually("#tab").Should(b.BeAbove("#tile"))          // pairwise: both boxes read in one atomic frame
Eventually("#note").Should(b.BeInViewport(b.Fully()))  // wholly on screen, not merely laid out
hex := b.GetComputedStyle(".rail", "--stage")          // resolves custom properties
box := b.GetBoundingBox("#card")                       // Box{Top,Left,Width,Height,…,ClientWidth,ClientHeight}
```

`Box.Width`/`Height` are border-box; `ClientWidth`/`ClientHeight` are the scrollbar-excluded content box. Also: `b.GetScrollOffset`, `b.GetOffsetTopWithin`/`GetOffsetLeftWithin`, `b.BeBelow`/`BeLeftOf`/`BeRightOf`/`Encloses`/`Overlaps`, `b.GetGapBetween`/`HaveGapBetween`. Drop to `Eventually(b.Run)` only for what these don't cover (per-line `getClientRects` wrap detection, SVG path points, atomic act-then-measure, WebGL `gl.readPixels`, `elementFromPoint` hit-testing).

**A backwards document-order assertion goes green, it doesn't flake.** `Eventually(X).Should(b.BePrecededBy(Y))` ⇔ X comes **AFTER** Y; `b.BeFollowedBy(Y)` ⇔ X comes **BEFORE** Y. These read backwards to most people, and on a fixture that happens to satisfy the inversion the spec silently tests the opposite of what you meant. Pin the direction from both sides:

```go
Eventually(noteSel).Should(b.BePrecededBy(sectionSel))   // the note comes AFTER the section
Ω(noteSel).ShouldNot(b.BeFollowedBy(sectionSel))         // …and not before it
```

("Anywhere after" includes *inside* — scope with `Locator.NotWithin` when you mean "after Y but not nested in Y". On failure the message reports the order actually observed.)

**A consistently wrong geometry value needs diagnosis before a longer timeout.** The DOM is real, but if the page computed the position once and never reconciled, the value is *stably wrong* and `Eventually` can't save you. Check the expected value and fixture as well as app-side layout reconciliation before changing the timeout. The poll trajectory tells you which: **flat** suggests a stable mismatch, **monotone** suggests latency, **dip-then-rebound** suggests a late reflow (`biloba:debug-failures`).
