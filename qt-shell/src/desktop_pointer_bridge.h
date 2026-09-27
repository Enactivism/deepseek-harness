#pragma once

#include <QPoint>
#include <QString>

#include <QObject>

class QDBusInterface;
class QDBusServiceWatcher;

/** Reads compositor-global pointer coordinates from the optional GNOME bridge. */
class DesktopPointerBridge final : public QObject {
    Q_OBJECT

public:
    explicit DesktopPointerBridge(QObject *parent = nullptr);

    /** Start watching for the GNOME Shell pointer service. */
    void start();

    /** Stop the service and release the D-Bus signal subscription. */
    void stop();

    /** Whether the bridge service is currently connected. */
    bool isAvailable() const;

    /** Whether the bridge has delivered at least one pointer position. */
    bool hasPosition() const;

    /** The latest compositor-global pointer position. */
    QPoint position() const;

signals:
    /** Emitted for each pointer position reported by GNOME Shell. */
    void pointerMoved(const QPoint &position);

    /** Emitted when the bridge cannot be used or becomes unavailable. */
    void unavailable(const QString &reason);

private slots:
    void handlePointerMoved(int x, int y);
    void handleServiceRegistered(const QString &service);
    void handleServiceUnregistered(const QString &service);

private:
    void startService();
    void stopService();

    QDBusServiceWatcher *service_watcher_ = nullptr;
    QDBusInterface *service_interface_ = nullptr;
    QPoint position_{};
    bool started_ = false;
    bool available_ = false;
    bool has_position_ = false;
};
