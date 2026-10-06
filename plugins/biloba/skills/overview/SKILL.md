---
name: overview
description: Explain Biloba’s testing model and route to task-specific guidance. Use when first adopting Biloba or deciding which interaction track fits a test.
---

# Biloba: the testing model

Biloba is a Go browser-testing framework built on chromedp for Ginkgo/Gomega. Drive it through a `*biloba.Biloba`, conventionally `b`. The [narrative docs](https://onsi.github.io/biloba/) describe intended usage; match the skills to the installed Biloba version because the API may shift before 1.0.

## Decisions that differ from other browser frameworks

- **One shared Chrome, isolated tabs.** Each Ginkgo parallel process gets a reusable root tab. `b.Prepare()` resets it and closes additional tabs. Run independent specs with `ginkgo -p`.
- **Fast interactions are atomic JS simulations.** `b.Click(sel)` checks visibility/enabled state and calls `element.click()` in one browser evaluation. It does not scroll, check occlusion, or move focus. Pass selectors into actions rather than fetching an element and acting later.
- **Realism is opt-in.** `b.Realistic()` is a view of the same tab using real CDP input. Use it when real hover, occlusion, pointer drag, scrolling, or touch is part of the contract; keep other specs on the faster default track.
- **Setting a value is different from typing.** Fast `b.SetValue` focuses and fires `input`/`change`; `b.Type` sends real keystrokes. Fast `b.Hover` sends events without activating CSS `:hover`.
- **Actions and getters poll by default.** `b.Click(sel)` waits until actionable, acts once, then stops. An under-applied action (`b.Click()`) returns a matcher for `Eventually`. A getter waits for readiness, not for an arbitrary expected value: assert eventual state with a matcher.
- **Snapshots remain snapshots.** `b.Run`, `Count`, and `Current*ForEach` do not poll. Poll changing state; keep a single read when testing an intentional snapshot, a pre-action baseline, or meaningful absence. `b.Immediate()` explicitly opts out of polling.
- **Capture the asserted read.** Value-reading matchers expose `.Capture(&x)` to avoid asserting and then re-reading a changing page.
- **Errors integrate with Ginkgo.** Most methods fail the spec rather than returning errors. Console output streams to `GinkgoWriter`; a failing `console.assert` fails the spec. Agents/CI receive failure outlines and screenshot files automatically.

## Choose the guidance the task needs

| Task | Skill |
|---|---|
| Bootstrap, Chrome installation, isolation | `biloba:setup` |
| Write or review specs | `biloba:write-tests` |
| Exact method names and argument forms | `biloba:api` |
| Real pointer input, hover, occlusion, drag | `biloba:realistic-mode` |
| Screenshot comparisons and baseline review | `biloba:visual-assertions` |
| XPath axes and predicates | `biloba:xpath` |
| Inspect an unfamiliar app | `biloba:explore-unfamiliar-page` |
| Read failure evidence or configure artifacts | `biloba:debug-failures` |
| Races, ordering, or vacuous assertions | `biloba:flaky-specs` |

For CDP features without a Biloba wrapper (for example geolocation or cross-origin frames), use chromedp through `b.Context`.
