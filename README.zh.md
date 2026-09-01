# DeepSeek Harness

[English](README.md) | 中文

<p align="center">
  <a href="https://github.com/Enactivism/deepseek-harness/stargazers"><img src="https://img.shields.io/github/stars/Enactivism/deepseek-harness?style=flat-square&amp;label=%E2%98%85&amp;color=08C" alt="GitHub stars"></a>
  <a href="https://github.com/Enactivism"><img src="https://img.shields.io/badge/maintained%20by-Enactivism-47848F?style=flat-square" alt="Maintained by Enactivism"></a>
  <img src="https://img.shields.io/badge/architecture-everything%20is%20a%20plugin-4493F8?style=flat-square" alt="Everything is a plugin">
  <img src="https://img.shields.io/badge/desktop-Qt%206-41CD52?style=flat-square&amp;logo=qt&amp;logoColor=white" alt="Qt 6 desktop shell">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square" alt="MIT License"></a>
</p>

<h3 align="center">插件原生的 agent harness，原生桌面入口。</h3>

<p align="center">由 Enactivism 维护的 DeepSeek Harness 下游版本，集成 Cordis 运行时、React 工作区和 Qt 6 桌面外壳。</p>

## 项目定位

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。[Cordis](https://github.com/cordiverse/cordis) 提供组合运行时，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

本仓库是由 Enactivism 维护的下游版本。它保留上游插件运行时和 Web UI，同时加入 Qt 6 桌面入口以及由本组织维护的集成工作。

> [!IMPORTANT]
>
> 本项目处于开发者预览阶段，可能引入破坏兼容性的变更。

## 版本组成

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>插件运行时</h3>
      <p>模型、工具、会话、工作流、设置与 UI 扩展统一加入 Cordis 插件图，而不是堆积到单体主循环中。</p>
    </td>
    <td width="50%" valign="top">
      <h3>Web 工作区</h3>
      <p>本地 React 工作区在 <code>127.0.0.1:3080</code> 提供对话、工具、模型选择、设置、后台任务和插件面板。</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Qt 6 桌面外壳</h3>
      <p>原生外壳监督 <code>dsh web</code>，等待 HTTP 与插件就绪，通过 Qt WebEngine 渲染工作区，并提供原生恢复状态。</p>
    </td>
    <td width="50%" valign="top">
      <h3>双扩展平面</h3>
      <p>TypeScript 和 React 插件负责 Harness 业务功能；Qt 和 C++ 扩展负责窗口、通知、快捷键和本地设备集成等桌面能力。</p>
    </td>
  </tr>
</table>

## 架构

Qt 应用是进程监督器和浏览器宿主，不是 Harness 运行时的第二套实现。[架构文档](docs/architecture.md)负责说明插件模型，[Qt 外壳指南](qt-shell/README.md)负责说明桌面构建和启动细节。

```text
Qt 6 desktop process
├── QProcess ──────────> pnpm dsh web ──> Cordis plugin graph
└── QWebEngineView ───> http://127.0.0.1:3080 ──> React Web UI
```

Harness 持有业务状态和插件生命周期；Qt 只持有子进程、原生窗口和明确的桌面集成点。

<a id="run"></a>

## 快速开始

<a id="run-from-source"></a>

### 在 macOS 上构建 Qt 6 桌面外壳

安装 Homebrew、包含 WebEngine 的 Qt 6、CMake 和受支持的 Node.js 版本（`^22.19.0` 或 `>=24.0.0`），然后构建完整源码树：

```sh
brew install qt node@22 cmake
export PATH="$(brew --prefix node@22)/bin:$PATH"

git clone https://github.com/Enactivism/deepseek-harness.git
cd deepseek-harness
corepack pnpm install --frozen-lockfile
corepack pnpm build

cmake -S qt-shell -B qt-shell/build -DCMAKE_PREFIX_PATH="$(brew --prefix qt)"
cmake --build qt-shell/build --parallel
open qt-shell/build/deepseek-harness-qt.app
```

可执行文件发现、`DSH_ROOT`、启动就绪检查和故障排查见 [Qt 外壳指南](qt-shell/README.md)。

### 在 Ubuntu 上构建 Qt 6 桌面外壳

安装 Qt 6、Qt WebEngine、CMake 和编译工具：

```bash
sudo apt update
sudo apt install qt6-base-dev qt6-webengine-dev qt6-webengine-dev-tools \
  cmake build-essential
```

构建 Harness 和 Qt 桌面外壳：

```bash
cd /home/chacha/repo/deepseek-harness
corepack enable
corepack prepare pnpm@11.7.0 --activate
corepack pnpm install --frozen-lockfile
corepack pnpm build
cmake -S qt-shell -B qt-shell/build
cmake --build qt-shell/build --parallel
```

Linux 生成普通可执行文件，按以下方式启动：

```bash
DSH_ROOT="$PWD" \
PNPM_EXECUTABLE="$(command -v corepack)" \
./qt-shell/build/deepseek-harness-qt
```

如果启动失败，请检查显卡驱动和 OpenGL 版本。也可以禁用 GPU 加速并使用软件渲染：

```bash
export QTWEBENGINE_DISABLE_GPU=1
export QT_QUICK_BACKEND=software
export QT_WEBENGINE_RENDERER=software

DSH_ROOT="$PWD" \
PNPM_EXECUTABLE="$(command -v corepack)" \
./qt-shell/build/deepseek-harness-qt
```

### 通过 npm 启动 Web UI

安装 Node.js，然后直接启动上游发布的包：

```sh
npx @deepseek-ai/dsh web
```

Web UI 默认监听 `http://127.0.0.1:3080`。更多信息见 [Web UI 指南](docs/user/guide/index.md)。

## 插件开发

- Host 插件使用 TypeScript 提供服务、工具、事件、持久化和 agent 行为。
- Client 插件使用 React 与 Harness 客户端运行时贡献 slot、设置页和工作区面板。
- 功能需要操作系统访问时，原生桌面扩展使用 Qt 和 C++，并通过窄 IPC 或 HTTP 接口与 Harness 连接。

开发前请阅读[架构文档](docs/architecture.md)、[插件管理参考](apps/cli/reference/README.md#plugin-management)和[开发指南](docs/development.md)。

## 与上游的关系

核心运行时、npm 包、插件系统和 Web UI 来自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。[Enactivism 维护版](https://github.com/Enactivism/deepseek-harness)负责下游桌面与集成工作，不改变上游 npm 包命名空间。

> 本仓库是社区维护的下游版本，并非 DeepSeek 官方产品。

## 参与贡献与支持

- 修改仓库前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
- Enactivism 维护版和 Qt 外壳问题请提交到 [Enactivism issues](https://github.com/Enactivism/deepseek-harness/issues)。
- 上游产品问题与贡献请提交到[上游仓库](https://github.com/deepseek-ai/deepseek-harness)。

## 许可证

本项目遵循 [MIT License](LICENSE)。第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
