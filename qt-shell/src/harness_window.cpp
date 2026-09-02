#include "harness_window.h"

#include <QCloseEvent>
#include <QColor>
#include <QCoreApplication>
#include <QDir>
#include <QFrame>
#include <QGraphicsDropShadowEffect>
#include <QKeySequence>
#include <QLabel>
#include <QMenuBar>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProgressBar>
#include <QProcess>
#include <QProcessEnvironment>
#include <QPushButton>
#include <QStandardPaths>
#include <QStackedLayout>
#include <QTimer>
#include <QUrl>
#include <QVBoxLayout>
#include <QWebEngineView>
#include <QWidget>
#include <QFileInfo>
#include <QFileDialog>
#include <QDebug>
#include <QWebEnginePage>
#include <QWebEngineProfile>
#include <QWebEngineScript>
#include <QWebEngineScriptCollection>
#include <QWebEngineSettings>
#include <QMouseEvent>
#include <QPalette>
#include <QScreen>
#include <QGuiApplication>
#include <QWindow>
#include <QTcpSocket>
#include <QHostAddress>

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

constexpr auto kPetPageScript = R"JS(
(() => {
  const applyPetSurface = () => {
    const body = document.body;
    if (!body) return;
    document.documentElement.style.setProperty('background', 'transparent', 'important');
    body.style.setProperty('background', 'transparent', 'important');
    body.style.setProperty('background-color', 'transparent', 'important');
    body.style.setProperty('overflow', 'hidden', 'important');
    const companion = body.querySelector('[data-live2d-companion="true"]');
    if (!companion) return;
    const keep = new Set([companion]);
    for (let node = companion.parentElement; node && node !== body; node = node.parentElement) {
      keep.add(node);
    }
    for (const child of body.querySelectorAll('*')) {
      if (!keep.has(child) && !companion.contains(child)) {
        child.style.setProperty('display', 'none', 'important');
        child.style.setProperty('visibility', 'hidden', 'important');
      }
    }
    for (let current = companion; current && current !== body; current = current.parentElement) {
      current.style.setProperty('display', 'flex', 'important');
      current.style.setProperty('visibility', 'visible', 'important');
      current.style.setProperty('position', 'fixed', 'important');
      current.style.setProperty('inset', '0', 'important');
      current.style.setProperty('width', '100vw', 'important');
      current.style.setProperty('height', '100vh', 'important');
      current.style.setProperty('background', 'transparent', 'important');
      current.style.setProperty('background-color', 'transparent', 'important');
      current.style.setProperty('box-shadow', 'none', 'important');
      current.style.setProperty('border', '0', 'important');
    }
  };
  if (!window.__dshDesktopPetObserver) {
    const observer = new MutationObserver(applyPetSurface);
    observer.observe(document, { childList: true, subtree: true });
    window.__dshDesktopPetObserver = observer;
  }
  applyPetSurface();
})();
)JS";

