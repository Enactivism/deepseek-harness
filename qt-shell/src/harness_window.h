#pragma once

#include <QMainWindow>

class QLabel;
class QNetworkAccessManager;
class QProcess;
class QProgressBar;
class QPushButton;
class QStackedLayout;
class QTimer;
class QWebEngineView;
class QWidget;

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
    void showLoadingState(const QString &title, const QString &description);
    void showErrorState(const QString &title, const QString &description);
    void retryHarness();
    void reloadWebView();
    void updateStatus(const QString &message);

    QProcess *server_;
    QNetworkAccessManager *network_manager_;
    QTimer *readiness_timer_;
    QWebEngineView *web_view_;
    QWidget *state_view_;
    QStackedLayout *content_stack_ = nullptr;
    QLabel *state_icon_;
    QLabel *state_kicker_;
    QLabel *state_title_;
    QLabel *state_description_;
    QProgressBar *state_progress_;
    QPushButton *state_action_;
    int readiness_attempts_ = 0;
    int page_retry_attempts_ = 0;
    bool probe_in_flight_ = false;
    bool page_loaded_ = false;
    bool stopping_ = false;
};
