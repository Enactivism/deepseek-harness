# Agent Note: Qt WebEngine WebGL2 startup flags

Status: implemented

English | [中文](2026-09-02-qt-webengine-webgl2.zh.md)

## Problem

The vendored `l2d` runtime initializes Cubism 6 models through a WebGL2 context. Some Qt WebEngine deployments disable WebGL2 because the host GPU is blocked or unavailable, causing the runtime's browser-support alert before a model can load.

## Decision

The Qt shell clears `QTWEBENGINE_DISABLE_GPU` and `QT_WEBENGINE_RENDERER`, then sets `QTWEBENGINE_CHROMIUM_FLAGS` before constructing `QApplication`. It enables GPU/WebGL, enables Chromium's unsafe SwiftShader fallback, and ignores Chromium's GPU blocklist while leaving Qt's platform-selected GL implementation unchanged. An existing Chromium flag value is preserved and only receives the required flags when `--enable-webgl` is absent. The shell does not force Qt's global software OpenGL attribute because that makes Qt WebEngine disable its GL context. The Web client and ordinary browser rendering retain their existing paths.

## Alternatives considered

**Change `l2d` to use WebGL1.** Rejected because Cubism 6's renderer requires WebGL2 and changing the vendored runtime would fork its supported rendering path.

**Make the model optional when WebGL2 is unavailable.** Rejected because the Qt shell can provide a software context without weakening the Live2D feature contract.

**Require users to configure Chromium flags manually.** Rejected because the desktop shell owns WebEngine startup and can apply the narrow compatibility defaults consistently.

## Consequences

Qt WebEngine can initialize the Live2D WebGL2 renderer on machines whose GPU is unavailable or blocked, at the cost of software-rendered graphics when SwiftShader is selected. Deployments can still provide their own Chromium flags through `QTWEBENGINE_CHROMIUM_FLAGS`.