class HarnessWebPage final : public QWebEnginePage {
    Q_OBJECT
public:
    explicit HarnessWebPage(QObject *parent = nullptr)
        : QWebEnginePage(parent) {}

protected:
    bool acceptNavigationRequest(const QUrl &url, NavigationType type, bool is_main_frame) override {
        Q_UNUSED(type);
        Q_UNUSED(is_main_frame);
        if (url.scheme() == QStringLiteral("dsh")
            && url.host() == QStringLiteral("desktop-pet")
            && url.path() == QStringLiteral("/toggle")) {
            emit desktopPetRequested();
            return false;
        }
        return QWebEnginePage::acceptNavigationRequest(url, type, is_main_frame);
    }

signals:
    void desktopPetRequested();

protected:
    QStringList chooseFiles(FileSelectionMode mode,
                            const QStringList &old_files,
                            const QStringList &accepted_mime_types) override {
        Q_UNUSED(accepted_mime_types);

        // This opt-in path makes local integration tests deterministic while
        // keeping normal users on the native folder picker.
        if (mode == FileSelectUploadFolder) {
            const QString preset_path = qEnvironmentVariable("DSH_LIVE2D_MODEL_PATH");
            const QFileInfo preset_info(preset_path);
            if (!preset_path.isEmpty() && preset_info.isDir()) {
                return {preset_info.absoluteFilePath()};
            }
        }

        QFileDialog dialog(nullptr);
        dialog.setWindowTitle(mode == FileSelectUploadFolder
                                  ? QStringLiteral("选择 Live2D 模型文件夹")
                                  : QStringLiteral("选择文件"));
        if (!old_files.isEmpty()) {
            const QFileInfo old_info(old_files.constFirst());
            if (old_info.exists()) {
                dialog.setDirectory(old_info.isDir() ? old_info.absoluteFilePath()
                                                      : old_info.absolutePath());
            }
        }

        switch (mode) {
        case FileSelectOpen:
            dialog.setFileMode(QFileDialog::ExistingFile);
            break;
        case FileSelectOpenMultiple:
            dialog.setFileMode(QFileDialog::ExistingFiles);
            break;
        case FileSelectUploadFolder:
            dialog.setFileMode(QFileDialog::Directory);
            dialog.setOption(QFileDialog::ShowDirsOnly, true);
            break;
        case FileSelectSave:
            dialog.setAcceptMode(QFileDialog::AcceptSave);
            dialog.setFileMode(QFileDialog::AnyFile);
            break;
        }

        return dialog.exec() == QDialog::Accepted ? dialog.selectedFiles() : QStringList{};
    }
};
}

