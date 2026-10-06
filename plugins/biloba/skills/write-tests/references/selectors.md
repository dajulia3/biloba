## Selecting elements — the vocabulary

A `selector` is a **CSS string** (fastest; `:has()`; `>>>` pierces shadow/iframe), a **`Locator`** (`b.By*`; most resilient, slowest — full-document ARIA scan), or an **`XPath`** (`biloba:xpath`; axis/ordinal; pierces neither).

```go
b.Click("#go")                                     // CSS by id — the preferred default
b.Click("[data-testid=save]")                      // CSS by intentional test-id
Eventually("tr:has(td.overdue)").Should(b.Exist()) // CSS :has() — "the row that contains X"
b.Click(b.ByRole("button").WithName("Save"))       // Locator — role + accessible name (a11y guard)
b.Click(b.ByText("Submit"))                        // Locator — visible text (ByTextContains for substring)
b.SetValue(b.ByLabel("Email"), "jane@acme.com")    // Locator — a control by its label
b.Click(b.XPath("li").WithText("OK").Ancestor("ul"))// XPath — an axis query nothing else expresses
```

Constructors (each text-valued one has a `*Contains` variant): `b.ByRole`, `b.ByText`, `b.ByLabel`, `b.ByPlaceholder`, `b.ByAltText`, `b.ByTitle`, `b.ByTestID` (attr = `biloba.TestIDAttribute`, default `data-testid`), `b.ByCSS(sel)` (raw CSS into the algebra — the structural escape hatch). Refine a role with `.WithName(n)`, `.Level(n)`, or ARIA states `.Checked()`/`.Disabled()`/`.Expanded()`/`.Pressed()`/`.Selected()`.

Locators **compose**, and every filter accepts **any** selector (CSS/XPath/Locator):

```go
b.ByRole("listitem").ContainingText("Product 2")        // .ContainingText / .NotContainingText
b.ByRole("listitem").Containing(b.ByText("Delete"))     // .Containing / .NotContaining (a descendant)
b.ByRole("button").And(".primary")                      // .And / .Or — intersection / union
b.ByRole("button").WithName("Delete").Within("#dialog") // .Within / .NotWithin
b.ByText("Item").Nth(2)                                 // .Nth(i) / .First() / .Last()
b.ByCSS(".story").Nth(1)                                // the 2nd .story
```

**Trap — an unresolved `.Within`/`.Containing` scope matches nothing, so a negative assertion is vacuous** — it passes instantly and forever if the scope never renders. Anchor the scope first:

```go
Eventually("#published-list").Should(b.Exist())                                       // the scope is real…
Consistently(b.ByTextContains("Draft").Within("#published-list")).ShouldNot(b.Exist()) // …so this bites
```

Locators **pierce open shadow roots automatically**; CSS needs `>>>` (one boundary each, open shadow / same-origin iframe only); XPath crosses neither.

```go
b.Click("my-widget >>> button.submit")
Eventually("#editor-frame >>> .toolbar .save").Should(b.Click())
```

Never fetch-then-act — pass the selector *into* the action so find-and-act is one atomic JS snippet.
