# Agent Note: Live2D Galgame mode

Status: implemented

English | [中文](2026-09-23-live2d-galgame-mode.zh.md)

## Problem

Desktop-pet chat supports open-ended messages, while an interactive story needs the assistant to offer three player replies that the user can send with one selection.

## Decision

The native pet window leaves the chat and Galgame button area, including double-clicks, to the Web controls while retaining native gestures over the model area.

The floating desktop pet opens a Galgame mode picker, and the chat header returns to ordinary desktop-pet chat. Free mode uses the existing chat composer. Story mode offers an optional story card with tone, character, player role, and opening scene fields. Blank text fields are omitted; the card is logged with the first story instruction, and explicitly applied edits add a new control message without restarting the story. Story instructions ask the assistant to return narrative text followed by exactly three numbered player messages inside `<galgame-choices>`. The browser renders buttons only for a complete ordered `1.`–`3.` block; selecting a button submits that option text unchanged through the same Session. Focus mode shows only the latest visible conversation message in a letterboxed layout; switching back restores the complete transcript without changing Session history or issuing a model request. Mode instructions and story cards are logged with a feature-owned prefix and omitted from the compact dialogue display. While story instructions are active, switching to free mode or leaving Galgame submits a localized instruction to stop the story format. A missing or malformed block leaves no selectable messages and offers a retry. Galgame free and story modes share a Session with the tool-free `chat-only` composition; ordinary desktop-pet chat has its own Session. The selected Galgame screen and presentation preference are stored in same-origin local storage so the floating pet can open the native chat window directly into that screen; these preferences are presentation state and are not part of the Session log. The [chat-only Session note](2026-09-24-live2d-galgame-chat-only-session.md) records the model-context decision.

## Alternatives considered

**Create a separate Session for story mode.** Rejected because free chat and story mode belong to one Galgame conversation and retain one history and model selection.

**Parse untagged numbered prose as choices.** Rejected because ordinary story text can contain numbered lists; an explicit `<galgame-choices>` block distinguishes sendable player messages.

**Generate choices in a second model request or backend endpoint.** Rejected because the assistant can return the narrative and choices in one response using the existing Session prompt path.

## Consequences

Story instructions, optional setup text, mode changes, and selected replies are ordinary logged user messages; generated choices share the narrative response's token accounting, and focus mode has no model token cost. Unselected choices are presentation data and do not enter model history. Galgame history is separate from ordinary pet chat and does not carry its tools or dynamic runtime context. Choice buttons depend on the assistant following the requested format; the UI keeps the narrative visible and offers a retry when parsing fails. Cross-window mode and setup preferences depend on same-origin local storage, while the in-page Galgame UI remains usable when storage is unavailable.

## Related

The desktop-pet Session, native chat window, and model-selection behavior are recorded in [Live2D desktop pet mode](2026-09-02-live2d-desktop-pet-mode.md).
