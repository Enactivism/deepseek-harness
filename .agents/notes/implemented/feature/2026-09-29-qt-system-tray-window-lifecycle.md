# Agent Note: Qt shell system-tray window lifecycle

Status: implemented

English | [中文](2026-09-29-qt-system-tray-window-lifecycle.zh.md)

## Problem

Closing the Qt shell window terminated the owned Harness service, so users could not keep the local service running while temporarily removing the desktop UI.

## Decision

`HarnessWindow` owns a `QSystemTrayIcon` with a generated `DH` icon and a context menu containing `Open` and `Close`. Double-clicking the tray icon restores and activates the main window. A normal main-window close hides only the main workspace, ignores the close event, and keeps the desktop pet, its chat window, and the Harness service running while the tray icon is available. The tray `Close` action and `File > Exit` set the explicit-quit flag, close the window, hide all auxiliary windows, hide the tray icon, and stop the owned service. When the desktop environment has no system tray, the close event retains direct-exit behavior so the process cannot become unreachable.

## Alternatives considered

**Keep the existing direct close behavior.** Rejected because it makes closing the workspace also terminate the local service and removes the ability to resume quickly from the tray.

**Implement the tray in the Web UI.** Rejected because the tray icon and process shutdown belong to the native Qt shell and must remain available when the WebEngine window is hidden.

**Hide the desktop-pet and chat windows together with the main window.** Rejected because the desktop pet is an independent user-facing window; closing the workspace must not stop its pointer tracking or interrupt its interaction.

## Consequences

The Harness service continues running while the shell is hidden, so reopening does not restart the local server. The native shell carries a small generated icon instead of adding a platform-specific asset or resource target. Environments without a usable system tray fall back to the previous direct shutdown behavior.
