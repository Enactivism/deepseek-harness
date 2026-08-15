#include "harness_window.h"

#include <QCloseEvent>
#include <QCoreApplication>
#include <QDir>
#include <QLabel>
#include <QMenuBar>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcess>
#include <QProcessEnvironment>
#include <QStandardPaths>
#include <QStatusBar>
#include <QTimer>
#include <QUrl>
#include <QVBoxLayout>
#include <QWebEngineView>
#include <QWidget>
#include <QFileInfo>
#include <QDebug>

namespace {
constexpr auto kHarnessUrl = "http://127.0.0.1:3080";
constexpr auto kDefaultNpmUserConfig = "/dev/null";
constexpr auto kFallbackPnpm = "/Users/tankaiwen/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm";
constexpr auto kNode22Corepack = "/opt/homebrew/opt/node@22/bin/corepack";
constexpr auto kFallbackPnpmDirectory = "/Users/tankaiwen/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback";
constexpr int kReadinessIntervalMs = 500;
constexpr int kMaxReadinessAttempts = 180;
constexpr int kInitialPageDelayMs = 3000;
constexpr int kPageBootInspectionDelayMs = 1200;
constexpr int kPageRetryDelayMs = 2000;
constexpr int kMaxPageRetries = 3;
}

HarnessWindow::HarnessWindow(QWidget *parent)
    : QMainWindow(parent),
      server_(new QProcess(this)),
      network_manager_(new QNetworkAccessManager(this)),
      readiness_timer_(new QTimer(this)),
      web_view_(new QWebEngineView(this)),
      status_label_(new QLabel("正在启动 DeepSeek Harness…", this)) {
    setWindowTitle("DeepSeek Harness");
    resize(1440, 920);

    auto *container = new QWidget(this);
    auto *layout = new QVBoxLayout(container);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(web_view_);
    setCentralWidget(container);

    auto *file_menu = menuBar()->addMenu("文件");
    auto *reload_action = file_menu->addAction("重新加载");
    connect(reload_action, &QAction::triggered, web_view_, &QWebEngineView::reload);
    file_menu->addSeparator();
    auto *quit_action = file_menu->addAction("退出");
    connect(quit_action, &QAction::triggered, this, &QWidget::close);

    statusBar()->addWidget(status_label_);
    readiness_timer_->setInterval(kReadinessIntervalMs);
    connect(readiness_timer_, &QTimer::timeout, this, &HarnessWindow::probeHarness);
    connect(server_, &QProcess::started, this, [this] {
        qInfo() << "[deepseek-harness-qt] Harness process started:" << server_->program();
        updateStatus("Harness 进程已启动，等待 Web 服务…");
        readiness_timer_->start();
        probeHarness();
    });
    connect(server_, &QProcess::readyReadStandardError, this, [this] {
        const auto output = QString::fromLocal8Bit(server_->readAllStandardError());
        if (!output.trimmed().isEmpty()) {
            qWarning().noquote() << "[deepseek-harness-qt] Harness stderr:" << output.trimmed();
            updateStatus(output.trimmed());
        }
    });
    connect(server_, &QProcess::readyReadStandardOutput, this, [this] {
        const auto output = QString::fromLocal8Bit(server_->readAllStandardOutput());
        if (!output.trimmed().isEmpty()) {
            qInfo().noquote() << "[deepseek-harness-qt] Harness stdout:" << output.trimmed();
            updateStatus(output.trimmed());
        }
    });
    connect(server_, qOverload<int, QProcess::ExitStatus>(&QProcess::finished),
            this, [this](int exit_code, QProcess::ExitStatus exit_status) {
                qWarning() << "[deepseek-harness-qt] Harness exited:" << exit_code << exit_status;
                readiness_timer_->stop();
                if (!stopping_ && (exit_status == QProcess::CrashExit || exit_code != 0)) {
                    updateStatus("Harness 已退出，退出码：" + QString::number(exit_code));
                    if (!page_loaded_) {
                        showServerError("Harness 进程提前退出，退出码 " + QString::number(exit_code));
                    }
                }
            });
    connect(server_, &QProcess::stateChanged, this, [](QProcess::ProcessState state) {
        qInfo() << "[deepseek-harness-qt] Harness process state:" << state;
    });
    connect(server_, &QProcess::errorOccurred, this, [this](QProcess::ProcessError) {
        qWarning() << "[deepseek-harness-qt] Harness process error:" << server_->errorString();
        showServerError(server_->errorString());
    });
    connect(web_view_, &QWebEngineView::loadFinished, this, [this](bool ok) {
        if (stopping_ || !page_loaded_) return;

        qInfo() << "[deepseek-harness-qt] WebEngine page load finished:" << ok
                << web_view_->url();
        if (!ok) {
            if (page_retry_attempts_ >= kMaxPageRetries) {
                updateStatus("网页加载失败，请从菜单重新加载。" );
                return;
            }
            ++page_retry_attempts_;
            updateStatus(QString("网页加载失败，正在重试（%1/%2）…")
                             .arg(page_retry_attempts_)
                             .arg(kMaxPageRetries));
            QTimer::singleShot(kPageRetryDelayMs, this, [this] {
                if (!stopping_) web_view_->reload();
            });
            return;
        }

        // The HTTP listener becomes ready before the web boot graph settles. Inspect
        // the rendered boot gate and retry when the first load captured that race.
        QTimer::singleShot(kPageBootInspectionDelayMs, this, [this] {
            if (stopping_ || !page_loaded_) return;
            web_view_->page()->runJavaScript(
                "document.body ? document.body.innerText : ''",
                [this](const QVariant &value) {
                    const auto body = value.toString();
                    const auto boot_not_ready = body.trimmed().isEmpty()
                        || body.contains("Loading plugins")
                        || body.contains("Failed to load plugins")
                        || body.contains("did not activate")
                        || body.contains("pending (waiting for service");
                    if (!boot_not_ready) {
                        qInfo() << "[deepseek-harness-qt] WebEngine boot page ready; body length:"
                                << body.size();
                        qInfo().noquote() << "[deepseek-harness-qt] WebEngine body text:"
                                          << body.simplified().left(400);
                        updateStatus("已连接到本地 Harness");
                        return;
                    }
                    qWarning().noquote() << "[deepseek-harness-qt] Web boot is still pending; retrying:"
                                         << body.left(500);
                    if (page_retry_attempts_ >= kMaxPageRetries) {
                        updateStatus("Harness 插件启动失败，请从菜单重新加载。" );
                        return;
                    }
                    ++page_retry_attempts_;
                    updateStatus(QString("Harness 插件仍在启动，正在重试（%1/%2）…")
                                     .arg(page_retry_attempts_)
                                     .arg(kMaxPageRetries));
                    QTimer::singleShot(kPageRetryDelayMs, this, [this] {
                        if (!stopping_) web_view_->reload();
                    });
                });
        });
    });

    startHarness();
}

