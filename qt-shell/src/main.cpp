#include "harness_window.h"

#include <QApplication>

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    QApplication::setApplicationName("DeepSeek Harness");
    QApplication::setApplicationDisplayName("DeepSeek Harness");
    QApplication::setOrganizationName("DeepSeek");

    HarnessWindow window;
    window.show();
    return app.exec();
}
