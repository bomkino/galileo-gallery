from __future__ import annotations
import pathlib, sys
import cairosvg

if len(sys.argv) != 2:
    raise SystemExit("Usage: python rasterize-stills.py <evidence-dir>")
out = pathlib.Path(sys.argv[1])
for svg in sorted(out.glob("*.svg")):
    cairosvg.svg2png(bytestring=svg.read_bytes(), write_to=str(svg.with_suffix(".png")), output_width=None, output_height=None)
print(f"rasterized {len(list(out.glob('*.svg')))} SVG stills")
