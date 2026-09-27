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
ctest --test-dir qt-shell/build --output-on-failure
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

选择 Live2D 模型后，网页会提供“桌宠模式”。进入后，外壳创建第二个 WebEngine 视图并放入无边框、置顶的 360x480 小窗，同时保持主工作区窗口打开且不变。鼠标位于窗口内部时，不接收输入的绿色边缘会持续明暗闪烁；鼠标移出后边缘消失，窗口恢复透明无边框外观。鼠标移动到桌面任意位置都能引导模型视线；按住鼠标左键拖动模型区域可移动桌宠，在模型区域向上滚动滚轮会同步放大模型和窗口，向下滚动会同步缩小二者；每个完整滚轮步长都会保持模型与原生窗口的相同比例、保持底部中心锚点，窗口最小为 240x320。双击模型区域可关闭桌宠窗口；点击聊天和 Galgame 按钮不会开始拖动或关闭桌宠。主工作区、桌宠和聊天页面共用一个命名的持久化 WebEngine profile，IndexedDB 数据保存在系统应用数据目录中，因此应用重启后会自动恢复所选模型，模型文件也不会存入仓库。尚未保存过模型的配置需先选择一次文件夹，之后才能自动恢复。

桌宠窗口中的聊天按钮会打开一个带系统边框且可独立调整大小的聊天窗口。该窗口承载由独立 Harness Session 提供的紧凑对话，并像主界面一样提供服务商/模型和推理等级选择器。其消息与模型上下文同主工作区聊天相互隔离，打开聊天也不会改变主窗口持久化的当前 Session。桌宠窗口仍可独立拖动、缩放和双击退出，聊天窗口可单独调整大小。

桌宠窗口的离开事件会立即隐藏绿色边缘，包括鼠标移到桌面或其他应用时。桌宠收到新的进入或鼠标事件前，全局鼠标轮询不会重新显示边缘，即使 XWayland 此时仍报告窗口内的旧坐标。

Linux Wayland 会话通过 `DISPLAY` 提供 XWayland 时，外壳会选择 Qt 的 `xcb` 后端，使桌宠能读取全局鼠标坐标并保持显式窗口位置。指针定时器会直接查询 X11 root window，避免鼠标移入其他 surface 后继续使用 Qt 缓存的旧坐标；显式设置的 `QT_QPA_PLATFORM` 优先。纯 Wayland 会话会保留原生 Wayland 行为：滚轮模型缩放仍可使用，但协议不会向客户端提供桌面全局坐标，因此模型只能在鼠标位于本应用持有的 surface 上时追踪鼠标。

在 GNOME Wayland 下，如果需要追踪原生 Wayland 窗口（包括桌面和 Chrome）中的鼠标，请构建并启用仓库附带的 GNOME Shell 扩展：

```bash
cmake --build qt-shell/build --target dsh-pointer-extension
gnome-extensions install --force qt-shell/build/dsh-pointer@deepseek.ai.zip
gnome-extensions enable dsh-pointer@deepseek.ai
```

扩展在 GNOME Shell 内读取合成器提供的桌面全局指针坐标，并通过 session bus 发布。Qt 外壳检测到该来源时优先使用它，否则回退到 XWayland 的 X11 来源。不使用桌宠时可以禁用扩展，以避免持续提供全局鼠标坐标。

当主机 GPU 不可用时，外壳为两个 WebEngine 视图启用 WebGL2，并允许 Chromium 使用 SwiftShader 回退。外壳会清除会在 Chromium 启动前禁用或替换 WebGL 图形路径的 `QTWEBENGINE_DISABLE_GPU`、`QT_WEBENGINE_RENDERER` 和 `QT_QUICK_BACKEND`。外壳保留 Qt 按平台选择的 GL 实现，因为部分 Qt WebEngine 构建不接受显式 ANGLE/SwiftShader 实现参数。可以通过 `QTWEBENGINE_CHROMIUM_FLAGS` 覆盖部署环境的图形参数；外壳会保留已有值，只有在缺少 `--enable-webgl` 时才追加所需 WebGL 参数。

启动诊断信息通过标准错误输出，并使用 `[deepseek-harness-qt]` 前缀。

经过验证的 macOS arm64 构建产物为 `qt-shell/build/deepseek-harness-qt.app`。

## 在 Ubuntu 上构建 Qt 6 桌面外壳

安装 Qt 6、Qt WebEngine、CMake 和编译工具：

```bash
sudo apt update
sudo apt install qt6-base-dev qt6-webengine-dev qt6-webengine-dev-tools \
  libx11-dev cmake build-essential
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
