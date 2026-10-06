## Prefer real backends; stub the network when you must

Favor real backends and fix flakes/perf there. When you must stub, stub only the endpoints you don't want to depend on — everything unmatched passes through.

```go
b.StubRequest(ContainSubstring("/api/users"), biloba.StubResponse{
	Body:    `[{"name":"Jane"},{"name":"Bob"}]`,
	Headers: map[string]string{"Content-Type": "application/json"},
})
b.Navigate("/app")
Eventually(".user").Should(b.HaveCount(2))
```

Stubs are per-tab and reset by `Prepare()`. Also `b.AbortRequest(url)`, `b.ModifyRequest(url).WithURL/.WithMethod/.WithHeader/.WithBody(...)`, and `b.ModifyResponse(url).WithStatus/.WithHeader/.WithBody/.Using(func(biloba.InterceptedResponse) biloba.StubResponse)`. All share one **first-match-wins** handler list. While interception is on Biloba disables the HTTP cache (a cached response raises no interception event), restoring it in `Prepare()`.

Every registration returns a handle — `stub.Count()`/`abort.Count()`/`mod.Count()` — reporting how many dispatches *that handler* claimed. **Assert it fired:** `Eventually(stub.Count).Should(Equal(1))`. A typo'd URL otherwise matches nothing, passes through to the real network, and the spec passes for the wrong reason.

Three traps, detailed in `biloba:flaky-specs`:

- **Observe in order:** `Eventually(b).Should(b.HaveMadeRequest(...))` **first**, *then* `Eventually(b).Should(b.BeNetworkIdle())`. Idle means "nothing in flight right now", so alone it passes at t=0.
- **Handlers accumulate in an `Ordered` container** (`Prepare()` is `OncePerOrdered`), so an earlier `It`'s handler silently shadows a later identical one — sometimes a timeout, sometimes a spec that just passes.
- **Assert your own interception state** (`Eventually(hold.Count).Should(Equal(1))`) so you'd notice either.

**`b.HoldResponse(url)` holds a real response hostage** so you can force an arrival order — the honest way to test optimistic-UI reconciliation, where the bug only shows when a stale response lands *after* the next action.

```go
hold := b.HoldResponse(ContainSubstring("/api/settings"))
b.Click("#refresh")            // fires the request…
hold.Await()                   // …blocks until its response is actually being held
b.Click("#rename")             // drive the app into the racy window
hold.Release()                 // now let the stale response land
Ω(hold.Count()).Should(Equal(1))
```

**By default a hold freezes *every* matching response**, and a bare `Release()` frees them all and disarms the hold. `.Limit(n)` caps how many are held at once — overflow matches fly straight past, which is how you express "hold save #1 while save #2 lands". `Await()` returns the **oldest response still held**; `hold.Release(r)` releases just that one and `hold.ReleaseNext()` releases the oldest, both keeping the hold **armed** (`ReleaseNext` fails loudly if nothing is held). `Await` has its own 30s deadline (`b.WithTimeout(d).HoldResponse(url)`); holds are force-released at spec end and by `Prepare()`. Matching is **tab-wide and URL-based**, so a hold can catch a response from an earlier page load — scope the flow to a `b.NewTab()` when that matters. Full semantics → `biloba:api`; worked orderings → `biloba:flaky-specs`.

`hold.Held()`/`hold.PassedThrough()` split `Count()` into what the hold actually froze vs. what arrived and flew past (at `Limit`, or after a bare `Release()`) — with `.Limit(1)`, assert `Eventually(hold.PassedThrough).Should(Equal(1))` directly rather than inferring "not held" from `Count()` and the limit. And `Count`/`Release` are facts about the network, not the page — pair them with an app-state barrier (`b.GetJSValue`, or the DOM the response produces) when the assertion is about what the app *did* with the response.

## Seed state to skip slow flows

Navigate to a real origin first — `about:blank` can't hold cookies/storage.

```go
b.Navigate("/home")
b.SetCookie(biloba.Cookie{Name: "user", Value: "Joe"})
DeferCleanup(b.ClearCookies)
```

Or shortcut through your app's JS API:

```go
b.Run(`app.load(` + jsonFixture + `); app.redraw()`)
Eventually("#doc-name").Should(b.HaveInnerText("My Fixture Data"))
```

