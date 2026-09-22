# Agent Note: Live2D desktop pet mode

Status: implemented

English | [中文](2026-09-02-live2d-desktop-pet-mode.zh.md)

## Problem

The Live2D companion is rendered inside the Web workspace's right column. A desktop shell user needs to keep the model visible as a small floating companion without disrupting the main workspace or adding a separate native model runtime.

## Decision

The Qt shell handles a `dsh://desktop-pet/toggle` navigation request from the Live2D component. Enabling the mode creates a second WebEngine view in a frameless, always-on-top 360x480 tool window near the primary screen's lower-right corner; the main workspace window and its original view remain visible and unchanged. The selected model files are cached in same-origin IndexedDB and sent through a same-origin `BroadcastChannel` after the pet page opens, so the mode remains usable when a Qt profile rejects IndexedDB writes. The Web document receives a `dshDesktopPet=1` query flag, and the shell prunes every non-companion DOM node from that page before applying a transparent page/window background. The shell polls the desktop cursor every 16 milliseconds while the pet is visible, maps each changed position into WebEngine client coordinates without clamping it to the window, and dispatches a `mousemove` event in the page's main JavaScript world so the existing `l2d` renderer follows the pointer outside the window. On Linux Wayland sessions that expose an XWayland display, the shell selects Qt's `xcb` backend before constructing the application; an explicit `QT_QPA_PLATFORM` value wins, and native Wayland disables global polling because the protocol supplies only focused-surface coordinates. Dragging the window moves it. Vertical wheel input changes its size in 24x32 increments while preserving the bottom-center position, with a minimum size of 240x320. A double-click exits the mode. The normal workspace renderer is not switched to desktop presentation.

The desktop-only control is selected by the `DeepSeekHarnessQt` user-agent marker. Ordinary browser sessions keep the existing right-workspace behavior and do not expose a native-window action.

The desktop-pet document owns a `DesktopPetChatController` that restores its feature-owned Session id from local storage or creates a Session when none remains. `SessionRuntime.openTransient()` stages that Session and opens its history inside the auxiliary browser runtime without overwriting the primary selection stored in `dsh.sessions.current`; the primary WebEngine view therefore restores and continues its own current Session. The compact panel projects only user and assistant text, while prompt admission still uses the ordinary Session behavior face and its configured agent and tools.

The pet page reports chat visibility through `dsh://desktop-pet/chat/open` and `dsh://desktop-pet/chat/close`. While chat is open, the Qt shell leaves mouse and wheel events to WebEngine so the user can focus the composer, press buttons, and scroll messages. With chat closed, only the lower-right chat-button area bypasses native gestures; the remaining surface retains drag, wheel-resize, and double-click-exit behavior.

The Qt shell probes port 3080 before starting its child process. When an existing Harness service is already listening, the shell reuses that service and does not claim ownership or terminate it on close; this prevents a second launch from turning a working page into an `EADDRINUSE` retry loop.

## Alternatives considered

**Move the workspace's WebEngine view into the pet window.** Rejected because the main window would lose its active workspace while desktop-pet mode is enabled.

**Implement a browser-only fixed-position overlay.** Rejected because a browser tab cannot stay above other desktop applications and would not provide transparent window chrome.

**Add a separate native Live2D renderer.** Rejected because it would duplicate the Cubism runtime, model loading, and licensing surface already provided by the browser plugin.

**Install platform-specific global mouse hooks.** Rejected because Qt can sample the desktop cursor only while the pet is visible and pass ordinary client coordinates to the existing renderer without adding operating-system hook permissions or separate implementations. XWayland supplies this existing path on Linux without reading input devices directly.

**Resize from invisible frame edges.** Rejected because it divides the compact surface between move and resize hit regions; wheel resizing leaves the full surface available for moving the pet.

**Reuse the main workspace's current Session for pet chat.** Rejected because messages sent from the floating surface would alter the main conversation's history and model context, and selecting another main conversation would silently move the pet between contexts.

**Implement a native chat transport in Qt.** Rejected because Session creation, prompt admission, streaming projection, reconnection, and tool behavior already belong to the browser object layer; a native path would duplicate those semantics and diverge from the assembled plugin runtime.

## Consequences

Qt desktop users on a global-coordinate window system get a movable, resizable, always-on-top companion whose gaze follows the pointer across the desktop while the normal workspace remains unchanged. The pet chat has independent history and provider context; its Session can still appear in the shared Session catalog, but the main surface's current selection and displayed conversation do not move. Wheel resizing preserves the 3:4 dimensions and bottom-center position while consuming vertical wheel input over the closed pet; an open chat panel owns wheel input for message scrolling instead. Cursor polling is active only while the pet is visible, and WebEngine receives an event only when the mapped position changes. Selecting `xcb` trades native Wayland integration for desktop-global pointer tracking and reliable explicit placement; deployments can restore native Wayland through `QT_QPA_PLATFORM`, with focused-surface tracking only. The desktop mode is intentionally a shell capability: web browsers and remote pages cannot request native window changes or global cursor coordinates. Double-click exits the mode only while chat is closed.
