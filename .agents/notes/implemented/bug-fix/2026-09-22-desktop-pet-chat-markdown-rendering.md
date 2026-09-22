# Agent Note: Desktop-pet chat renders assistant Markdown

Status: implemented

English | [中文](2026-09-22-desktop-pet-chat-markdown-rendering.zh.md)

## Problem

The desktop-pet chat rendered every message as literal text, so assistant responses exposed Markdown source instead of rendering formulas and fenced code.

## Decision

`Live2DOverlay` keeps user messages literal and passes assistant messages through the shared `MarkdownText` renderer. The desktop-pet chat therefore matches the main conversation's GFM, fenced-code, KaTeX, and streaming behavior without maintaining a second Markdown pipeline.

## Alternatives considered

**Add a local Markdown renderer.** Rejected because it would duplicate parsing, KaTeX handling, code highlighting, and the streaming rules owned by `MarkdownText`.

**Render user messages as Markdown too.** Rejected because the main conversation presents user input literally, and the desktop-pet chat keeps the same distinction.

## Consequences

Completed assistant output renders mathematical formulas and fenced code. While an assistant message streams, incomplete formulas and fences retain `MarkdownText`'s literal fallback until the next complete parse.

## Verification

`packages/client/ui-live2d/tests/overlay.client.spec.tsx` renders display math and a TypeScript fence in the desktop-pet panel. The assembled browser scenario remains in `apps/web/tests/desktop-pet-chat.e2e.ts`.
