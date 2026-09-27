# Agent Note: Live2D desktop pet mode

Status: implemented

English | [中文](2026-09-02-live2d-desktop-pet-mode.zh.md)

## Problem

The Live2D companion is rendered inside the Web workspace's right column. A desktop shell user needs to keep the model visible as a small floating companion without disrupting the main workspace or adding a separate native model runtime.

## Decision

The Qt shell handles a `dsh://desktop-pet/toggle` navigation request from the Live2D component. Enabling the mode creates a second WebEngine view in a frameless, always-on-top 360x480 tool window near the primary screen's lower-right corner; the main workspace window and its original view remain visible and unchanged. The selected model files are cached in same-origin IndexedDB and sent through a same-origin `BroadcastChannel` after the pet page opens, so the mode remains usable when a Qt profile rejects IndexedDB writes. The Web document receives a `dshDesktopPet=1` query flag, and the shell prunes every non-companion DOM node from that page before applying a transparent page/window background. An input-transparent overlay at the viewport edge pulses green while the pointer is inside the pet window and becomes fully transparent on exit; the separate chat page omits it. Native enter and leave events from the pet window, its WebEngine view, and the top-level `QWindow` update the hover state immediately. A native leave prevents a polled cursor position still inside the window from restoring the overlay until the pet receives a real entry or mouse event; this covers XWayland cursor positions that remain cached when the pointer moves onto a native Wayland surface. The 16-millisecond global cursor poll can also hide the overlay when it observes the pointer outside. The page never infers visibility from WebEngine `pointerout`, which is not guaranteed when the pointer leaves a transparent top-level window, and synthetic `mousemove` events used for model gaze cannot reveal the frame. After the pet page reports a successful load, the shell consumes the GNOME Shell extension's compositor-global pointer source when available, queries the X11 root window directly on Linux `xcb` otherwise, and uses the supported Qt global cursor source on other platforms; it maps the current position into WebEngine client coordinates without clamping it to the window and dispatches it as a `mousemove` event in the page's main JavaScript world. Repeating the injection while the page and model initialize keeps the existing `l2d` renderer synchronized when the pointer remains outside the window. On Linux Wayland sessions that expose an XWayland display, the shell selects Qt's `xcb` backend before constructing the application; an explicit `QT_QPA_PLATFORM` value wins. GNOME Wayland deployments can enable the bundled extension for native Wayland windows; other native Wayland sessions provide only focused-surface coordinates. Dragging the window moves it. Vertical wheel input resizes the native window around its bottom-center anchor and sends the resulting absolute scale to the pet page. The page uses 360x480 as the base canvas size and applies that same scale to the canvas dimensions, with shrinking limited to 240x320, so the model rendering surface and window remain synchronized. A double-click exits the mode. The normal workspace renderer is not switched to desktop presentation. The pointer-refresh rationale is recorded in the [desktop-pet pointer refresh note](../bug-fix/2026-09-25-desktop-pet-pointer-refresh.md).

Every companion page restores the cached model during startup, and removing the model deletes the IndexedDB record.

The desktop-only control is selected by the `DeepSeekHarnessQt` user-agent marker. Ordinary browser sessions keep the existing right-workspace behavior and do not expose a native-window action.

The desktop-pet document owns a `DesktopPetChatController` that restores separate ordinary-chat and Galgame Session ids from local storage or creates the missing Session. It stages the Session selected by the visible mode through `SessionRuntime.openTransient()` without overwriting the primary selection stored in `dsh.sessions.current`; the primary WebEngine view therefore restores and continues its own current Session. The compact panel projects user and assistant text. Ordinary pet chat uses its configured agent and tools and displays one-shot approval controls; Galgame uses the tool-free composition described in [Live2D Galgame chat-only Session](2026-09-24-live2d-galgame-chat-only-session.md).

The pet page reports chat visibility through `dsh://desktop-pet/chat/open` and `dsh://desktop-pet/chat/close`. The Qt shell responds by opening a separate normally decorated `QWidget` containing a second WebEngine page at `dshDesktopPetChat=1`; that page owns the resizable chat surface, while the transparent pet page keeps drag, model-scaling, and double-click-exit behavior. The chat header resolves the same per-session `ModelDirectory` used by the main model-selection seat, so provider/model and reasoning-effort changes submit against the currently selected pet Session only. Ordinary browser previews keep the compact chat inline because they do not have the Qt shell's second native window.

The Qt shell probes port 3080 before starting its child process. When an existing Harness service is already listening, the shell reuses that service and does not claim ownership or terminate it on close; this prevents a second launch from turning a working page into an `EADDRINUSE` retry loop.

## Alternatives considered

**Move the workspace's WebEngine view into the pet window.** Rejected because the main window would lose its active workspace while desktop-pet mode is enabled.

**Implement a browser-only fixed-position overlay.** Rejected because a browser tab cannot stay above other desktop applications and would not provide transparent window chrome.

**Add a separate native Live2D renderer.** Rejected because it would duplicate the Cubism runtime, model loading, and licensing surface already provided by the browser plugin.

**Install platform-specific global mouse hooks.** Rejected because Qt can sample the desktop cursor only while the pet is visible and pass ordinary client coordinates to the existing renderer without adding operating-system hook permissions or separate implementations. XWayland supplies this existing path on Linux without reading input devices directly.

**Scale only the model inside a fixed native window.** Rejected because the enlarged model can extend beyond the WebEngine view and be obscured.

**Resize the native window without scaling the model.** Rejected because the window and model then have different display scales.

**Reserve layout space for a native border.** Rejected because changing the WebEngine viewport would shift the model canvas and make window scaling include decoration pixels instead of only model pixels.

**Reuse the main workspace's current Session for pet chat.** Rejected because messages sent from the floating surface would alter the main conversation's history and model context, and selecting another main conversation would silently move the pet between contexts.

**Implement a native chat transport in Qt.** Rejected because Session creation, prompt admission, streaming projection, reconnection, and tool behavior already belong to the browser object layer; a native path would duplicate those semantics and diverge from the assembled plugin runtime.

## Consequences

Qt desktop users on a global-coordinate window system get a movable, always-on-top companion whose gaze follows the pointer across the desktop while the normal workspace remains unchanged. The pet window remains transparent and visually frameless until the pointer enters it, when the pulsing green overlay exposes its exact extent without changing layout or intercepting controls. The pet chat has independent history and provider context; its Session can still appear in the shared Session catalog, but the main surface's current selection and displayed conversation do not move. Vertical wheel input over the closed pet resizes the native window and scales the model with one absolute ratio, preserving the bottom-center anchor and stopping at 240x320; an open chat panel owns wheel input for message scrolling instead. Global pointer delivery is active only while the pet is visible; WebEngine receives the current mapped position after its page has loaded and continues receiving it at the polling interval so late model initialization cannot lose the pointer state. Selecting `xcb` trades native Wayland integration for desktop-global pointer tracking and reliable explicit placement; GNOME Wayland can add the bundled Shell extension for compositor-global coordinates over native Wayland windows, while other native Wayland sessions provide focused-surface tracking only. The desktop mode is intentionally a shell capability: web browsers and remote pages cannot request native window changes or global cursor coordinates. Double-click exits the mode only while chat is closed.
