# Agent Note: 桌宠滚轮同步缩放模型和窗口

Status: implemented

[English](2026-09-22-desktop-pet-wheel-model-scaling.md) | 中文

## Problem

Qt 外壳会捕获桌宠关闭聊天时的垂直滚轮输入。原有的原生缩放路径只改变了顶层窗口几何尺寸，没有同步改变 Web 模型的显示，因此模型可能被改变后的视图遮挡。

## Decision

Qt 外壳累积完整的滚轮步长，围绕底部中心锚点调整原生窗口，并以 `dsh-desktop-pet-scale` 事件把调整后的绝对比例发送给[Live2D 桌宠页面](../feature/2026-09-02-live2d-desktop-pet-mode.md)。Live2D 覆盖层把同一个比例应用到画布的 CSS 宽高，使 `l2d` 的 ResizeObserver 把实际渲染画布调整为与原生窗口相同的尺寸。窗口最小为 240x320，聊天展开时的滚轮归属仍由 WebEngine 保持。

## Alternatives considered

**只在固定窗口中缩放模型。** 不采用，因为放大的画布可能超出 WebEngine 视图并被遮挡。

**调整原生窗口但不缩放页面。** 不采用，因为这正是导致窗口变化而模型不变的回归行为。

**增加第二套原生模型缩放实现。** 不采用，因为浏览器覆盖层已经拥有模型画布及其外观缩放状态；原生路径会在 Qt 外壳和 Web 客户端之间重复维护显示状态。

## Consequences

滚轮缩放会同步改变渲染模型和透明窗口，并保持窗口底部中心锚点。Qt/WebEngine 事件携带绝对比例，属于内部集成点，普通浏览器会忽略它。

## Testing

Qt 交互测试验证底部中心几何锚点、最小尺寸，以及完整滚轮步长生成的绝对比例事件。Live2D 覆盖层测试通过桌宠入口分发该事件，检查匹配的画布尺寸。
