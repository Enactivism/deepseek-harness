#pragma once

#include <QByteArray>
#include <QPoint>
#include <QRect>
#include <QSize>
#include <QString>

namespace desktop_pet {

/** Whether a Wayland session should use XWayland for global pet interactions. */
bool shouldPreferXcbPlatform(const QByteArray &configured_platform,
                             const QByteArray &wayland_display,
                             const QByteArray &x_display);

/** Whether the selected Qt platform exposes usable desktop-global coordinates. */
bool supportsGlobalPointerTracking(const QString &platform_name);

/** Tracks hover while rejecting cursor positions cached after a native leave. */
class HoverPresence {
public:
    /** Whether the pointer is currently inside the pet window. */
    bool inside() const;

    /** Accept a native entry or a mouse event delivered to the pet. */
    bool enter();

    /** Accept a native exit or a mouse event delivered outside the pet. */
    bool leave();

    /** Accept a polled cursor position; an inside value cannot undo a leave. */
    bool observeCursor(bool inside);

private:
    bool inside_ = false;
    bool left_surface_ = false;
};

/** Accumulate wheel angle input and return the number of complete wheel steps. */
int consumeWheelSteps(int angle_delta, int &remainder);

/** Resize around the bottom-center anchor while preserving the minimum size. */
QRect wheelResizedGeometry(const QRect &geometry,
                           int steps,
                           const QSize &step_size,
                           const QSize &minimum_size);

/** Whether the point belongs to Web controls instead of native pet gestures. */
bool isPetControlArea(const QPoint &position,
                      const QSize &window_size,
                      const QSize &control_area);

/** Build the page event that applies an absolute scale to the desktop-pet model. */
QString desktopPetScaleScript(double scale);

/** Build the page event that lets Live2D follow a desktop-global pointer position. */
QString pointerMoveScript(const QPoint &client_position,
                          const QPoint &screen_position);

/** Build the pointer-controlled flashing frame for the frameless pet window. */
QString desktopPetHoverFrameScript();

/** Build the page event that explicitly updates the pet hover-frame visibility. */
QString desktopPetHoverFrameVisibilityScript(bool visible);

}  // namespace desktop_pet
