"""Render an invariant 60-frame mechanical product turn; no image synthesis.

Frames are lossless WebP so the entire outer margin remains exactly #0C2630.
The poster is an exact copy of frame 0, and all sample seeds are frame invariant.
"""
from pathlib import Path
import json
import os
import subprocess
import time
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'frames'
OUT.mkdir(exist_ok=True)
env = dict(os.environ, OMP_NUM_THREADS='8')
start = time.monotonic()
order = [0, 29, 59] + [i for i in range(60) if i not in (0, 29, 59)]
for i in order:
    ppm = OUT / f'frame-{i:03d}.ppm'
    png = OUT / f'frame-{i:03d}.png'
    webp = OUT / f'frame-{i:03d}.webp'
    subprocess.run([str(ROOT/'render'), '720', '12', str(i), '60', str(ppm)], env=env, check=True)
    im = Image.open(ppm)
    im.save(webp, lossless=True, method=6)
    if i in (0, 29, 59):
        im.save(png)
    if i == 0:
        im.save(ROOT/'poster.png')
        im.save(ROOT/'poster.webp', lossless=True, method=6)
    ppm.unlink()
    print(f'FRAME {i:03d} complete / {time.monotonic()-start:.1f}s elapsed', flush=True)

metadata = {
    'frameCount': 60,
    'width': 720,
    'height': 720,
    'samplesPerPixel': 12,
    'pattern': 'frame-{index:03d}.webp',
    'firstFrame': 0,
    'lastFrame': 59,
    'rotationDegrees': [-28, 30],
    'background': '#0C2630',
    'compression': 'lossless WebP',
    'renderer': 'Analytic C++ CPU ray tracer',
    'geometry': 'Beveled titanium annulus, subtractive fastener pockets, copper bezel, internal baffles, two spherical refractive lenses',
    'totalBytes': sum(p.stat().st_size for p in OUT.glob('*.webp')),
}
(ROOT/'sequence.json').write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps(metadata), flush=True)
