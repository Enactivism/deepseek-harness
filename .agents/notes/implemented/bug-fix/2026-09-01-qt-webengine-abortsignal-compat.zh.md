# Agent Note: 旧版 Qt WebEngine 的 AbortSignal 兼容性

Status: implemented

[English](2026-09-01-qt-webengine-abortsignal-compat.md) | 中文

## 问题

Qt 桌面外壳通过 Qt WebEngine 浏览器渲染 Web Client。旧版 Qt WebEngine Chromium 不提供静态的 `AbortSignal.timeout` 和 `AbortSignal.any` 方法。共享浏览器 API 载体在有界 RPC 请求中直接调用了这些方法，因此页面在请求到达本地 Harness 服务前就以 `AbortSignal.timeout is not a function` 失败。

## 决策

共享的 `AbstractApiClient` 载体现在通过小型平台无关函数解析超时和信号组合辅助函数。原生静态方法仍是快速路径；缺少任一方法时，载体会创建 `AbortController`，用 `setTimeout` 安排截止时间，保留 `TimeoutError` 原因，并转发第一个中止源、移除监听器来组合信号。所有有界一元调用都使用该回退，包括 Qt WebEngine Client 发起的调用；用户节奏的调用仍只接受调用方取消。

## 考虑过的替代方案

**由 Qt 外壳注入兼容脚本。** 不予采纳：这会让原生外壳耦合浏览器实现细节，也无法覆盖其他旧版浏览器 Client。

**要求升级 Qt 或 Chromium。** 不予采纳：用户不一定能升级系统 Qt 包，而缺少的方法可以在载体内用小范围等价实现补足。

**在每个超时调用点分别替换。** 不予采纳：这会重复取消语义，并可能让不同载体行为不一致；fetch 载体统一负责此平台差异。

## 后果

旧版 WebEngine Client 可以完成和取消有界 RPC 请求，不改变 wire 协议或 Node 进程。新版浏览器继续使用原生实现。每个有界请求的回退会额外创建一个定时器和一组中止监听器，并在取消时移除这些监听器。

## 测试

API 载体回归套件会在测试运行时临时移除两个静态方法，并验证有界请求仍能中止。同一套件中已有的超时、外部取消和用户节奏目录选择器测试继续固定原生与回退语义。
