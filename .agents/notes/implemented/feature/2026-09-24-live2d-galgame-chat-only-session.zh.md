# Agent Note: Live2D Galgame 纯聊天 Session

Status: implemented

[English](2026-09-24-live2d-galgame-chat-only-session.md) | 中文

## Problem

Galgame 需要对话式剧情回复，而普通桌宠 Session 可能带有面向编程工作的工具和提示词段落。复用普通 Session 会让每次 Galgame 请求都携带 agent 能力，并把剧情历史和普通聊天混在一起。

## Decision

随附的 `chat-only` preset 只提供一条完整 persona，抑制动态运行上下文，不挂载模型可调用工具。`DesktopPetChatController` 使用独立的 localStorage 键恢复普通聊天和 Galgame，并通过 `agentPreset: 'chat-only'` 创建 Galgame Session。Galgame 自由和剧情模式共用该 Session；普通桌宠聊天继续使用部署默认组成。模式切换会通过 `openTransient()` 暂存对应 Session，不会更改主工作区持久化的 Session 选择。客户端 `ISessions.create()` 会把可选 preset id 传递给 Host 的 `session.create` 请求。

## Alternatives considered

**打开 Galgame 时重组共用 Session。** 不采用，因为 preset 服务只允许重组空白 Session；保留同一份历史会导致剧情轮次与不兼容的工具组成混合，或让普通聊天继续携带工具。

**只在 Galgame 请求中隐藏工具。** 不采用，因为从单次请求中移除 schema 不会移除 Agent 执行这些工具的能力，而现有扩展点是在整个 Agent 上组装工具。

**普通桌宠聊天也移除工具。** 不采用，因为本次 token 缩减针对 Galgame，普通聊天继续使用部署配置的助手。

## Consequences

Galgame 请求只携带简短完整 persona 和剧情对话历史，不带工具 schema 或动态运行上下文。普通聊天与 Galgame 分别保存历史和 per-Session 模型选择，而 Galgame 自由和剧情模式继续共用一个对话。`chat-only` preset 也会出现在随附的 preset 名单中，可供其他入口创建 Session 时选择。

## Related

Galgame 剧情控件和选项格式见 [Live2D Galgame 模式](2026-09-23-live2d-galgame-mode.md)。桌宠 Session 和窗口行为见 [Live2D 桌宠模式](2026-09-02-live2d-desktop-pet-mode.md)。
