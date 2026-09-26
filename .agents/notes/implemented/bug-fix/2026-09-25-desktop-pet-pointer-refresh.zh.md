# Agent Note: 桌宠指针刷新

Status: implemented

[English](2026-09-25-desktop-pet-pointer-refresh.md) | 中文

## Problem

Qt 壳可能在 WebEngine 页面及其异步 Live2D 模型监听器就绪前采样桌面全局鼠标位置。原先只在映射后的位置变化时发送合成 `mousemove`，因此该位置可能在监听器注册前被消费；鼠标停在桌宠窗口外时，模型要等鼠标再次移动才会转向。

## Decision

`HarnessWindow` 在 `loadFinished` 成功后标记桌宠页面就绪，并为已加载页面保持现有的 16 毫秒全局指针定时器。每次定时器触发都会把当前 `QCursor::pos()` 映射为 WebEngine 客户区坐标，再注入包含 `view`、`screenX` 和 `screenY` 字段的 `mousemove` 事件。事件在页面主 JavaScript world 中发送，因此 `l2d` 的 document 监听器会收到与浏览器鼠标事件相同的客户区坐标。

## Alternatives considered

**在 `loadFinished` 后重置最后位置缓存。** 不采用，因为 Live2D 模型加载和监听器注册会在页面加载事件之后继续异步进行；一次强制发送仍可能过早。

**安装操作系统全局鼠标钩子。** 不采用，因为这会增加平台专用权限和实现，而现有 Qt 光标轮询已经能在支持的 X11、Windows 和 macOS 后端提供全局坐标。原生 Wayland 仍不会向普通客户端提供桌面全局坐标。

## Consequences

页面和模型完成初始化期间，即使鼠标停在桌宠窗口外，模型也会持续收到当前桌面指针。桌宠加载后即使鼠标静止，也会按指针轮询周期执行一次 WebEngine JavaScript。纯 Wayland 会话继续只能在获焦 surface 上追踪，因为协议不提供桌面全局指针位置。

## Verification

`qt-shell/tests/desktop_pet_interaction_test.cpp` 保留窗口外的负数和越界客户区坐标，并检查事件中的全局坐标字段。Qt 壳已通过 `qt-shell/build` 中的 CMake 构建，桌宠交互测试通过。
