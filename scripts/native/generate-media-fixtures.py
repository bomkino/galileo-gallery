#!/usr/bin/env python3
"""Regenerate synthetic media fixtures. Maintenance only: Pillow/WebP and ffmpeg with VPx encoders required."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageCms
import subprocess,json,tempfile,shutil
r=Path(__file__).resolve().parents[2]/'native/Tests/GalileoNativeTests/Fixtures'
r.mkdir(parents=True,exist_ok=True)
w=Path(tempfile.mkdtemp());frames=[]
profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
for i in range(6):
    im=Image.new('RGBA',(160,96),(0,0,0,0));d=ImageDraw.Draw(im)
    d.rectangle((28,20,131,75),fill=[(235,36,27,255),(29,218,45,255),(31,57,237,255)][i%3])
    d.rectangle((2+i*4,2,11+i*4,12),fill=(240,210,70,130))
    im.save(w/f'f{i}.png',icc_profile=profile);frames.append(im)
frames[0].save(r/'still-alpha.webp',lossless=True,icc_profile=profile)
# A patch-based animation with different delays, transparency and movement.
frames[0].save(r/'animated-alpha.webp',save_all=True,append_images=frames[1:4],duration=[400,200,600,450],loop=0,lossless=True,quality=100,minimize_size=True,icc_profile=profile)
exif=Image.Exif();exif[274]=6
frames[0].convert('RGB').save(r/'oriented.webp',lossless=True,exif=exif,icc_profile=profile)
for name,codec,pix in [('vp8.webm','libvpx','yuv420p'),('vp9.webm','libvpx-vp9','yuv420p'),('vp9-alpha.webm','libvpx-vp9','yuva420p')]:
    cmd=['ffmpeg','-hide_banner','-v','error','-y','-framerate','2','-i',str(w/'f%d.png'),'-c:v',codec,'-threads','2','-pix_fmt',pix,'-auto-alt-ref','0','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709']
    if codec=='libvpx-vp9':cmd+=['-lossless','1']
    else:cmd+=['-b:v','200k']
    subprocess.run(cmd+[str(r/name)],check=True)
# Variable frame durations remain variable in the compatibility representation.
(w/'vfr.txt').write_text(''.join(f"file '{w/f'f{i}.png'}'\nduration {t}\n" for i,t in enumerate([.4,.2,.6,.44]))+f"file '{w/'f3.png'}'\n")
subprocess.run(['ffmpeg','-hide_banner','-v','error','-y','-safe','0','-f','concat','-i',str(w/'vfr.txt'),'-c:v','libvpx-vp9','-lossless','1','-pix_fmt','yuv420p','-fps_mode','vfr','-an',str(r/'vfr.webm')],check=True)
(r/'malformed.webp').write_bytes((r/'still-alpha.webp').read_bytes()[:42])
report={}
for f in r.glob('*.webm'):
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_frames','-of','json',str(f)]))
    report[f.name]={'codec':info['streams'][0]['codec_name'],'pts':[float(x['pts_time']) for x in info['frames']],'size':[160,96],'alpha':f.name=='vp9-alpha.webm'}
report['animated-alpha.webp']={'durations_ms':[400,200,600,450],'channels':[0,1,2,0],'size':[160,96]}
(r/'expected.json').write_text(json.dumps(report,indent=2)+'\n')
# Independent libwebp/Pillow reconstructed frames are comparison references,
# not images produced by Galileo's ImageIO decoder.
with Image.open(r/'animated-alpha.webp') as animation:
    for index in range(animation.n_frames):
        animation.seek(index);animation.convert('RGBA').save(r/f'webp-frame-{index}.png',icc_profile=profile)
print(report)
shutil.rmtree(w)
