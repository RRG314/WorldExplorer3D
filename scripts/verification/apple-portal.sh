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
Path(sys.argv[2]).write_text(data)
PY
}
finish() {
  for step in resolve build test; do
    if test -f "$APPLE_PRIVATE/$step.log"; then sanitize "$APPLE_PRIVATE/$step.log" "apple-portal-evidence/$step.log"; fi
  done
  if test -n "${APPLE_SIMULATOR:-}"; then
    xcrun simctl shutdown "$APPLE_SIMULATOR" >/dev/null 2>&1 || true
    xcrun simctl delete "$APPLE_SIMULATOR" >/dev/null 2>&1 || true
  fi
}
trap finish EXIT
xcodebuild -resolvePackageDependencies -project apple/WorldExplorerPortal.xcodeproj -scheme WorldExplorerPortal -clonedSourcePackagesDirPath "$RUNNER_TEMP/we3d-apple-packages" > "$APPLE_PRIVATE/resolve.log" 2>&1
cp apple/WorldExplorerPortal.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved apple-portal-evidence/Package.resolved
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
xcodebuild test-without-building -project apple/WorldExplorerPortal.xcodeproj -scheme WorldExplorerPortal -configuration Debug -destination "id=$APPLE_SIMULATOR" -derivedDataPath "$RUNNER_TEMP/we3d-apple-derived" -resultBundlePath "$APPLE_PRIVATE/Portal.xcresult" -parallel-testing-enabled NO CODE_SIGN_IDENTITY=- > "$APPLE_PRIVATE/test.log" 2>&1
# Export only explicitly kept screenshot attachments; raw xcresult stays private.
xcrun xcresulttool export attachments --path "$APPLE_PRIVATE/Portal.xcresult" --output-path "$APPLE_PRIVATE/attachments"
python3 - "$APPLE_PRIVATE/attachments" <<'PY'
from pathlib import Path
import shutil,sys
root=Path(sys.argv[1]); out=Path('apple-portal-evidence/screenshots');out.mkdir(exist_ok=True)
for source in root.rglob('*.png'):
    shutil.copyfile(source,out/source.name)
PY
printf '%s\n' 'Native iOS simulator checks passed. This is not physical iPhone, App Attest, WidgetKit Home Screen, TestFlight or headset acceptance.' > apple-portal-evidence/scope.txt
