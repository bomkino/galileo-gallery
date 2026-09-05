#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo "The app build requires an Apple-silicon Mac." >&2; exit 1; }
output="${1:-release-native}"
version="$(cat native/VERSION)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid version" >&2; exit 1; }
swift build --package-path native -c release
binary_dir="$(swift build --package-path native -c release --show-bin-path)"
app="$output/Galileo Gallery.app"
mkdir -p "$output"
[[ ! -e "$app" ]] || { echo "Refusing to replace an existing app bundle: $app" >&2; exit 1; }
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$binary_dir/GalileoGallery" "$app/Contents/MacOS/GalileoGallery"
cp build/icon.icns "$app/Contents/Resources/icon.icns"
cp LICENSE THIRD_PARTY_NOTICES.md "$app/Contents/Resources/"
cp native/Resources/Help.html "$app/Contents/Resources/Help.html"
GALLERY_APP="$app" GALLERY_VERSION="$version" GALLERY_SHA="$(git rev-parse HEAD)" python3 - <<'PY'
import os, pathlib, plistlib, json
app=pathlib.Path(os.environ['GALLERY_APP'])
info={
'CFBundleExecutable':'GalileoGallery','CFBundleIdentifier':'dog.pitch.galileo-gallery',
'CFBundleName':'Galileo Gallery','CFBundleDisplayName':'Galileo Gallery','CFBundlePackageType':'APPL',
'CFBundleShortVersionString':os.environ['GALLERY_VERSION'],'CFBundleVersion':os.environ['GALLERY_VERSION'],
'CFBundleIconFile':'icon.icns','NSPrincipalClass':'NSApplication','NSHighResolutionCapable':True,
'LSMinimumSystemVersion':'14.0','LSArchitecturePriority':['arm64'],'LSRequiresNativeExecution':True,
'NSHumanReadableCopyright':'pitch.dog. GPL-3.0.',
'CFBundleDocumentTypes':[{'CFBundleTypeName':'Galileo Document','CFBundleTypeRole':'Editor','LSHandlerRank':'Owner','LSItemContentTypes':['dog.pitch.galileo.document'],'CFBundleTypeExtensions':['galileo'],'LSTypeIsPackage':True,'NSDocumentClass':'GalileoDocument'}],
'UTExportedTypeDeclarations':[
 {'UTTypeIdentifier':'dog.pitch.galileo.document','UTTypeDescription':'Galileo Gallery Document','UTTypeConformsTo':['com.apple.package'],'UTTypeTagSpecification':{'public.filename-extension':['galileo']}},
 {'UTTypeIdentifier':'dog.pitch.galileo.preset','UTTypeDescription':'Galileo Scene Preset','UTTypeConformsTo':['public.json'],'UTTypeTagSpecification':{'public.filename-extension':['galileo-preset']}}
]}
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
(app/'Contents/Resources/build.json').write_text(json.dumps({'version':os.environ['GALLERY_VERSION'],'sourceSha':os.environ['GALLERY_SHA'],'platform':'macOS','architecture':'arm64','signing':'ad-hoc; not notarized'},indent=2)+'\n')
PY
# Keep the existing project's ad-hoc distribution policy. Do not imply notarization.
codesign --force --sign - --timestamp=none "$app"
codesign --verify --deep --strict "$app"
[[ "$(lipo -archs "$app/Contents/MacOS/GalileoGallery")" == arm64 ]]
if otool -L "$app/Contents/MacOS/GalileoGallery" | grep -Ei 'Electron|Chromium|ffmpeg|WebKit'; then
    echo "A forbidden browser/legacy dependency is linked." >&2; exit 1
fi
printf '%s\n' "$app"