**`b.Run` returns the decoded value directly** — `n := b.Run("app.users.length")` feeds Gomega with no wrapper, `b.Run("expr", &typed)` decodes into a pointer, and there is no need for `runInt`/`runStr` helpers. It's a synchronous *expression*, so a top-level `return` is illegal — use `b.RunAsync` for `fetch`/`await`. Numbers decode to `float64`.

**Poll a `b.Run` read instead of snapshotting it.** It's a plain `func(string, ...any) any`, so it drops straight into `Eventually` — the antidote to the most common flake:

```go
Eventually(b.Run).WithArguments(`isReady()`).Should(BeTrue())
Eventually(b.Run).WithArguments(`document.querySelectorAll(".card").length`).Should(BeNumerically("==", 3))
```

For an interpolated/multi-line expr, pre-build the string (`expr := fmt.Sprintf(...)`) or poll a closure returning the decoded value.

**Don't hand-roll `getBoundingClientRect`/`scrollTop` through `b.Run`** — the geometry getters (`b.GetBoundingBox`/`GetScrollOffset`/`GetOffsetTopWithin` + `Have*` matchers) wait for layout before reading; relational layout has the pairwise matchers and `b.GetGapBetween`; on-screen-ness `b.BeInViewport()`; document order `b.BePrecededBy`/`BeFollowedBy`; computed style `b.GetComputedStyle`. → `biloba:api`

## The app-state barrier: `b.GetJSValue`

`b.GetJSValue(expr[, &ptr])` polls `expr` until it is *defined* and returns it, retrying through both `undefined` and a thrown error (a `ReferenceError` for a not-yet-created global is a not-ready condition); `null` is a legitimate value and returns immediately. It proves response application only when the observed path is created by the response handler after applying that response. A path created by an optimistic update proves less; a Go-side HTTP read bypasses the tab entirely.

```go
b.Run(`app.store.on("update", () => { window.__storeLog ??= []; window.__storeLog.push(app.store.state) })`)
b.Click("#save")
var log []string
Eventually(`window.__storeLog ?? []`).Should(b.EvaluateTo(HaveExactElements("saving", "saved")).Capture(&log))
```

**Definedness is not completion.** Even a lazily-created log becomes defined on the optimistic `"saving"` update, before `"saved"` arrives. Poll the required contents as above. `GetJSValue` is a useful barrier only for a path created exclusively after the response has been applied; an eagerly-created log is defined from page load and gates nothing.

**For an eagerly-created path, poll the *predicate*** — one read, one poll, typed result:

```go
var log []FoldEntry
Eventually(`window.__storeLog`).Should(b.EvaluateTo(ContainElement(HaveKeyWithValue("state", "saved"))).Capture(&log))
```

Asymmetry: `EvaluateTo` hands its sub-matcher the **raw JSON-decoded** value (`[]any` of `map[string]any` — `HaveKeyWithValue`, not `HaveField`); `Capture` gives you the typed `[]FoldEntry`.

**`GetJSValue` is wrong wherever *absence* is meaningful** — a ledger absent on `about:blank` means *quiet*; `window.__renderErrors` absent means *no errors*; a flag planted before a JS-only tab switch must have *survived* (waiting inverts the test); a pre-action baseline count. Those stay `b.Run` with a coalesce (`b.Run("window.__ledger ?? null")`) — correct, not a smell. → `biloba:flaky-specs` §3

## Multi-tab flows

```go
tab := b.NewTab()                // isolated, incognito-like context; closed by Prepare()
login(b, "sally"); login(tab, "jane")
Eventually(userXPath.WithText("Jane")).Should(b.HaveClass("online"))
```

Tabs opened *by the page* (`target="_blank"`) are **spawned tabs**:

```go
tab.Click(linkXPath)
Eventually(tab).Should(tab.HaveSpawnedTab().WithURL("https://youtube.com/..."))
yt := tab.AllSpawnedTabs().Find(tab.TabMatching().WithURL("https://youtube.com/..."))
```

A DOM method always operates on the tab it's invoked on (`tab.Click`, not `b.Click`). Dialogs and downloads are per-tab too — register dialog handlers **before** the action that triggers them.
