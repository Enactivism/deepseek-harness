# Agent Note: Desktop-pet wheel synchronizes model and window scaling

Status: implemented

English | [中文](2026-09-22-desktop-pet-wheel-model-scaling.zh.md)

## Problem

The Qt shell consumes vertical wheel input over the closed desktop pet. The previous native resize path changed the top-level window geometry without changing the Web model presentation, so the model could be obscured by the resized view.

## Decision

The Qt shell accumulates complete wheel steps, resizes the native window around its bottom-center anchor, and sends the resulting absolute scale to the [Live2D desktop-pet page](../feature/2026-09-02-live2d-desktop-pet-mode.md) as `dsh-desktop-pet-scale`. The Live2D overlay applies that scale to the canvas CSS width and height, allowing `l2d`'s resize observer to resize the actual rendering surface to the same dimensions as the native window. The window stops shrinking at 240x320, and chat-open wheel ownership continues to stay with WebEngine.

## Alternatives considered

**Scale only the model in a fixed window.** Rejected because an enlarged canvas can extend beyond the WebEngine view and be obscured.

**Resize the native window without scaling the page.** Rejected because it is the regression: the window grows or shrinks while the model presentation stays unchanged.

**Add a second native model-scaling implementation.** Rejected because the browser overlay already owns the model canvas and its appearance scale; a native path would duplicate presentation state across the Qt shell and Web client.

## Consequences

Wheel zoom changes the rendered model and native window together while preserving the transparent window's bottom-center anchor. The Qt/WebEngine event carries an absolute scale as an internal integration point and is ignored by ordinary browser sessions.

## Testing

The Qt interaction test verifies bottom-center geometry, the minimum size, and the absolute scale event emitted for complete wheel steps. The Live2D overlay test dispatches that event through the desktop-pet entry path and observes the matching canvas dimensions.
