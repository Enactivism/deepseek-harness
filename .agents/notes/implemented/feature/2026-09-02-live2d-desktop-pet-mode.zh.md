# Agent Note: Live2D 桌宠模式

Status: implemented

[English](2026-09-02-live2d-desktop-pet-mode.md) | 中文

## Problem

Live2D 陪伴模型当前渲染在 Web 工作区右侧栏。桌面壳用户需要把模型保持为悬浮桌宠，同时避免重新启动模型运行时，也不能让模型在普通工作区覆盖对话内容。

## Decision

Qt 壳拦截 Live2D 组件发出的 `dsh://desktop-pet/toggle` 导航请求。进入模式后，创建第二个 WebEngine 视图并放入无边框、置顶的 360x480 工具窗口，移动到主屏幕右下角；主工作区窗口及其原有视图保持显示且不变。所选模型文件会缓存到同源 IndexedDB，并在桌宠页面打开后通过同源 `BroadcastChannel` 再发送一次；即使 Qt WebEngine 配置拒绝 IndexedDB 写入，桌宠模式仍可工作。Web 文档通过 `dshDesktopPet=1` 查询参数，外壳会在应用挂载后移除该页面中所有非陪伴 DOM 节点，并设置透明页面/窗口背景。鼠标左键拖动桌宠窗口，双击退出模式。普通工作区渲染器不会切换到桌宠显示方式。

桌面入口通过 `DeepSeekHarnessQt` user-agent 标记识别。普通浏览器仍保持右侧栏行为，不显示原生窗口操作。

Qt 壳会在启动子进程前探测 3080 端口。若已有 Harness 服务正在监听，外壳会直接复用该服务，不声明所有权，也不会在关闭时终止它；这样再次启动不会把正常页面变成 `EADDRINUSE` 重试循环。

## Alternatives considered

**创建第二个 WebEngine 窗口并重新加载模型。** 不采用，因为浏览器选择的模型文件由原页面持有，object URL 不能安全转移到第二个渲染器。

**只实现浏览器 fixed-position 覆盖层。** 不采用，因为浏览器标签页不能置于其他桌面应用之上，也不能提供透明窗口外观。

**增加独立的原生 Live2D 渲染器。** 不采用，因为这会重复已有浏览器插件提供的 Cubism 运行时、模型加载和许可证范围。

## Consequences

Qt 桌面用户获得可移动的置顶桌宠，普通工作区不变。桌宠模式刻意限定在桌面壳能力内，浏览器和远程页面不能请求原生窗口变化。紧凑显示会隐藏常规控件，因此使用双击退出模式。
