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

/** Accumulate wheel angle input and return the number of complete wheel steps. */
int consumeWheelSteps(int angle_delta, int &remainder);

/** Resize around the bottom-center anchor while preserving the minimum size. */
QRect wheelResizedGeometry(const QRect &geometry,
                           int steps,
                           const QSize &step_size,
                           const QSize &minimum_size);

/** Whether the point belongs to Web chat instead of native pet gestures. */
bool isChatInteractionArea(const QPoint &position,
                           const QSize &window_size,
                           bool chat_open,
                           int closed_button_area);

/** Build the page event that applies an absolute scale to the desktop-pet model. */
QString desktopPetScaleScript(double scale);

/** Build the page event that lets Live2D follow a desktop-global pointer position. */
QString pointerMoveScript(const QPoint &client_position);

}  // namespace desktop_pet
