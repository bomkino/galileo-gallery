#!/bin/bash
# Package the already-built, ad-hoc-signed app without altering its contents.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo "Distribution requires an Apple-silicon Mac." >&2; exit 1; }
[[ $# == 2 ]] || { echo "Usage: $0 <app-bundle> <new-output-folder>" >&2; exit 1; }
app="$1"
output="$2"
version="$(cat native/VERSION)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid version" >&2; exit 1; }
[[ -d "$app" && -x "$app/Contents/MacOS/GalileoGallery" ]] || { echo "Native app not found." >&2; exit 1; }
[[ ! -e "$output" ]] || { echo "Use a new distribution folder: $output" >&2; exit 1; }
codesign --verify --deep --strict "$app"
[[ "$(lipo -archs "$app/Contents/MacOS/GalileoGallery")" == arm64 ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")" == "$version" ]]
mkdir -p "$output"
output="$(cd "$output" && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/galileo-distribution.XXXXXX")"
mounted=false
cleanup() {
  if $mounted; then hdiutil detach "$work/mount" -quiet || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
mkdir -p "$work/image" "$work/mount"
ditto "$app" "$work/image/Galileo Gallery.app"
ln -s /Applications "$work/image/Applications"
cat > "$work/image/Install.txt" <<'TXT'
Galileo Gallery — Apple silicon, macOS 14 or later

1. Quit the old app. Keep copies of important projects.
2. Drag Galileo Gallery to Applications. Choose Replace for the old app.
3. Eject this disk image and open Galileo Gallery from Applications.

This app is ad-hoc signed, not notarized. For a developer-verification warning,
use System Settings > Privacy & Security > Open Anyway after attempting launch.
Do not disable Gatekeeper globally or override a damaged/malware warning.

Select media and enable Bring to centre for an authored spotlight hold.
Video frames can loop during that hold. Exported movies are silent.
Legacy projects open as separate native copies; save with a different name.
TXT
base="Galileo.Gallery-${version}-macOS-arm64"
ditto -c -k --sequesterRsrc --keepParent "$work/image/Galileo Gallery.app" "$output/$base.zip"
hdiutil create -volname "Galileo Gallery" -srcfolder "$work/image" -format UDZO "$output/$base.dmg"
hdiutil verify "$output/$base.dmg"
hdiutil attach "$output/$base.dmg" -readonly -nobrowse -mountpoint "$work/mount"
mounted=true
codesign --verify --deep --strict "$work/mount/Galileo Gallery.app"
cmp "$app/Contents/MacOS/GalileoGallery" "$work/mount/Galileo Gallery.app/Contents/MacOS/GalileoGallery"
[[ "$(lipo -archs "$work/mount/Galileo Gallery.app/Contents/MacOS/GalileoGallery")" == arm64 ]]
hdiutil detach "$work/mount" -quiet
mounted=false
mkdir "$work/zip"
ditto -x -k "$output/$base.zip" "$work/zip"
codesign --verify --deep --strict "$work/zip/Galileo Gallery.app"
cmp "$app/Contents/MacOS/GalileoGallery" "$work/zip/Galileo Gallery.app/Contents/MacOS/GalileoGallery"
(cd "$output" && shasum -a 256 "$base.dmg" "$base.zip" > SHA256SUMS.txt)
printf '%s\n' "Verified distribution: $output"
