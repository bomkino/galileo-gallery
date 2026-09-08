#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo "The app build requires an Apple-silicon Mac." >&2; exit 1; }
output="${1:-release-native}"
version="$(cat native/VERSION)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid version" >&2; exit 1; }
bash scripts/native/build-codecs.sh
swift build --package-path native -c release
binary_dir="$(swift build --package-path native -c release --show-bin-path)"
app="$output/Galileo Gallery.app"
mkdir -p "$output"
[[ ! -e "$app" ]] || { echo "Refusing to replace an existing app bundle: $app" >&2; exit 1; }
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$binary_dir/GalileoGallery" "$app/Contents/MacOS/GalileoGallery"
cp build/icon.icns "$app/Contents/Resources/icon.icns"
cp LICENSE THIRD_PARTY_NOTICES.md "$app/Contents/Resources/"
# Precompile the imported backgrounds: no shader compilation in the shipping UI.
shader="native/Sources/GalileoNative/Resources/DriftBackgrounds.metal"
xcrun -sdk macosx metal -fcikernel -c "$shader" -o "$output/DriftBackgrounds.air"
xcrun -sdk macosx metallib -cikernel "$output/DriftBackgrounds.air" -o "$app/Contents/Resources/DriftBackgrounds.metallib"
rm "$output/DriftBackgrounds.air"
cp native/Vendor/DriftBackgrounds/LICENSE "$app/Contents/Resources/Drift-AGPL-3.0.txt"
cp native/Vendor/DriftBackgrounds/NOTICE "$app/Contents/Resources/Drift-NOTICE.txt"
mkdir -p "$app/Contents/Resources/MediaTools" "$app/Contents/Resources/CodecLicenses"
cp native/.codecs/bin/ffmpeg native/.codecs/bin/ffprobe "$app/Contents/Resources/MediaTools/"
cp native/.codecs/licenses/* "$app/Contents/Resources/CodecLicenses/"
cp native/.codecs/identity.txt "$app/Contents/Resources/MediaTools/identity.txt"
for tool in ffmpeg ffprobe; do
    codesign --verify --strict "$app/Contents/Resources/MediaTools/$tool"
done
python3 scripts/native/verify-studio-fonts.py native/Resources/StudioFonts
ditto native/Resources/StudioFonts "$app/Contents/Resources/StudioFonts"
cp native/Resources/Help.html "$app/Contents/Resources/Help.html"
GALLERY_APP="$app" GALLERY_VERSION="$version" GALLERY_SHA="$(git rev-parse HEAD)" python3 - <<'PY'
import os, pathlib, plistlib, json, re
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
studio=next(p for p in json.loads(pathlib.Path('native/Package.resolved').read_text())['pins'] if p['identity']=='pitchdog-studio-ui')
expected=re.search(r'\.package\(url: "https://github.com/bomkino/pitchdog-studio-ui.git", revision: "([0-9a-f]{40})"\)', pathlib.Path('native/Package.swift').read_text()).group(1)
assert studio['location']=='https://github.com/bomkino/pitchdog-studio-ui.git' and studio['state']['revision']==expected
(app/'Contents/Resources/build.json').write_text(json.dumps({'version':os.environ['GALLERY_VERSION'],'sourceSha':os.environ['GALLERY_SHA'],'platform':'macOS','architecture':'arm64','signing':'ad-hoc; not notarized','studioUIRepository':studio['location'],'studioUIRevision':expected},indent=2)+'\n')
PY
# Keep the existing project's ad-hoc distribution policy. Do not imply notarization.
codesign --force --sign - --timestamp=none "$app"
codesign --verify --deep --strict "$app"
[[ "$(lipo -archs "$app/Contents/MacOS/GalileoGallery")" == arm64 ]]
if otool -L "$app/Contents/MacOS/GalileoGallery" | grep -Ei 'Electron|Chromium|ffmpeg|WebKit'; then
    echo "A forbidden browser/legacy dependency is linked." >&2; exit 1
fi
printf '%s\n' "$app"
