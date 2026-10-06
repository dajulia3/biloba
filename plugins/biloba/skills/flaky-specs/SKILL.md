---
name: flaky-specs
description: Diagnose intermittent, order-dependent, or load-sensitive Biloba specs, or review a suite for races and vacuous assertions.
---

# Flaky Biloba specs

Biloba polls by default: `b.Click(sel)`, `b.SetValue(sel, v)`, `b.GetProperty(sel, name)` already wait for readiness, act once, then stop. So the residual flake sources are (a) reads you take yourself, (b) the few verbs that can't poll, (c) signals that don't mean what they look like, (d) assertions that can never fail.

Poll values expected to change; keep intentional snapshots and pre-action baselines as single reads. Use failure evidence to distinguish a race from a wrong expectation or an app bug.

Failure *artifacts* (outlines, screenshots, poll trajectory) → `biloba:debug-failures`. Authoring baseline → `biloba:write-tests`. Method surfaces → `biloba:api`.

## Triage

| Symptom | Possible cause | Check or fix | § |
|---|---|---|---|
| Passes focused, fails when run with the suite | Network handlers accumulated across an `Ordered` container | assert `hold.Count()`; own `b.NewTab()` | [6](#6-network-handlers-in-an-ordered-container) |
| Fails only under `-p` / load | Single-shot `b.Run` read racing an async settle | `Eventually(b.Run).WithArguments(expr)` | [1](#1-reads-you-take-yourself) |
| Fails at an assertion, not at the interaction before it | `b.Immediate()` acted a frame early | delete the `Immediate()` | [2](#2-actions-that-dont-poll) |
| Times out *consistently*, not intermittently | Stable mismatch in app state, fixture, or expectation | read the trajectory and check the expected value before changing the timeout | [4](#4-layout-geometry-and-document-order) |
| Getter times out on an element that's plainly there | Property is never *defined* on that element type | `b.AllowMissing("name")` | [5](#5-two-axis-getters) |
| Green forever, even against a broken page | Vacuous assertion (empty scope / empty slice / t=0 idle) | anchor the subject first | [7](#7-assertions-that-cannot-fail) |
| Green in test, broken against a real server | Asserted the optimistic DOM, or a Go-side HTTP read | barrier on app state | [3](#3-optimistic-ui--server-reconciliation) |
| "I ran it 30× and it was green" | The ordering was never forced | `b.HoldResponse` | [3](#3-optimistic-ui--server-reconciliation) |
| Click appears to do nothing | Fast `Click` bypassed an overlay, or the app did not handle it | inspect console errors and the occlusion note; use `b.Realistic()` when hit-testing matters | [2](#2-actions-that-dont-poll) |
| Intermittent "could not find DOM element" on the line *after* a capture | The capture expanded the viewport; the page re-rendered on its breakpoint and unmounted the subject | capture something already in view (scroll, gate on `b.BeInViewport(b.Fully())`) | [7](#7-assertions-that-cannot-fail) |
| Assertion passes but asserts the opposite of your intent | Inverted `BePrecededBy`/`BeFollowedBy` | also assert the inverse doesn't hold | [4](#4-layout-geometry-and-document-order) |

## 1. Reads you take yourself

Poll JS state that is expected to change with `Eventually(b.Run).WithArguments(expr)`. Preserve single reads for deliberate snapshots, pre-action baselines, or meaningful absence. Capture an asserted value with `.Capture(&x)` rather than reading it again. See [worked cases](references/reads.md).

## 2. Actions that don't poll

Fully-applied actions already poll and stop after success. Use `Immediate()` when deliberately testing single-attempt behavior. Gate global keystrokes and plural `*Immediately` actions on their intended target state. A repeated action in a polling closure must be idempotent; a toggle click is not. See [worked cases](references/actions.md).

## 3. Optimistic UI & server reconciliation

An optimistic DOM or a Go-side HTTP read does not prove the browser applied a response. Wait for browser-side acknowledgement. `GetJSValue` gates on definedness only; poll a predicate for eagerly-created state. Force response order with `HoldResponse`, and distinguish interception/release from application of the response. See [worked cases](references/reconciliation.md).

## 4. Layout, geometry, and document order

Use native geometry matchers/getters for layout readiness and atomic pairwise reads. `BePrecededBy` means the subject comes after its argument; `BeFollowedBy` means before. Persistent wrong values may indicate an app bug, an incorrect expectation, or an unsuitable fixture; inspect the evidence before widening a timeout. See [worked cases](references/layout.md).

## 5. Two-axis getters

`GetProperty`/`GetAttribute` wait for presence and definedness. Use `AllowMissing` when absence is a legitimate value; decode into `**T` when absence must differ from a zero value. `GetValue`/`GetInnerText`/`GetTextContent` only gate on element presence. See [worked cases](references/getters.md).

## 6. Network handlers in an `Ordered` container

All interception handlers are first-match-wins and reset by `Prepare()`. They accumulate inside `Ordered` containers with `OncePerOrdered`. Assert the handler’s own `Count()`, reuse an existing hold when appropriate, or isolate the flow in `b.NewTab()`. See [worked cases](references/network-handlers.md).

## 7. Assertions that cannot fail

Check that a green assertion could fail: anchor locator scopes before negation; observe a request before network-idle; gate plural snapshots on the intended collection; review visual baselines and keep update mode out of CI. Missing elements are errors for geometry/state matchers; use `Exist` or `HaveCount(0)` for disappearance. See [worked cases](references/vacuous-assertions.md).

## 8. Two facts that prevent wrong diagnoses

Gate navigation on destination DOM readiness when the assertion requires a rendered page. Fast clicks/taps act in place; `Focus`, `SetValue`, `Type`, and realistic interactions can scroll. A scroll change around a fast click can come from app behavior. See [worked cases](references/navigation-and-focus.md).
