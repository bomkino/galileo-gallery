from __future__ import annotations
import json, math, pathlib, subprocess, sys, tempfile, shutil
from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) != 3:
    raise SystemExit("Usage: python render-clip.py <frames.json> <output.mp4>")
source = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
data = json.loads(source.read_text())
w, h, fps = int(data["width"]), int(data["height"]), int(data["fps"])
font = ImageFont.load_default()

def color_for(item):
    return item.get("color") or "#777777"

def draw_frame(frame, path):
    stage = frame["stage"]
    sx, sy = w / stage["width"], h / stage["height"]
    im = Image.new("RGB", (w, h), "#e9e7df")
    ordered = sorted((c for c in frame["cards"] if c.get("visible")), key=lambda c: (c["z"], c["sourceIndex"]))
    for card in ordered:
        item = card["item"]
        yaw = math.cos(math.radians(card.get("projectedYaw", 0)))
        cw = max(2, int(card["width"] * card["scale"] * max(0.12, yaw) * sx))
        ch = max(2, int(card["height"] * card["scale"] * sy))
        layer = Image.new("RGBA", (cw, ch), (0,0,0,0))
        d = ImageDraw.Draw(layer)
        if item.get("status") == "failed":
            d.rectangle((0,0,cw-1,ch-1), fill="#d8d4cc")
            d.line((0,0,cw-1,ch-1), fill="#504d49", width=max(1,min(cw,ch)//28))
            d.line((cw-1,0,0,ch-1), fill="#504d49", width=max(1,min(cw,ch)//28))
        elif item.get("alpha"):
            r = min(cw,ch)*0.34
            for scale,alpha in [(1,.24),(.78,.48),(.56,.74),(.34,1)]:
                rr=r*scale
                fill=Image.new("RGBA",(1,1),color_for(item)).getpixel((0,0))[:3]+(int(255*alpha),)
                d.ellipse((cw/2-rr,ch/2-rr,cw/2+rr,ch/2+rr), fill=fill)
        else:
            d.rectangle((0,0,cw-1,ch-1), fill=color_for(item))
            inset=max(3,min(cw,ch)//12)
            d.rectangle((inset,inset,cw-inset,max(inset+2,inset+min(cw,ch)//28)), fill="#f6f2e8")
            rr=min(cw,ch)*.18
            d.ellipse((cw*.5-rr,ch*.48-rr,cw*.5+rr,ch*.48+rr), fill="#25292c")
            d.text((inset,max(inset,ch-inset-10)),item["id"],font=font,fill="#f6f2e8")
        angle=-float(card.get("rotation",0))
        if abs(angle) > .001:
            layer=layer.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
        x=int(card["x"]*sx-layer.width/2); y=int(card["y"]*sy-layer.height/2)
        im.paste(layer,(x,y),layer)
    im.save(path, optimize=True)

with tempfile.TemporaryDirectory(prefix="galileo-clip-") as td:
    td=pathlib.Path(td)
    for i, frame in enumerate(data["frames"]):
        draw_frame(frame, td/f"frame-{i:04d}.png")
    subprocess.run(["ffmpeg","-y","-loglevel","error","-framerate",str(fps),"-i",str(td/"frame-%04d.png"),"-c:v","libx264","-preset","veryfast","-crf","25","-pix_fmt","yuv420p","-movflags","+faststart",str(out)],check=True)
print(out)