HarnessWindow::HarnessWindow(QWidget *parent)
    : QMainWindow(parent),
      server_(new QProcess(this)),
      network_manager_(new QNetworkAccessManager(this)),
      readiness_timer_(new QTimer(this)),
      web_view_(new QWebEngineView(this)),
      state_view_(new QWidget(this)),
      state_icon_(new QLabel("DH", state_view_)),
      state_kicker_(new QLabel("DESKTOP SHELL", state_view_)),
      state_title_(new QLabel(state_view_)),
      state_description_(new QLabel(state_view_)),
      state_progress_(new QProgressBar(state_view_)),
      state_action_(new QPushButton("重新连接", state_view_)) {
    setWindowTitle("DeepSeek Harness");
    setMinimumSize(960, 640);
    resize(1440, 920);

    setStyleSheet(R"(
        QMainWindow {
            background: #0d1118;
        }
        QMenuBar {
            background: #151a23;
            color: #aab5c6;
            border: none;
            padding: 4px 8px;
        }
        QMenuBar::item {
            padding: 5px 9px;
            border-radius: 6px;
        }
        QMenuBar::item:selected {
            background: #263142;
            color: #f5f7fb;
        }
        QMenu {
            background: #171e29;
            color: #e8edf5;
            border: 1px solid #2b3544;
            padding: 6px;
        }
        QMenu::item {
            padding: 7px 26px 7px 12px;
            border-radius: 6px;
        }
        QMenu::item:selected {
            background: #263449;
        }
        #stateIcon {
            background: #66e3bd;
            color: #07151a;
            border-radius: 18px;
            font-weight: 700;
            letter-spacing: 1px;
            font-size: 20px;
        }
        #stateKicker {
            color: #7e8a9d;
            font-size: 11px;
            letter-spacing: 1px;
        }
        #stateView {
            background: #10151e;
        }
        #stateCard {
            background: #171e29;
            border: 1px solid #2b3748;
            border-radius: 18px;
        }
        #stateTitle {
            color: #f4f7fb;
            font-size: 21px;
            font-weight: 650;
        }
        #stateDescription {
            color: #98a5b8;
            font-size: 13px;
        }
        #stateProgress {
            background: #273242;
            border: none;
            border-radius: 2px;
            min-height: 4px;
            max-height: 4px;
        }
        #stateProgress::chunk {
            background: #66e3bd;
            border-radius: 2px;
        }
        #stateAction {
            background: #66e3bd;
            color: #08151a;
            border: none;
            border-radius: 8px;
            padding: 8px 18px;
            min-height: 34px;
            font-weight: 650;
        }
        #stateAction:hover {
            background: #82ebcb;
        }
        #stateAction:pressed {
            background: #51cda8;
        }
    )");

    auto *container = new QWidget(this);
    auto *layout = new QVBoxLayout(container);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);
    content_stack_ = new QStackedLayout;
    content_stack_->setContentsMargins(0, 0, 0, 0);
    layout->addLayout(content_stack_, 1);

    web_view_->setObjectName("harnessWebView");
    web_view_->setStyleSheet("border: none; background: #10151e;");
    web_view_->settings()->setAttribute(QWebEngineSettings::WebGLEnabled, true);
    web_view_->settings()->setAttribute(QWebEngineSettings::Accelerated2dCanvasEnabled, true);
    auto *web_page = new HarnessWebPage(web_view_);
    web_page->profile()->setHttpUserAgent(
        web_page->profile()->httpUserAgent() + QStringLiteral(" DeepSeekHarnessQt/1"));
    web_view_->setPage(web_page);
    web_view_->installEventFilter(this);
    connect(web_page, &HarnessWebPage::desktopPetRequested,
            this, &HarnessWindow::toggleDesktopPet);
    content_stack_->addWidget(web_view_);

    pet_window_ = new QWidget(nullptr, Qt::Tool | Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint);
    pet_window_->setWindowTitle(QStringLiteral("Live2D 桌宠"));
    pet_window_->setMinimumSize(240, 320);
    pet_window_->resize(360, 480);
    pet_window_->setAttribute(Qt::WA_TranslucentBackground, true);
    pet_window_->setAttribute(Qt::WA_NoSystemBackground, true);
    pet_window_->setAutoFillBackground(false);
    {
        auto palette = pet_window_->palette();
        palette.setColor(QPalette::Window, Qt::transparent);
        pet_window_->setPalette(palette);
    }
    pet_window_->setStyleSheet("background: transparent;");
    pet_window_->setMouseTracking(true);
    auto *pet_layout = new QVBoxLayout(pet_window_);
    pet_layout->setContentsMargins(0, 0, 0, 0);
    pet_web_view_ = new QWebEngineView(pet_window_);
    pet_web_view_->setAttribute(Qt::WA_TranslucentBackground, true);
    pet_web_view_->setAttribute(Qt::WA_NoSystemBackground, true);
    pet_web_view_->setAttribute(Qt::WA_OpaquePaintEvent, false);
    pet_web_view_->setAttribute(Qt::WA_AlwaysStackOnTop, true);
    pet_web_view_->setAutoFillBackground(false);
    {
        auto palette = pet_web_view_->palette();
        palette.setColor(QPalette::Window, Qt::transparent);
        pet_web_view_->setPalette(palette);
    }
    pet_web_view_->setMouseTracking(true);
    pet_web_view_->setStyleSheet("border: none; background: transparent;");
    pet_web_view_->settings()->setAttribute(QWebEngineSettings::WebGLEnabled, true);
    pet_web_view_->settings()->setAttribute(QWebEngineSettings::Accelerated2dCanvasEnabled, true);
    auto *pet_page = new HarnessWebPage(pet_web_view_);
    pet_page->profile()->setHttpUserAgent(
        pet_page->profile()->httpUserAgent() + QStringLiteral(" DeepSeekHarnessQt/1"));
    QWebEngineScript pet_script;
    pet_script.setName(QStringLiteral("dsh-desktop-pet-surface"));
    pet_script.setInjectionPoint(QWebEngineScript::DocumentCreation);
    pet_script.setWorldId(QWebEngineScript::MainWorld);
    pet_script.setSourceCode(QString::fromUtf8(kPetPageScript));
    pet_page->scripts().insert(pet_script);
    pet_web_view_->setPage(pet_page);
    pet_page->setBackgroundColor(Qt::transparent);
    pet_web_view_->installEventFilter(this);
    pet_window_->installEventFilter(this);
    qApp->installEventFilter(this);
    connect(pet_page, &HarnessWebPage::desktopPetRequested,
            this, &HarnessWindow::toggleDesktopPet);
    connect(pet_web_view_, &QWebEngineView::loadFinished,
            this, &HarnessWindow::preparePetPage);
    pet_layout->addWidget(pet_web_view_);
    pet_window_->hide();

    state_view_->setObjectName("stateView");
    auto *state_outer_layout = new QVBoxLayout(state_view_);
    state_outer_layout->setContentsMargins(20, 20, 20, 20);
    state_outer_layout->addStretch(1);
    auto *state_card = new QFrame(state_view_);
    state_card->setObjectName("stateCard");
    state_card->setMaximumWidth(520);
    auto *shadow = new QGraphicsDropShadowEffect(state_card);
    shadow->setBlurRadius(32);
    shadow->setOffset(0, 12);
    shadow->setColor(QColor(0, 0, 0, 95));
    state_card->setGraphicsEffect(shadow);
    auto *state_card_layout = new QVBoxLayout(state_card);
    state_card_layout->setContentsMargins(34, 32, 34, 30);
    state_card_layout->setSpacing(9);
    state_icon_->setObjectName("stateIcon");
    state_icon_->setAlignment(Qt::AlignCenter);
    state_icon_->setFixedSize(52, 52);
    state_card_layout->addWidget(state_icon_, 0, Qt::AlignHCenter);
    state_kicker_->setObjectName("stateKicker");
    state_kicker_->setAlignment(Qt::AlignCenter);
    state_card_layout->addWidget(state_kicker_);
    state_title_->setObjectName("stateTitle");
    state_title_->setAlignment(Qt::AlignCenter);
    state_card_layout->addWidget(state_title_);
    state_description_->setObjectName("stateDescription");
    state_description_->setAlignment(Qt::AlignCenter);
    state_description_->setWordWrap(true);
    state_card_layout->addWidget(state_description_);
    state_progress_->setObjectName("stateProgress");
    state_progress_->setRange(0, 0);
    state_progress_->setTextVisible(false);
    state_progress_->setFixedHeight(4);
    state_card_layout->addSpacing(6);
    state_card_layout->addWidget(state_progress_);
    state_action_->setObjectName("stateAction");
    state_action_->setCursor(Qt::PointingHandCursor);
    state_action_->setVisible(false);
    connect(state_action_, &QPushButton::clicked, this, &HarnessWindow::retryHarness);
    state_card_layout->addSpacing(7);
    state_card_layout->addWidget(state_action_, 0, Qt::AlignHCenter);
    state_outer_layout->addWidget(state_card, 0, Qt::AlignHCenter);
    state_outer_layout->addStretch(1);
    content_stack_->addWidget(state_view_);
    content_stack_->setCurrentWidget(state_view_);
    setCentralWidget(container);

    auto *file_menu = menuBar()->addMenu("文件");
    auto *reload_action = file_menu->addAction("重新加载");
    reload_action->setShortcut(QKeySequence::Refresh);
    connect(reload_action, &QAction::triggered, this, &HarnessWindow::reloadWebView);
    file_menu->addSeparator();
    auto *quit_action = file_menu->addAction("退出");
    connect(quit_action, &QAction::triggered, this, &QWidget::close);

    showLoadingState("正在连接本地工作区", "正在启动 Harness 服务并等待网页插件图…");
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
            if (page_ready_) {
                qInfo() << "[deepseek-harness-qt] Ignoring a late subresource load failure after the page became ready";
                return;
            }
            if (page_retry_attempts_ >= kMaxPageRetries) {
                showErrorState("网页加载失败", "请检查本地 Harness 服务状态，然后重新连接。" );
                return;
            }
            ++page_retry_attempts_;
            showLoadingState("网页加载失败，正在重试", QString("第 %1/%2 次尝试…")
                             .arg(page_retry_attempts_)
                             .arg(kMaxPageRetries));
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
                        page_ready_ = true;
                        qInfo() << "[deepseek-harness-qt] WebEngine boot page ready; body length:"
                                << body.size();
                        qInfo().noquote() << "[deepseek-harness-qt] WebEngine body text:"
                                          << body.simplified().left(400);
                        content_stack_->setCurrentWidget(web_view_);
                        updateStatus("已连接到本地 Harness");
                        return;
                    }
                    qWarning().noquote() << "[deepseek-harness-qt] Web boot is still pending; retrying:"
                                         << body.left(500);
                    if (page_retry_attempts_ >= kMaxPageRetries) {
                        showErrorState("插件图启动失败", "Harness 服务已经响应，但前端插件没有完成启动。" );
                        return;
                    }
                    ++page_retry_attempts_;
                    showLoadingState("正在启动网页插件", QString("第 %1/%2 次尝试…")
                                     .arg(page_retry_attempts_)
                                     .arg(kMaxPageRetries));
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

