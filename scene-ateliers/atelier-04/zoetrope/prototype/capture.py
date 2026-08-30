from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import os
from pathlib import Path
from socketserver import TCPServer
from threading import Thread
from http.server import SimpleHTTPRequestHandler

from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
SCENE = HERE.parent
EVIDENCE = SCENE / "evidence"
CAPTURES = EVIDENCE / "captures"
FRAMES = EVIDENCE / "frames"

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass

@contextlib.contextmanager
def server():
    previous = Path.cwd()
    os.chdir(HERE)
    httpd = TCPServer(("127.0.0.1", 0), QuietHandler)
    thread = Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)
        os.chdir(previous)

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
    evaluator = (HERE / "evaluator.mjs").read_text().replace("export const ", "const ").replace("export function ", "function ")
    app_lines = (HERE / "app.mjs").read_text().splitlines()
    app = "\n".join(line for line in app_lines if not line.startswith("import "))
    html = html.replace('<link rel="stylesheet" href="styles.css" />', f"<style>{css}</style>")
    html = html.replace('<script type="module" src="app.mjs"></script>', f"<script>{evaluator}\n{app}</script>")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--disable-gpu-sandbox", "--no-sandbox"])
        page = await browser.new_page(viewport={"width": 1500, "height": 1050}, device_scale_factor=1)
        await page.set_content(html, wait_until="load")
        await page.wait_for_function("document.documentElement.dataset.ready === 'true'")
        stage = page.locator("#stage")

        cases = [
            ("canonical-landscape-gate.png", "ordinary6", "16:9", 0.142, False),
            ("portrait-many-bounded.png", "many127", "9:16", 0.417, False),
            ("mixed-ratios-four-five.png", "mixed20", "4:5", 0.583, False),
            ("alpha-transparent.png", "mediaEdge", "1:1", 0.271, True),
        ]
        capture_records = []
        for name, fixture, canvas, time, transparent in cases:
            await page.evaluate("([fixture, canvas, time, transparent]) => { prototypeApi.setFixture(fixture); prototypeApi.setCanvas(canvas); prototypeApi.setTransparent(transparent); prototypeApi.setTime(time); document.documentElement.style.background = transparent ? 'transparent' : ''; document.body.style.background = transparent ? 'transparent' : ''; document.querySelector('.stage-wrap').style.background = transparent ? 'transparent' : ''; document.querySelector('.stage-wrap').style.borderColor = transparent ? 'transparent' : ''; }", [fixture, canvas, time, transparent])
            await page.wait_for_timeout(60)
            path = CAPTURES / name
            box = await stage.bounding_box()
            await page.screenshot(path=str(path), clip=box, omit_background=transparent)
            state = await page.evaluate("JSON.parse(document.querySelector('#readback').textContent)")
            capture_records.append({"file": f"captures/{name}", "fixture": fixture, "canvas": canvas, "normalizedTime": time, "transparent": transparent, "readback": state})

        await page.evaluate("() => { prototypeApi.setFixture('ordinary6'); prototypeApi.setCanvas('16:9'); prototypeApi.setTransparent(false); }")
        for index in range(12):
            time = index / 12
            await page.evaluate("time => prototypeApi.setTime(time)", time)
            await page.wait_for_timeout(25)
            await stage.screenshot(path=str(FRAMES / f"frame-{index:03d}.png"))

        browser_version = browser.version
        await browser.close()

    alpha_path = CAPTURES / "alpha-transparent.png"
    source = Image.open(alpha_path).convert("RGBA")
    alpha_pixels = list(source.getdata())
    alpha_zero = sum(1 for r, g, b, a in alpha_pixels if a == 0)
    alpha_zero_rgb = sum(1 for r, g, b, a in alpha_pixels if a == 0 and (r or g or b))
    partial = sum(1 for r, g, b, a in alpha_pixels if 0 < a < 255)
    opaque = sum(1 for r, g, b, a in alpha_pixels if a == 255)
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

    alpha_receipt = {
        "source": "captures/alpha-transparent.png",
        "width": source.width,
        "height": source.height,
        "alphaZeroPixels": alpha_zero,
        "alphaZeroWithNonZeroRgb": alpha_zero_rgb,
        "partialAlphaPixels": partial,
        "opaquePixels": opaque,
        "passZeroRgbBelowZeroAlpha": alpha_zero_rgb == 0,
    }
    (EVIDENCE / "ALPHA_ANALYSIS.json").write_text(json.dumps(alpha_receipt, indent=2) + "\n")

    files = sorted([*CAPTURES.glob("*.png"), *FRAMES.glob("*.png"), EVIDENCE / "ALPHA_ANALYSIS.json", EVIDENCE / "TEST_VECTOR_READBACK.json"])
    manifest_lines = [f"{sha256(path)}  {path.relative_to(EVIDENCE).as_posix()}" for path in files]
    (EVIDENCE / "CAPTURE_MANIFEST.sha256").write_text("\n".join(manifest_lines) + "\n")
    receipt = {
        "sceneId": "zoetrope",
        "captureTool": "Playwright Python with system Chromium",
        "browserVersion": browser_version,
        "captureCount": len(capture_records),
        "frameSequenceCount": 12,
        "captures": capture_records,
        "alpha": alpha_receipt,
        "manifest": "CAPTURE_MANIFEST.sha256",
        "limitations": [
            "Generated local SVG fixtures prove geometry and source-treatment state, not decoded RGB equivalence with arbitrary user media.",
            "The 12-frame sequence is deterministic sampling, not a human real-time taste verdict.",
        ],
    }
    (EVIDENCE / "CAPTURE_RECEIPT.json").write_text(json.dumps(receipt, indent=2) + "\n")

if __name__ == "__main__":
    asyncio.run(run())
