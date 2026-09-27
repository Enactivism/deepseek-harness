# Agent Note: Desktop-pet pointer refresh

Status: implemented

English | [中文](2026-09-25-desktop-pet-pointer-refresh.zh.md)

## Problem

The Qt shell could sample a desktop-global pointer position before the WebEngine page and its asynchronous Live2D model listener were ready. Sending a synthetic `mousemove` only when the mapped position changed allowed that position to be consumed before the listener existed, so a pointer left outside the pet window did not direct the model until it moved again.

## Decision

`HarnessWindow` marks the pet page ready after a successful `loadFinished` and keeps the existing 16-millisecond global-pointer timer active for the loaded page. On GNOME Wayland, the optional GNOME Shell extension publishes compositor-global coordinates over the session bus and the Qt shell consumes them when available. On Linux `xcb` without that bridge, each tick queries the X11 root window with `XQueryPointer`; other supported platforms use `QCursor::pos()`. The resulting desktop coordinates are mapped into WebEngine client coordinates and injected as a `mousemove` event, including `view`, `screenX`, and `screenY` fields. The event is sent in the page's main JavaScript world so the `l2d` document listener receives the same client coordinates as a browser mouse event.

## Alternatives considered

**Reset the last-position cache after `loadFinished`.** Rejected because Live2D model loading and listener registration continue asynchronously after the page load event; one forced event can still arrive too early.

**Install an operating-system global mouse hook.** Rejected because it adds platform-specific permissions and implementations beyond the compositor-owned GNOME extension path needed for native Wayland. Native Wayland still does not expose desktop-global coordinates to ordinary clients without compositor cooperation.

## Consequences

The model receives the current desktop pointer while the page and model finish initializing, including when the pointer remains outside the pet window. GNOME Wayland deployments can use the extension for native Wayland windows; Linux `xcb` deployments without it query the X11 server directly, so the pointer source does not depend on Qt's cached cursor value. The loaded pet incurs one WebEngine JavaScript evaluation per pointer-poll interval even when the pointer is stationary. Other pure Wayland sessions retain focused-surface-only tracking because the protocol does not expose a desktop-global pointer position.

## Verification

`qt-shell/tests/desktop_pet_interaction_test.cpp` preserves negative and out-of-window client coordinates and checks the event's global coordinate fields. The Qt shell builds and its desktop-pet interaction test passes with the CMake build in `qt-shell/build`.
