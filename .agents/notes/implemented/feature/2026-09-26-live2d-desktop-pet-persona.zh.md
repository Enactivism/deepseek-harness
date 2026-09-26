# Agent Note: Live2D 桌宠人格提示词

Status: implemented

[English](2026-09-26-live2d-desktop-pet-persona.md) | 中文

## Problem

桌宠用户需要一个用于角色扮演的独立人格提示词，同时主工作区对话及其上下文必须保持不变。

## Decision

桌宠聊天标题栏提供人格编辑器，长度限制为 1,000 个字符。人格内容保存到同源 localStorage 的 `dsh.live2d.desktop-pet-persona` 键中，由普通桌宠和 Galgame 视图共享。内容非空时，Live2D 覆盖层会使用 `[Desktop pet persona]` 功能自有人格标记，把它附加到发送给两个专用 Session 的每条用户消息前。这样 Session 日志包含模型可见的人格内容，而紧凑聊天投影会在渲染用户消息前移除标记和人格块。清空人格后续消息保持原样；保存内容从下一条消息生效，不会额外触发模型回合。

人格内容有意作为每条已记录用户消息中的功能自有内容，而不是新增系统提示或 Session 头字段。这样既能把设置限定在现有桌宠 Session 内，又能通过现有 Session 日志保持可重放性，还避免修改主工作区组成或持久化 Session 格式。

## Alternatives considered

**增加按 Session 保存的系统提示字段。** 不采用，因为这会要求 Host、浏览器运行时和模型请求组装流程为一个浏览器端功能增加新的 Session 持久化与重建语义。

**在对话开始前提交一条设定消息。** 不采用，因为这条设定会成为模型可见的额外回合，可能产生不需要的助手回复，而且恢复 Session 后还需要额外的重放逻辑来保持设定生效。

**只把人格保存在浏览器内存中。** 不采用，因为恢复 Session 后模型会丢失可见的人格内容，且日志无法重建该设置。

## Consequences

角色扮演设定可以直接从普通桌宠聊天标题栏配置，并一致作用于普通聊天和 Galgame，不影响主工作区。人格内容会重复出现在每条非空用户消息中，因此在清空或修改前，每轮桌宠请求都会增加输入 token。紧凑对话会刻意隐藏功能自有人格块，而 Session 历史和模型请求仍会保留它以便重建。该设置限定在同源浏览器配置中，不会同步到其他浏览器或设备。

## Related

[Live2D 桌宠模式](2026-09-02-live2d-desktop-pet-mode.md)

[Live2D Galgame 模式](2026-09-23-live2d-galgame-mode.md)
