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

Startup diagnostics use the `[deepseek-harness-qt]` prefix on standard error.

The validated macOS arm64 build artifact is `qt-shell/build/deepseek-harness-qt.app`.
