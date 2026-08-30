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
    assert manifest["sceneId"] == "the-build" and manifest["status"] == "g10c-preflight-only"
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
    assert len(diagnostics["canonical"]) >= 12
    assert len(diagnostics["boundaries"]) == len(manifest["phaseBoundaries"])
    assert diagnostics["sourceFidelity"]["allExact"]
    for sample in diagnostics["sourceFidelity"]["samples"]:
        style = sample["style"]
        assert style["opacity"] == "1" and style["filter"] == "none" and style["mixBlendMode"] == "normal"
        assert style["objectFit"] == "contain" and style["objectPosition"] == "50% 50%"
    assert diagnostics["alpha"]["pass"] and diagnostics["alpha"]["nonZeroRgbUnderZeroAlpha"] == 0
    assert diagnostics["lifecycle"]["disposed"] == {"canvases": 0, "guides": 0}
    assert diagnostics["lifecycle"]["stateEqual"] and diagnostics["lifecycle"]["sourceHashEqual"]
    assert not any(diagnostics["deletionTest"]["forbiddenMatches"].values())
    assert not diagnostics["deletionTest"]["parentImports"] and not diagnostics["deletionTest"]["sharedPrototypeReference"]

    compilation = diagnostics["timelineCompilation"]
    caption = compilation["automaticCaption"]
    no_caption = compilation["automaticNoCaption"]
    assert caption["durationMs"] == 11_600 and caption["minimumDurationMs"] == 7_900
    assert no_caption["durationMs"] == 10_700 and no_caption["minimumDurationMs"] == 7_300
    low = compilation["fixedTooShort"]
    assert low["issues"][0]["code"] == "duration-below-readable-minimum" and low["durationMs"] == 7_900
    assert all(segment["durationMs"] >= segment["min"] > 0 for segment in low["segments"])
    assert compilation["fixed9000"]["issues"][0]["code"] == "fixed-duration-compression"
    assert compilation["fixed12000"]["durationMs"] == 12_000
    directed = compilation["directedNative"]
    assert next(segment for segment in directed["segments"] if segment["id"] == "source-window")["requestedPaceScale"] == 1
    assert next(segment for segment in directed["segments"] if segment["id"] == "frame-apparatus")["requestedPaceScale"] == 2
    assert compilation["directed7000"]["issues"][0]["code"] == "duration-below-readable-minimum"

    contract = diagnostics["captionContract"]
    assert contract["captionBeatPresentWhenKnown"]
    assert contract["captionBeatAbsentWhenUnknown"]
    assert contract["noCaptionProgressAlwaysZero"]
    assert contract["captionAutomaticDurationMs"] - contract["noCaptionAutomaticDurationMs"] == 900
    start = diagnostics["boundaries"]["0"]
    seam = diagnostics["boundaries"]["1"]
    for key in ["frameProgress", "guideProgress", "sourceReveal", "captionProgress", "resolvedProgress"]:
        assert start[key] == seam[key] == 0
    resolved = diagnostics["canonical"]["0.8"]["evaluation"]
    assert resolved["phaseId"] == "resolved-hold" and resolved["guideProgress"] == 0 and resolved["sourceReveal"] == 1 and resolved["cursor"]["opacity"] == 0
    assert diagnostics["accessibility"]["empty"]["emptyHintHidden"] is False
    assert diagnostics["accessibility"]["resolved"]["emptyHintHidden"] is True
    assert "Project caption placed" in diagnostics["accessibility"]["resolved"]["story"]
    assert (root / "UI_JOURNEY.png").stat().st_size > 10_000

    clip = root / "the-build-real-speed.mp4"
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration", "-of", "json", str(clip)], check=True, capture_output=True, text=True)
    stream = json.loads(probe.stdout)["streams"][0]
    assert stream["width"] == 640 and stream["height"] == 360
    assert 11.5 <= float(stream["duration"]) <= 11.7
    assert len(list((root / "ratios").glob("*.png"))) == 4
    assert len(list((root / "fixtures").glob("*.png"))) >= 7
    print(json.dumps({"scene": "the-build", "manifestFiles": len(manifest["files"]), "canonical": len(diagnostics["canonical"]), "status": "pass", "g10c": "preflight-only", "captionDurationMs": caption["durationMs"], "noCaptionDurationMs": no_caption["durationMs"]}, indent=2))


if __name__ == "__main__":
    main()
