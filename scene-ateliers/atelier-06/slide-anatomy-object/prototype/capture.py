#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

CANONICAL = [0, .05, .1, .225, .35, .45, .5, .65, .775, .9, .95, 1]
RATIOS = [("16x9", 1920, 1080, "16:9"), ("9x16", 1080, 1920, "9:16"), ("1x1", 1080, 1080, "1:1"), ("4x5", 1080, 1350, "4:5")]
FIXTURES = ["one-caption", "one-no-caption", "extra-three", "explicit-many-proposal", "transparent-source", "failed-source", "video-source"]
GENERATED_DIRS = ["canonical", "ratios", "fixtures", "alpha-composites", "real-speed-frames"]
GENERATED_FILES = ["CAPTURE_MANIFEST.json", "DIAGNOSTICS.json", "REAL_SPEED_FRAMES.sha256", "slide-anatomy-real-speed.mp4", "UI_JOURNEY.png"]


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


def load(page, bundle: str, capture: bool = True) -> None:
    page.set_content(bundle, wait_until="load")
    page.wait_for_function("window.__atelier && window.__atelier.ready")
    if capture:
        page.evaluate("document.body.classList.add('capture'); document.documentElement.style.background='transparent'; document.body.style.background='transparent'")


def composite(raw: Path, output: Path, colour) -> None:
    image = Image.open(raw).convert("RGBA")
    if colour == "checker":
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        pixels = background.load()
        for y in range(image.height):
            for x in range(image.width):
                if ((x // 24) + (y // 24)) % 2:
                    pixels[x, y] = (145, 145, 145, 255)
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


def max_pose_delta(left: dict, right: dict) -> float:
    values: list[float] = []
    for key in ("rotateX", "rotateY"):
        values.append(abs(float(left["stage"][key]) - float(right["stage"][key])))
    right_planes = {plane["id"]: plane for plane in right["planes"]}
    for plane in left["planes"]:
        other = right_planes[plane["id"]]
        for key in ("x", "y", "z", "rotation", "opacity"):
            values.append(abs(float(plane[key]) - float(other[key])))
    return max(values, default=0.0)


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
        "sceneId": "slide-anatomy-object",
        "sourceModel": "flat-source",
        "canonical": {},
        "reversal": {},
        "sourceFidelity": {},
        "alpha": {},
        "accessibility": {},
        "lifecycle": {},
        "limitations": ["Explicit ordered layers remain blocked behind AT06-CONTRACT-SOURCE-ROLES."],
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=["--no-sandbox", "--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        load(page, bundled_html(here), capture=False)
        page.evaluate("window.__atelier.setTime(0.5)")
        page.locator("#inspection-target").focus()
        page.screenshot(path=str(output / "UI_JOURNEY.png"), full_page=True)
        page.evaluate("document.body.classList.add('capture'); document.documentElement.style.background='transparent'; document.body.style.background='transparent'")
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.evaluate("window.__atelier.setFixture('one-caption')")

        for index, time in enumerate(CANONICAL):
            page.evaluate("value => window.__atelier.setTime(value)", time)
            path = output / "canonical" / f"{index:02d}-t-{str(time).replace('.', '_')}.png"
            page.screenshot(path=str(path), omit_background=True)
            diagnostics["canonical"][str(time)] = page.evaluate("window.__atelier.inspect()")

        for name, width, height, ratio in RATIOS:
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("value => window.__atelier.setCanvas(value)", ratio)
            page.evaluate("value => window.__atelier.setTime(value)", .5)
            page.screenshot(path=str(output / "ratios" / f"{name}.png"), omit_background=True)

        page.set_viewport_size({"width": 1280, "height": 720})
        page.evaluate("window.__atelier.setCanvas('16:9')")
        for fixture in FIXTURES:
            page.evaluate("value => window.__atelier.setFixture(value)", fixture)
            page.evaluate("value => window.__atelier.setTime(value)", .5)
            page.screenshot(path=str(output / "fixtures" / f"{fixture}.png"), omit_background=True)

        page.evaluate("window.__atelier.setFixture('one-caption')")
        compiled = page.evaluate("window.__atelier.inspect().compiled")
        separate = compiled["segments"][1]
        returning = compiled["segments"][3]
        reversal_samples = []
        max_delta = 0.0
        for progress in [0, .125, .25, .5, .75, .875, 1]:
            outward_time = separate["start"] + progress * (separate["end"] - separate["start"])
            return_time = returning["start"] + (1 - progress) * (returning["end"] - returning["start"])
            page.evaluate("value => window.__atelier.setTime(value)", outward_time)
            outward = page.evaluate("window.__atelier.inspect().evaluation")
            page.evaluate("value => window.__atelier.setTime(value)", return_time)
            inward = page.evaluate("window.__atelier.inspect().evaluation")
            delta = max_pose_delta(outward, inward)
            max_delta = max(max_delta, delta)
            reversal_samples.append({"progress": progress, "outwardTime": outward_time, "returnTime": return_time, "outwardPhase": outward["phase"], "returnPhase": inward["phase"], "maxPoseDelta": delta})
        diagnostics["reversal"] = {"samples": reversal_samples, "maxPoseDelta": max_delta, "allExactWithinTolerance": max_delta <= 1e-9}

        hashes = []
        media_styles = []
        for fixture in ["one-caption", "one-no-caption", "transparent-source", "video-source"]:
            page.evaluate("value => window.__atelier.setFixture(value)", fixture)
            for time in CANONICAL:
                page.evaluate("value => window.__atelier.setTime(value)", time)
                inspected = page.evaluate("window.__atelier.inspect()")
                hashes.append({"fixture": fixture, "time": time, "hash": inspected["sourceHash"], "initial": inspected["sourceInitialHash"]})
                if inspected["mediaStyle"]:
                    media_styles.append(inspected["mediaStyle"])
        diagnostics["sourceFidelity"] = {"samples": hashes, "allExact": all(item["hash"] == item["initial"] for item in hashes), "mediaStyles": media_styles}

        page.evaluate("window.__atelier.setFixture('transparent-source')")
        page.evaluate("value => window.__atelier.setTime(value)", .5)
        raw = output / "alpha-composites" / "straight-alpha.png"
        page.screenshot(path=str(raw), omit_background=True)
        diagnostics["alpha"] = alpha_diagnostic(raw)
        for name, colour in [("black", (0, 0, 0, 255)), ("white", (255, 255, 255, 255)), ("red", (200, 24, 44, 255)), ("blue", (22, 72, 180, 255)), ("checker", "checker")]:
            composite(raw, output / "alpha-composites" / f"{name}.png", colour)

        page.evaluate("document.body.classList.remove('capture')")
        page.evaluate("window.__atelier.setFixture('one-caption')")
        page.evaluate("window.__atelier.setTime(0)")
        button = page.locator("#inspection-target")
        button.focus()
        before_access = page.evaluate("window.__atelier.inspect().accessibility")
        button.click()
        separated_access = page.evaluate("window.__atelier.inspect().accessibility")
        page.keyboard.press("Escape")
        resolved_access = page.evaluate("window.__atelier.inspect().accessibility")
        diagnostics["accessibility"] = {"before": before_access, "separated": separated_access, "resolved": resolved_access}

        before = page.evaluate("window.__atelier.inspect()")
        page.evaluate("window.__atelier.dispose()")
        disposed = page.evaluate("({planes: document.querySelectorAll('.plane').length, canvases: document.querySelectorAll('canvas').length})")
        page.evaluate("window.__atelier.mount()")
        after = page.evaluate("window.__atelier.inspect()")
        diagnostics["lifecycle"] = {"before": before["dom"], "disposed": disposed, "after": after["dom"], "stateEqual": before["evaluation"] == after["evaluation"]}

        page.evaluate("document.body.classList.add('capture')")
        page.set_viewport_size({"width": 640, "height": 360})
        page.evaluate("window.__atelier.setFixture('one-caption')")
        page.evaluate("window.__atelier.setCanvas('16:9')")
        fps = 15
        frames = 105
        for frame in range(frames):
            page.evaluate("value => window.__atelier.setTime(value)", frame / frames)
            page.screenshot(path=str(output / "real-speed-frames" / f"frame-{frame:04d}.png"), omit_background=True)
        browser.close()

    clip = output / "slide-anatomy-real-speed.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "15", "-i", str(output / "real-speed-frames" / "frame-%04d.png"), "-vf", "format=yuv420p", "-c:v", "libx264", "-movflags", "+faststart", str(clip)], check=True)
    (output / "REAL_SPEED_FRAMES.sha256").write_text("\n".join(f"{sha(path)}  {path.name}" for path in sorted((output / "real-speed-frames").glob("*.png"))) + "\n", encoding="utf-8")
    shutil.rmtree(output / "real-speed-frames")
    (output / "DIAGNOSTICS.json").write_text(json.dumps(diagnostics, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    files = [{"path": path.relative_to(output).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path)} for path in sorted(output.rglob("*")) if path.is_file() and path.name != "CAPTURE_MANIFEST.json"]
    manifest = {
        "sceneId": "slide-anatomy-object",
        "runner": "prototype/capture.py",
        "commands": ["node prototype/check.cjs", "CHROMIUM_BIN=<chromium> python prototype/capture.py --output ../evidence", "python prototype/verify_evidence.py ../evidence"],
        "canonicalTimes": CANONICAL,
        "files": files,
    }
    (output / "CAPTURE_MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"scene": "slide-anatomy-object", "files": len(files) + 1, "reversalMaxPoseDelta": max_delta, "sourceExact": diagnostics["sourceFidelity"]["allExact"], "alpha": diagnostics["alpha"]}, indent=2))


if __name__ == "__main__":
    main()
