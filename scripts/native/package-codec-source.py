#!/usr/bin/env python3
"""Attach exact codec source/configuration and verify it matches the app helpers."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[2]
if len(sys.argv) != 3:
    raise SystemExit("Usage: package-codec-source.py <app-bundle> <release-directory>")
app, output = (Path(arg).resolve() for arg in sys.argv[1:])
codecs = root / "native/.codecs"
version = (root / "native/VERSION").read_text().strip()
identity = (codecs / "identity.txt").read_text()
if identity != (app / "Contents/Resources/MediaTools/identity.txt").read_text():
    raise SystemExit("The app and corresponding codec source do not have the same build identity.")
for line in (codecs / "SHA256SUMS.txt").read_text().splitlines():
    digest, name = line.split(None, 1)
    relative = Path(name.strip().lstrip("*"))
    if relative.is_absolute() or ".." in relative.parts:
        raise SystemExit("Unsafe codec manifest path.")
    if hashlib.sha256((codecs / relative).read_bytes()).hexdigest() != digest:
        raise SystemExit(f"Codec build cache no longer matches: {relative}")
for name in ("ffmpeg", "ffprobe"):
    if (codecs / "bin" / name).read_bytes() != (app / "Contents/Resources/MediaTools" / name).read_bytes():
        raise SystemExit(f"Packaged helper does not match the source build: {name}")
output.mkdir(parents=True, exist_ok=True)
target = output / f"Galileo.Gallery-{version}-codec-source.zip"
if target.exists():
    raise SystemExit("Refusing to replace an existing corresponding-source archive.")
source_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
readme = f"""Corresponding source for Galileo Gallery {version}'s local media tools

Galileo source: {source_sha}
Build identity: {identity.strip()}

source/ contains the exact unmodified FFmpeg and libvpx source archives and
FFmpeg configuration used by this build. licenses/ retains upstream terms.
SHA256SUMS.txt records the source archives and the distributed helper binaries;
the binaries themselves are in the app, not duplicated in this source archive.

The supplied scripts/native/build-codecs.sh contains all configure/build flags.
On an Apple-silicon Mac with compatible Xcode/Metal tools, Git, Make and
pkg-config, run:
  bash scripts/native/build-codecs.sh "$PWD/rebuilt-codecs"
The recipe fetches the exact pinned Git commits, not a moving branch/tag.
The included archives also allow inspecting/rebuilding the upstream trees
without depending on the continued availability of those repositories.
No upstream source modifications were made; only configuration selects the
local-only picture functionality. Toolchain-dependent output need not be
byte-identical. Galileo runs these standalone programs, not linked libraries.
No developer tools or network access are required by the installed app.

FFmpeg: LGPL-2.1-or-later. libvpx: see licenses/libvpx-LICENSE.txt and PATENTS.
"""
with zipfile.ZipFile(target, "x", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("README.txt", readme)
    archive.writestr("galileo-source.json", json.dumps({"version":version, "sourceSha":source_sha, "codecIdentity":identity.strip()}, indent=2)+"\n")
    for folder in ("source", "licenses"):
        for path in sorted((codecs / folder).rglob("*")):
            if path.is_file():
                archive.write(path, str(path.relative_to(codecs)))
    for name in ("identity.txt", "SHA256SUMS.txt", "decoders.txt", "protocols.txt"):
        archive.write(codecs / name, name)
    archive.write(root / "scripts/native/build-codecs.sh", "scripts/native/build-codecs.sh")
print(f"Verified corresponding codec source: {target}")
