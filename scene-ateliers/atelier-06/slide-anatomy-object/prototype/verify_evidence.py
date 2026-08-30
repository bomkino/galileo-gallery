#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (HERE.parent / "evidence").resolve()
    manifest = json.loads((root / "CAPTURE_MANIFEST.json").read_text(encoding="utf-8"))
    assert manifest["sceneId"] == "slide-anatomy-object"
    assert len(manifest["canonicalTimes"]) >= 12
    seen: set[str] = set()
    for item in manifest["files"]:
        relative = item["path"]
        assert relative not in seen
        seen.add(relative)
        path = (root / relative).resolve()
        assert path.is_relative_to(root)
        assert path.is_file() and path.stat().st_size == item["bytes"] and sha(path) == item["sha256"], relative
        if path.suffix.lower() == ".png":
            with Image.open(path) as image:
                image.verify()

    diagnostics = json.loads((root / "DIAGNOSTICS.json").read_text(encoding="utf-8"))
    assert diagnostics["sourceModel"] == "flat-source"
    assert diagnostics["reversal"]["allExactWithinTolerance"]
    assert diagnostics["reversal"]["maxPoseDelta"] <= 1e-9
    assert diagnostics["sourceFidelity"]["allExact"]
    assert diagnostics["alpha"]["pass"]
    assert diagnostics["lifecycle"]["disposed"] == {"canvases": 0, "planes": 0}
    assert diagnostics["lifecycle"]["stateEqual"]
    assert diagnostics["canonical"]["0"]["evaluation"]["planes"] == diagnostics["canonical"]["1"]["evaluation"]["planes"]
    assert diagnostics["canonical"]["0.35"]["evaluation"]["separationProgress"] == 1
    assert diagnostics["canonical"]["0.65"]["evaluation"]["separationProgress"] == 1
    for style in diagnostics["sourceFidelity"]["mediaStyles"]:
        assert style["opacity"] == "1" and style["filter"] == "none" and style["mixBlendMode"] == "normal"
        assert style["objectFit"] == "contain" and style["objectPosition"] == "50% 50%"
    accessibility = diagnostics["accessibility"]
    assert accessibility["before"]["targetLabel"] == "Inspect planes" and accessibility["before"]["targetPressed"] == "false"
    assert accessibility["separated"]["targetLabel"] == "Resolve source" and accessibility["separated"]["targetPressed"] == "true"
    assert accessibility["resolved"]["targetLabel"] == "Inspect planes" and accessibility["resolved"]["targetPressed"] == "false"
    assert accessibility["before"]["structure"] == ["Backing", "Source frame", "Frame edge", "Safe area", "Caption"]
    assert (root / "UI_JOURNEY.png").stat().st_size > 10_000

    clip = root / "slide-anatomy-real-speed.mp4"
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration", "-of", "json", str(clip)], check=True, capture_output=True, text=True)
    stream = json.loads(probe.stdout)["streams"][0]
    assert stream["width"] == 640 and stream["height"] == 360
    assert 6.9 <= float(stream["duration"]) <= 7.1
    print(json.dumps({"scene": "slide-anatomy-object", "manifestFiles": len(manifest["files"]), "status": "pass", "uiJourney": True, "reversalMaxPoseDelta": diagnostics["reversal"]["maxPoseDelta"]}, indent=2))


if __name__ == "__main__":
    main()
