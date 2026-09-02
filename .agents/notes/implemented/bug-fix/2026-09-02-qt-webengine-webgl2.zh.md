# Agent Note: Qt WebEngine WebGL2 启动参数

Status: implemented

[English](2026-09-02-qt-webengine-webgl2.md) | 中文

## Problem

内置的 `l2d` 运行时通过 WebGL2 上下文初始化 Cubism 6 模型。部分 Qt WebEngine 部署会因为主机 GPU 被阻止或不可用而禁用 WebGL2，导致模型加载前就弹出浏览器不支持提示。

## Decision

Qt 壳会先清除 `QTWEBENGINE_DISABLE_GPU` 和 `QT_WEBENGINE_RENDERER`，再在创建 `QApplication` 之前设置 `QTWEBENGINE_CHROMIUM_FLAGS`，启用 GPU/WebGL、启用 Chromium 的不安全 SwiftShader 回退并忽略 GPU 黑名单，同时保留 Qt 按平台选择的 GL 实现。已有 Chromium 参数值会被保留，只有缺少 `--enable-webgl` 时才追加所需参数。外壳不会强制设置 Qt 全局软件 OpenGL 属性，因为该属性会让 Qt WebEngine 禁用 GL 上下文。Web Client 和普通浏览器渲染路径保持不变。

## Alternatives considered

**让 `l2d` 改用 WebGL1。** 不采用，因为 Cubism 6 渲染器要求 WebGL2，修改内置运行时会分叉其支持的渲染路径。

**WebGL2 不可用时让模型变为可选。** 不采用，因为桌面壳可以提供软件上下文，无需削弱 Live2D 功能契约。

**要求用户手动配置 Chromium 参数。** 不采用，因为桌面壳负责 WebEngine 启动，可以统一应用范围明确的兼容性默认值。

## Consequences

当主机 GPU 不可用或被阻止时，Qt WebEngine 仍可初始化 Live2D WebGL2 渲染器；选择 SwiftShader 时会使用软件渲染。部署环境仍可通过 `QTWEBENGINE_CHROMIUM_FLAGS` 提供自定义 Chromium 参数。
