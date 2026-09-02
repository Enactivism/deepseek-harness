# Agent Note: Live2D desktop pet mode

Status: implemented

English | [中文](2026-09-02-live2d-desktop-pet-mode.zh.md)

## Problem

The Live2D companion is rendered inside the Web workspace's right column. A desktop shell user needs to keep the model visible as a small floating companion without opening a second model runtime or allowing the model to cover the conversation during normal use.

## Decision

The Qt shell handles a `dsh://desktop-pet/toggle` navigation request from the Live2D component. Enabling the mode creates a second WebEngine view in a frameless, always-on-top 360x480 tool window near the primary screen's lower-right corner; the main workspace window and its original view remain visible and unchanged. The selected model files are cached in same-origin IndexedDB and sent through a same-origin `BroadcastChannel` after the pet page opens, so the mode remains usable when a Qt profile rejects IndexedDB writes. The Web document receives a `dshDesktopPet=1` query flag, and the shell prunes every non-companion DOM node from that page before applying a transparent page/window background. A left-button drag moves the pet window and a double-click exits the mode. The normal workspace renderer is not switched to desktop presentation.

The desktop-only control is selected by the `DeepSeekHarnessQt` user-agent marker. Ordinary browser sessions keep the existing right-workspace behavior and do not expose a native-window action.

The Qt shell probes port 3080 before starting its child process. When an existing Harness service is already listening, the shell reuses that service and does not claim ownership or terminate it on close; this prevents a second launch from turning a working page into an `EADDRINUSE` retry loop.

## Alternatives considered

**Create a second WebEngine window and reload the model.** Rejected because browser-selected model files are owned by the existing page and object URLs cannot be transferred safely to a second renderer.

**Implement a browser-only fixed-position overlay.** Rejected because a browser tab cannot stay above other desktop applications and would not provide transparent window chrome.

**Add a separate native Live2D renderer.** Rejected because it would duplicate the Cubism runtime, model loading, and licensing surface already provided by the browser plugin.

## Consequences

Qt desktop users get a movable, always-on-top companion while the normal workspace remains unchanged. The desktop mode is intentionally a shell capability: web browsers and remote pages cannot request native window changes. Double-click exits the mode because the compact presentation hides the regular controls.