HarnessWindow::~HarnessWindow() {
    qApp->removeEventFilter(this);
    stopHarness();
    delete pet_window_;
}

void HarnessWindow::startHarness() {
    stopping_ = false;
    page_loaded_ = false;
    page_ready_ = false;
    page_retry_attempts_ = 0;
    readiness_attempts_ = 0;
    probe_in_flight_ = false;
    owns_server_ = false;

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

    QTcpSocket existing_server;
    existing_server.connectToHost(QHostAddress::LocalHost, 3080);
    if (existing_server.waitForConnected(200)) {
        qInfo() << "[deepseek-harness-qt] Reusing existing Harness service on 127.0.0.1:3080";
        showHarnessReady();
        existing_server.disconnectFromHost();
        return;
    }

    QStringList arguments;
    const auto executableName = QFileInfo(pnpm).fileName();
    if (executableName == "corepack" || executableName == "corepack.exe") arguments << "pnpm";
    arguments << "dsh" << "web" << "--host" << "127.0.0.1" << "--port" << "3080";

    qInfo() << "[deepseek-harness-qt] Starting Harness from" << server_->workingDirectory()
            << "using" << pnpm << "arguments" << arguments;
    owns_server_ = true;
    server_->start(pnpm, arguments);
}

void HarnessWindow::stopHarness() {
    stopping_ = true;
    readiness_timer_->stop();
    for (auto *reply : network_manager_->findChildren<QNetworkReply *>()) reply->abort();
    if (!owns_server_ || server_->state() == QProcess::NotRunning) return;
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
    page_ready_ = false;
    readiness_timer_->stop();
    showLoadingState("正在载入工作区", "本地服务已就绪，正在加载 Harness 网页插件…");
    updateStatus("Web 服务已就绪，等待前端插件稳定…");
    QTimer::singleShot(kInitialPageDelayMs, this, [this] {
        if (!stopping_) web_view_->setUrl(QUrl(kHarnessUrl));
    });
}

