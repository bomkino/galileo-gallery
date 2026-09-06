#!/bin/bash
# Install the latest published Mac release. Never force-quit or alter projects.
set -euo pipefail
umask 077
[[ "$(uname -s)" == Darwin && "$(sysctl -n hw.optional.arm64 2>/dev/null)" == 1 ]] || { echo 'An Apple-silicon Mac is required.' >&2; exit 1; }
(( $(sw_vers -productVersion | cut -d. -f1) >= 14 )) || { echo 'macOS 14 or later is required.' >&2; exit 1; }
(( EUID != 0 )) || { echo 'Run this as your normal Mac user, not with sudo.' >&2; exit 1; }
REPO=bomkino/galileo-gallery
DEST='/Applications/Galileo Gallery.app'
ID=dog.pitch.galileo-gallery
WORK="$(mktemp -d "${TMPDIR:-/tmp}/galileo-install.XXXXXX")"
STAGE=''; BACKUP=''; COMMITTED=false; NEW_INSTALLED=false
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  set +e
  if ! $COMMITTED; then
    if $NEW_INSTALLED && [[ -d "$DEST" && -n "$STAGE" ]]; then sudo mv "$DEST" "$STAGE/failed.app"; fi
    if [[ -n "$BACKUP" && -d "$BACKUP" && ! -e "$DEST" ]]; then
      sudo mv "$BACKUP" "$DEST" || echo "Previous app remains at: $BACKUP" >&2
    fi
  fi
  hdiutil detach "$WORK/mount" -quiet 2>/dev/null
  [[ -z "$STAGE" ]] || sudo rm -rf "$STAGE"
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
get() { curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSL --retry 3 --connect-timeout 20 --max-time 300 "$1" -o "$2"; }
get "https://api.github.com/repos/$REPO/releases/latest" "$WORK/release.json"
TAG="$(plutil -extract tag_name raw -o - "$WORK/release.json")"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Unexpected release tag.' >&2; exit 1; }
[[ "$(plutil -extract draft raw -o - "$WORK/release.json")" == false && "$(plutil -extract prerelease raw -o - "$WORK/release.json")" == false ]]
VERSION="${TAG#v}"; FILE="Galileo.Gallery-$VERSION-macOS-arm64.dmg"
BASE="https://github.com/$REPO/releases/download/$TAG"
echo "Downloading Galileo Gallery $VERSION…"
get "$BASE/$FILE" "$WORK/$FILE"
get "$BASE/SHA256SUMS.txt" "$WORK/sums"
EXPECTED="$(awk -v f="$FILE" '$2 == f {print $1}' "$WORK/sums")"
[[ "$EXPECTED" =~ ^[0-9a-f]{64}$ && "$(shasum -a 256 "$WORK/$FILE" | cut -d' ' -f1)" == "$EXPECTED" ]] || { echo 'Checksum mismatch; installation stopped.' >&2; exit 1; }
get "https://api.github.com/repos/$REPO/git/ref/tags/$TAG" "$WORK/tag.json"
SHA="$(plutil -extract object.sha raw -o - "$WORK/tag.json")"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]]
if [[ "$(plutil -extract object.type raw -o - "$WORK/tag.json")" == tag ]]; then
  get "https://api.github.com/repos/$REPO/git/tags/$SHA" "$WORK/tag.json"
  SHA="$(plutil -extract object.sha raw -o - "$WORK/tag.json")"
fi
[[ "$(plutil -extract object.type raw -o - "$WORK/tag.json")" == commit && "$SHA" =~ ^[0-9a-f]{40}$ ]]
mkdir "$WORK/mount"
hdiutil attach "$WORK/$FILE" -readonly -nobrowse -mountpoint "$WORK/mount" >/dev/null
SOURCE="$WORK/mount/Galileo Gallery.app"
[[ -d "$SOURCE" && ! -L "$SOURCE" ]]
[[ "$(plutil -extract CFBundleIdentifier raw -o - "$SOURCE/Contents/Info.plist")" == "$ID" ]]
[[ "$(plutil -extract CFBundleShortVersionString raw -o - "$SOURCE/Contents/Info.plist")" == "$VERSION" ]]
[[ "$(plutil -extract sourceSha raw -o - "$SOURCE/Contents/Resources/build.json")" == "$SHA" ]]
codesign --verify --deep --strict "$SOURCE"
[[ ! -L "$DEST" && ( ! -e "$DEST" || -d "$DEST" ) ]] || { echo 'Unexpected installation destination; nothing replaced.' >&2; exit 1; }
# Finish copying and verify before asking the current app to close.
sudo -v
STAGE="$(sudo mktemp -d /Applications/.galileo-install.XXXXXX)"
sudo ditto "$SOURCE" "$STAGE/Galileo Gallery.app"
sudo codesign --verify --deep --strict "$STAGE/Galileo Gallery.app"
echo 'Save your work when Galileo asks. Cancel stops this installation.'
if ! osascript <<'APPLESCRIPT'
with timeout of 120 seconds
  if application id "dog.pitch.galileo-gallery" is running then
    tell application id "dog.pitch.galileo-gallery" to quit
  end if
end timeout
APPLESCRIPT
then
  echo 'Quit was cancelled or not completed. The installed app was not replaced.' >&2
  exit 1
fi
for ((i=0; i<60; i++)); do
  if ! pgrep -x GalileoGallery >/dev/null; then break; fi
  sleep 1
done
if pgrep -x GalileoGallery >/dev/null; then
  echo 'Galileo is still running. Quit it normally, then run the installer again.' >&2
  exit 1
fi
if [[ -e "$DEST" ]]; then
  BACKUP_DIR="$HOME/Library/Application Support/Galileo Gallery/Installer Backups"
  mkdir -p "$BACKUP_DIR"
  BACKUP_DIR="$(mktemp -d "$BACKUP_DIR/$(date +%Y%m%d-%H%M%S).XXXXXX")"
  BACKUP="$BACKUP_DIR/Galileo Gallery.app"
  # Backups may cross filesystems; only remove the installed copy after ditto succeeds.
  sudo ditto "$DEST" "$BACKUP"
  sudo mv "$DEST" "$STAGE/previous.app"
fi
sudo mv "$STAGE/Galileo Gallery.app" "$DEST"
NEW_INSTALLED=true
codesign --verify --deep --strict "$DEST"
COMMITTED=true
echo "Installed Galileo Gallery $VERSION from $SHA."
[[ -z "$BACKUP" ]] || echo "Previous application: $BACKUP"
open "$DEST" || echo 'Open Galileo Gallery from Applications. For a trusted developer warning, use the per-app Open Anyway procedure.'
