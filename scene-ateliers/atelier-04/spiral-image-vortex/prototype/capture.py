from __future__ import annotations
import asyncio, hashlib, json
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
HERE=Path(__file__).resolve().parent;SCENE=HERE.parent;EVIDENCE=SCENE/"evidence";CAPTURES=EVIDENCE/"captures";FRAMES=EVIDENCE/"frames"
def sha256(path:Path)->str:
 d=hashlib.sha256();
 with path.open("rb") as h:
  for c in iter(lambda:h.read(1024*1024),b""):d.update(c)
 return d.hexdigest()
def checker(size:tuple[int,int],cell:int=24)->Image.Image:
 image=Image.new("RGBA",size,(236,236,232,255));draw=ImageDraw.Draw(image)
 for y in range(0,size[1],cell):
  for x in range(0,size[0],cell):
   if(x//cell+y//cell)%2:draw.rectangle((x,y,x+cell-1,y+cell-1),fill=(168,168,164,255))
 return image
async def run()->None:
 CAPTURES.mkdir(parents=True,exist_ok=True);FRAMES.mkdir(parents=True,exist_ok=True)
 for directory in(CAPTURES,FRAMES):
  for file in directory.glob("*.png"):file.unlink()
 html=(HERE/"index.html").read_text();css=(HERE/"styles.css").read_text();evaluator=(HERE/"evaluator.mjs").read_text().replace("export const ","const ").replace("export function ","function ");app="\n".join(line for line in(HERE/"app.mjs").read_text().splitlines()if not line.startswith("import "));html=html.replace('<link rel="stylesheet" href="styles.css">',f"<style>{css}</style>").replace('<script type="module" src="app.mjs"></script>',f"<script>{evaluator}\n{app}</script>")
 async with async_playwright()as pw:
  browser=await pw.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=["--disable-gpu-sandbox","--no-sandbox"]);page=await browser.new_page(viewport={"width":1500,"height":1120},device_scale_factor=1);await page.set_content(html,wait_until="load");await page.wait_for_function("document.documentElement.dataset.ready === 'true'");stage=page.locator("#stage")
  cases=[("canonical-near-crossing.png","ordinary8","16:9",.184,False),("portrait-thread.png","mixed21","9:16",.417,False),("many-bounded.png","many127","4:5",.583,False),("alpha-transparent.png","mediaEdge","1:1",.271,True)];capture_records=[]
  for name,fixture,canvas,time,transparent in cases:
   await page.evaluate("([fixture,canvas,time,transparent])=>{prototypeApi.setFixture(fixture);prototypeApi.setCanvas(canvas);prototypeApi.setTransparent(transparent);prototypeApi.setTime(time);document.documentElement.style.background=transparent?'transparent':'';document.body.style.background=transparent?'transparent':'';document.querySelector('.stage-wrap').style.background=transparent?'transparent':'';document.querySelector('.stage-wrap').style.borderColor=transparent?'transparent':''}",[fixture,canvas,time,transparent]);await page.wait_for_timeout(60);path=CAPTURES/name;box=await stage.bounding_box();await page.screenshot(path=str(path),clip=box,omit_background=transparent);state=await page.evaluate("JSON.parse(document.querySelector('#readback').textContent)");capture_records.append({"file":f"captures/{name}","fixture":fixture,"canvas":canvas,"normalizedTime":time,"transparent":transparent,"readback":state})
  await page.evaluate("()=>{prototypeApi.setFixture('ordinary8');prototypeApi.setCanvas('16:9');prototypeApi.setTransparent(false)}")
  for index in range(12):
   time=index/12;await page.evaluate("time=>prototypeApi.setTime(time)",time);await page.wait_for_timeout(25);await stage.screenshot(path=str(FRAMES/f"frame-{index:03d}.png"))
  browser_version=browser.version;await browser.close()
 source=Image.open(CAPTURES/"alpha-transparent.png").convert("RGBA");pixels=list(source.getdata());alpha_zero=sum(1 for r,g,b,a in pixels if a==0);alpha_zero_rgb=sum(1 for r,g,b,a in pixels if a==0 and(r or g or b));partial=sum(1 for r,g,b,a in pixels if 0<a<255);opaque=sum(1 for r,g,b,a in pixels if a==255)
 for name,background in{"black":Image.new("RGBA",source.size,(0,0,0,255)),"white":Image.new("RGBA",source.size,(255,255,255,255)),"red":Image.new("RGBA",source.size,(210,24,24,255)),"blue":Image.new("RGBA",source.size,(26,72,210,255)),"checkerboard":checker(source.size)}.items():background.alpha_composite(source);background.convert("RGB").save(CAPTURES/f"alpha-over-{name}.png")
 alpha={"source":"captures/alpha-transparent.png","width":source.width,"height":source.height,"alphaZeroPixels":alpha_zero,"alphaZeroWithNonZeroRgb":alpha_zero_rgb,"partialAlphaPixels":partial,"opaquePixels":opaque,"passZeroRgbBelowZeroAlpha":alpha_zero_rgb==0};(EVIDENCE/"ALPHA_ANALYSIS.json").write_text(json.dumps(alpha,indent=2)+"\n")
 files=sorted([*CAPTURES.glob("*.png"),*FRAMES.glob("*.png"),EVIDENCE/"ALPHA_ANALYSIS.json",EVIDENCE/"TEST_VECTOR_READBACK.json"]);(EVIDENCE/"CAPTURE_MANIFEST.sha256").write_text("\n".join(f"{sha256(path)}  {path.relative_to(EVIDENCE).as_posix()}"for path in files)+"\n");receipt={"sceneId":"spiral-image-vortex","captureTool":"Playwright Python with system Chromium","browserVersion":browser_version,"captureCount":len(capture_records),"frameSequenceCount":12,"captures":capture_records,"alpha":alpha,"manifest":"CAPTURE_MANIFEST.sha256","limitations":["Generated local SVG fixtures prove helix geometry and treatment state, not arbitrary decoded RGB equivalence.","The deterministic frame sequence supports motion review but is not a human verdict."]};(EVIDENCE/"CAPTURE_RECEIPT.json").write_text(json.dumps(receipt,indent=2)+"\n")
if __name__=="__main__":asyncio.run(run())
