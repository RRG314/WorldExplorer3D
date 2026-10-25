#!/usr/bin/env bash
set -euo pipefail
mkdir -p android-launch-evidence
SDK_ROOT="${ANDROID_HOME:?}"
export PATH="$SDK_ROOT/platform-tools:$SDK_ROOT/emulator:$PATH"
export ANDROID_USER_HOME="$RUNNER_TEMP/we3d-android"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
mkdir -p "$ANDROID_AVD_HOME"
sudo chmod 666 /dev/kvm
"$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" "system-images;android-35;google_apis_playstore;x86_64" "emulator"
printf 'no\n' | "$SDK_ROOT/cmdline-tools/latest/bin/avdmanager" create avd -n we3d-launch -k "system-images;android-35;google_apis_playstore;x86_64" --force
test -f "$ANDROID_AVD_HOME/we3d-launch.ini"
emulator -list-avds
emulator -avd we3d-launch -no-window -no-audio -no-snapshot -gpu swiftshader_indirect -memory 2048 > android-launch-evidence/emulator.log 2>&1 &
EMULATOR_PID=$!
trap 'timeout 8 adb emu kill || true; kill "$EMULATOR_PID" 2>/dev/null || true' EXIT
if ! timeout 120 adb wait-for-device; then cat android-launch-evidence/emulator.log; exit 1; fi
timeout 240 bash -c 'until [ "$(adb shell getprop sys.boot_completed | tr -d "\r")" = 1 ]; do sleep 2; done'
adb shell input keyevent 82
adb shell getprop ro.build.version.release > android-launch-evidence/android-version.txt
adb shell dumpsys package com.android.chrome > android-launch-evidence/browser-package.txt
# Exercise release bytecode. The temporary CI key is never the owner's upload
# key and is not used for any distributed package or production association.
keytool -genkeypair -keystore "$RUNNER_TEMP/launch-check.p12" -storepass android -alias check -keyalg RSA -validity 2 -dname CN=LaunchCheck
"$SDK_ROOT/build-tools/36.0.0/apksigner" sign --ks "$RUNNER_TEMP/launch-check.p12" --ks-pass pass:android --out "$RUNNER_TEMP/launch-check.apk" android/app/build/outputs/apk/release/app-release-unsigned.apk
adb install "$RUNNER_TEMP/launch-check.apk"
adb shell dumpsys package io.worldexplorer3d.app > android-launch-evidence/app-package.txt
capture() {
  local phase="$1"
  adb logcat -d > "android-launch-evidence/$phase-logcat.txt"
  adb shell dumpsys activity activities > "android-launch-evidence/$phase-activities.txt"
  adb shell uiautomator dump /sdcard/launch-ui.xml
  adb pull /sdcard/launch-ui.xml "android-launch-evidence/$phase-ui.xml"
  adb exec-out screencap -p > "android-launch-evidence/$phase.png"
  node scripts/verification/check-android-launch.mjs android-launch-evidence "$phase"
}
start() {
  adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10000000 -n io.worldexplorer3d.app/.GameLauncherActivity
}
adb logcat -c
start > android-launch-evidence/online-start.txt
sleep 12
capture online
adb shell am force-stop io.worldexplorer3d.app
adb shell am force-stop com.android.chrome
adb shell svc wifi disable
adb shell svc data disable
sleep 3
adb logcat -c
start > android-launch-evidence/offline-start.txt
sleep 3
capture offline
adb shell svc wifi enable
adb shell svc data enable
sleep 5
# Tap the retry control from its actual UI bounds, independent of device size.
read -r RETRY_X RETRY_Y < <(python3 - <<'PY'
import xml.etree.ElementTree as ET, re
root=ET.parse('android-launch-evidence/offline-ui.xml')
node=next(n for n in root.iter('node') if n.get('resource-id','').endswith(':id/retry_connection'))
x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
print((x1+x2)//2,(y1+y2)//2)
PY
)
adb logcat -c
adb shell input tap "$RETRY_X" "$RETRY_Y"
sleep 12
capture retry
adb shell am force-stop io.worldexplorer3d.app
adb shell am force-stop com.android.chrome
adb logcat -c
start > android-launch-evidence/relaunch-start.txt
sleep 8
capture relaunch
