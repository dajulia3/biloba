---
name: biloba-dom-method
description: Add or change a Biloba browser primitive, Go wrapper, or matcher. Covers atomicity, polling, capture, and shared tab state.
---

# Adding or changing a Biloba DOM method

DOM interaction lives in a synchronous browser primitive in `biloba.js`; Go wraps it through `runBilobaHandler`. Read the relevant existing implementation and the design constraints in `CLAUDE.md` when making architectural decisions.

## Invariants to preserve

- **Resolve and act atomically.** Pass selectors into a single JS evaluation; avoid Go-side fetch-then-act flows. Use `one`/`poll`/`each` combinators, which also carry selector-found diagnostics.
- **Choose missing-element semantics deliberately.** `(false, nil)` retries under `Eventually` but can satisfy a negation. A matcher presupposing a real element should error when it is missing; document `Exist`/`HaveCount(0)` as the disappearance idiom when needed.
- **Fully-applied actions poll; under-applied actions return matchers.** Route through `pollOrImmediate` and `guardBareMatcher`, bound to `b.gt`. Classify non-polling methods with `guardConfig` rather than silently ignoring options.
- **Expose capture only for value-reading matchers.** Return `*ValueMatcher` and reuse `decodeCapture`; return `types.GomegaMatcher` for actions and value-less checks. Both value and cookie `Capture` return a copy, leaving the original capture target untouched.
- **Share per-tab state across views.** `Realistic`, `WithTimeout`, and other views shallow-copy `Biloba`. Put state reset by `Prepare()` in the shared `tabState`, and reset through that pointer. A new field must satisfy `tab_state_internal_test.go`’s classification guard.
- **First/all and polling/snapshot are API distinctions.** Singular `Get*` getters poll; `Current*ForEach` snapshots and plural `*Immediately` actions do not. `Each*` matchers require at least one match.

## Implementation references

Read only the reference relevant to the change:

- [Browser bridge and matcher construction](references/browser-bridge.md): JS combinators, result helpers, sub-matchers, and failure messages with artifact-writing side effects.
- [Value matchers and capture](references/value-matchers.md): existence-only capture, typed decoding, null/undefined, and builder-style matchers.
- [Polling, getters, and shared state](references/polling-and-getters.md): wiring examples, decode pointers, probe recording, option guards, and view-copy invariants.

## Verification and documentation

Use `biloba-testing` for the failure-capturing harness and run commands. Cover the behavior changed: dual forms, missing/not-ready behavior, and custom failure output as relevant. For a new value matcher, exercise capture, negation leaving the target untouched, and incompatible target types. When registering state through a view, prove the bare tab observes that state as well as proving timeout handling.

Update `docs/index.md`, affected godoc, and the relevant repo/plugin skill or reference when behavior changes. Stage user-facing release notes in `CHANGELOG-TMP.md`. Onsi owns releases: do not run `shipit`, bump `BILOBA_VERSION`, edit the released `CHANGELOG.md`, or tag/publish.
