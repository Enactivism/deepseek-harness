# Agent Note: AbortSignal compatibility for older Qt WebEngine browsers

Status: implemented

English | [中文](2026-09-01-qt-webengine-abortsignal-compat.zh.md)

## Problem

The Qt desktop shell renders the Web client through the Qt WebEngine browser. Older Qt WebEngine Chromium builds do not expose the static `AbortSignal.timeout` and `AbortSignal.any` methods. The shared browser API carrier called those methods directly for bounded RPC requests, so the page failed with `AbortSignal.timeout is not a function` before a request could reach the local Harness service.

## Decision

The shared `AbstractApiClient` carrier now resolves timeout and signal-combination helpers through small platform-neutral functions. Native static methods remain the fast path. When either method is absent, the carrier creates an `AbortController`, schedules a deadline with `setTimeout`, preserves a `TimeoutError` reason, and combines source signals by forwarding the first abort and removing listeners. The fallback is used by all bounded unary calls, including calls made by the Qt WebEngine client; user-paced calls retain caller-only cancellation.

## Alternatives considered

**Inject a compatibility script from the Qt shell.** Rejected because it couples the native shell to browser implementation details and would leave other older browser clients unsupported.

**Require a newer Qt or Chromium release.** Rejected because users cannot always upgrade the system Qt package, and the missing methods have a small, well-defined equivalent in the carrier.

**Replace every timeout call site independently.** Rejected because it duplicates cancellation semantics and risks inconsistent behavior across transports; the fetch carrier owns this platform difference.

## Consequences

Older WebEngine clients can complete and cancel bounded RPC requests without changing the wire protocol or the Node process. New browsers continue using their native implementations. The fallback adds one timer and abort-listener set per bounded request and removes those listeners when cancellation occurs.

## Testing

The API carrier regression suite temporarily removes both static methods from the test runtime and verifies that a bounded request still aborts. The same suite's existing timeout, external-cancellation, and user-paced picker tests continue to pin the native and fallback semantics.
