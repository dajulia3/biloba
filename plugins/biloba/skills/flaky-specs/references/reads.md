## 1. Reads you take yourself

**Single-shot `b.Run` read — the #1 flake source.** `b.Run` is `func(string, ...any) any`, so it drops straight into `Eventually`:

```go
// WRONG — reads the world once
var centered bool
b.Run(`isCentered()`, &centered)
Expect(centered).To(BeTrue())

// RIGHT — no wrapper closure needed for a scalar expr
Eventually(b.Run).WithArguments(`isCentered()`).Should(BeTrue())
Eventually(b.Run).WithArguments(`document.querySelector("#card").getBoundingClientRect().top`).
    Should(BeNumerically("~", 40, 1))   // JSON numbers decode to float64 — never Equal(intLiteral)
```

`WithArguments` needs a pre-built string. For an interpolated or multi-line expr, build it first (`expr := fmt.Sprintf(...)`) or poll a closure that returns the decoded value.

**Grep detector.** Anchor on the *decode target*, not on `b.Run(` — multi-line scripts put `, &x)` lines away from the call and slip the obvious regex:

```
rg ', &(\w+)\)' -n        # then check whether Expect(x)/Ω(x) follows within a few lines
```

**Gate-then-re-read (TOCTOU).** A matcher assertion followed by a getter is *two* reads; the page can re-render between them.

```go
// WRONG
Eventually(".figure-frame").Should(b.HaveAttribute("data-block-id", Not(BeEmpty())))
id := b.GetAttribute(".figure-frame", "data-block-id")   // …of what?

// RIGHT — .Capture writes the value from the read that satisfied the assertion
var blockID string
Eventually(".figure-frame").Should(b.HaveAttribute("data-block-id", Not(BeEmpty())).Capture(&blockID))
```

`.Capture` decodes into your Go type and writes only on a match (so `ShouldNot` captures nothing). The `any`-returning getters take the same optional trailing pointer: `b.GetProperty("#row", "offsetWidth", &n)`.

**Don't null-guard against a remount in a matcher.** A matcher poll re-resolves the selector from scratch every tick, so it retries straight through a portal migration or list re-key. `document.querySelector(sel)?.x ?? ''` guards belong only inside your own `b.Run` closure, where you hold a node reference.

```go
Eventually(sel).Should(b.HaveProperty("dataset.side", "left"))   // no guard needed
```

**Prefer native geometry getters to `b.Run`** — see [layout and geometry](layout.md).
