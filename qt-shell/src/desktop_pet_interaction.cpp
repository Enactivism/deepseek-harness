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

bool isPetControlArea(const QPoint &position,
                      const QSize &window_size,
                      const QSize &control_area) {
    return position.x() >= window_size.width() - control_area.width()
        && position.y() >= window_size.height() - control_area.height();
}

QString desktopPetScaleScript(double scale) {
    return QStringLiteral(
        "window.dispatchEvent(new CustomEvent('dsh-desktop-pet-scale', {"
        "detail: {scale: %1}}));")
        .arg(QString::number(scale, 'f', 6));
}

QString pointerMoveScript(const QPoint &client_position,
                          const QPoint &screen_position) {
    return QStringLiteral(
        "document.dispatchEvent(new MouseEvent('mousemove', {"
        "bubbles: true, cancelable: true, view: window, "
        "screenX: %1, screenY: %2, clientX: %3, clientY: %4}));")
        .arg(screen_position.x())
        .arg(screen_position.y())
        .arg(client_position.x())
        .arg(client_position.y());
}

QString desktopPetHoverFrameScript() {
    return QStringLiteral(R"JS(
(() => {
  const query = new URLSearchParams(window.location.search);
  if (query.get('dshDesktopPetChat') === '1') return;

  const frameId = 'dsh-desktop-pet-hover-frame';
  const setFrameVisible = (visible) => {
    const frame = document.getElementById(frameId);
    if (!frame) return;
    const animation = frame.__dshDesktopPetHoverAnimation;
    if (!visible) {
      animation.cancel();
      frame.style.opacity = '0';
      return;
    }
    frame.style.opacity = '1';
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation.play();
    }
  };
  const ensureFrame = () => {
    const body = document.body;
    if (!body || document.getElementById(frameId)) return;
    const frame = document.createElement('div');
    frame.id = frameId;
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, {
      position: 'fixed',
      inset: '0',
      boxSizing: 'border-box',
      border: '3px solid rgb(57, 255, 136)',
      boxShadow: 'inset 0 0 12px rgba(57, 255, 136, 0.9)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      opacity: '0',
    });
    body.appendChild(frame);
    const animation = frame.animate(
      [{ opacity: 0.28 }, { opacity: 1 }],
      {
        duration: 700,
        direction: 'alternate',
        easing: 'ease-in-out',
        iterations: Infinity,
      },
    );
    animation.cancel();
    frame.__dshDesktopPetHoverAnimation = animation;
    setFrameVisible(window.__dshDesktopPetHoverInside === true);
  };

  if (!window.__dshDesktopPetHoverFrameObserver) {
    const observer = new MutationObserver(ensureFrame);
    observer.observe(document, { childList: true, subtree: true });
    window.__dshDesktopPetHoverFrameObserver = observer;
  }
  if (!window.__dshDesktopPetHoverFrameEvents) {
    window.addEventListener('dsh-desktop-pet-hover-frame-visibility', (event) => {
      const visible = event.detail?.visible === true;
      window.__dshDesktopPetHoverInside = visible;
      setFrameVisible(visible);
    });
    window.__dshDesktopPetHoverFrameEvents = true;
  }
  ensureFrame();
})();
)JS");
}

QString desktopPetHoverFrameVisibilityScript(bool visible) {
    return QStringLiteral(
        "window.__dshDesktopPetHoverInside = %1;"
        "window.dispatchEvent(new CustomEvent("
        "'dsh-desktop-pet-hover-frame-visibility', {detail:{visible:%1}}));")
        .arg(visible ? QStringLiteral("true") : QStringLiteral("false"));
}

}  // namespace desktop_pet
