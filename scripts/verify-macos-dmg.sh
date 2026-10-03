#!/usr/bin/env bash
# Verify the actual shipped app, not just the pre-packaging build directory.
# Ad-hoc signing checks integrity; it does not imply Apple notarization/trust.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ! -f "$1" || (${2:-} != "" && ${2:-} != --require-layout) ]]; then
  echo "Usage: $0 <dmg> [--require-layout]" >&2
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

if [[ ${2:-} == --require-layout ]]; then
  if [[ ! -s "$work_dir/mount/.DS_Store" ]]; then
    echo "Missing Finder layout (.DS_Store); DMG appearance step was skipped." >&2
    exit 1
  fi
  if [[ ! -L "$work_dir/mount/Applications" || $(readlink "$work_dir/mount/Applications") != /Applications ]]; then
    echo "Missing Applications installation shortcut." >&2
    exit 1
  fi
  echo "Finder layout metadata and Applications shortcut present."
fi

shopt -s nullglob
apps=("$work_dir/mount/"*.app)
if [[ ${#apps[@]} -ne 1 ]]; then
  echo "Expected exactly one app in the DMG; found ${#apps[@]}" >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "${apps[0]}"
echo "DMG checksum and packaged app signature verified (not a notarization check)."
