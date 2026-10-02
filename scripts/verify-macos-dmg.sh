#!/usr/bin/env bash
# Verify the actual shipped app, not just the pre-packaging build directory.
# Ad-hoc signing checks integrity; it does not imply Apple notarization/trust.
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage: $0 <dmg>" >&2
  exit 1
fi

hdiutil verify "$1"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ip-radar-dmg.XXXXXX")"
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$work_dir/mount" -quiet || return
  fi
  rmdir "$work_dir/mount" "$work_dir"
}
trap cleanup EXIT
mkdir "$work_dir/mount"
hdiutil attach "$1" -readonly -nobrowse -mountpoint "$work_dir/mount" -quiet
mounted=true

shopt -s nullglob
apps=("$work_dir/mount/"*.app)
if [[ ${#apps[@]} -ne 1 ]]; then
  echo "Expected exactly one app in the DMG; found ${#apps[@]}" >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "${apps[0]}"
echo "DMG checksum and packaged app signature verified (not a notarization check)."
