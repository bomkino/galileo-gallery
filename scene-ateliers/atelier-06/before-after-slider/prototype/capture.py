#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json,os,shutil,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
CANONICAL=[0,.04,.08076923076923077,.21,.35,.4125,.475,.6096153846153847,.7442307692307693,.8067307692307693,.8692307692307693,.93,1]
RATIOS=[("16x9",1920,1080,"16:9"),("9x16",1080,1920,"9:16"),("1x1",1080,1080,"1:1"),("4x5",1080,1350,"4:5")]
FIXTURES=["one","aligned-pair","extra-four","failed-before","failed-after","both-failed","different-dimensions","different-ratios","alpha-edge","video-pair"]
def sha(p):
 h=hashlib.sha256();
 with p.open('rb') as f:
  for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
 return h.hexdigest()
def html(here):
 s=(here/'index.html').read_text();s=s.replace('<link rel="stylesheet" href="styles.css">','<style>'+(here/'styles.css').read_text()+'</style>');s=s.replace('<script src="scene-core.js"></script>','<script>'+(here/'scene-core.js').read_text()+'</script>');s=s.replace('<script src="app.js"></script>','<script>'+(here/'app.js').read_text()+'</script>');return s
def load(page,bundle,capture=True):
 page.set_content(bundle,wait_until='load');page.wait_for_function('window.__atelier&&window.__atelier.ready')
 if capture:page.evaluate("document.body.classList.add('capture')")
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',default='../evidence');ap.add_argument('--chromium',default=os.environ.get('CHROMIUM_BIN','chromium'));a=ap.parse_args();here=Path(__file__).resolve().parent;out=(here/a.output).resolve();out.mkdir(parents=True,exist_ok=True)
 for name in ['canonical','ratios','fixtures','alpha-diagnostics','real-speed-frames']:
  target=out/name
  if target.exists():shutil.rmtree(target)
 for name in ['CAPTURE_MANIFEST.json','DIAGNOSTICS.json','REAL_SPEED_FRAMES.sha256','before-after-real-speed.mp4','UI_JOURNEY.png']:
  target=out/name
  if target.exists():target.unlink()
 for n in ['canonical','ratios','fixtures','alpha-diagnostics','real-speed-frames']: (out/n).mkdir(exist_ok=True)
 d={'sceneId':'before-after-slider','canonical':{},'registration':{},'manualParity':{},'keyboard':{},'sourceContamination':{},'lifecycle':{},'limitations':['Opaque-only candidate; alpha backgrounds are diagnostic composites, not transparent-output proof.']}
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=a.chromium,headless=True,args=['--no-sandbox','--disable-gpu-sandbox']);p=b.new_page(viewport={'width':1440,'height':1000});load(p,html(here),False);p.screenshot(path=str(out/'UI_JOURNEY.png'),full_page=True);p.evaluate("document.body.classList.add('capture')");p.set_viewport_size({'width':1920,'height':1080});p.evaluate("window.__atelier.setFixture('aligned-pair')")
  for i,t in enumerate(CANONICAL):p.evaluate('(v)=>window.__atelier.setTime(v)',t);path=out/'canonical'/f'{i:02d}-t-{str(t).replace(".","_")}.png';p.screenshot(path=str(path));d['canonical'][str(t)]=p.evaluate('window.__atelier.inspect()')
  for name,w,h,r in RATIOS:p.set_viewport_size({'width':w,'height':h});p.evaluate('(v)=>window.__atelier.setCanvas(v)',r);p.evaluate('(v)=>window.__atelier.setTime(v)',.5);p.screenshot(path=str(out/'ratios'/f'{name}.png'))
  p.set_viewport_size({'width':1280,'height':720});p.evaluate("window.__atelier.setCanvas('16:9')")
  for f in FIXTURES:p.evaluate('(v)=>window.__atelier.setFixture(v)',f);p.evaluate('(v)=>window.__atelier.setTime(v)',.5);p.screenshot(path=str(out/'fixtures'/f'{f}.png'))
  p.evaluate("window.__atelier.setFixture('aligned-pair')");p.evaluate('(v)=>window.__atelier.setTime(v)',.21);auto=p.evaluate('window.__atelier.inspect()');p.evaluate('(v)=>window.__atelier.setManualSplit(v)',auto['evaluation']['split']);manual=p.evaluate('window.__atelier.inspect()');d['manualParity']={'automaticSplit':auto['evaluation']['split'],'manualSplit':manual['evaluation']['split'],'rectsEqual':auto['rects']==manual['rects'],'sourceHashesEqual':auto['sourceHashes']==manual['sourceHashes']}
  p.evaluate("window.__atelier.setFixture('different-dimensions')");reg=p.evaluate('window.__atelier.inspect()');d['registration']={'before':reg['rects']['before'],'after':reg['rects']['after'],'equal':reg['rects']['before']==reg['rects']['after'],'styles':reg['mediaStyles']}
  p.evaluate("window.__atelier.setFixture('alpha-edge')");
  for bg in ['black','white','red','blue','checker']:p.evaluate('(v)=>window.__atelier.setBackground(v)',bg);p.screenshot(path=str(out/'alpha-diagnostics'/f'{bg}.png'))
  p.evaluate("window.__atelier.setBackground('neutral')");p.evaluate("window.__atelier.setFixture('aligned-pair')");slider=p.locator('#slider');slider.focus();steps=[]
  for key in ['ArrowRight','PageUp','Home','End']:p.keyboard.press(key);steps.append({'key':key,'aria':p.evaluate('window.__atelier.inspect().accessibility'),'split':p.evaluate('window.__atelier.inspect().evaluation.split')})
  p.screenshot(path=str(out/'fixtures'/'keyboard-focus.png'));d['keyboard']=steps
  hashes=[]
  for f in ['aligned-pair','alpha-edge','failed-before','failed-after']:
   p.evaluate('(v)=>window.__atelier.setFixture(v)',f)
   for t in [0,.25,.5,.75,1]:p.evaluate('(v)=>window.__atelier.setTime(v)',t);hashes.append({'fixture':f,'t':t,'hashes':p.evaluate('window.__atelier.inspect().sourceHashes')})
  grouped={};
  for x in hashes:grouped.setdefault(x['fixture'],set()).add(json.dumps(x['hashes'],sort_keys=True))
  d['sourceContamination']={'samples':hashes,'allStable':all(len(v)==1 for v in grouped.values())}
  p.evaluate("window.__atelier.setFixture('aligned-pair')");before=p.evaluate('window.__atelier.inspect()');p.evaluate('window.__atelier.dispose()');disposed=p.evaluate('({canvases:document.querySelectorAll("canvas.media").length})');p.evaluate('window.__atelier.mount()');after=p.evaluate('window.__atelier.inspect()');d['lifecycle']={'before':before['dom'],'disposed':disposed,'after':after['dom'],'stateEqual':before['evaluation']==after['evaluation']}
  p.set_viewport_size({'width':640,'height':360});p.evaluate("window.__atelier.setFixture('aligned-pair')");p.evaluate("window.__atelier.setCanvas('16:9')");fps=15;frames=78
  for n in range(frames):p.evaluate('(v)=>window.__atelier.setTime(v)',n/frames);p.screenshot(path=str(out/'real-speed-frames'/f'frame-{n:04d}.png'))
  b.close()
 clip=out/'before-after-real-speed.mp4';subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','15','-i',str(out/'real-speed-frames'/'frame-%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(clip)],check=True);(out/'REAL_SPEED_FRAMES.sha256').write_text('\n'.join(f'{sha(x)}  {x.name}' for x in sorted((out/'real-speed-frames').glob('*.png')))+'\n');shutil.rmtree(out/'real-speed-frames')
 (out/'DIAGNOSTICS.json').write_text(json.dumps(d,indent=2,sort_keys=True)+'\n');files=[{'path':x.relative_to(out).as_posix(),'bytes':x.stat().st_size,'sha256':sha(x)} for x in sorted(out.rglob('*')) if x.is_file() and x.name!='CAPTURE_MANIFEST.json'];m={'sceneId':'before-after-slider','runner':'prototype/capture.py','commands':['node prototype/check.cjs','CHROMIUM_BIN=<chromium> python prototype/capture.py --output ../evidence','python prototype/verify_evidence.py ../evidence'],'canonicalTimes':CANONICAL,'files':files};(out/'CAPTURE_MANIFEST.json').write_text(json.dumps(m,indent=2,sort_keys=True)+'\n');print(json.dumps({'scene':'before-after-slider','files':len(files)+1,'clip':clip.name,'registration':d['registration']['equal'],'sourceStable':d['sourceContamination']['allStable']},indent=2))
if __name__=='__main__':main()
