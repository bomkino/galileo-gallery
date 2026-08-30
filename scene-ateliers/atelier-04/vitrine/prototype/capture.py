from __future__ import annotations

import asyncio
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
SCENE = HERE.parent
EVIDENCE = SCENE / "evidence"
CAPTURES = EVIDENCE / "captures"
FRAMES = EVIDENCE / "frames"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checker(size: tuple[int, int], cell: int = 24) -> Image.Image:
    image = Image.new("RGBA", size, (236, 236, 232, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(168, 168, 164, 255))
    return image


async def run() -> None:
    CAPTURES.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(parents=True, exist_ok=True)
    for directory in (CAPTURES, FRAMES):
        for file in directory.glob("*.png"):
            file.unlink()

    html = (HERE / "index.html").read_text()
    css = (HERE / "styles.css").read_text()
    evaluator = (
        (HERE / "evaluator.mjs")
        .read_text()
        .replace("export const ", "const ")
        .replace("export function ", "function ")
    )
    app = (HERE / "app.mjs").read_text()
    first_newline = app.find("\n")
    first_semicolon = app.find(";")
    cut = first_semicolon + 1 if first_semicolon != -1 and (first_newline == -1 or first_semicolon < first_newline) else first_newline + 1
    app = app[cut:]
    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>{css}</style>")
    html = html.replace('<script type="module" src="app.mjs"></script>', f"<script>{evaluator}\n{app}</script>")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            headless=True,
            args=["--disable-gpu-sandbox", "--no-sandbox"],
        )
        page = await browser.new_page(viewport={"width": 1520, "height": 1140}, device_scale_factor=1)
        await page.set_content(html, wait_until="load")
        await page.wait_for_function("document.documentElement.dataset.ready === 'true'")
        stage = page.locator("#stage")

        cases = [
            {
                "name": "canonical-readable-hold.png",
                "fixture": "ordinary8", "canvas": "16:9", "time": 0.04, "runKind": "loop",
                "spotlight": "ordinary-001", "finale": "ordinary-008", "transparent": False,
                "reduced": False, "placard": True,
            },
            {
                "name": "composed-pair-exchange.png",
                "fixture": "two", "canvas": "16:9", "time": 0.42, "runKind": "loop",
                "spotlight": "two-001", "finale": "two-002", "transparent": False,
                "reduced": False, "placard": True,
            },
            {
                "name": "portrait-negative-space.png",
                "fixture": "one", "canvas": "9:16", "time": 0.30, "runKind": "loop",
                "spotlight": "one-001", "finale": "one-001", "transparent": False,
                "reduced": False, "placard": True,
            },
            {
                "name": "finite-finale-hold.png",
                "fixture": "ordinary8", "canvas": "4:5", "time": 0.92, "runKind": "finite",
                "spotlight": "ordinary-004", "finale": "ordinary-008", "transparent": False,
                "reduced": False, "placard": True,
            },
            {
                "name": "alpha-transparent.png",
                "fixture": "mediaEdge", "canvas": "1:1", "time": 0.34, "runKind": "finite",
                "spotlight": "media-edge-003", "finale": "media-edge-006", "transparent": True,
                "reduced": False, "placard": False,
            },
        ]
        records: list[dict[str, object]] = []
        for case in cases:
            await page.evaluate(
                """caseData => {
                    prototypeApi.setFixture(caseData.fixture);
                    prototypeApi.setCanvas(caseData.canvas);
                    prototypeApi.setRunKind(caseData.runKind);
                    prototypeApi.setDirection('forward');
                    prototypeApi.setIntent(caseData.spotlight, caseData.finale);
                    prototypeApi.setControl('placardVisibility', caseData.placard);
                    prototypeApi.setReducedMotion(caseData.reduced);
                    prototypeApi.setTransparent(caseData.transparent);
                    prototypeApi.setTime(caseData.time);
                    document.documentElement.style.background = caseData.transparent ? 'transparent' : '';
                    document.body.style.background = caseData.transparent ? 'transparent' : '';
                    document.querySelector('.stage-wrap').style.background = caseData.transparent ? 'transparent' : '';
                    document.querySelector('.stage-wrap').style.borderColor = caseData.transparent ? 'transparent' : '';
                }""",
                case,
            )
            await page.wait_for_timeout(70)
            path = CAPTURES / str(case["name"])
            box = await stage.bounding_box()
            if box is None:
                raise RuntimeError("stage bounds unavailable")
            await page.screenshot(path=str(path), clip=box, omit_background=bool(case["transparent"]))
            state = await page.evaluate("JSON.parse(document.querySelector('#readback').textContent)")
            records.append({**case, "file": f"captures/{case['name']}", "readback": state})

        await page.evaluate(
            """() => {
                prototypeApi.setFixture('ordinary8');
                prototypeApi.setCanvas('16:9');
                prototypeApi.setRunKind('finite');
                prototypeApi.setDirection('forward');
                prototypeApi.setIntent('ordinary-004', 'ordinary-008');
                prototypeApi.setControl('placardVisibility', true);
                prototypeApi.setTransparent(false);
                prototypeApi.setReducedMotion(false);
            }"""
        )
        for index in range(12):
            time = index / 11
            await page.evaluate("time => prototypeApi.setTime(time)", time)
            await page.wait_for_timeout(30)
            await stage.screenshot(path=str(FRAMES / f"frame-{index:03d}.png"))

        browser_version = browser.version
        await browser.close()

    source = Image.open(CAPTURES / "alpha-transparent.png").convert("RGBA")
    pixels = list(source.getdata())
    alpha_zero = sum(1 for r, g, b, a in pixels if a == 0)
    alpha_zero_rgb = sum(1 for r, g, b, a in pixels if a == 0 and (r or g or b))
    partial = sum(1 for _r, _g, _b, a in pixels if 0 < a < 255)
    opaque = sum(1 for _r, _g, _b, a in pixels if a == 255)

    backgrounds = {
        "black": Image.new("RGBA", source.size, (0, 0, 0, 255)),
        "white": Image.new("RGBA", source.size, (255, 255, 255, 255)),
        "red": Image.new("RGBA", source.size, (210, 24, 24, 255)),
        "blue": Image.new("RGBA", source.size, (26, 72, 210, 255)),
        "checkerboard": checker(source.size),
    }
    for name, background in backgrounds.items():
        background.alpha_composite(source)
        background.convert("RGB").save(CAPTURES / f"alpha-over-{name}.png")

    alpha = {
        "source": "captures/alpha-transparent.png",
        "width": source.width,
        "height": source.height,
        "alphaZeroPixels": alpha_zero,
        "alphaZeroWithNonZeroRgb": alpha_zero_rgb,
        "partialAlphaPixels": partial,
        "opaquePixels": opaque,
        "passZeroRgbBelowZeroAlpha": alpha_zero_rgb == 0,
    }
    (EVIDENCE / "ALPHA_ANALYSIS.json").write_text(json.dumps(alpha, indent=2) + "\n")

    files = sorted([
        *CAPTURES.glob("*.png"),
        *FRAMES.glob("*.png"),
        EVIDENCE / "ALPHA_ANALYSIS.json",
        EVIDENCE / "TEST_VECTOR_READBACK.json",
    ])
    (EVIDENCE / "CAPTURE_MANIFEST.sha256").write_text(
        "\n".join(f"{sha256(path)}  {path.relative_to(EVIDENCE).as_posix()}" for path in files) + "\n"
    )
    receipt = {
        "sceneId": "vitrine",
        "captureTool": "Playwright Python with system Chromium",
        "browserVersion": browser_version,
        "captureCount": len(records),
        "frameSequenceCount": 12,
        "captures": records,
        "alpha": alpha,
        "manifest": "CAPTURE_MANIFEST.sha256",
        "limitations": [
            "Generated fixtures do not prove decoded pixel-for-pixel equality against external user media.",
            "Frame sequence and stills do not constitute human motion/taste acceptance or Product export integration.",
        ],
    }
    (EVIDENCE / "CAPTURE_RECEIPT.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    asyncio.run(run())
