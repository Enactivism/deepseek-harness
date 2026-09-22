# Agent Note: 桌宠聊天渲染助手 Markdown

Status: implemented

[English](2026-09-22-desktop-pet-chat-markdown-rendering.md) | 中文

## Problem

桌宠聊天将所有消息作为字面文本渲染，因此助手回复会暴露 Markdown 源文本，公式和围栏代码无法显示。

## Decision

`Live2DOverlay` 保持用户消息按字面显示，并将助手消息交给共享的 `MarkdownText` 渲染器。桌宠聊天因而复用主对话的 GFM、围栏代码、KaTeX 和流式渲染行为，无需维护第二套 Markdown 处理逻辑。

## Alternatives considered

**添加本地 Markdown 渲染器。** 不采用，因为这会重复 `MarkdownText` 所有的解析、KaTeX 处理、代码高亮和流式规则。

**也将用户消息渲染为 Markdown。** 不采用，因为主对话按字面显示用户输入，桌宠聊天也保持这一差异。

## Consequences

已完成的助手输出会渲染数学公式和围栏代码。助手消息流式到达期间，不完整的公式和围栏会保留 `MarkdownText` 的字面降级行为，直至下次完整解析。

## Verification

`packages/client/ui-live2d/tests/overlay.client.spec.tsx` 在桌宠面板中渲染显示公式和 TypeScript 围栏。组装后的浏览器场景仍位于 `apps/web/tests/desktop-pet-chat.e2e.ts`。
