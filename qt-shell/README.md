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

After selecting a Live2D model, the Web client offers `Desktop pet`. This opens a second WebEngine view in a frameless, always-on-top 360x480 window while leaving the main workspace window open and unchanged. A non-interactive green frame pulses at the window edge while the pointer is inside and disappears when the pointer leaves, restoring the transparent frameless appearance. Move the pointer anywhere on the desktop to direct the model's gaze, drag the model area with the left mouse button to reposition the window, scroll up over the model to enlarge both the model and its window or down to shrink them, and double-click the model area to close it. The chat and Galgame buttons receive clicks without starting a drag or closing the pet. Each complete wheel step keeps the model and native window at the same scale, preserves the bottom-center anchor, and stops shrinking at 240x320. The main workspace, pet, and chat pages share a named persistent WebEngine profile whose IndexedDB data is stored under the system application-data directory, so the selected model is restored after an application restart and is not stored in the repository. A profile with no saved model requires one folder selection before automatic restoration can begin.

The chat button in the pet window opens a separate, normally decorated and resizable chat window. That window hosts a compact conversation backed by its own Harness Session and exposes the same provider/model and reasoning-effort selector as the main interface. Its messages and model context are separate from the main workspace chat, and opening it does not change the main window's persisted current Session. The pet window keeps its own drag, scaling, and double-click exit gestures while the chat window can be resized independently.

The pet window's leave event hides the green frame immediately, including when the pointer moves to the desktop or another application. A global cursor poll cannot show it again until the pet receives a new enter or mouse event, even if XWayland still reports an in-window cursor position.

On a Linux Wayland session with XWayland available through `DISPLAY`, the shell selects Qt's `xcb` backend so the desktop pet can read global pointer coordinates and retain explicit window placement. The pointer timer queries X11's root window directly, which avoids using a stale Qt cursor value after the pointer crosses into another surface. An explicit `QT_QPA_PLATFORM` value takes precedence. A pure Wayland session keeps native Wayland behavior: wheel model scaling works, but the model can follow the pointer only while it is over a surface owned by the application because the protocol does not expose desktop-global coordinates to clients.

For GNOME Wayland, build and enable the bundled GNOME Shell extension to follow the pointer over native Wayland windows, including the desktop and Chrome:

```bash
cmake --build qt-shell/build --target dsh-pointer-extension
gnome-extensions install --force qt-shell/build/dsh-pointer@deepseek.ai.zip
gnome-extensions enable dsh-pointer@deepseek.ai
```

The extension reads GNOME Shell's compositor-global pointer position and publishes it over the session bus. The Qt shell uses that source when it is available and falls back to the X11 source on XWayland. Disable the extension when the desktop pet is not in use if global pointer access is not desired.

The shell enables WebGL2 for both WebEngine views with Chromium's SwiftShader fallback when the host GPU is unavailable. It clears `QTWEBENGINE_DISABLE_GPU`, `QT_WEBENGINE_RENDERER`, and `QT_QUICK_BACKEND`, which would disable or replace the WebGL-capable graphics path before Chromium starts. It leaves Qt's platform-selected GL implementation unchanged because some Qt WebEngine builds reject explicit ANGLE/SwiftShader implementation flags. Override `QTWEBENGINE_CHROMIUM_FLAGS` to provide deployment-specific graphics flags; the shell preserves an existing value and only adds the required WebGL flags when `--enable-webgl` is absent.

Startup diagnostics use the `[deepseek-harness-qt]` prefix on standard error.

The validated macOS arm64 build artifact is `qt-shell/build/deepseek-harness-qt.app`.

## Build the Qt 6 desktop shell on Ubuntu

Install Qt 6, Qt WebEngine, CMake, and the build tools:

```bash
sudo apt update
sudo apt install qt6-base-dev qt6-webengine-dev qt6-webengine-dev-tools \
  libx11-dev cmake build-essential
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