HarnessWindow::~HarnessWindow() { stopHarness(); }

void HarnessWindow::startHarness() {
    stopping_ = false;
    page_loaded_ = false;
    page_retry_attempts_ = 0;
    readiness_attempts_ = 0;
    probe_in_flight_ = false;

    auto root = qEnvironmentVariable("DSH_ROOT");
    if (root.isEmpty()) root = QStringLiteral(DSH_DEFAULT_ROOT);
    if (root.isEmpty() || !QFileInfo::exists(QDir(root).filePath("package.json"))) {
        showServerError("找不到 Harness 源码目录，请设置 DSH_ROOT");
        qWarning() << "[deepseek-harness-qt] Harness root not found:" << root;
        return;
    }
    server_->setWorkingDirectory(root);

    auto pnpm = qEnvironmentVariable("PNPM_EXECUTABLE");
    if (pnpm.isEmpty()) pnpm = QStandardPaths::findExecutable("pnpm");
    if (pnpm.isEmpty() && QFileInfo::exists("/opt/homebrew/bin/pnpm")) pnpm = "/opt/homebrew/bin/pnpm";
    if (pnpm.isEmpty() && QFileInfo::exists(kNode22Corepack)) pnpm = kNode22Corepack;
    if (pnpm.isEmpty() && QFileInfo::exists(kFallbackPnpm)) pnpm = kFallbackPnpm;
    if (pnpm.isEmpty()) {
        showServerError("找不到 pnpm；请设置 PNPM_EXECUTABLE");
        qWarning() << "[deepseek-harness-qt] pnpm executable not found";
        return;
    }

    auto environment = QProcessEnvironment::systemEnvironment();
    auto path = environment.value("PATH");
    const auto pathPrefix = QStringLiteral("%1:%2:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin")
                                .arg(kFallbackPnpmDirectory, QCoreApplication::applicationDirPath());
    environment.insert("PATH", pathPrefix + (path.isEmpty() ? QString() : ":" + path));
    if (!environment.contains("NPM_CONFIG_USERCONFIG")) {
        environment.insert("NPM_CONFIG_USERCONFIG", kDefaultNpmUserConfig);
    }
    environment.insert("DSH_ROOT", root);
    server_->setProcessEnvironment(environment);

    QStringList arguments;
    const auto executableName = QFileInfo(pnpm).fileName();
    if (executableName == "corepack" || executableName == "corepack.exe") arguments << "pnpm";
    arguments << "dsh" << "web" << "--host" << "127.0.0.1" << "--port" << "3080";

    qInfo() << "[deepseek-harness-qt] Starting Harness from" << server_->workingDirectory()
            << "using" << pnpm << "arguments" << arguments;
    server_->start(pnpm, arguments);
}

