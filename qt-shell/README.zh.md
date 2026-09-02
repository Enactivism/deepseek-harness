# DeepSeek Harness Qt 桌面外壳

[English](README.md) | 中文

本目录包含 DeepSeek Harness 的 Qt 6 桌面外壳。它不重复实现 Harness Web UI 或插件运行时，而是：

1. 通过 `QProcess` 启动 `pnpm dsh web`；
2. 通过 `QWebEngineView` 加载 `http://127.0.0.1:3080`；
3. 关闭窗口时终止由它持有的 Harness 服务。

## 在 macOS 上构建

桌面外壳需要 Qt 6、Qt WebEngine、CMake、受支持的 Node.js 版本（`^22.19.0` 或 `>=24.0.0`），以及 pnpm 或 Corepack。在使用 Homebrew 的 macOS 上，通过以下命令安装原生依赖：

```bash
brew install qt node@22
```

本机验证环境使用 Qt 6.11.1，安装路径为 `/opt/homebrew/opt/qt`。

```bash
cd /path/to/deepseek-harness
pnpm install
pnpm build

cmake -S qt-shell -B qt-shell/build \
  -DCMAKE_PREFIX_PATH=/opt/homebrew/opt/qt
cmake --build qt-shell/build
```

如果系统没有独立的 `pnpm`，将两条 pnpm 命令替换为 `corepack pnpm install` 和 `corepack pnpm build`。如果 `~/.npmrc` 包含不可用的代理，仅在本次安装中绕过用户配置：

```bash
NPM_CONFIG_USERCONFIG=/dev/null corepack pnpm install --frozen-lockfile
NPM_CONFIG_USERCONFIG=/dev/null corepack pnpm build
```

CMake 会将当前 Harness 工作副本写入应用，作为默认源码根目录。设置 `DSH_ROOT` 可以覆盖该路径：

```bash
DSH_ROOT=/path/to/deepseek-harness \
  qt-shell/build/deepseek-harness-qt.app/Contents/MacOS/deepseek-harness-qt
```

Finder 使用精简的 `PATH` 启动应用。自动 Corepack 和 pnpm 发现无法找到所需可执行文件时，请设置 `PNPM_EXECUTABLE`：

```bash
DSH_ROOT=/path/to/deepseek-harness \
PNPM_EXECUTABLE=/path/to/pnpm \
  qt-shell/build/deepseek-harness-qt.app/Contents/MacOS/deepseek-harness-qt
```

启动 `dsh web` 后，外壳会轮询 `127.0.0.1:3080` 的 HTTP 就绪状态，再等待前端插件图稳定。如果 Qt WebEngine 首次读取到 `Loading plugins…`，外壳会自动重试。

选择 Live2D 模型后，网页会提供“桌宠模式”。进入后，外壳创建第二个 WebEngine 视图并放入无边框、置顶的 360x480 小窗，同时保持主工作区窗口打开且不变。按住鼠标左键拖动可移动桌宠窗口，双击关闭桌宠窗口。所选模型通过同源 IndexedDB 共享，因此不需要重新选择文件。

当主机 GPU 不可用时，外壳为两个 WebEngine 视图启用 WebGL2，并允许 Chromium 使用 SwiftShader 回退。外壳会清除会在 Chromium 启动前禁用或替换 WebGL 图形路径的 `QTWEBENGINE_DISABLE_GPU`、`QT_WEBENGINE_RENDERER` 和 `QT_QUICK_BACKEND`。外壳保留 Qt 按平台选择的 GL 实现，因为部分 Qt WebEngine 构建不接受显式 ANGLE/SwiftShader 实现参数。可以通过 `QTWEBENGINE_CHROMIUM_FLAGS` 覆盖部署环境的图形参数；外壳会保留已有值，只有在缺少 `--enable-webgl` 时才追加所需 WebGL 参数。

启动诊断信息通过标准错误输出，并使用 `[deepseek-harness-qt]` 前缀。

经过验证的 macOS arm64 构建产物为 `qt-shell/build/deepseek-harness-qt.app`。

## 在 Ubuntu 上构建 Qt 6 桌面外壳

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
