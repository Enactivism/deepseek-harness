cmake_minimum_required(VERSION 3.21)

project(deepseek_harness_qt LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Network Widgets WebEngineWidgets)

get_filename_component(DSH_DEFAULT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." REALPATH)

qt_add_executable(deepseek-harness-qt
    src/main.cpp
    src/desktop_pet_interaction.cpp
    src/desktop_pet_interaction.h
    src/harness_window.cpp
    src/harness_window.h
)

target_link_libraries(deepseek-harness-qt PRIVATE
    Qt6::Network
    Qt6::Widgets
    Qt6::WebEngineWidgets
)

target_compile_definitions(deepseek-harness-qt PRIVATE
    DSH_DEFAULT_ROOT="${DSH_DEFAULT_ROOT}"
)

if(BUILD_TESTING)
    add_executable(deepseek-harness-qt-desktop-pet-test
        tests/desktop_pet_interaction_test.cpp
        src/desktop_pet_interaction.cpp
        src/desktop_pet_interaction.h
    )
    target_include_directories(deepseek-harness-qt-desktop-pet-test PRIVATE src)
    target_link_libraries(deepseek-harness-qt-desktop-pet-test PRIVATE Qt6::Core)
    add_test(NAME deepseek-harness-qt-desktop-pet-test
             COMMAND deepseek-harness-qt-desktop-pet-test)
endif()

if(APPLE)
    set_target_properties(deepseek-harness-qt PROPERTIES
        MACOSX_BUNDLE TRUE
        MACOSX_BUNDLE_GUI_IDENTIFIER "ai.deepseek.harness.qt"
        MACOSX_BUNDLE_BUNDLE_NAME "DeepSeek Harness"
    )
endif()
