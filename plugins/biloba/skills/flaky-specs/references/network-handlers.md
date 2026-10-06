## 6. Network handlers in an `Ordered` container

Handlers (`StubRequest`/`AbortRequest`/`ModifyRequest`/`ModifyResponse`/`HoldResponse`) are first-match-wins in registration order, and `Prepare()` is what clears them. With `BeforeEach(func(){ b.Prepare() }, OncePerOrdered)`, `Prepare()` does **not** run between the `It`s — so handlers accumulate and a later identical handler is **silent dead code**.

**Detector: an interception gate that times out only when the spec runs with the rest of the suite, and passes when focused alone.** Check what ran before it in the same process before diagnosing anything else.

**Shadowing is silent in both directions, and the green direction is worse.** A leftover **stateful** handler — one keeping a counter — claims the response, and because its counter has moved on, passes it through untouched. The app behaves normally; the later spec's own counter stays 0; nothing hangs.

```go
b.ModifyResponse(url).Using(func(r biloba.InterceptedResponse) biloba.StubResponse {
    if atomic.AddInt32(&intercepted, 1) == 1 { /* mangle only the first */ }
    return passthrough
})
```

**Assert on your own interception state in every spec that installs a handler it depends on** — the app's behavior can't tell you. Every registration returns a handle with its own `Count()` (`stub.Count()`/`abort.Count()`/`mod.Count()`/`hold.Count()`) — reach for that before hand-rolling a counter; only a `Using()` callback needing logic beyond counting still needs one:

```go
Eventually(hold.Count).Should(Equal(1))
Eventually(func() int32 { return atomic.LoadInt32(&intercepted) }).Should(Equal(int32(1)))
```

On failure Biloba names both registration sites of a handler that never ran and was shadowed (`biloba:debug-failures`) — but that's a *failure* artifact, so the silently-green case still needs your own `Count` assertion.

Fixes: drive both orderings from a **single `It`** (usually reads better anyway), or give the holding spec its own **`b.NewTab()`** (handler lists are per-tab).
