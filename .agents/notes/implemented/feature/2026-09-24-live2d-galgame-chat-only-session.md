# Agent Note: Live2D Galgame chat-only Session

Status: implemented

English | [中文](2026-09-24-live2d-galgame-chat-only-session.zh.md)

## Problem

Galgame needs conversational story replies, while the ordinary desktop-pet Session may expose tools and prompt sections for coding work. Reusing it sends agent capabilities with every Galgame request and mixes story history with ordinary chat.

## Decision

The shipped `chat-only` preset contributes one complete persona, suppresses dynamic runtime context, and mounts no model-facing tools. `DesktopPetChatController` restores ordinary chat and Galgame from separate local-storage keys and creates the Galgame Session with `agentPreset: 'chat-only'`. Galgame free and story modes share that Session; ordinary desktop-pet chat keeps the deployment's default composition. Switching modes stages the matching Session with `openTransient()`, so the main workspace's persisted Session selection does not change. Client `ISessions.create()` carries an optional preset id through the Host `session.create` request.

## Alternatives considered

**Change the composition of the shared Session when Galgame opens.** Rejected because the preset service permits recomposition only while a Session is blank; retaining one history would leave story turns under incompatible tool sets or retain ordinary chat's tools.

**Hide tools only in the Galgame request.** Rejected because removing schemas from one prompt would not remove the Agent's ability to execute those tools, and the existing extension point composes tools for the whole Agent.

**Remove tools from ordinary desktop-pet chat as well.** Rejected because the requested token reduction applies to Galgame, while ordinary chat continues to use the deployment's configured assistant.

## Consequences

Galgame requests carry only the short complete persona and story conversation history, without tool schemas or dynamic runtime context. Ordinary chat and Galgame keep separate histories and per-Session model selections, while the Galgame free and story modes retain one shared conversation. The `chat-only` preset is also available in the shipped preset roster for Sessions created through other surfaces.

## Related

The Galgame story controls and choice format are described in [Live2D Galgame mode](2026-09-23-live2d-galgame-mode.md). The desktop-pet Session and window behavior are described in [Live2D desktop pet mode](2026-09-02-live2d-desktop-pet-mode.md).
