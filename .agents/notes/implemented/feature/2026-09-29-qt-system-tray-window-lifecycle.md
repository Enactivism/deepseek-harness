# Agent Note: Qt shell system-tray window lifecycle

Status: implemented

English | [中文](2026-09-29-qt-system-tray-window-lifecycle.zh.md)

## Problem

Closing the Qt shell window terminated the owned Harness service, so users could not keep the local service running while temporarily removing the desktop UI.

## Decision

`HarnessWindow` owns a `QSystemTrayIcon` with a generated `DH` icon and a context menu containing `Open` and `Close`. Double-clicking the tray icon restores and activates the main window. A normal main-window close hides the main, desktop-pet, and chat windows, ignores the close event, and keeps the Harness service running while the tray icon is available. The tray `Close` action and `File > Exit` set the explicit-quit flag, close the window, hide all auxiliary windows, hide the tray icon, and stop the owned service. When the desktop environment has no system tray, the close event retains direct-exit behavior so the process cannot become unreachable.

## Alternatives considered

**Keep the existing direct close behavior.** Rejected because it makes closing the workspace also terminate the local service and removes the ability to resume quickly from the tray.

**Implement the tray in the Web UI.** Rejected because the tray icon and process shutdown belong to the native Qt shell and must remain available when the WebEngine window is hidden.

**Leave the desktop-pet or chat windows visible after hiding the main window.** Rejected because a window close is treated as hiding the whole desktop shell; reopening from the tray starts from one visible workspace window and avoids orphaned auxiliary windows.

## Consequences

The Harness service continues running while the shell is hidden, so reopening does not restart the local server. The native shell carries a small generated icon instead of adding a platform-specific asset or resource target. Environments without a usable system tray fall back to the previous direct shutdown behavior.
