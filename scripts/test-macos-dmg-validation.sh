#!/usr/bin/env bash
# Native integration regression: reject unsealed/tampered apps, accept sealed apps.
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ip-radar-signing-test.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
app="$work_dir/input/Signature Test.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>signature-test</string>
<key>CFBundleIdentifier</key><string>com.ipradar.signature-test</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
echo 'int main(void) { return 0; }' > "$work_dir/main.c"
xcrun clang "$work_dir/main.c" -o "$app/Contents/MacOS/signature-test"
echo 'original resource' > "$app/Contents/Resources/test.txt"

check_image() {
  local name="$1" expected="$2" actual=0
  hdiutil create -quiet -volname 'Signature Test' -srcfolder "$work_dir/input" \
    -format UDZO "$work_dir/$name.dmg"
  bash "$script_dir/verify-macos-dmg.sh" "$work_dir/$name.dmg" \
    > "$work_dir/$name.log" 2>&1 || actual=$?
  if [[ "$actual" -ne "$expected" ]]; then
    cat "$work_dir/$name.log" >&2
    echo "FAIL: $name expected exit $expected, got $actual" >&2
    exit 1
  fi
  if [[ "$expected" -ne 0 ]]; then
    # Prove rejection came from codesign, not a broken image or mount failure.
    grep -Eq 'code has no resources|not signed at all|sealed resource is missing or invalid' "$work_dir/$name.log"
  fi
  echo "PASS: $name (exit $actual)"
}

check_image linker-only 1
codesign --force --sign - "$app"
check_image sealed 0
if bash "$script_dir/verify-macos-dmg.sh" "$work_dir/sealed.dmg" --require-layout \
  > "$work_dir/layout.log" 2>&1; then
  echo "FAIL: layout-less DMG passed --require-layout" >&2
  exit 1
fi
grep -q 'Missing Finder layout' "$work_dir/layout.log"
echo "PASS: missing Finder layout rejected"
echo 'modified resource' > "$app/Contents/Resources/test.txt"
check_image tampered 1
