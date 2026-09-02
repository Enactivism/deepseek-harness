# @deepseek-ai/dsh-client-ui-live2d

[English](README.md) | 中文

面向 Harness 编程工作区的本地优先 Live2D 陪伴功能。本功能向布局的 `shell.right` 槽贡献一个可叠加条目，角色会嵌入聊天工作区右侧的固定栏；该栏参与正常布局，因此不会覆盖对话区或输入区。工具详情仍然使用独立的 `details` 栏。

空状态会说明使用流程，并允许用户选择一个模型文件夹。文件夹必须包含一个 `.model3.json` 或 `.model.json` 入口文件，以及它引用的 `.moc3`/`.moc`、贴图、动作、表情、物理和音频资源。浏览器会把所选文件转换为临时 object URL，并在交给 [`l2d`](https://github.com/hacxy/l2d) 前重写入口文档里的本地引用；模型字节不会发送给 Host 或模型提供方。

模型加载后，陪伴组件会显示当前模型名和文件数量，依据 Harness 当前选中会话的只读运行状态显示一个小状态指示，并提供模型大小、透明度、隐藏/恢复、更换和移除控制。槽条目销毁时渲染器也会一起释放，包括 WebGL 状态和 object URL，因此快速更换模型不会把旧模型留在内存里。

组件刻意保持浏览器端实现。Qt 仍然只是 WebEngine/进程外壳，不需要引入 Live2D SDK，也不需要维护第二条渲染路径。这样，本地模型的所有权和 UI 接缝都与其余 Web 插件体系保持在同一层。

## 开发

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-live2d bundle
pnpm run test:gui
```

浏览器 bundle 会内联 `l2d`；React、槽渲染器和 UI primitives 仍然从 Harness 浏览器模块表解析。基于 Live2D Cubism 的运行时和模型资源有各自的许可义务；在分发一个接受任意用户模型的产品前，请查看 [`l2d` 的许可证与免责声明](https://github.com/hacxy/l2d#disclaimer) 以及 [Live2D SDK 许可证](https://www.live2d.com/en/sdk/license/)。

## 模型体验

### 本地陪伴状态

#### What the model sees

什么也看不到。本陪伴组件只响应本地文件选择和只读的 `current-session` 运行状态，不会改变 `prompt`、消息、工具调用、`schema` 或模型配置。

#### Token effect

无；所选模型和运行指示器都只存在于浏览器 UI 中。

#### KV Cache effect

无；本包不会组装或发送任何 provider 请求。

## 已知限制与暂缓事项

- **当前模型只存在于本页面** —— 刷新页面会清空所选文件，因为实现刻意避免把可能很大的模型资源复制进 Harness 设置或远端存储。后续可以在不改变槽契约的前提下，加入明确的 IndexedDB 模型库。
- **一次一个文件夹** —— 选择结果包含多个模型入口文件时会被拒绝，避免用户选中包含多个模型的父目录后静默显示错误角色。
- **渲染能力跟随 `l2d`** —— 本包接受两种常见 Cubism 入口格式，但具体模型仍可能因为导出资源不完整或许可问题而加载失败。模型的分发和使用权始终由模型持有者负责。
- **第一版只保留必要交互** —— 模型自身的待机/点击动作仍然有效；聊天联动表情、语音/口型同步和模型库可以在未来的浏览器服务后面增加，不需要让模型字节经过 Host。
