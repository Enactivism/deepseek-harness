#include "desktop_pet_interaction.h"

#include <algorithm>

#include <Qt>

namespace desktop_pet {
namespace {
constexpr int kWheelAngleStep = 120;
}

bool shouldPreferXcbPlatform(const QByteArray &configured_platform,
                             const QByteArray &wayland_display,
                             const QByteArray &x_display) {
    return configured_platform.isEmpty() && !wayland_display.isEmpty() && !x_display.isEmpty();
}

bool supportsGlobalPointerTracking(const QString &platform_name) {
    return platform_name.compare(QStringLiteral("xcb"), Qt::CaseInsensitive) == 0
        || platform_name.compare(QStringLiteral("windows"), Qt::CaseInsensitive) == 0
        || platform_name.compare(QStringLiteral("cocoa"), Qt::CaseInsensitive) == 0;
}

int consumeWheelSteps(int angle_delta, int &remainder) {
    const int accumulated = remainder + angle_delta;
    const int steps = accumulated / kWheelAngleStep;
    remainder = accumulated % kWheelAngleStep;
    return steps;
}

QRect wheelResizedGeometry(const QRect &geometry,
                           int steps,
                           const QSize &step_size,
                           const QSize &minimum_size) {
    const int width = std::max(minimum_size.width(),
                               geometry.width() + steps * step_size.width());
    const int height = std::max(minimum_size.height(),
                                geometry.height() + steps * step_size.height());
    const int center_x = geometry.x() + geometry.width() / 2;
    const int bottom = geometry.y() + geometry.height();
    return {center_x - width / 2, bottom - height, width, height};
}

bool isChatInteractionArea(const QPoint &position,
                           const QSize &window_size,
                           bool chat_open,
                           int closed_button_area) {
    if (chat_open) return true;
    return position.x() >= window_size.width() - closed_button_area
        && position.y() >= window_size.height() - closed_button_area;
}

QString desktopPetScaleScript(double scale) {
    return QStringLiteral(
        "window.dispatchEvent(new CustomEvent('dsh-desktop-pet-scale', {"
        "detail: {scale: %1}}));")
        .arg(QString::number(scale, 'f', 6));
}

QString pointerMoveScript(const QPoint &client_position) {
    return QStringLiteral(
        "document.dispatchEvent(new MouseEvent('mousemove', {"
        "bubbles: true, cancelable: true, clientX: %1, clientY: %2}));")
        .arg(client_position.x())
        .arg(client_position.y());
}

}  // namespace desktop_pet
