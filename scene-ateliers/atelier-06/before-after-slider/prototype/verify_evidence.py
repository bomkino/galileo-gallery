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
    assert manifest["sceneId"] == "before-after-slider"
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
    assert diagnostics["registration"]["equal"]
    assert diagnostics["manualParity"]["automaticSplit"] == diagnostics["manualParity"]["manualSplit"]
    assert diagnostics["manualParity"]["rectsEqual"]
    assert diagnostics["manualParity"]["sourceHashesEqual"]
    assert diagnostics["sourceContamination"]["allStable"]
    assert diagnostics["lifecycle"]["disposed"] == {"canvases": 0}
    assert diagnostics["lifecycle"]["stateEqual"]
    assert diagnostics["canonical"]["0"]["evaluation"]["split"] == diagnostics["canonical"]["1"]["evaluation"]["split"]
    assert abs(diagnostics["canonical"]["0.35"]["evaluation"]["velocity"]) < 1e-9
    assert abs(diagnostics["canonical"]["0.7442307692307693"]["evaluation"]["velocity"]) < 1e-9
    for style in diagnostics["registration"]["styles"]:
        assert style["opacity"] == "1" and style["filter"] == "none" and style["mixBlendMode"] == "normal"
        assert style["objectFit"] == "contain" and style["objectPosition"] == "50% 50%"
    keyboard = diagnostics["keyboard"]
    assert [step["key"] for step in keyboard] == ["ArrowRight", "PageUp", "Home", "End"]
    assert keyboard[-2]["split"] == 0.12 and keyboard[-1]["split"] == 0.88
    assert all(step["aria"]["label"] for step in keyboard)
    assert (root / "UI_JOURNEY.png").stat().st_size > 10_000
    clip = root / "before-after-real-speed.mp4"
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration", "-of", "json", str(clip)], check=True, capture_output=True, text=True)
    stream = json.loads(probe.stdout)["streams"][0]
    assert stream["width"] == 640 and stream["height"] == 360
    assert 5.1 <= float(stream["duration"]) <= 5.3
    print(json.dumps({"scene": "before-after-slider", "manifestFiles": len(manifest["files"]), "status": "pass", "uiJourney": True, "keyboard": "verified"}, indent=2))

if __name__ == "__main__":
    main()
