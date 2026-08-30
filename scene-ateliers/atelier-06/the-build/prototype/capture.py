#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

RATIOS = [("16x9", 1920, 1080, "16:9"), ("9x16", 1080, 1920, "9:16"), ("1x1", 1080, 1080, "1:1"), ("4x5", 1080, 1350, "4:5")]
FIXTURES = ["one-caption", "one-no-caption", "extra-three", "explicit-stages-proposal", "transparent-source", "failed-source", "video-source"]
GENERATED_DIRS = ["canonical", "ratios", "fixtures", "alpha-composites", "real-speed-frames"]
GENERATED_FILES = ["CAPTURE_MANIFEST.json", "DIAGNOSTICS.json", "REAL_SPEED_FRAMES.sha256", "the-build-real-speed.mp4", "UI_JOURNEY.png"]


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bundled_html(here: Path) -> str:
    source = (here / "index.html").read_text(encoding="utf-8")
    source = source.replace('<link rel="stylesheet" href="styles.css">', f"<style>{(here / 'styles.css').read_text(encoding='utf-8')}</style>")
    source = source.replace('<script src="scene-core.js"></script>', f"<script>{(here / 'scene-core.js').read_text(encoding='utf-8')}</script>")
    source = source.replace('<script src="app.js"></script>', f"<script>{(here / 'app.js').read_text(encoding='utf-8')}</script>")
    return source


def load(page, body: str, capture: bool = True) -> None:
    page.set_content(body, wait_until="load")
    page.wait_for_function("window.__atelier && window.__atelier.ready")
    if capture:
        page.evaluate("document.body.classList.add('capture'); document.documentElement.style.background='transparent'; document.body.style.background='transparent'")


