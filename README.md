# DeepSeek Harness

English | [中文](README.zh.md)

<p align="center">
  <a href="https://github.com/Enactivism/deepseek-harness/stargazers"><img src="https://img.shields.io/github/stars/Enactivism/deepseek-harness?style=flat-square&amp;label=%E2%98%85&amp;color=08C" alt="GitHub stars"></a>
  <a href="https://github.com/Enactivism"><img src="https://img.shields.io/badge/maintained%20by-Enactivism-47848F?style=flat-square" alt="Maintained by Enactivism"></a>
  <img src="https://img.shields.io/badge/architecture-everything%20is%20a%20plugin-4493F8?style=flat-square" alt="Everything is a plugin">
  <img src="https://img.shields.io/badge/desktop-Qt%206-41CD52?style=flat-square&amp;logo=qt&amp;logoColor=white" alt="Qt 6 desktop shell">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square" alt="MIT License"></a>
</p>

<h3 align="center">Plugin-native agent harness. Native desktop entry.</h3>

<p align="center">An Enactivism-maintained distribution of DeepSeek Harness with its Cordis runtime, React workspace, and a Qt 6 desktop shell.</p>

## Overview

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com). [Cordis](https://github.com/cordiverse/cordis) supplies its composition runtime, following the design described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

This repository is the Enactivism-maintained downstream distribution. It preserves the upstream plugin runtime and Web UI while adding a Qt 6 desktop entry point and organization-owned integration work.

> [!IMPORTANT]
>
> The project is in developer preview and may introduce compatibility-breaking changes.

## Distribution components

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Plugin runtime</h3>
      <p>Models, tools, sessions, workflows, settings, and UI contributions join the same Cordis plugin graph instead of accumulating in a monolithic loop.</p>
    </td>
    <td width="50%" valign="top">
      <h3>Web workspace</h3>
      <p>The local React workspace provides conversations, tools, model selection, settings, jobs, and plugin-contributed panels at <code>127.0.0.1:3080</code>.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Qt 6 desktop shell</h3>
      <p>The native shell supervises <code>dsh web</code>, waits for HTTP and plugin readiness, renders the workspace through Qt WebEngine, and presents native recovery states.</p>
    </td>
    <td width="50%" valign="top">
      <h3>Two extension planes</h3>
      <p>TypeScript and React plugins own Harness business features. Qt and C++ extensions own desktop capabilities such as windows, notifications, shortcuts, and local device integration.</p>
    </td>
  </tr>
</table>

## Architecture

The Qt application is a process supervisor and browser host, not a second implementation of the Harness runtime. The [architecture documentation](docs/architecture.md) owns the plugin model, and the [Qt shell guide](qt-shell/README.md) owns desktop build and launch details.

```text
Qt 6 desktop process
├── QProcess ──────────> pnpm dsh web ──> Cordis plugin graph
└── QWebEngineView ───> http://127.0.0.1:3080 ──> React Web UI
```

Harness retains business state and plugin lifecycle ownership. Qt owns the child process, native window, and explicit desktop integration points.

<a id="run"></a>

## Quick start

<a id="run-from-source"></a>

### Qt 6 desktop shell on macOS

Install Homebrew, Qt 6 with WebEngine, CMake, and a supported Node.js release (`^22.19.0` or `>=24.0.0`), then build the complete source tree:

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

See the [Qt shell guide](qt-shell/README.md) for executable discovery, `DSH_ROOT`, startup readiness, and troubleshooting.

### Web UI from npm

Install Node.js and start the upstream-published package directly:

```sh
npx @deepseek-ai/dsh web
```

The Web UI listens on `http://127.0.0.1:3080` by default. See the [Web UI guide](docs/user/guide/index.md).

## Plugin development

- Host plugins use TypeScript to provide services, tools, events, persistence, and agent behavior.
- Client plugins use React and the Harness client runtime to contribute slots, settings, and workspace panels.
- Native desktop extensions use Qt and C++ behind a narrow IPC or HTTP interface when a feature requires operating-system access.

Start with the [architecture documentation](docs/architecture.md), [plugin management reference](apps/cli/reference/README.md#plugin-management), and [development guide](docs/development.md).

## Relationship to upstream

The core runtime, npm packages, plugin system, and Web UI originate in [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). The [Enactivism distribution](https://github.com/Enactivism/deepseek-harness) maintains downstream desktop and integration work without changing the upstream package namespace.

> This is a community-maintained downstream distribution, not an official DeepSeek product.

## Contributing and support

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing the repository.
- Report Enactivism distribution and Qt shell problems through [Enactivism issues](https://github.com/Enactivism/deepseek-harness/issues).
- Send upstream product questions and contributions to the [upstream repository](https://github.com/deepseek-ai/deepseek-harness).

## License

The project is licensed under the [MIT License](LICENSE). Third-party dependencies and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
