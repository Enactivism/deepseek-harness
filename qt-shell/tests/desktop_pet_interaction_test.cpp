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

    desktop_pet::HoverPresence hover;
    expect(hover.observeCursor(true) && hover.inside(),
           "a pointer initially inside the pet must reveal the frame");
    expect(hover.leave() && !hover.inside(),
           "leaving the pet must hide the frame before another application receives input");
    expect(!hover.observeCursor(true) && !hover.inside(),
           "a cursor position frozen inside the pet must not reveal the frame after exit");
    expect(hover.enter() && hover.inside(),
           "entering the pet again must restore the frame");
    expect(hover.observeCursor(false) && !hover.inside(),
           "a cursor position outside the pet must hide the frame");
    expect(!hover.observeCursor(true) && !hover.inside(),
           "a cursor poll alone must not undo an observed exit");
    expect(hover.enter() && hover.inside(),
           "a mouse event delivered to the pet must clear the exit state");

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

    const QRect enlarged = desktop_pet::wheelResizedGeometry(
        {100, 200, 360, 480}, 1, {24, 32}, {240, 320});
    expect(enlarged == QRect(88, 168, 384, 512),
           "enlarging must preserve the bottom-center anchor");
    const QRect minimum = desktop_pet::wheelResizedGeometry(
        enlarged, -20, {24, 32}, {240, 320});
    expect(minimum == QRect(160, 360, 240, 320),
           "shrinking must stop at the minimum window size");

    expect(desktop_pet::isPetControlArea({250, 440}, {360, 480}, {160, 64}),
           "the Galgame button must receive click and double-click events");
    expect(desktop_pet::isPetControlArea({320, 440}, {360, 480}, {160, 64}),
           "the chat button must receive click and double-click events");
    expect(!desktop_pet::isPetControlArea({190, 440}, {360, 480}, {160, 64}),
           "the model surface must keep native pet gestures outside the controls");
    expect(!desktop_pet::isPetControlArea({250, 400}, {360, 480}, {160, 64}),
           "the model surface above the controls must keep native pet gestures");

    const QString scale_script = desktop_pet::desktopPetScaleScript(1.066667);
    expect(scale_script.contains(QStringLiteral("dsh-desktop-pet-scale"))
               && scale_script.contains(QStringLiteral("scale: 1.066667")),
           "the synchronized window scale must be sent to the page");

    const QString pointer_script = desktop_pet::pointerMoveScript({-32, 600}, {1920, 1300});
    expect(pointer_script.contains(QStringLiteral("clientX: -32")),
           "pointer script must preserve coordinates left of the pet window");
    expect(pointer_script.contains(QStringLiteral("clientY: 600")),
           "pointer script must preserve coordinates below the pet window");
    expect(pointer_script.contains(QStringLiteral("screenX: 1920"))
               && pointer_script.contains(QStringLiteral("screenY: 1300"))
               && pointer_script.contains(QStringLiteral("view: window")),
           "pointer script must retain the global event fields used by page listeners");

    const QString hover_frame_script = desktop_pet::desktopPetHoverFrameScript();
    expect(hover_frame_script.contains(QStringLiteral("dsh-desktop-pet-hover-frame"))
               && hover_frame_script.contains(
                   QStringLiteral("border: '3px solid rgb(57, 255, 136)'"))
               && hover_frame_script.contains(QStringLiteral("pointerEvents: 'none'")),
           "the hover frame must draw a non-interactive green window edge");
    expect(hover_frame_script.contains(QStringLiteral("duration: 700"))
               && hover_frame_script.contains(
                   QStringLiteral("'dsh-desktop-pet-hover-frame-visibility'"))
               && hover_frame_script.contains(QStringLiteral("animation.play()"))
               && hover_frame_script.contains(QStringLiteral("animation.cancel()")),
           "native hover updates must start and stop the frame pulse");
    expect(hover_frame_script.contains(QStringLiteral("dshDesktopPetChat")),
           "the separate chat window must opt out of the pet hover frame");

    const QString hover_visible_script =
        desktop_pet::desktopPetHoverFrameVisibilityScript(true);
    const QString hover_hidden_script =
        desktop_pet::desktopPetHoverFrameVisibilityScript(false);
    expect(hover_visible_script.contains(QStringLiteral("visible:true"))
               && hover_hidden_script.contains(QStringLiteral("visible:false"))
               && hover_visible_script.contains(
                   QStringLiteral("dsh-desktop-pet-hover-frame-visibility")),
           "the native window must send both hover-frame visibility states");
    return failures == 0 ? 0 : 1;
}