void HarnessWindow::stopHarness() {
    stopping_ = true;
    readiness_timer_->stop();
    for (auto *reply : network_manager_->findChildren<QNetworkReply *>()) reply->abort();
    if (server_->state() == QProcess::NotRunning) return;
    server_->terminate();
    if (!server_->waitForFinished(1500)) server_->kill();
}

void HarnessWindow::probeHarness() {
    if (stopping_ || page_loaded_ || probe_in_flight_ || server_->state() != QProcess::Running) return;
    if (++readiness_attempts_ > kMaxReadinessAttempts) {
        readiness_timer_->stop();
        showServerError("等待 Web 服务超时（127.0.0.1:3080）");
        return;
    }

    probe_in_flight_ = true;
    QNetworkRequest request{QUrl(kHarnessUrl)};
    request.setTransferTimeout(2500);
    auto *reply = network_manager_->get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        probe_in_flight_ = false;
        const auto status_code = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const auto ready = reply->error() == QNetworkReply::NoError && status_code >= 200 && status_code < 400;
        reply->deleteLater();
        if (ready) showHarnessReady();
    });
}

void HarnessWindow::showHarnessReady() {
    if (page_loaded_ || stopping_) return;
    page_loaded_ = true;
    readiness_timer_->stop();
    updateStatus("Web 服务已就绪，等待前端插件稳定…");
    QTimer::singleShot(kInitialPageDelayMs, this, [this] {
        if (!stopping_) web_view_->setUrl(QUrl(kHarnessUrl));
    });
}

void HarnessWindow::showServerError(const QString &message) {
    updateStatus("无法启动 Harness：" + message + "。请确认 Node.js 与 pnpm 已安装。");
    const auto html = QStringLiteral(
        "<html><body style='font-family:-apple-system,sans-serif;padding:32px'>"
        "<h2>DeepSeek Harness 启动失败</h2><p>%1</p>"
        "<p>请查看终端中的 <code>[deepseek-harness-qt]</code> 日志。</p>"
        "</body></html>").arg(message.toHtmlEscaped());
    web_view_->setHtml(html);
}

void HarnessWindow::updateStatus(const QString &message) {
    status_label_->setText(message.left(240));
}

void HarnessWindow::closeEvent(QCloseEvent *event) {
    stopHarness();
    event->accept();
}
