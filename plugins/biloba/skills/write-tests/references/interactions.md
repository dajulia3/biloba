## The interaction vocabulary

All dual unless noted; all work on both the fast and realistic tracks.

```go
b.DblClick(sel); b.RightClick(sel); b.MiddleClick(sel)
b.Click(sel, b.At(x, y))                          // click at a top-left-origin offset; canvas/map/slider
b.Click(sel, b.Shift(), b.Meta())                 // modifiers held; composes with b.At(...)
b.DragTo(source, target)                          // pointer-based drag — Eventually(src).Should(b.DragTo(tgt))
b.ScrollWheel(sel, deltaX, deltaY)                // +Y down, +X right
b.Tap(sel)                                        // touch tap; takes b.At(...), ignores modifiers
b.Focus(sel); b.Blur(sel); b.Hover(sel)           // Hover fires pointer events, NOT CSS :hover
b.ScrollIntoView(sel, b.AtTopOffset(96))          // also b.WithinScroller(container)
b.Type(sel, "abc"); b.Type(sel, biloba.Keys.Enter)// real keystrokes — SetValue does NOT type
b.Type("textarea", biloba.Keys.Enter, b.Shift())  // Shift-Enter — modifiers work on the keyboard too
```

**`b.Type` is THE element-targeted keyboard method** — text, named `biloba.Keys.*`, and held modifiers. `b.Type(sel, payload...)` polls; `b.Type(payload)` returns a matcher (a lone string, or one-or-more `Keys.*`). Exact disambiguation → `biloba:api`.

`b.At(x,y)`/`b.Shift()`/`b.Ctrl()`/`b.Alt()`/`b.Meta()` (⌘/Win) are **pointer options** on `Click`/`DblClick`/`RightClick`/`MiddleClick`/`Tap` — after the selector, or in place of it in the matcher form (`Eventually(sel).Should(b.Click(b.At(x,y), b.Shift()))`). The modifiers double as keyboard modifiers on `b.Type`/`b.SendKeysToWindowImmediately`.

**Two interactions don't poll — gate them by hand:** `b.SendKeysToWindowImmediately(...)` (focus-free global keystrokes — routes to the focused element, else `document`/window) and the `*Immediately` plural verbs.

```go
Eventually("input.search").Should(b.BeFocused()); b.SendKeysToWindowImmediately(biloba.Keys.Enter)
```

To send keys *into* an element use `b.Type(sel, ...)` — it focuses and polls. Reserve `SendKeysToWindowImmediately` for genuine global hotkeys.

**Fast interactions act in place** — `element.click()` after a visibility check, no `scrollIntoView`, no focus move — so a fast click never shifts the page out from under a scroll/layout assertion. Scroll-into-view comes only from `b.Realistic()` and from focus-bearing ops (`b.Focus`/`b.SetValue`/`b.Type`, because `.focus()` scrolls). If a scroll position moves around a fast click, the cause is app-side.

**`b.SetValue` and frameworks.** It writes through the input's native value setter, so it drives **controlled** React/Vue/Solid inputs (`onChange` fires, state updates) — no need to make an input uncontrolled. It does **not** blur, so an `onBlur` commit / inline-edit-unmount handler won't fire; pair with `b.Blur(sel)`.

**`<select>`.** `b.SetValue(sel, v)` matches the option's underlying **`value`**, not its visible label (`input`+`change` fire with `bubbles:true`, so React `onChange` runs — no realistic mode needed). Pick by label with `b.SetValue("#model", b.ValueLabel("Sonnet"))`. Assert labels via `option.textContent`, the selection via `b.HaveProperty("value", id)`.

### Selecting text (highlight / annotation / editor UIs)

Each produces a genuine `window.getSelection()` range and dispatches `mouseup`, so selection-driven toolbars fire.

```go
b.SelectText("#passage")                          // all of the element's text (dual, polls)
b.SelectText("#passage", "fox")                   // the first "fox"
b.SelectText("#passage", "fox", b.Occurrence(2))  // the 2nd "fox" (1-based)
b.SelectRange("#passage", 4, 9)                   // chars [4,9) across text nodes; fails if out of bounds
b.ClearSelection()

Eventually("#passage").Should(b.SelectText())                       // matcher forms
Eventually("#passage").Should(b.SelectText("fox", b.Occurrence(2))) // REQUIRES an explicit Occurrence
Eventually("#passage").Should(b.SelectRange(4, 9))
```

Read back what's selected: `Eventually("window.getSelection().toString()").Should(b.EvaluateTo("quick"))`.
