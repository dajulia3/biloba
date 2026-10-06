## 3. Optimistic UI & server reconciliation

If the app renders optimistically and a later server frame reconciles, **both obvious signals lie**:

| Signal | What it actually proves |
|---|---|
| The DOM | The click handler ran. It's the optimistic copy — `Eventually` just re-reads it, and under load it can settle *stably wrong*. |
| A Go-side HTTP read (`GET /sessions/{id}`) | The server persisted something. It bypasses the browser's event loop entirely — the tab may have done nothing with the response. |
| Browser-side acknowledgement | Proves response application only if the app emits it after applying that response. `GetJSValue` alone waits only for definedness. |

```go
b.Run(`app.store.on("update", () => { window.__storeLog ??= []; window.__storeLog.push(app.store.state) })`)
b.Click("#save")
var log []string
Eventually(`window.__storeLog ?? []`).Should(b.EvaluateTo(HaveExactElements("saving", "saved")).Capture(&log))
```

**Trap inside the fix: `GetJSValue` gates on definedness, not completion.** A lazy log is already defined after the optimistic `"saving"` update; an eager log is defined from page load. Neither proves `"saved"` landed. Poll the contents as above, or use a path created exclusively after the response was applied. For a log of objects, poll the **predicate**:

```go
var log []SaveEntry
Eventually(`window.__storeLog`).Should(b.EvaluateTo(ContainElement(HaveKeyWithValue("state", "saved"))).Capture(&log))
```

(Asymmetry: `EvaluateTo`'s sub-matcher sees the **raw JSON-decoded** value — `[]any` of `map[string]any`, so `HaveKeyWithValue`, not `HaveField`. `.Capture` gives you the typed `[]SaveEntry`.) Check which event creates or updates the path before trusting it as a response barrier.

**`GetJSValue` is the wrong tool wherever absence is meaningful** — a ledger missing on `about:blank` (missing = quiet), `window.__renderErrors` missing (= no errors), a flag that must have *survived* a JS-only tab switch, a baseline count taken before the action. Those stay `b.Run("window.__ledger ?? null")`. That's correct, not a smell.

### Force the arrival order with `b.HoldResponse`

Reconciliation bugs are ordering bugs (a stale response landing after a newer local write). Repeated clean runs do not establish that the problematic ordering occurred; force that ordering explicitly.

```go
before := b.Run(`window.__appliedRefreshCount ?? 0`).(float64) // fixture acknowledgement counter
hold := b.HoldResponse(ContainSubstring("/api/settings"))
b.Click("#refresh")     // fires the request…
hold.Await()            // …blocks until its response is genuinely held in flight
b.Click("#rename")      // drive the app into the racy window
hold.Release()          // let the stale response land, on your schedule, every run
Ω(hold.Count()).Should(Equal(1))
Eventually(`window.__appliedRefreshCount ?? 0`).Should(b.EvaluateTo(BeNumerically(">", before)))
Eventually(`app.store.state`).Should(b.EvaluateTo(Equal("renamed"))) // stale response did not clobber it
```

The fixture’s `__appliedRefreshCount` must advance only after the browser applies a refresh response, including a stale response it intentionally ignores. Use an equivalent application acknowledgement in your app; an optimistic state value alone is insufficient.

**`Count`/`Release` are facts about the network, not the page.** `Count` says the response reached the tab's interceptor; `Release` returns when the release is signalled. Neither says the renderer has done anything with it — the acknowledgement counter above proves that, not the `Release()` call. When the assertion is about what the app did with a response, pair the network fact with an app-state barrier (or the DOM the response produces) — never a sleep.

- **A hold freezes EVERY matching response by default**, and a bare `Release()` frees them all *and* disarms the hold. So "response #1 is still in flight while #2 lands" is not expressible with the default — cap it:
  ```go
  hold := b.HoldResponse(ContainSubstring("/api/save")).Limit(1)
  b.Click("#save"); hold.Await()                                    // #1 held…
  b.Click("#save"); Eventually(hold.PassedThrough).Should(Equal(1)) // …#2 passes straight through
  hold.Release()                                                    // now #1 lands, last
  ```
  Assert `PassedThrough`, not `Count` — the fixture under test is "#2 was NOT held," and `Count()==2` only says that by inference from the limit. A regression that raises the limit to 2 keeps `Count()==2` green while quietly destroying the ordering you pinned. `hold.Held()` is the other half — `Held()+PassedThrough()==Count()` always, and both are snapshots safe to poll.
- `hold.ReleaseNext()` releases the oldest still held and **stays armed** (fails loudly with nothing held — that means your sequencing is off). `Await()` always returns the oldest still held, so `Await`/`ReleaseNext`/`Await` walks arrival order.
- `Await` honors `WithTimeout`/`WithContext` set on the tab you built the hold from (`b.WithTimeout(d).HoldResponse(url)`); otherwise 30s. `Count()`/`Held()`/`PassedThrough()` are snapshots but safe to poll. Holds are force-released at spec end and by `Prepare()`.
- **Sharp edge: matching is tab-wide and URL-based**, so a hold can catch a response from an *earlier page load*. If the flow navigates, scope it to a `b.NewTab()` or assert `Count()`. And handlers are first-match-wins, so a **second `HoldResponse` for a URL an earlier one already claims is dead code** — re-arm the one you have with `ReleaseNext` ([handler ordering](network-handlers.md)).
