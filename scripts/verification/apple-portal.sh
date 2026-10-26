#!/usr/bin/env bash
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
export DEVELOPER_DIR=/Applications/Xcode_26.6.app/Contents/Developer
test -d "$DEVELOPER_DIR"
mkdir -p apple-portal-evidence
APPLE_PRIVATE="$RUNNER_TEMP/we3d-apple-private"
mkdir -p "$APPLE_PRIVATE"
chmod 700 "$APPLE_PRIVATE"
git rev-parse HEAD > apple-portal-evidence/source-commit.txt
xcodebuild -version > apple-portal-evidence/xcode-version.txt
# Raw SDK/debug credentials and xcresult console attachments are never uploaded.
sanitize() {
  python3 - "$1" "$2" <<'PY'
import re,sys
from pathlib import Path
data=Path(sys.argv[1]).read_text(errors='replace')
data=re.sub(r'(?im)^.*(?:debug token|FIRAppCheckDebugToken|X-Firebase-AppCheck|Authorization:|refreshToken|idToken|customToken).*$','[private authentication diagnostic omitted]',data)
data=re.sub(r'AIza[0-9A-Za-z_-]{30,}', '[public SDK key omitted]', data)
data=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[private token omitted]', data)
Path(sys.argv[2]).write_text(data)
PY
}
finish() {
  if test -n "${APPLE_SIMULATOR:-}"; then
    xcrun simctl spawn "$APPLE_SIMULATOR" log show --style compact --info --debug --last 20m --predicate 'process == "LivingPortalWidget" OR (eventMessage CONTAINS[c] "worldexplorer" AND (subsystem BEGINSWITH[c] "com.apple.widgetkit" OR process == "runningboardd" OR process == "SpringBoard"))' > "$APPLE_PRIVATE/widget-system.log" 2>&1 || true
    sanitize "$APPLE_PRIVATE/widget-system.log" "apple-portal-evidence/widget-system.log"
  fi
  for step in resolve build test native-live; do
    if test -f "$APPLE_PRIVATE/$step.log"; then sanitize "$APPLE_PRIVATE/$step.log" "apple-portal-evidence/$step.log"; fi
  done
  if test -d "$APPLE_PRIVATE/Portal.xcresult"; then
    xcrun xcresulttool export attachments --path "$APPLE_PRIVATE/Portal.xcresult" --output-path "$APPLE_PRIVATE/attachments" > "$APPLE_PRIVATE/export.log" 2>&1 || true
    python3 - "$APPLE_PRIVATE/attachments" <<'PY'
from pathlib import Path
import shutil,sys
root=Path(sys.argv[1]); out=Path('apple-portal-evidence/screenshots');out.mkdir(exist_ok=True)
for source in root.rglob('*.png'):
    shutil.copyfile(source,out/source.name)
PY
  fi
  if test -n "${APPLE_SIMULATOR:-}"; then
    xcrun simctl shutdown "$APPLE_SIMULATOR" >/dev/null 2>&1 || true
    xcrun simctl delete "$APPLE_SIMULATOR" >/dev/null 2>&1 || true
  fi
}
trap finish EXIT
mkdir -p apple/WorldExplorerPortal.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
cp apple/Package.resolved apple/WorldExplorerPortal.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
xcodebuild -resolvePackageDependencies -onlyUsePackageVersionsFromResolvedFile -project apple/WorldExplorerPortal.xcodeproj -scheme WorldExplorerPortal -clonedSourcePackagesDirPath "$RUNNER_TEMP/we3d-apple-packages" > "$APPLE_PRIVATE/resolve.log" 2>&1
cp apple/WorldExplorerPortal.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved apple-portal-evidence/Package.resolved
cmp apple/Package.resolved apple-portal-evidence/Package.resolved
# Select an available iOS runtime and iPhone. Refuse to borrow any existing phone.
xcrun simctl list runtimes -j > "$APPLE_PRIVATE/runtimes.json"
xcrun simctl list devicetypes -j > "$APPLE_PRIVATE/types.json"
read -r APPLE_DEVICE_TYPE APPLE_RUNTIME < <(python3 - "$APPLE_PRIVATE" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
runtimes=[r for r in json.loads((root/'runtimes.json').read_text())['runtimes'] if r.get('isAvailable') and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-')]
types=[r for r in json.loads((root/'types.json').read_text())['devicetypes'] if r['name']=='iPhone 17 Pro']
assert runtimes and types, 'The required owned iPhone simulator is unavailable.'
print(types[0]['identifier'],sorted(runtimes,key=lambda r:tuple(map(int,r['version'].split('.'))))[-1]['identifier'])
PY
)
APPLE_SIMULATOR=$(xcrun simctl create "WorldExplorer-Owned-$GITHUB_RUN_ID" "$APPLE_DEVICE_TYPE" "$APPLE_RUNTIME")
printf '%s\n' "$APPLE_SIMULATOR" > apple-portal-evidence/owned-simulator.txt
xcrun simctl boot "$APPLE_SIMULATOR"
xcrun simctl bootstatus "$APPLE_SIMULATOR" -b > "$APPLE_PRIVATE/boot.log" 2>&1
xcodebuild build-for-testing -project apple/WorldExplorerPortal.xcodeproj -scheme WorldExplorerPortal -configuration Debug -destination "id=$APPLE_SIMULATOR" -derivedDataPath "$RUNNER_TEMP/we3d-apple-derived" -clonedSourcePackagesDirPath "$RUNNER_TEMP/we3d-apple-packages" -disableAutomaticPackageResolution CODE_SIGN_IDENTITY=- > "$APPLE_PRIVATE/build.log" 2>&1
# Keep the array nonempty: macOS Bash 3.2 treats an empty array as unset under -u.
APPLE_JOURNEY=(-parallel-testing-enabled NO)
if test "${WE3D_PORTAL_APPLE_WIDGET_ONLY:-false}" = true; then APPLE_JOURNEY+=(-only-testing:PortalUITests/PortalUITests/testHomeScreenWidget); fi
APPLE_UI_STATUS=0
xcodebuild test-without-building -project apple/WorldExplorerPortal.xcodeproj -scheme WorldExplorerPortal -configuration Debug -destination "id=$APPLE_SIMULATOR" -derivedDataPath "$RUNNER_TEMP/we3d-apple-derived" -resultBundlePath "$APPLE_PRIVATE/Portal.xcresult" "${APPLE_JOURNEY[@]}" CODE_SIGN_IDENTITY=- > "$APPLE_PRIVATE/test.log" 2>&1 || APPLE_UI_STATUS=$?
# Run only the added SDK journey when an owned short-lived identity is present.
# Reuse this exact build and simulator; do not restart the offline UI sequence.
APPLE_LIVE_STATUS=not-requested
if test -n "${WE3D_PORTAL_APPLE_ACCEPTANCE:-}"; then
    xcrun simctl terminate "$APPLE_SIMULATOR" io.worldexplorer3d.app.staging >/dev/null 2>&1 || true
    APPLE_CONTAINER=$(xcrun simctl get_app_container "$APPLE_SIMULATOR" io.worldexplorer3d.app.staging data)
    mkdir -p "$APPLE_CONTAINER/Documents"
    umask 077
    printf '%s' "$WE3D_PORTAL_APPLE_ACCEPTANCE" > "$APPLE_CONTAINER/Documents/native-acceptance.json"
    unset WE3D_PORTAL_APPLE_ACCEPTANCE
    APPLE_LIVE_STATUS=0
    xcodebuild test-without-building -project apple/WorldExplorerPortal.xcodeproj -scheme WorldExplorerPortal -configuration Debug -destination "id=$APPLE_SIMULATOR" -derivedDataPath "$RUNNER_TEMP/we3d-apple-derived" -resultBundlePath "$APPLE_PRIVATE/NativeLive.xcresult" -parallel-testing-enabled NO -only-testing:PortalTests/PortalNativeLiveTests CODE_SIGN_IDENTITY=- > "$APPLE_PRIVATE/native-live.log" 2>&1 || APPLE_LIVE_STATUS=$?
    # XCTest can replace the host's data-container directory during installation.
    # Clean the captured and current owned locations without failing on a file
    # the simulator has already removed.
    rm -f "$APPLE_CONTAINER/Documents/native-acceptance.json"
    if APPLE_CURRENT_CONTAINER=$(xcrun simctl get_app_container "$APPLE_SIMULATOR" io.worldexplorer3d.app.staging data 2>/dev/null); then
      rm -f "$APPLE_CURRENT_CONTAINER/Documents/native-acceptance.json"
    fi
fi
python3 - "$APPLE_UI_STATUS" "$APPLE_LIVE_STATUS" "${WE3D_PORTAL_APPLE_WIDGET_ONLY:-false}" <<'PY'
import json,sys
from pathlib import Path
Path('apple-portal-evidence/journey-status.json').write_text(json.dumps({'uiExitCode':int(sys.argv[1]),'uiScope':'Home Screen widget only' if sys.argv[3]=='true' else 'Native app and Home Screen widget','nativeSDKExitCode':None if sys.argv[2]=='not-requested' else int(sys.argv[2]),'scope':'Owned iOS simulator. Controlled HTTP browser role and temporary debug attestation for requested SDK check. Not physical iPhone, App Attest, TestFlight or headset acceptance.'},indent=2)+'\n')
PY
test "$APPLE_UI_STATUS" = 0
test "$APPLE_LIVE_STATUS" = not-requested || test "$APPLE_LIVE_STATUS" = 0
