# Agent Note: 桌宠指针刷新

Status: implemented

[English](2026-09-25-desktop-pet-pointer-refresh.md) | 中文

## Problem

Qt 壳可能在 WebEngine 页面及其异步 Live2D 模型监听器就绪前采样桌面全局鼠标位置。原先只在映射后的位置变化时发送合成 `mousemove`，因此该位置可能在监听器注册前被消费；鼠标停在桌宠窗口外时，模型要等鼠标再次移动才会转向。

## Decision

`HarnessWindow` 在 `loadFinished` 成功后标记桌宠页面就绪，并为已加载页面保持现有的 16 毫秒全局指针定时器。在 GNOME Wayland 下，附带的可选 GNOME Shell 扩展会通过 session bus 发布合成器提供的全局坐标，Qt 外壳在该来源可用时使用它；没有该来源时，Linux `xcb` 后端每次定时器触发都会通过 `XQueryPointer` 直接查询 X11 root window，其他支持的平台使用 `QCursor::pos()`。得到的桌面坐标会被映射为 WebEngine 客户区坐标，再注入包含 `view`、`screenX` 和 `screenY` 字段的 `mousemove` 事件。事件在页面主 JavaScript world 中发送，因此 `l2d` 的 document 监听器会收到与浏览器鼠标事件相同的客户区坐标。

## Alternatives considered

**在 `loadFinished` 后重置最后位置缓存。** 不采用，因为 Live2D 模型加载和监听器注册会在页面加载事件之后继续异步进行；一次强制发送仍可能过早。

**安装操作系统全局鼠标钩子。** 不采用，因为原生 Wayland 只需要使用合成器协作的 GNOME 扩展路径，继续扩展为各平台专用钩子会增加权限和实现成本。没有合成器协作时，原生 Wayland 仍不会向普通客户端提供桌面全局坐标。

## Consequences

页面和模型完成初始化期间，即使鼠标停在桌宠窗口外，模型也会持续收到当前桌面指针。GNOME Wayland 部署可以通过扩展追踪原生 Wayland 窗口，未启用扩展的 Linux `xcb` 部署直接查询 X11 server，因此指针来源不依赖 Qt 缓存的光标值。桌宠加载后即使鼠标静止，也会按指针轮询周期执行一次 WebEngine JavaScript。其他纯 Wayland 会话继续只能在获焦 surface 上追踪，因为协议不提供桌面全局指针位置。

## Verification

`qt-shell/tests/desktop_pet_interaction_test.cpp` 保留窗口外的负数和越界客户区坐标，并检查事件中的全局坐标字段。Qt 壳已通过 `qt-shell/build` 中的 CMake 构建，桌宠交互测试通过。
