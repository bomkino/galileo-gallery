#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, subprocess, sys
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
    assert manifest["sceneId"] == "light-table"
    assert len(manifest["canonicalTimes"]) >= 12
    seen: set[str] = set()
    for item in manifest["files"]:
        relative = item["path"]
        assert relative not in seen, f"duplicate manifest path: {relative}"
        seen.add(relative)
        path = (root / relative).resolve()
        assert path.is_relative_to(root), relative
        assert path.is_file(), relative
        assert path.stat().st_size == item["bytes"], relative
        assert sha(path) == item["sha256"], relative
        if path.suffix.lower() == ".png":
            with Image.open(path) as image:
                image.verify()
    diagnostics = json.loads((root / "DIAGNOSTICS.json").read_text(encoding="utf-8"))
    assert diagnostics["sourceContamination"]["allIdentical"] is True
    assert diagnostics["lifecycle"]["disposed"] == {"items": 0, "canvases": 0}
    assert diagnostics["lifecycle"]["remountStateEqual"] is True
    assert diagnostics["luminanceSummary"]["pass"] is True
    assert diagnostics["canonical"]["0"]["evaluation"]["frames"] == diagnostics["canonical"]["1"]["evaluation"]["frames"]
    media_styles = diagnostics["canonical"]["0.5"]["mediaStyles"]
    assert media_styles, "canonical media styles missing"
    assert all(style == {"opacity": "1", "filter": "none", "mixBlendMode": "normal"} for style in media_styles.values())
    tab_indices = diagnostics["canonical"]["0.5"]["accessibility"]["tabIndices"]
    assert tab_indices.count(0) == 1
    assert all(value in (-1, 0) for value in tab_indices)
    assert diagnostics["boundedMany"]["outOfBoundsCount"] == 0
    assert diagnostics["boundedMany"]["maxOcclusionFraction"] <= 0.22
    ui = root / "UI_JOURNEY.png"
    assert ui.is_file() and ui.stat().st_size > 10_000
    clip = root / "light-table-real-speed.mp4"
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,duration", "-of", "json", str(clip)
    ], check=True, capture_output=True, text=True)
    stream = json.loads(probe.stdout)["streams"][0]
    assert stream["width"] == 640 and stream["height"] == 360
    assert float(stream["duration"]) >= 9.9
    print(json.dumps({"scene": "light-table", "manifestFiles": len(manifest["files"]), "status": "pass", "uiJourney": True, "boundedManyOcclusion": diagnostics["boundedMany"]["maxOcclusionFraction"]}, indent=2))

if __name__ == "__main__":
    main()
