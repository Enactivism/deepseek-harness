#include "desktop_pointer_bridge.h"

#if defined(Q_OS_LINUX)
#include <QDBusConnection>
#include <QDBusConnectionInterface>
#include <QDBusError>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusServiceWatcher>
#endif

#if defined(Q_OS_LINUX)
namespace {
constexpr auto kService = "ai.deepseek.Harness.Pointer";
constexpr auto kObjectPath = "/ai/deepseek/Harness/Pointer";
constexpr auto kInterface = "ai.deepseek.Harness.Pointer";
}
#endif

DesktopPointerBridge::DesktopPointerBridge(QObject *parent)
#if defined(Q_OS_LINUX)
    : QObject(parent),
      service_watcher_(new QDBusServiceWatcher(
          QString::fromLatin1(kService),
          QDBusConnection::sessionBus(),
          QDBusServiceWatcher::WatchForRegistration
              | QDBusServiceWatcher::WatchForUnregistration,
          this)) {
    connect(service_watcher_, &QDBusServiceWatcher::serviceRegistered,
            this, &DesktopPointerBridge::handleServiceRegistered);
    connect(service_watcher_, &QDBusServiceWatcher::serviceUnregistered,
            this, &DesktopPointerBridge::handleServiceUnregistered);
#else
    : QObject(parent) {
    Q_UNUSED(parent);
#endif
}

void DesktopPointerBridge::start() {
#if defined(Q_OS_LINUX)
    if (started_) return;
    started_ = true;
    auto bus = QDBusConnection::sessionBus();
    if (!bus.isConnected()) {
        emit unavailable(bus.lastError().message());
        return;
    }
    if (bus.interface()->isServiceRegistered(QString::fromLatin1(kService))) {
        startService();
    }
#endif
}

void DesktopPointerBridge::stop() {
#if defined(Q_OS_LINUX)
    if (!started_) return;
    started_ = false;
    stopService();
    has_position_ = false;
#endif
}

bool DesktopPointerBridge::isAvailable() const {
    return available_;
}

bool DesktopPointerBridge::hasPosition() const {
    return has_position_;
}

QPoint DesktopPointerBridge::position() const {
    return position_;
}

void DesktopPointerBridge::startService() {
#if defined(Q_OS_LINUX)
    if (!started_ || available_) return;
    auto bus = QDBusConnection::sessionBus();
    service_interface_ = new QDBusInterface(
        QString::fromLatin1(kService),
        QString::fromLatin1(kObjectPath),
        QString::fromLatin1(kInterface),
        bus,
        this);
    if (!service_interface_->isValid()) {
        const auto reason = service_interface_->lastError().message();
        delete service_interface_;
        service_interface_ = nullptr;
        emit unavailable(reason);
        return;
    }
    if (!bus.connect(QString::fromLatin1(kService),
                    QString::fromLatin1(kObjectPath),
                    QString::fromLatin1(kInterface),
                    QStringLiteral("PointerMoved"),
                    this,
                    SLOT(handlePointerMoved(int,int)))) {
        const auto reason = bus.lastError().message();
        delete service_interface_;
        service_interface_ = nullptr;
        emit unavailable(reason);
        return;
    }
    const auto reply = service_interface_->call(QDBus::Block, QStringLiteral("Start"));
    if (reply.type() == QDBusMessage::ErrorMessage) {
        const auto reason = reply.errorMessage();
        bus.disconnect(QString::fromLatin1(kService),
                      QString::fromLatin1(kObjectPath),
                      QString::fromLatin1(kInterface),
                      QStringLiteral("PointerMoved"),
                      this,
                      SLOT(handlePointerMoved(int,int)));
        delete service_interface_;
        service_interface_ = nullptr;
        emit unavailable(reason);
        return;
    }
    available_ = true;
#endif
}

void DesktopPointerBridge::stopService() {
#if defined(Q_OS_LINUX)
    auto bus = QDBusConnection::sessionBus();
    if (service_interface_ != nullptr) {
        service_interface_->call(QDBus::Block, QStringLiteral("Stop"));
        bus.disconnect(QString::fromLatin1(kService),
                      QString::fromLatin1(kObjectPath),
                      QString::fromLatin1(kInterface),
                      QStringLiteral("PointerMoved"),
                      this,
                      SLOT(handlePointerMoved(int,int)));
        delete service_interface_;
        service_interface_ = nullptr;
    }
    available_ = false;
#endif
}

void DesktopPointerBridge::handlePointerMoved(int x, int y) {
#if defined(Q_OS_LINUX)
    if (!available_) return;
    position_ = {x, y};
    has_position_ = true;
    emit pointerMoved(position_);
#else
    Q_UNUSED(x);
    Q_UNUSED(y);
#endif
}

void DesktopPointerBridge::handleServiceRegistered(const QString &service) {
#if defined(Q_OS_LINUX)
    if (service == QString::fromLatin1(kService)) startService();
#else
    Q_UNUSED(service);
#endif
}

void DesktopPointerBridge::handleServiceUnregistered(const QString &service) {
#if defined(Q_OS_LINUX)
    if (service != QString::fromLatin1(kService)) return;
    stopService();
    has_position_ = false;
    emit unavailable(QStringLiteral("GNOME Shell pointer extension disconnected"));
#else
    Q_UNUSED(service);
#endif
}
