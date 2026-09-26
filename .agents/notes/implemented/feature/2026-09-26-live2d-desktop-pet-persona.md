# Agent Note: Live2D desktop-pet persona prompt

Status: implemented

English | [中文](2026-09-26-live2d-desktop-pet-persona.zh.md)

## Problem

Desktop-pet users need a character-specific personality prompt for roleplay, while the main workspace conversation and its context must remain unchanged.

## Decision

The desktop-pet chat header provides a personality editor with a 1,000-character limit. The value is stored under `dsh.live2d.desktop-pet-persona` in same-origin local storage and is shared by the ordinary pet and Galgame views. When the value is nonblank, the Live2D overlay prepends it to every user message sent to either dedicated Session using the `[Desktop pet persona]` feature-owned marker. The Session log therefore contains the model-visible value, while the compact chat projection removes the marker and persona block before rendering the user's message. Clearing the value leaves subsequent messages unchanged; saving a value affects the next message and does not add a model turn.

The persona is intentionally represented as feature-owned content inside each logged user message rather than as a new system-prompt or Session-header field. This keeps the setting local to the existing desktop-pet Sessions, preserves replayability through the existing Session log, and avoids changing the main workspace composition or durable Session format.

## Alternatives considered

**Add a per-Session system-prompt field.** Rejected because it would require new Session persistence and reconstruction semantics across the host, browser runtime, and model request assembly for a setting that is owned by this browser-only feature.

**Submit one setup message before the conversation.** Rejected because the setup would become an extra model-visible turn, could produce an unwanted assistant response, and would need replay logic to remain active after restoring the Session.

**Keep the persona only in browser memory.** Rejected because restored Sessions would lose the model-visible setting and the value would not be reconstructable from the logged messages.

## Consequences

Roleplay settings are available directly from the ordinary desktop-pet chat header and apply consistently to ordinary and Galgame conversations without affecting the main workspace. The persona is repeated in each nonblank user message, so it adds input tokens on every pet turn until cleared or changed. The compact transcript deliberately hides the feature-owned block, while Session history and model requests retain it for reconstruction. The setting is scoped to the same-origin browser profile and is not synchronized across browsers or devices.

## Related

[Live2D desktop pet mode](2026-09-02-live2d-desktop-pet-mode.md)

[Live2D Galgame mode](2026-09-23-live2d-galgame-mode.md)
