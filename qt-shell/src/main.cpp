#include "harness_window.h"

#include <QApplication>
#include <QByteArray>

namespace {
void configureWebEngineGraphics() {
    // These deployment variables disable Chromium's WebGL context entirely;
    // the shell uses Chromium's SwiftShader path instead.
    qunsetenv("QTWEBENGINE_DISABLE_GPU");
    qunsetenv("QT_WEBENGINE_RENDERER");
    qunsetenv("QT_QUICK_BACKEND");
    // Transparent WebEngine surfaces need Chromium's transparent visual path;
    // without it the native window is composited as an opaque rectangle.
    QByteArray flags = qgetenv("QTWEBENGINE_CHROMIUM_FLAGS");
    constexpr const char *required[] = {
        "--enable-gpu",
        "--enable-webgl",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--enable-transparent-visuals",
    };
    for (const auto *flag : required) {
        if (flags.contains(flag)) continue;
        if (!flags.isEmpty()) flags.append(' ');
        flags.append(flag);
    }
    qputenv("QTWEBENGINE_CHROMIUM_FLAGS", flags);
}
}

int main(int argc, char *argv[]) {
    configureWebEngineGraphics();
    QApplication app(argc, argv);
    QApplication::setApplicationName("DeepSeek Harness");
    QApplication::setApplicationDisplayName("DeepSeek Harness");
    QApplication::setOrganizationName("DeepSeek");

    HarnessWindow window;
    window.show();
    return app.exec();
}
