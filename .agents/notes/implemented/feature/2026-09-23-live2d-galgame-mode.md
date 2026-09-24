# Agent Note: Live2D Galgame mode

Status: implemented

English | [中文](2026-09-23-live2d-galgame-mode.zh.md)

## Problem

Desktop-pet chat supports open-ended messages, while an interactive story needs the assistant to offer three player replies that the user can send with one selection.

## Decision

The native pet window leaves the chat and Galgame button area, including double-clicks, to the Web controls while retaining native gestures over the model area.

The floating desktop pet opens a Galgame mode picker, and the chat header returns to ordinary desktop-pet chat. Free mode uses the existing chat composer. Story mode sends a localized instruction through the Galgame Session, asking the assistant to return narrative text followed by exactly three numbered player messages inside `<galgame-choices>`. The browser renders buttons only for a complete ordered `1.`–`3.` block; selecting a button submits that option text unchanged through the same Session. Mode instructions are logged with a feature-owned prefix and omitted from the compact dialogue display. While story instructions are active, switching to free mode or leaving Galgame submits a localized instruction to stop the story format. A missing or malformed block leaves no selectable messages and offers a retry. Galgame free and story modes share a Session with the tool-free `chat-only` composition; ordinary desktop-pet chat has its own Session. The selected Galgame screen is stored in same-origin local storage so the floating pet can open the native chat window directly into that screen; the screen selection is presentation state and is not part of the Session log. The [chat-only Session note](2026-09-24-live2d-galgame-chat-only-session.md) records the model-context decision.

## Alternatives considered

**Create a separate Session for story mode.** Rejected because free chat and story mode belong to one Galgame conversation and retain one history and model selection.

**Parse untagged numbered prose as choices.** Rejected because ordinary story text can contain numbered lists; an explicit `<galgame-choices>` block distinguishes sendable player messages.

**Generate choices in a second model request or backend endpoint.** Rejected because the assistant can return the narrative and choices in one response using the existing Session prompt path.

## Consequences

Story instructions, mode changes, and selected replies are ordinary logged user messages, and generated choices share the narrative response's token accounting. Unselected choices are presentation data and do not enter model history. Galgame history is separate from ordinary pet chat and does not carry its tools or dynamic runtime context. Choice buttons depend on the assistant following the requested format; the UI keeps the narrative visible and offers a retry when parsing fails. Cross-window mode selection depends on same-origin local storage, while the in-page Galgame UI remains usable when storage is unavailable.

## Related

The desktop-pet Session, native chat window, and model-selection behavior are recorded in [Live2D desktop pet mode](2026-09-02-live2d-desktop-pet-mode.md).
