#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_URL="https://worldexplorer3d.io"
WRAPPER_DIR="$ROOT_DIR/itch-wrapper"
DIST_DIR="$ROOT_DIR/dist"
INDEX_PATH="$WRAPPER_DIR/index.html"
ZIP_PATH="$DIST_DIR/worldexplorer3d-itch-wrapper.zip"

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

command -v zip >/dev/null 2>&1 || fail "Missing required command: zip"
command -v unzip >/dev/null 2>&1 || fail "Missing required command: unzip"

mkdir -p "$WRAPPER_DIR"
pass "Created/verified wrapper folder: $WRAPPER_DIR"

cat >"$INDEX_PATH" <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>World Explorer 3D</title>
    <meta http-equiv="refresh" content="0; url=https://worldexplorer3d.io" />
    <script>
      window.location.replace("https://worldexplorer3d.io");
    </script>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; text-align:center; }
      a { word-break: break-all; }
    </style>
  </head>
  <body>
    <h1>World Explorer 3D</h1>
    <p>If you are not redirected automatically, click here:</p>
    <p><a href="https://worldexplorer3d.io" rel="noopener">https://worldexplorer3d.io</a></p>
  </body>
</html>
HTML
pass "Generated wrapper file: $INDEX_PATH"

mkdir -p "$DIST_DIR"
pass "Created/verified dist folder: $DIST_DIR"

rm -f "$ZIP_PATH"
(
  cd "$WRAPPER_DIR"
  zip -q "$ZIP_PATH" index.html
)
pass "Built zip artifact: $ZIP_PATH"

[[ -f "$ZIP_PATH" ]] || fail "Zip file was not created: $ZIP_PATH"
pass "Zip file exists"

ZIP_ENTRIES="$(unzip -Z1 "$ZIP_PATH")"
printf '%s\n' "$ZIP_ENTRIES" | grep -Fxq "index.html" || fail "Zip does not contain index.html at root"
printf '%s\n' "$ZIP_ENTRIES" | grep -Fxq "itch-wrapper/index.html" && fail "Zip is incorrectly nested under itch-wrapper/"
pass "Zip structure verified (index.html at root)"

grep -Fq "$TARGET_URL" "$INDEX_PATH" || fail "index.html does not contain target URL: $TARGET_URL"
pass "index.html contains target URL"

unzip -p "$ZIP_PATH" index.html | grep -Fq "$TARGET_URL" || fail "Zipped index.html does not contain target URL: $TARGET_URL"
pass "Zipped index.html contains target URL"

printf '[DONE] Wrapper build complete: %s\n' "$ZIP_PATH"
