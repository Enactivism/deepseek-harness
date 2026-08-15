# DeepSeek Harness Qt shell

这是 DeepSeek Harness 的 Qt 6 桌面容器。它不复制 Harness 的 Web/插件逻辑，而是：

1. 通过 `QProcess` 启动 `pnpm dsh web`；
2. 通过 `QWebEngineView` 加载 `http://127.0.0.1:3080`；
3. 关闭窗口时终止由它启动的 Harness 服务。

## 构建

需要 Qt 6、Qt WebEngine、CMake、Node.js 22+ 和 pnpm（也可以使用 Node 自带的 Corepack）。macOS + Homebrew 可直接安装：

```bash
brew install qt node@22
```

本机验证使用 Qt 6.11.1，安装前缀为 `/opt/homebrew/opt/qt`。

```bash
cd /path/to/deepseek-harness-src
pnpm install
pnpm build

cmake -S qt-shell -B qt-shell/build \
  -DCMAKE_PREFIX_PATH=/opt/homebrew/opt/qt
cmake --build qt-shell/build
```

如果系统没有独立的 `pnpm`，可以把上面两条命令替换为 `corepack pnpm install` 和
`corepack pnpm build`。如果本机 `~/.npmrc` 配置了不可用的代理，安装时临时绕过用户配置：

```bash
NPM_CONFIG_USERCONFIG=/dev/null corepack pnpm install --frozen-lockfile
NPM_CONFIG_USERCONFIG=/dev/null corepack pnpm build
```

构建时，CMake 会把当前 Harness 源码目录写入 `.app` 作为默认根目录；也可以通过 `DSH_ROOT`
覆盖它：

```bash
DSH_ROOT=/path/to/deepseek-harness-src \
  qt-shell/build/deepseek-harness-qt.app/Contents/MacOS/deepseek-harness-qt
```

如果从 Finder 启动导致 Qt 找不到 `pnpm`，可以显式指定：

```bash
DSH_ROOT=/path/to/deepseek-harness-src \
PNPM_EXECUTABLE=/path/to/pnpm \
  qt-shell/build/deepseek-harness-qt.app/Contents/MacOS/deepseek-harness-qt
```

外壳会按以下顺序处理启动：启动 `dsh web` 后轮询 `127.0.0.1:3080` 的 HTTP 状态，确认服务
可访问后再等待前端插件图稳定；若 WebEngine 首次加载时仍处于 `Loading plugins…`，会自动重试。
因此 Finder 的精简 `PATH` 不再是必要条件，Qt 会自动尝试 Homebrew Node 22 的 Corepack 和本机
fallback pnpm 路径。

启动诊断信息会输出到终端，前缀为 `[deepseek-harness-qt]`。

构建产物是 macOS arm64 `.app`：
`qt-shell/build/deepseek-harness-qt.app`。
