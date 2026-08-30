#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, shutil, subprocess, tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

CANONICAL = [0, 0.0625, 0.1, 0.1875, 0.25, 0.375, 0.5, 0.625, 0.75, 0.78, 0.85, 0.92, 0.96875, 1]
RATIOS = [("16x9", 1920, 1080, "16:9"), ("9x16", 1080, 1920, "9:16"), ("1x1", 1080, 1080, "1:1"), ("4x5", 1080, 1350, "4:5")]
FIXTURES = ["one", "two", "five", "ordinary-six", "many-24", "failed-six", "video-six", "colour-chart-six"]

def sha(path: Path) -> str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def bundled_html(here: Path) -> str:
    html=(here/'index.html').read_text(encoding='utf-8')
    html=html.replace('<link rel="stylesheet" href="styles.css">', '<style>'+ (here/'styles.css').read_text(encoding='utf-8') +'</style>')
    html=html.replace('<script src="scene-core.js"></script>', '<script>'+ (here/'scene-core.js').read_text(encoding='utf-8') +'</script>')
    html=html.replace('<script src="app.js"></script>', '<script>'+ (here/'app.js').read_text(encoding='utf-8') +'</script>')
    return html

def load(page, html: str, capture: bool = True) -> None:
    page.set_content(html, wait_until='load')
    page.wait_for_function('window.__atelier && window.__atelier.ready')
    if capture:
        page.evaluate("document.body.classList.add('capture')")

def luminance_without_frames(path: Path, bounds: list[dict]) -> float:
    im=Image.open(path).convert('RGB')
    pix=im.load(); w,h=im.size
    total=0.0; count=0
    for y in range(0,h,4):
        for x in range(0,w,4):
            if any(b['left'] <= x <= b['right'] and b['top'] <= y <= b['bottom'] for b in bounds): continue
            r,g,bv=pix[x,y]
            total += .2126*r + .7152*g + .0722*bv; count += 1
    return total/max(1,count)

