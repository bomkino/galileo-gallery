#!/bin/bash
# Reproducible, offline-at-runtime VP8/VP9 compatibility tools. Never used for sound.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/native/.codecs}"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
FFMPEG_SHA=38b88335f99e76ed89ff3c93f877fdefce736c13
VPX_SHA=d168454ecd099805c675d4a98c66f4891373302a
IDENTITY="ffmpeg-8.1.2-$FFMPEG_SHA-vpx-1.15.2-$VPX_SHA-arm64-v1"
if [[ -x "$OUT/bin/ffmpeg" && -x "$OUT/bin/ffprobe" && "$(cat "$OUT/identity.txt" 2>/dev/null)" == "$IDENTITY" ]]; then exit 0; fi
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]]
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
fetch() {
  git init -q "$WORK/$1"
  git -C "$WORK/$1" remote add origin "$2"
  git -C "$WORK/$1" fetch -q --depth 1 origin "$3"
  git -C "$WORK/$1" checkout -q --detach FETCH_HEAD
  [[ "$(git -C "$WORK/$1" rev-parse HEAD)" == "$3" ]]
}
fetch ffmpeg https://github.com/FFmpeg/FFmpeg.git "$FFMPEG_SHA"
fetch libvpx https://github.com/webmproject/libvpx.git "$VPX_SHA"
mkdir -p "$OUT/bin" "$OUT/licenses" "$OUT/source"
git -C "$WORK/ffmpeg" archive --prefix=ffmpeg-8.1.2/ HEAD | gzip -n > "$OUT/source/ffmpeg-8.1.2.tar.gz"
git -C "$WORK/libvpx" archive --prefix=libvpx-1.15.2/ HEAD | gzip -n > "$OUT/source/libvpx-1.15.2.tar.gz"
cp "$WORK/ffmpeg/COPYING.LGPLv2.1" "$OUT/licenses/FFmpeg-LGPL-2.1.txt"
cp "$WORK/libvpx/LICENSE" "$OUT/licenses/libvpx-LICENSE.txt"
cp "$WORK/libvpx/PATENTS" "$OUT/licenses/libvpx-PATENTS.txt"
export MACOSX_DEPLOYMENT_TARGET=14.0
JOBS="$(sysctl -n hw.ncpu)"; (( JOBS > 8 )) && JOBS=8
(
  cd "$WORK/libvpx"
  CFLAGS='-O2 -mmacosx-version-min=14.0' ./configure --prefix="$WORK/prefix" --target=arm64-darwin20-gcc \
    --disable-examples --disable-tools --disable-docs --disable-unit-tests \
    --disable-vp8-encoder --disable-vp9-encoder --enable-vp9-highbitdepth --disable-shared --enable-static
  make -j"$JOBS"; make install
)
(
  cd "$WORK/ffmpeg"
  export PKG_CONFIG_PATH="$WORK/prefix/lib/pkgconfig"
  ./configure --prefix="$WORK/install" --cc=clang --arch=aarch64 --target-os=darwin \
    --disable-autodetect --disable-everything --disable-network --disable-doc --disable-debug \
    --disable-shared --enable-static --enable-small --enable-pthreads --enable-ffmpeg --enable-ffprobe \
    --enable-libvpx --enable-zlib --enable-protocol=file,pipe \
    --enable-demuxer=matroska,mov,image2,png_pipe,webp_pipe \
    --enable-decoder=libvpx_vp8,libvpx_vp9,png,webp,prores,rawvideo \
    --enable-encoder=prores_ks,png --enable-muxer=mov,image2,null \
    --enable-parser=vp8,vp9,png --enable-filter=scale,format,setsar,setpts,transpose,hflip,vflip \
    --enable-swscale --enable-avfilter --extra-cflags="-I$WORK/prefix/include -mmacosx-version-min=14.0" \
    --extra-ldflags="-L$WORK/prefix/lib -mmacosx-version-min=14.0"
  make -j"$JOBS" ffmpeg ffprobe
  cp ffmpeg ffprobe "$OUT/bin/"
  cp config.h config_components.h "$OUT/source/"
  cp ffbuild/config.mak "$OUT/source/ffmpeg-config.mak"
)
for TOOL in ffmpeg ffprobe; do
  strip "$OUT/bin/$TOOL"
  lipo -verify_arch arm64 "$OUT/bin/$TOOL"
  # Only system frameworks/libraries may be referenced. No Homebrew runtime.
  if otool -L "$OUT/bin/$TOOL" | tail -n +2 | grep -vE '^[[:space:]]+(/usr/lib/|/System/Library/)'; then
    echo 'Unexpected external runtime dependency.' >&2; exit 1
  fi
  codesign --force --sign - "$OUT/bin/$TOOL"
done
"$OUT/bin/ffmpeg" -hide_banner -decoders > "$OUT/decoders.txt"
"$OUT/bin/ffmpeg" -hide_banner -protocols > "$OUT/protocols.txt"
printf '%s\n' "$IDENTITY" > "$OUT/identity.txt"
(cd "$OUT" && shasum -a 256 bin/* source/*.tar.gz > SHA256SUMS.txt)
