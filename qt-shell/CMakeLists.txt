cmake_minimum_required(VERSION 3.21)

project(deepseek_harness_qt LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Network Widgets WebEngineWidgets)

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    find_package(Qt6 REQUIRED COMPONENTS DBus)
endif()

get_filename_component(DSH_DEFAULT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." REALPATH)

qt_add_executable(deepseek-harness-qt
    src/main.cpp
    src/desktop_pet_interaction.cpp
    src/desktop_pet_interaction.h
    src/desktop_pointer_bridge.cpp
    src/desktop_pointer_bridge.h
    src/harness_window.cpp
    src/harness_window.h
)

target_link_libraries(deepseek-harness-qt PRIVATE
    Qt6::Network
    Qt6::Widgets
    Qt6::WebEngineWidgets
)

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    find_package(X11 REQUIRED)
    target_link_libraries(deepseek-harness-qt PRIVATE Qt6::DBus X11::X11)
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    set(DSH_POINTER_EXTENSION_DIR
        "${CMAKE_CURRENT_SOURCE_DIR}/gnome-shell-extension/dsh-pointer@deepseek.ai")
    set(DSH_POINTER_EXTENSION_ARCHIVE
        "${CMAKE_CURRENT_BINARY_DIR}/dsh-pointer@deepseek.ai.zip")
    add_custom_command(
        OUTPUT "${DSH_POINTER_EXTENSION_ARCHIVE}"
        COMMAND ${CMAKE_COMMAND} -E tar cf "${DSH_POINTER_EXTENSION_ARCHIVE}"
                --format=zip metadata.json extension.js
        WORKING_DIRECTORY "${DSH_POINTER_EXTENSION_DIR}"
        DEPENDS
            "${DSH_POINTER_EXTENSION_DIR}/metadata.json"
            "${DSH_POINTER_EXTENSION_DIR}/extension.js"
        VERBATIM
    )
    add_custom_target(dsh-pointer-extension
        DEPENDS "${DSH_POINTER_EXTENSION_ARCHIVE}")
endif()

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