def main() -> None:
    ap=argparse.ArgumentParser(); ap.add_argument('--output', default='../evidence'); ap.add_argument('--chromium', default=os.environ.get('CHROMIUM_BIN','chromium'))
    args=ap.parse_args()
    here=Path(__file__).resolve().parent; html=bundled_html(here); out=(here/args.output).resolve(); out.mkdir(parents=True,exist_ok=True)
    for name in ['canonical', 'ratios', 'fixtures', 'real-speed-frames']:
        target=out/name
        if target.exists(): shutil.rmtree(target)
    for name in ['CAPTURE_MANIFEST.json', 'DIAGNOSTICS.json', 'REAL_SPEED_FRAMES.sha256', 'light-table-real-speed.mp4', 'UI_JOURNEY.png']:
        target=out/name
        if target.exists(): target.unlink()
    canonical_dir=out/'canonical'; ratios_dir=out/'ratios'; fixtures_dir=out/'fixtures'; realtime_dir=out/'real-speed-frames'
    for d in [canonical_dir,ratios_dir,fixtures_dir,realtime_dir]: d.mkdir(parents=True,exist_ok=True)
    diagnostics={'sceneId':'light-table','canonical':{},'sourceContamination':{},'luminance':{},'lifecycle':{},'accessibility':{},'limitations':[]}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--disable-gpu-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        load(page, html, capture=False)
        page.screenshot(path=str(out/'UI_JOURNEY.png'), full_page=True, omit_background=False)
        page.evaluate("document.body.classList.add('capture')")
        page.set_viewport_size({'width':1920,'height':1080})
        page.evaluate("window.__atelier.setFixture('ordinary-six')")
        page.evaluate("window.__atelier.setCanvas('16:9')")
        for i,t in enumerate(CANONICAL):
            page.evaluate('(v)=>window.__atelier.setTime(v)', t)
            p=canonical_dir/f'{i:02d}-t-{str(t).replace(".","_")}.png'; page.screenshot(path=str(p),omit_background=False)
            info=page.evaluate('window.__atelier.inspect()'); diagnostics['canonical'][str(t)]={'evaluation':info['evaluation'],'sourceHashes':info['sourceHashes'],'mediaStyles':info['mediaStyles'],'dom':info['dom'],'accessibility':info['accessibility']}
            diagnostics['luminance'][str(t)]=luminance_without_frames(p,info['frameBounds'])
        for name,w,h,ratio in RATIOS:
            page.set_viewport_size({'width':w,'height':h}); page.evaluate('(r)=>window.__atelier.setCanvas(r)', ratio); page.evaluate('(v)=>window.__atelier.setTime(v)', .5)
            page.screenshot(path=str(ratios_dir/f'{name}.png'),omit_background=False)
        page.set_viewport_size({'width':1280,'height':720}); page.evaluate("window.__atelier.setCanvas('16:9')")
        for fixture in FIXTURES:
            page.evaluate('(f)=>window.__atelier.setFixture(f)', fixture); page.evaluate('(v)=>window.__atelier.setTime(v)', .5)
            page.screenshot(path=str(fixtures_dir/f'{fixture}.png'),omit_background=False)
        page.evaluate("window.__atelier.setFixture('many-24')"); page.evaluate('(v)=>window.__atelier.setTime(v)', .5)
        diagnostics['boundedMany']=page.evaluate('window.__atelier.inspect().evaluation.layoutMetrics')
        page.evaluate("window.__atelier.setFixture('ordinary-six')"); page.evaluate('(v)=>window.__atelier.setReduced(v)', True); page.evaluate('(v)=>window.__atelier.setTime(v)', .5)
        page.screenshot(path=str(fixtures_dir/'reduced-motion.png'),omit_background=False)
        page.evaluate('(v)=>window.__atelier.setReduced(v)', False); page.evaluate("window.__atelier.setFixture('colour-chart-six')"); page.evaluate('(v)=>window.__atelier.setTime(v)', .5)
        hashes=[]
        for strength in [0,.7]:
            page.evaluate('(v)=>window.__atelier.setControl("underlight-strength",v)',strength)
            for t in [0,.25,.5,.75,1]:
                page.evaluate('(v)=>window.__atelier.setTime(v)',t); hashes.append({'strength':strength,'t':t,'hashes':page.evaluate('window.__atelier.inspect().sourceHashes')})
        diagnostics['sourceContamination']={'samples':hashes,'allIdentical':len({json.dumps(x['hashes'],sort_keys=True) for x in hashes})==1}
        before=page.evaluate('window.__atelier.inspect()'); page.evaluate('window.__atelier.dispose()'); disposed=page.evaluate('({items:document.querySelectorAll(".item").length,canvases:document.querySelectorAll("canvas.media").length})'); page.evaluate('window.__atelier.mount()'); after=page.evaluate('window.__atelier.inspect()')
        diagnostics['lifecycle']={'before':before['dom'],'disposed':disposed,'after':after['dom'],'remountStateEqual':before['evaluation']==after['evaluation']}
        diagnostics['accessibility']=after['accessibility']
        page.set_viewport_size({'width':640,'height':360}); page.evaluate("window.__atelier.setFixture('ordinary-six')"); page.evaluate("window.__atelier.setCanvas('16:9')"); page.evaluate('(v)=>window.__atelier.setTime(v)', 0)
        fps=15; seconds=10; frames=fps*seconds
        for n in range(frames):
            page.evaluate('(v)=>window.__atelier.setTime(v)',n/frames)
            page.screenshot(path=str(realtime_dir/f'frame-{n:04d}.png'),omit_background=False)
        browser.close()
    clip=out/'light-table-real-speed.mp4'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','15','-i',str(realtime_dir/'frame-%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(clip)],check=True)
    frame_hashes=[f'{sha(p)}  {p.name}' for p in sorted(realtime_dir.glob('*.png'))]
    (out/'REAL_SPEED_FRAMES.sha256').write_text('\n'.join(frame_hashes)+'\n',encoding='utf-8')
    shutil.rmtree(realtime_dir)
    values=list(diagnostics['luminance'].values()); diagnostics['luminanceSummary']={'minimum':min(values),'maximum':max(values),'range255':max(values)-min(values),'threshold255':8,'pass':max(values)-min(values)<=8}
    (out/'DIAGNOSTICS.json').write_text(json.dumps(diagnostics,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    files=[]
    for p in sorted(out.rglob('*')):
        if p.is_file() and p.name!='CAPTURE_MANIFEST.json': files.append({'path':p.relative_to(out).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
    manifest={'sceneId':'light-table','runner':'prototype/capture.py','commands':['node prototype/check.cjs','CHROMIUM_BIN=<chromium> python prototype/capture.py --output ../evidence','python prototype/verify_evidence.py ../evidence'],'canonicalTimes':CANONICAL,'files':files}
    (out/'CAPTURE_MANIFEST.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps({'scene':'light-table','files':len(files)+1,'clip':clip.name,'diagnostics':diagnostics['luminanceSummary'],'sourceContamination':diagnostics['sourceContamination']['allIdentical']},indent=2))
if __name__=='__main__': main()
