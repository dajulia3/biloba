## 5. Two-axis getters

`GetProperty`/`GetProperties`/`GetAttribute`/`GetAttributes` poll until the element is present **and** every named property/attribute is *defined*. That bites when the name doesn't exist on that element type — `b.GetProperty("div.card", "disabled")` polls to timeout even though the element was there all along.

```go
b.GetProperty("div.card", b.AllowMissing("disabled"))            // nil instead of a timeout
b.GetProperties("#user", "dataset.firstName", b.AllowMissing("dataset.middleName"))
```

The timeout message self-explains: it says the element was present, names the undefined property, and prints the exact `b.AllowMissing(...)` to paste. Read it before investigating.

**`AllowMissing` only pays off if the decode target can hold "absent."** A JS `null`/`undefined` decodes to the Go zero value, so a plain `*string` flattens "absent" and "present but empty" into the same `""`. Decode into a `**T` instead — absent leaves it `nil`, present allocates:

```go
var key *string
b.GetAttribute(".mark", b.AllowMissing("data-key"), &key)   // key == nil while the attribute is absent
```

Works for every decode target (`.Capture` and the getters' trailing pointer), and is re-evaluated on every observation, so a poll watching an absent → present transition stays honest.

`GetValue`/`GetInnerText`/`GetTextContent` have no "defined" axis (empty string is a valid value) — they poll on presence only and never need `AllowMissing`.

**The `Each*` matchers fail on zero matches** (`EachBeVisible`/`EachBeEnabled`/`EachHaveClass`/`EachHaveInnerText`/`EachHaveProperty`/…): "≥1 match AND all satisfy", so they wait for elements to appear instead of passing vacuously. To assert nothing matches, use `Eventually(sel).Should(b.HaveCount(0))` or `ShouldNot(b.Exist())` — **not** the no-arg `EachHaveInnerText()`/`EachHaveTextContent()`, which now assert the property is *defined* on every match (and capture the slice).