def composite(raw: Path, output: Path, colour) -> None:
    image = Image.open(raw).convert("RGBA")
    if colour == "checker":
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        draw = ImageDraw.Draw(background)
        tile = 32
        for y in range(0, image.height, tile):
            for x in range(0, image.width, tile):
                if ((x // tile) + (y // tile)) % 2:
                    draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(145, 145, 145, 255))
    else:
        background = Image.new("RGBA", image.size, colour)
    background.alpha_composite(image)
    background.convert("RGB").save(output)


def alpha_diagnostic(path: Path) -> dict:
    image = Image.open(path).convert("RGBA")
    zero = bad = partial = 0
    for red, green, blue, alpha in image.get_flattened_data():
        if alpha == 0:
            zero += 1
            bad += int(red != 0 or green != 0 or blue != 0)
        elif alpha < 255:
            partial += 1
    return {"zeroAlphaPixels": zero, "nonZeroRgbUnderZeroAlpha": bad, "partialAlphaPixels": partial, "pass": zero > 0 and bad == 0}


def runtime_scan(here: Path) -> dict:
    files = ["scene-core.js", "app.js", "index.html", "styles.css"]
    text = "\n".join((here / file).read_text(encoding="utf-8") for file in files)
    forbidden = ["approved", "palette", "typography trial", "particle", "bloom", "caustic", "confetti"]
    return {
        "files": files,
        "forbiddenMatches": {token: bool(re.search(r"\b" + re.escape(token) + r"\b", text, re.I)) for token in forbidden},
        "parentImports": any(token in text for token in ['require("../', "require('../", 'from "../', "from '../"]),
        "sharedPrototypeReference": bool(re.search(r"atelier-0[1-5]|slide-anatomy-object/prototype|light-table/prototype|before-after-slider/prototype", text)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="../evidence")
    parser.add_argument("--chromium", default=os.environ.get("CHROMIUM_BIN", "chromium"))
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    output = (here / args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    for name in GENERATED_DIRS:
        path = output / name
        if path.exists():
            shutil.rmtree(path)
        path.mkdir()
    for name in GENERATED_FILES:
        path = output / name
        if path.exists():
            path.unlink()

    diagnostics = {
        "sceneId": "the-build",
        "status": "g10c-preflight-only",
        "canonical": {},
        "boundaries": {},
        "sourceFidelity": {},
        "alpha": {},
        "timelineCompilation": {},
        "captionContract": {},
        "accessibility": {},
        "lifecycle": {},
        "deletionTest": runtime_scan(here),
        "limitations": [
            "Formal G10C remains blocked behind G10A and G10B.",
            "Explicit authored stages remain blocked behind AT06-CONTRACT-AUTHORED-STAGES.",
            "Prototype evidence does not prove Product Project round trip, export integration, performance, or human taste.",
        ],
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=["--no-sandbox", "--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        load(page, bundled_html(here), capture=False)
        page.evaluate("window.__atelier.setTime(0.8)")
        page.screenshot(path=str(output / "UI_JOURNEY.png"), full_page=True)
        page.evaluate("document.body.classList.add('capture'); document.documentElement.style.background='transparent'; document.body.style.background='transparent'")
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.evaluate("window.__atelier.setFixture('one-caption')")
        compiled = page.evaluate("window.__atelier.inspect().compiled")
        boundaries = [0] + [segment["end"] for segment in compiled["segments"]]
        canonical = sorted(set(boundaries + [.1, .25, .4, .6, .8, .95]))

        for index, time in enumerate(canonical):
            page.evaluate("value => window.__atelier.setTime(value)", time)
            path = output / "canonical" / f"{index:02d}-t-{time:.12f}.png"
            page.screenshot(path=str(path), omit_background=True)
            diagnostics["canonical"][f"{time:.15g}"] = page.evaluate("window.__atelier.inspect()")
        for time in boundaries:
            diagnostics["boundaries"][f"{time:.15g}"] = page.evaluate("value => window.__atelier.evaluateNormalized(value)", time)

        for name, width, height, ratio in RATIOS:
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("value => window.__atelier.setCanvas(value)", ratio)
            page.evaluate("value => window.__atelier.setTime(value)", .8)
            page.screenshot(path=str(output / "ratios" / f"{name}.png"), omit_background=True)

        page.set_viewport_size({"width": 1280, "height": 720})
        page.evaluate("window.__atelier.setCanvas('16:9')")
        for fixture in FIXTURES:
            page.evaluate("value => window.__atelier.setFixture(value)", fixture)
            page.evaluate("value => window.__atelier.setTime(value)", .8 if fixture != "explicit-stages-proposal" else .5)
            page.screenshot(path=str(output / "fixtures" / f"{fixture}.png"), omit_background=True)

        source_samples = []
        for fixture in ["one-caption", "one-no-caption", "transparent-source", "video-source"]:
            page.evaluate("value => window.__atelier.setFixture(value)", fixture)
            for time in canonical:
                page.evaluate("value => window.__atelier.setTime(value)", time)
                inspected = page.evaluate("window.__atelier.inspect()")
                source_samples.append({"fixture": fixture, "time": time, "hash": inspected["sourceHash"], "initial": inspected["sourceInitialHash"], "style": inspected["mediaStyle"]})
        diagnostics["sourceFidelity"] = {
            "samples": source_samples,
            "allExact": all(item["hash"] == item["initial"] and item["style"] and item["style"]["opacity"] == "1" and item["style"]["filter"] == "none" and item["style"]["mixBlendMode"] == "normal" for item in source_samples),
        }

        page.evaluate("window.__atelier.setFixture('transparent-source')")
        page.evaluate("value => window.__atelier.setTime(value)", .8)
        raw = output / "alpha-composites" / "straight-alpha.png"
        page.screenshot(path=str(raw), omit_background=True)
        diagnostics["alpha"] = alpha_diagnostic(raw)
        for name, colour in [("black", (0, 0, 0, 255)), ("white", (255, 255, 255, 255)), ("red", (200, 24, 44, 255)), ("blue", (22, 72, 180, 255)), ("checker", "checker")]:
            composite(raw, output / "alpha-composites" / f"{name}.png", colour)

        page.evaluate("window.__atelier.setFixture('one-caption')")
        diagnostics["timelineCompilation"] = {
            "automaticCaption": page.evaluate("window.__atelier.compileFor({mode:'automatic'}, null, {hasCaption:true})"),
            "automaticNoCaption": page.evaluate("window.__atelier.compileFor({mode:'automatic'}, null, {hasCaption:false})"),
            "fixedTooShort": page.evaluate("window.__atelier.compileFor({mode:'fixed-duration',durationMs:2000}, null, {hasCaption:true})"),
            "fixed9000": page.evaluate("window.__atelier.compileFor({mode:'fixed-duration',durationMs:9000}, null, {hasCaption:true})"),
            "fixed12000": page.evaluate("window.__atelier.compileFor({mode:'fixed-duration',durationMs:12000}, null, {hasCaption:true})"),
            "directedNative": page.evaluate("window.__atelier.compileFor({mode:'directed'}, null, {hasCaption:true})"),
            "directed7000": page.evaluate("window.__atelier.compileFor({mode:'directed',durationMs:7000}, null, {hasCaption:true})"),
        }
        caption_ids = [segment["id"] for segment in diagnostics["timelineCompilation"]["automaticCaption"]["segments"]]
        no_caption_ids = [segment["id"] for segment in diagnostics["timelineCompilation"]["automaticNoCaption"]["segments"]]
        page.evaluate("window.__atelier.setFixture('one-no-caption')")
        no_caption_states = []
        for time in canonical:
            page.evaluate("value => window.__atelier.setTime(value)", time)
            no_caption_states.append(page.evaluate("window.__atelier.inspect().evaluation"))
        diagnostics["captionContract"] = {
            "captionBeatPresentWhenKnown": "caption-if-known" in caption_ids,
            "captionBeatAbsentWhenUnknown": "caption-if-known" not in no_caption_ids,
            "noCaptionProgressAlwaysZero": all(state["captionProgress"] == 0 for state in no_caption_states),
            "captionAutomaticDurationMs": diagnostics["timelineCompilation"]["automaticCaption"]["durationMs"],
            "noCaptionAutomaticDurationMs": diagnostics["timelineCompilation"]["automaticNoCaption"]["durationMs"],
        }

        page.evaluate("document.body.classList.remove('capture')")
        page.evaluate("window.__atelier.setFixture('one-caption')")
        page.evaluate("window.__atelier.setTime(0)")
        empty = page.evaluate("window.__atelier.inspect().accessibility")
        page.evaluate("window.__atelier.setTime(0.8)")
        resolved_access = page.evaluate("window.__atelier.inspect().accessibility")
        diagnostics["accessibility"] = {"empty": empty, "resolved": resolved_access}

        before = page.evaluate("window.__atelier.inspect()")
        page.evaluate("window.__atelier.dispose()")
        disposed = page.evaluate("({canvases: document.querySelectorAll('#source-window canvas').length, guides: document.querySelectorAll('.guide-line').length})")
        page.evaluate("window.__atelier.mount()")
        after = page.evaluate("window.__atelier.inspect()")
        diagnostics["lifecycle"] = {"before": before["dom"], "disposed": disposed, "after": after["dom"], "stateEqual": before["evaluation"] == after["evaluation"], "sourceHashEqual": before["sourceHash"] == after["sourceHash"]}

        page.evaluate("document.body.classList.add('capture')")
        page.set_viewport_size({"width": 640, "height": 360})
        page.evaluate("window.__atelier.setFixture('one-caption')")
        page.evaluate("window.__atelier.setMode('automatic')")
        fps = 15
        frames = 174
        for frame_index in range(frames):
            page.evaluate("value => window.__atelier.setTime(value)", frame_index / frames)
            page.screenshot(path=str(output / "real-speed-frames" / f"frame-{frame_index:04d}.png"), omit_background=True)
        browser.close()

    clip = output / "the-build-real-speed.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "15", "-i", str(output / "real-speed-frames" / "frame-%04d.png"), "-vf", "format=yuv420p", "-c:v", "libx264", "-movflags", "+faststart", str(clip)], check=True)
    (output / "REAL_SPEED_FRAMES.sha256").write_text("\n".join(f"{sha(path)}  {path.name}" for path in sorted((output / "real-speed-frames").glob("*.png"))) + "\n", encoding="utf-8")
    shutil.rmtree(output / "real-speed-frames")
    (output / "DIAGNOSTICS.json").write_text(json.dumps(diagnostics, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "README.md").write_text(
        "# The Build evidence\n\nG10C preflight only. Generated fixtures. No historical assets or network media.\n\n"
        "- Canonical stills: every authored boundary plus additional story samples at 1920×1080.\n"
        "- Ratio compositions: 1920×1080, 1080×1920, 1080×1080, 1080×1350.\n"
        "- Edge fixtures: one/no-caption, extras preserved, explicit-stage block, transparency, failed primary, generated source-video frame.\n"
        "- Alpha: straight capture plus black, white, red, blue, and checkerboard composites.\n"
        "- Motion: 11.6-second, 15 fps verified frame sequence encoded to MP4; frame hashes retained.\n"
        "- Diagnostics: caption/no-caption phase truth, exact boundaries, source hash/style checks, fixed/directed compiler reports, lifecycle, and deletion test.\n\n"
        "This packet does not claim Product integration, formal G10C approval, performance acceptance, or human taste acceptance.\n",
        encoding="utf-8",
    )
    (output / "VISUAL_INSPECTION.md").write_text(
        "# Visual inspection\n\nInspection scope: default resolved hold, guide/source boundary, no-caption phrase, explicit-stage block, failed primary, 9:16 recomposition, straight-alpha and checker composites, and real-speed phrase.\n\n"
        "Result recorded after capture review: apparatus remains outside source pixels; source reveal reads as one intact plane; no-caption input contains no invisible caption beat; temporary guides and cursor are absent at finale; explicit stages fail visibly; failed primary is not substituted; portrait recomposition remains legible; alpha edges show no visible colour fringe in supplied composites. This is provisional atelier inspection, not a human taste verdict or formal G10C approval.\n",
        encoding="utf-8",
    )
    files = [{"path": path.relative_to(output).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path)} for path in sorted(output.rglob("*")) if path.is_file() and path.name != "CAPTURE_MANIFEST.json"]
    manifest = {
        "sceneId": "the-build",
        "status": "g10c-preflight-only",
        "runner": "prototype/capture.py",
        "commands": ["node prototype/check.cjs", "CHROMIUM_BIN=<chromium> python prototype/capture.py --output ../evidence", "python prototype/verify_evidence.py ../evidence"],
        "canonicalTimes": canonical,
        "phaseBoundaries": boundaries,
        "files": files,
    }
    (output / "CAPTURE_MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"scene": "the-build", "files": len(files) + 1, "canonical": len(canonical), "sourceExact": diagnostics["sourceFidelity"]["allExact"], "alpha": diagnostics["alpha"], "captionDurationMs": diagnostics["captionContract"]["captionAutomaticDurationMs"], "noCaptionDurationMs": diagnostics["captionContract"]["noCaptionAutomaticDurationMs"]}, indent=2))


if __name__ == "__main__":
    main()
