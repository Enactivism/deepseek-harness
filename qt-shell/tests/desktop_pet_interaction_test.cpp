#include "desktop_pet_interaction.h"

#include <QDebug>

namespace {
int failures = 0;

void expect(bool condition, const char *message) {
    if (condition) return;
    qCritical() << message;
    ++failures;
}
}

int main() {
    expect(desktop_pet::shouldPreferXcbPlatform({}, "wayland-0", ":1"),
           "Wayland sessions with XWayland must prefer the xcb backend");
    expect(!desktop_pet::shouldPreferXcbPlatform("wayland", "wayland-0", ":1"),
           "an explicit Qt platform must override the desktop-pet default");
    expect(!desktop_pet::shouldPreferXcbPlatform({}, "wayland-0", {}),
           "pure Wayland sessions must retain their available backend");
    expect(desktop_pet::supportsGlobalPointerTracking(QStringLiteral("xcb")),
           "the xcb backend must enable desktop pointer polling");
    expect(!desktop_pet::supportsGlobalPointerTracking(QStringLiteral("wayland-egl")),
           "native Wayland must not poll stale global coordinates");
    expect(!desktop_pet::supportsGlobalPointerTracking(QStringLiteral("offscreen")),
           "headless backends must not claim desktop pointer support");

    int wheel_remainder = 0;
    expect(desktop_pet::consumeWheelSteps(60, wheel_remainder) == 0
               && wheel_remainder == 60,
           "partial wheel input must be retained");
    expect(desktop_pet::consumeWheelSteps(60, wheel_remainder) == 1
               && wheel_remainder == 0,
           "accumulated wheel input must produce a complete step");
    expect(desktop_pet::consumeWheelSteps(-240, wheel_remainder) == -2
               && wheel_remainder == 0,
           "wheel input toward the user must produce shrinking steps");

    const QRect initial(100, 100, 360, 480);
    expect(desktop_pet::wheelResizedGeometry(initial, 1, {24, 32}, {240, 320})
               == QRect(88, 68, 384, 512),
           "wheel growth must preserve the bottom-center anchor");
    expect(desktop_pet::wheelResizedGeometry(initial, -10, {24, 32}, {240, 320})
               == QRect(160, 260, 240, 320),
           "wheel shrinking must preserve the anchor and minimum dimensions");

    expect(desktop_pet::isChatInteractionArea({40, 40}, {360, 480}, true, 64),
           "an open chat panel must receive interaction across the pet window");
    expect(desktop_pet::isChatInteractionArea({320, 440}, {360, 480}, false, 64),
           "the closed chat button area must receive interaction");
    expect(!desktop_pet::isChatInteractionArea({100, 100}, {360, 480}, false, 64),
           "the model surface must keep native pet gestures while chat is closed");

    const QString pointer_script = desktop_pet::pointerMoveScript({-32, 600});
    expect(pointer_script.contains(QStringLiteral("clientX: -32")),
           "pointer script must preserve coordinates left of the pet window");
    expect(pointer_script.contains(QStringLiteral("clientY: 600")),
           "pointer script must preserve coordinates below the pet window");
    return failures == 0 ? 0 : 1;
}