void HarnessWindow::toggleDesktopPet() {
    setDesktopPet(!desktop_pet_);
}

void HarnessWindow::setDesktopPet(bool enabled) {
    if (desktop_pet_ == enabled) return;
    desktop_pet_ = enabled;
    if (enabled) {
        pet_window_->resize(360, 480);
        pet_window_->move(QGuiApplication::primaryScreen()->availableGeometry().bottomRight()
                          - QPoint(pet_window_->width() + 24, pet_window_->height() + 24));
        pet_web_view_->setUrl(QUrl(QStringLiteral("%1/?dshDesktopPet=1").arg(kHarnessUrl)));
        pet_window_->show();
        pet_window_->raise();
    } else {
        dragging_ = false;
        pet_window_->hide();
        pet_web_view_->stop();
    }
}

void HarnessWindow::preparePetPage(bool ok) {
    if (!desktop_pet_ || !ok) return;
    // QWebEngineView creates its native render widget lazily. Configure the
    // child after navigation as well as the view itself, otherwise that child
    // can paint an opaque rectangle over the translucent top-level window.
    for (auto *child : pet_web_view_->findChildren<QWidget *>()) {
        child->setAttribute(Qt::WA_TranslucentBackground, true);
        child->setAttribute(Qt::WA_NoSystemBackground, true);
        child->setAttribute(Qt::WA_OpaquePaintEvent, false);
        child->setAutoFillBackground(false);
        auto palette = child->palette();
        palette.setColor(QPalette::Window, Qt::transparent);
        child->setPalette(palette);
    }
    pet_web_view_->page()->runJavaScript(QString::fromUtf8(kPetPageScript));
}

