#!/usr/bin/env bash
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
mkdir -p android-widget-evidence
SDK_ROOT="${ANDROID_HOME:?}"
export PATH="$SDK_ROOT/platform-tools:$SDK_ROOT/emulator:$PATH"
export ANDROID_USER_HOME="$RUNNER_TEMP/we3d-portal-android"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
export ANDROID_SERIAL=emulator-5566
mkdir -p "$ANDROID_AVD_HOME"
sudo chmod 666 /dev/kvm
"$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" "system-images;android-35;default;x86_64" "emulator"
printf 'no\n' | "$SDK_ROOT/cmdline-tools/latest/bin/avdmanager" create avd -n we3d-portal -k "system-images;android-35;default;x86_64"
emulator -avd we3d-portal -port 5566 -no-window -no-audio -no-snapshot -gpu swiftshader_indirect -memory 2048 > android-widget-evidence/emulator.log 2>&1 &
WIDGET_EMULATOR_PID=$!
trap 'timeout 8 adb -s "$ANDROID_SERIAL" emu kill || true; kill "$WIDGET_EMULATOR_PID" 2>/dev/null || true' EXIT
timeout 120 adb wait-for-device
timeout 240 bash -c 'until [ "$(adb shell getprop sys.boot_completed | tr -d "\r")" = 1 ]; do sleep 2; done'
adb shell input keyevent 82
adb shell wm size 720x1600
adb shell wm density 320
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell svc wifi disable
adb shell svc data disable
adb install android/app/build/outputs/apk/debug/app-debug.apk
adb shell appwidget grantbind --package io.worldexplorer3d.app
adb logcat -c
adb shell am instrument -w -e ownedEmulator true io.worldexplorer3d.app/.PortalWidgetContractInstrumentation > android-widget-evidence/result.txt
adb logcat -d > android-widget-evidence/logcat.txt
adb shell dumpsys appwidget > android-widget-evidence/widget-ownership.txt
for name in widget-investigation widget-saved native-trail native-account widget-compact; do
    adb exec-out run-as io.worldexplorer3d.app cat "files/portal-evidence/$name.png" > "android-widget-evidence/$name.png" || true
done
git rev-parse HEAD > android-widget-evidence/source-commit.txt
git rev-parse HEAD:android/app/src/main > android-widget-evidence/native-main-source-tree.txt
cat android-widget-evidence/result.txt
grep -q 'INSTRUMENTATION_RESULT: passed=true' android-widget-evidence/result.txt
