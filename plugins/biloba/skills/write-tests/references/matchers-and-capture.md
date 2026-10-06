## Pocket matcher cheat-sheet — reach here before `b.Run`

| Want to assert… | Matcher |
|---|---|
| present / visible | `b.Exist()` / `b.BeVisible()` |
| how many match | `b.HaveCount(BeNumerically(">", 0))`; distinct by key: `b.HaveDistinctCount("data-key", 3)` |
| visible text | `b.HaveInnerText("…")` / `b.HaveTextContent(…)` / `b.HaveText(…)` (whitespace-collapsed) |
| a DOM/JS property | `b.HaveProperty("href", …)` / `b.HaveClass("active")`; JSON attr `b.HaveJSONAttribute("data-state", HaveKeyWithValue(…))` (getter `b.GetJSONAttribute(sel, attr, &out)`) |
| actually clickable (visible+enabled+topmost) | `b.BeClickable()` |
| form value | `b.HaveValue(…)` |
| tab URL / title / spawned tab | `b.HaveURL(…)` / `b.HaveTitle(…)` / `b.HaveSpawnedTab(…)`; getters `b.GetLocation()`/`b.GetTitle()` |
| the app applied a server response | poll a browser-side acknowledgement; see [network and state](network-and-state.md#the-app-state-barrier-bgetjsvalue) |
| a network request was made | `Eventually(b).Should(b.HaveMadeRequest(…))` |
| layout / box / scroll | `b.HaveBoundingBox(HaveField("Top", …))` / `b.HaveOffsetTopWithin(container, …)` / `b.HaveScrollOffset(…)`. `Box.Width`/`Height` = border-box; `ClientWidth`/`ClientHeight` = scrollbar-excluded content box |
| A relative to B | `b.BeAbove` / `BeBelow` / `BeLeftOf` / `BeRightOf` / `b.Encloses` / `b.Overlaps`; numeric `b.GetGapBetween(a,b)` → `BoxDelta` |
| on screen / document order | `b.BeInViewport()` (partial; `b.BeInViewport(b.Fully())` = whole box) / `b.BePrecededBy` / `b.BeFollowedBy` |
| computed style | `b.HaveComputedStyle(prop, …)` / `b.HaveComputedStyleNumeric(prop, …)`; color across syntaxes `b.HaveComputedStyle(prop, b.MatchColor("var(--tok)"))`; getters `b.GetComputedStyle`/`GetComputedStyleNumeric`/`NormalizeColor` |
| scroll a target into view (instant) | `b.ScrollIntoView(sel)` — options `b.WithinScroller(container)`, `b.AtTopOffset(px)` |
| an arbitrary JS expression | `Eventually(expr).Should(b.EvaluateTo(matcher))` |
| it still *looks* like this | `b.HaveScreenshot("name")` against a committed baseline → `biloba:visual-assertions` |

- `EvaluateTo`/`Run` decode JS numbers to **float64** — `BeNumerically("==", n)`, not `Equal(intLiteral)`.
- **`BePrecededBy`/`BeFollowedBy` read subject-first**: `Eventually(X).Should(b.BeFollowedBy(Y))` ⇔ X comes **BEFORE** Y. A backwards one passes silently — also assert the inverse doesn't hold.
- **Geometry matchers error on a missing element**, so `Eventually(sel).ShouldNot(b.BeInViewport())` times out. Assert disappearance with `ShouldNot(b.Exist())` / `Should(b.HaveCount(0))`.

## `.Capture(&x)` — don't re-read what you just asserted on

```go
var blockID string
Eventually(".figure-frame").Should(b.HaveAttribute("data-block-id", Not(BeEmpty())).Capture(&blockID))
b.Click("#block-" + blockID)
```

Asserting and *then* calling the getter is two reads of a page that may have changed in between. `Capture` hands you the value from the winning read, decoded into your Go type (a JS number lands in an `*int` as `3`, not `float64(3)`).

- Writes **only on a match** — `ShouldNot` captures nothing; use a `Should` when you need the value.
- Returns a **new** matcher and leaves the receiver alone, so a matcher in a variable is reusable with different targets (`m.Capture(&idA)`, then `m.Capture(&idB)`).
- Narrowing a JS object into a struct with a subset of its fields is fine; capture Biloba's own structs (`Box`, `ScrollOffset`, `BoxDelta`, `Cookie`) into the matching type or an `any` — a different struct is rejected, not half-filled.
- A JS `null`/`undefined` decodes to the Go zero value, so a plain `*string` target can't tell "absent" from "present but empty." Decode into a `**T` instead — absent leaves it `nil`, present allocates. Same rule for the getters' trailing decode pointer. Matters most under `AllowMissing` (`biloba:api`), whose whole point is making absence a value rather than a timeout.
- Value-less matchers (`Exist`, `BeVisible`, `BeInViewport`, the relational ones) and actions-as-matchers deliberately don't compile with it. Full capturable list → `biloba:api`.