bool HarnessWindow::eventFilter(QObject *watched, QEvent *event) {
    const auto *widget = qobject_cast<const QWidget *>(watched);
    QPoint global_position;
    if (const auto *mouse = dynamic_cast<const QMouseEvent *>(event)) {
        global_position = mouse->globalPosition().toPoint();
    }
    const bool inside_pet_window = pet_window_ != nullptr
        && pet_window_->frameGeometry().contains(global_position);
    const bool is_pet_target = desktop_pet_
        && (watched == pet_window_
            || watched == pet_web_view_
            || (widget != nullptr && pet_window_ != nullptr && pet_window_->isAncestorOf(widget))
            || inside_pet_window);
    if (is_pet_target || (desktop_pet_ && dragging_)) {
        if (event->type() == QEvent::MouseButtonDblClick) {
            const auto *mouse = static_cast<QMouseEvent *>(event);
            if (is_pet_target && mouse->button() == Qt::LeftButton) {
                setDesktopPet(false);
                return true;
            }
        } else if (event->type() == QEvent::MouseButtonPress) {
            const auto *mouse = static_cast<QMouseEvent *>(event);
            if (is_pet_target && mouse->button() == Qt::LeftButton) {
                if (auto *window = pet_window_->windowHandle();
                    window != nullptr && window->startSystemMove()) {
                    dragging_ = false;
                    return true;
                }
                dragging_ = true;
                drag_offset_ = mouse->globalPosition().toPoint() - pet_window_->frameGeometry().topLeft();
                return true;
            }
        } else if (event->type() == QEvent::MouseMove && dragging_) {
            const auto *mouse = static_cast<QMouseEvent *>(event);
            pet_window_->move(mouse->globalPosition().toPoint() - drag_offset_);
            return true;
        } else if (event->type() == QEvent::MouseButtonRelease && dragging_) {
            dragging_ = false;
            return true;
        }
    }
    return QMainWindow::eventFilter(watched, event);
}

void HarnessWindow::showServerError(const QString &message) {
    page_loaded_ = false;
    page_ready_ = false;
    readiness_timer_->stop();
    showErrorState("无法连接到 Harness", message + "\n请确认 Node.js 与 pnpm 已安装，然后重试。" );
    updateStatus("无法启动 Harness：" + message + "。请确认 Node.js 与 pnpm 已安装。");
}

void HarnessWindow::showLoadingState(const QString &title, const QString &description) {
    state_icon_->setText("DH");
    state_icon_->setStyleSheet(QString());
    state_kicker_->setText("DESKTOP SHELL");
    state_title_->setText(title);
    state_description_->setText(description);
    state_progress_->setVisible(true);
    state_action_->setVisible(false);
    state_action_->setEnabled(true);
    content_stack_->setCurrentWidget(state_view_);
}

void HarnessWindow::showErrorState(const QString &title, const QString &description) {
    state_icon_->setText("!");
    state_icon_->setStyleSheet(
        "background: #ff7a90; color: #241018; border-radius: 26px; font-size: 22px; font-weight: 700;");
    state_kicker_->setText("LOCAL SERVICE");
    state_title_->setText(title);
    state_description_->setText(description);
    state_progress_->setVisible(false);
    state_action_->setVisible(true);
    state_action_->setEnabled(true);
    content_stack_->setCurrentWidget(state_view_);
}

void HarnessWindow::retryHarness() {
    if (stopping_) return;

    page_loaded_ = false;
    page_ready_ = false;
    page_retry_attempts_ = 0;
    readiness_attempts_ = 0;
    probe_in_flight_ = false;
    showLoadingState("正在重新连接", "重新检查本地 Harness 服务…");

    if (server_->state() == QProcess::NotRunning) {
        startHarness();
        return;
    }

    readiness_timer_->start();
    probeHarness();
}

void HarnessWindow::reloadWebView() {
    if (server_->state() != QProcess::Running || !page_loaded_) {
        retryHarness();
        return;
    }

    page_retry_attempts_ = 0;
    page_ready_ = false;
    showLoadingState("正在刷新工作区", "重新加载网页插件和会话状态…");
    updateStatus("正在重新加载 Harness…");
    web_view_->reload();
}

void HarnessWindow::updateStatus(const QString &message) {
    qInfo().noquote() << "[deepseek-harness-qt] Status:" << message.left(240);
}

void HarnessWindow::closeEvent(QCloseEvent *event) {
    if (pet_window_ != nullptr) pet_window_->hide();
    stopHarness();
    event->accept();
}

#include "harness_window.moc"
