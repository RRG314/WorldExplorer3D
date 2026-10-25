#!/usr/bin/env bash
set -euo pipefail
mkdir -p android-launch-evidence
SDK_ROOT="${ANDROID_HOME:?}"
export PATH="$SDK_ROOT/platform-tools:$SDK_ROOT/emulator:$PATH"
sudo chmod 666 /dev/kvm
"$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" "system-images;android-35;google_apis_playstore;x86_64" "emulator"
printf 'no\n' | "$SDK_ROOT/cmdline-tools/latest/bin/avdmanager" create avd -n we3d-launch -k "system-images;android-35;google_apis_playstore;x86_64" --force
emulator -avd we3d-launch -no-window -no-audio -no-snapshot -gpu swiftshader_indirect -memory 2048 > android-launch-evidence/emulator.log 2>&1 &
EMULATOR_PID=$!
trap 'adb emu kill || true; wait "$EMULATOR_PID" || true' EXIT
adb wait-for-device
timeout 240 bash -c 'until [ "$(adb shell getprop sys.boot_completed | tr -d "\r")" = 1 ]; do sleep 2; done'
adb shell input keyevent 82
adb shell getprop ro.build.version.release > android-launch-evidence/android-version.txt
adb shell pm list packages | sort > android-launch-evidence/packages.txt
adb install android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10000000 -n io.worldexplorer3d.app/.GameLauncherActivity > android-launch-evidence/start.txt
sleep 18
adb logcat -d > android-launch-evidence/logcat.txt
adb shell dumpsys activity activities > android-launch-evidence/activities.txt
adb exec-out screencap -p > android-launch-evidence/launch.png
if rg -q 'FATAL EXCEPTION|Process: io.worldexplorer3d.app' android-launch-evidence/logcat.txt; then
  rg -A55 -B8 'FATAL EXCEPTION|Process: io.worldexplorer3d.app' android-launch-evidence/logcat.txt
  exit 1
fi
