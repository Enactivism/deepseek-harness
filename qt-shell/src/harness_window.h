#pragma once

#include <QMainWindow>

class QLabel;
class QNetworkAccessManager;
class QProcess;
class QTimer;
class QWebEngineView;

class HarnessWindow final : public QMainWindow {
    Q_OBJECT

public:
    explicit HarnessWindow(QWidget *parent = nullptr);
    ~HarnessWindow() override;

protected:
    void closeEvent(QCloseEvent *event) override;

private:
    void startHarness();
    void stopHarness();
    void probeHarness();
    void showHarnessReady();
    void showServerError(const QString &message);
    void updateStatus(const QString &message);

    QProcess *server_;
    QNetworkAccessManager *network_manager_;
    QTimer *readiness_timer_;
    QWebEngineView *web_view_;
    QLabel *status_label_;
    int readiness_attempts_ = 0;
    int page_retry_attempts_ = 0;
    bool probe_in_flight_ = false;
    bool page_loaded_ = false;
    bool stopping_ = false;
};
