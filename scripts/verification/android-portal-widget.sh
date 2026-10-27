#!/usr/bin/env bash
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
if test "${WE3D_PORTAL_NATIVE_ONLY:-false}" = true; then
    test -n "${WE3D_PORTAL_ANDROID_ACCEPTANCE:-}"
fi
mkdir -p android-widget-evidence
SDK_ROOT="${ANDROID_HOME:?}"
"$SDK_ROOT/build-tools/36.0.0/aapt2" dump badging android/app/build/outputs/apk/debug/app-debug.apk > android-widget-evidence/debug-package.txt
"$SDK_ROOT/build-tools/36.0.0/aapt2" dump xmltree android/app/build/outputs/apk/debug/app-debug.apk --file AndroidManifest.xml > android-widget-evidence/debug-manifest.txt
grep -q "package: name='io.worldexplorer3d.app.staging'" android-widget-evidence/debug-package.txt
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
adb shell pm list instrumentation > android-widget-evidence/instrumentation-components.txt
grep -Fq 'io.worldexplorer3d.app.staging/io.worldexplorer3d.app.PortalWidgetContractInstrumentation' android-widget-evidence/instrumentation-components.txt
if test "${WE3D_PORTAL_NATIVE_ONLY:-false}" != true; then
adb shell appwidget grantbind --package io.worldexplorer3d.app.staging
adb logcat -c
adb shell am instrument -w -e ownedEmulator true -e layoutOnly "${WE3D_PORTAL_LAYOUT_ONLY:-false}" -e layoutStage "${WE3D_PORTAL_LAYOUT_STAGE:-all}" io.worldexplorer3d.app.staging/io.worldexplorer3d.app.PortalWidgetContractInstrumentation > android-widget-evidence/result.txt
adb logcat -d > android-widget-evidence/logcat.txt
adb shell dumpsys appwidget > android-widget-evidence/widget-ownership.txt
node scripts/verification/android-widget-evidence.mjs

cat android-widget-evidence/result.txt
grep -q 'INSTRUMENTATION_RESULT: passed=true' android-widget-evidence/result.txt
fi
git rev-parse HEAD > android-widget-evidence/source-commit.txt
git rev-parse HEAD:android/app/src/main > android-widget-evidence/native-main-source-tree.txt
if test -n "${WE3D_PORTAL_ANDROID_ACCEPTANCE:-}"; then
    adb shell svc wifi enable
    adb shell svc data enable
    NATIVE_FIXTURE="$RUNNER_TEMP/we3d-native-acceptance.private.json"
    umask 077
    printf '%s' "$WE3D_PORTAL_ANDROID_ACCEPTANCE" > "$NATIVE_FIXTURE"
    unset WE3D_PORTAL_ANDROID_ACCEPTANCE
    # A native-only run has not launched the app and cannot depend on the UI
    # journey having created Context.filesDir first.
    adb shell run-as io.worldexplorer3d.app.staging mkdir -p files
    adb shell -T "run-as io.worldexplorer3d.app.staging sh -c 'cat > files/native-acceptance.json'" < "$NATIVE_FIXTURE"
    rm "$NATIVE_FIXTURE"
    adb logcat -c
    adb shell am instrument -w -e ownedEmulator true io.worldexplorer3d.app.staging/io.worldexplorer3d.app.PortalAccountLiveInstrumentation > android-widget-evidence/native-live-result.txt
    # Only bounded redacted SDK diagnostics enter the uploaded evidence.
    adb logcat -d > "$RUNNER_TEMP/we3d-native-logcat.private.txt"
    python3 - "$RUNNER_TEMP/we3d-native-logcat.private.txt" <<'PY'
import re,sys
from pathlib import Path
data=Path(sys.argv[1]).read_text(errors='replace')
data=re.sub(r'(?im)^.*(?:Authorization|AppCheck.*token|refreshToken|customToken|idToken).*$','[private authentication diagnostic omitted]',data)
data=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[private token omitted]',data)
Path('android-widget-evidence/native-live-logcat.txt').write_text(data)
PY
    cat android-widget-evidence/native-live-result.txt
    grep -q 'INSTRUMENTATION_RESULT: passed=true' android-widget-evidence/native-live-result.txt
fi
