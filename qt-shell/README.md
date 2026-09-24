# DeepSeek Harness Qt shell

English | [中文](README.zh.md)

This directory contains the Qt 6 desktop shell for DeepSeek Harness. It does not duplicate the Harness Web UI or plugin runtime. Instead, it:

1. starts `pnpm dsh web` through `QProcess`;
2. loads `http://127.0.0.1:3080` through `QWebEngineView`;
3. terminates the Harness service it owns when the window closes.

## Build

The shell requires Qt 6, Qt WebEngine, CMake, a supported Node.js release (`^22.19.0` or `>=24.0.0`), and pnpm or Corepack. On macOS with Homebrew, install the native dependencies with:

```bash
brew install qt node@22
```

The validated local environment uses Qt 6.11.1 at `/opt/homebrew/opt/qt`.

```bash
cd /path/to/deepseek-harness
pnpm install
pnpm build

cmake -S qt-shell -B qt-shell/build \
  -DCMAKE_PREFIX_PATH=/opt/homebrew/opt/qt
cmake --build qt-shell/build
ctest --test-dir qt-shell/build --output-on-failure
```

If the system has no standalone `pnpm`, replace the two pnpm commands with `corepack pnpm install` and `corepack pnpm build`. If `~/.npmrc` contains an unavailable proxy, bypass the user configuration for this installation only:

```bash
NPM_CONFIG_USERCONFIG=/dev/null corepack pnpm install --frozen-lockfile
NPM_CONFIG_USERCONFIG=/dev/null corepack pnpm build
```

CMake embeds the current Harness checkout as the default source root. Set `DSH_ROOT` to override it:

```bash
DSH_ROOT=/path/to/deepseek-harness \
  qt-shell/build/deepseek-harness-qt.app/Contents/MacOS/deepseek-harness-qt
```

Finder launches applications with a reduced `PATH`. Set `PNPM_EXECUTABLE` when automatic Corepack and pnpm discovery cannot find the required executable:

```bash
DSH_ROOT=/path/to/deepseek-harness \
PNPM_EXECUTABLE=/path/to/pnpm \
  qt-shell/build/deepseek-harness-qt.app/Contents/MacOS/deepseek-harness-qt
```

After starting `dsh web`, the shell polls `127.0.0.1:3080` for HTTP readiness and then waits for the frontend plugin graph to settle. If Qt WebEngine first observes `Loading plugins…`, the shell retries automatically.

After selecting a Live2D model, the Web client offers `Desktop pet`. This opens a second WebEngine view in a frameless, always-on-top 360x480 window while leaving the main workspace window open and unchanged. Move the pointer anywhere on the desktop to direct the model's gaze, drag the model area with the left mouse button to reposition the window, scroll up over the model to enlarge both the model and its window or down to shrink them, and double-click the model area to close it. The chat and Galgame buttons receive clicks without starting a drag or closing the pet. Each complete wheel step keeps the model and native window at the same scale, preserves the bottom-center anchor, and stops shrinking at 240x320. The selected model is shared through same-origin IndexedDB, so it does not need to be selected again.

The chat button in the pet window opens a separate, normally decorated and resizable chat window. That window hosts a compact conversation backed by its own Harness Session and exposes the same provider/model and reasoning-effort selector as the main interface. Its messages and model context are separate from the main workspace chat, and opening it does not change the main window's persisted current Session. The pet window keeps its own drag, scaling, and double-click exit gestures while the chat window can be resized independently.

On a Linux Wayland session with XWayland available through `DISPLAY`, the shell selects Qt's `xcb` backend so the desktop pet can read global pointer coordinates and retain explicit window placement. An explicit `QT_QPA_PLATFORM` value takes precedence. A pure Wayland session keeps native Wayland behavior: wheel model scaling works, but the model can follow the pointer only while it is over a surface owned by the application because the protocol does not expose desktop-global coordinates to clients.

The shell enables WebGL2 for both WebEngine views with Chromium's SwiftShader fallback when the host GPU is unavailable. It clears `QTWEBENGINE_DISABLE_GPU`, `QT_WEBENGINE_RENDERER`, and `QT_QUICK_BACKEND`, which would disable or replace the WebGL-capable graphics path before Chromium starts. It leaves Qt's platform-selected GL implementation unchanged because some Qt WebEngine builds reject explicit ANGLE/SwiftShader implementation flags. Override `QTWEBENGINE_CHROMIUM_FLAGS` to provide deployment-specific graphics flags; the shell preserves an existing value and only adds the required WebGL flags when `--enable-webgl` is absent.

Startup diagnostics use the `[deepseek-harness-qt]` prefix on standard error.

The validated macOS arm64 build artifact is `qt-shell/build/deepseek-harness-qt.app`.

## Build the Qt 6 desktop shell on Ubuntu

Install Qt 6, Qt WebEngine, CMake, and the build tools:

```bash
sudo apt update
sudo apt install qt6-base-dev qt6-webengine-dev qt6-webengine-dev-tools \
  cmake build-essential
```

Build Harness and the Qt desktop shell:

```bash
cd /home/chacha/repo/deepseek-harness
corepack enable
corepack prepare pnpm@11.7.0 --activate
corepack pnpm install --frozen-lockfile
corepack pnpm build
cmake -S qt-shell -B qt-shell/build
cmake --build qt-shell/build --parallel
```

Linux produces a regular executable. Start it with:

```bash
DSH_ROOT="$PWD" \
PNPM_EXECUTABLE="$(command -v corepack)" \
./qt-shell/build/deepseek-harness-qt
```

If startup fails, check the graphics driver and OpenGL version. Software rendering is also available:

```bash
export QTWEBENGINE_DISABLE_GPU=1
export QT_QUICK_BACKEND=software
export QT_WEBENGINE_RENDERER=software

DSH_ROOT="$PWD" \
PNPM_EXECUTABLE="$(command -v corepack)" \
./qt-shell/build/deepseek-harness-qt
```
