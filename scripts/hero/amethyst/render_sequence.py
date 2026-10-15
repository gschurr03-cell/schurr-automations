"""Deterministic raytraced 3D scroll asset, with no model/image synthesis.

Build first:
  g++ -O3 -fopenmp -std=c++17 render.cpp -o render
Run:
  python render_sequence.py

48 actual 3D views. Lossless WebP preserves the exact #140F1B backdrop.
The poster is copied byte for byte from frame 000.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import time
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'frames'
OUT.mkdir(exist_ok=True)
env = dict(os.environ, OMP_NUM_THREADS='8')
start = time.monotonic()
for i in [0, 24, 47] + [n for n in range(48) if n not in (0, 24, 47)]:
    ppm = OUT / f'frame-{i:03d}.ppm'
    webp = OUT / f'frame-{i:03d}.webp'
    subprocess.run([str(ROOT / 'render'), '720', '12', str(i), '48', str(ppm)], env=env, check=True)
    with Image.open(ppm) as im:
        im.save(webp, lossless=True, method=6)
        if i in (0, 24, 47):
            im.save(ROOT / f'preview-{i:03d}.png')
    ppm.unlink()
    if i == 0:
        shutil.copyfile(webp, ROOT / 'poster.webp')
    print(f'FRAME {i:03d} complete / {time.monotonic()-start:.1f}s elapsed', flush=True)

assert (OUT / 'frame-000.webp').read_bytes() == (ROOT / 'poster.webp').read_bytes()
metadata = {
    'frameCount': 48,
    'width': 720,
    'height': 720,
    'samplesPerPixel': 12,
    'pattern': 'frame-{index:03d}.webp',
    'firstFrame': 0,
    'lastFrame': 47,
    'background': '#140F1B',
    'compression': 'lossless WebP',
    'renderer': 'Analytic C++ CPU ray tracer',
    'geometry': 'Three machined rounded-rectangle titanium modules with real bevels and separately modeled recessed amethyst lacquer inserts',
    'motion': 'Cubic ease assembly along shared depth axis plus an 11-degree yaw, 8-degree pitch, 8-degree roll turn',
    'totalBytes': sum(p.stat().st_size for p in OUT.glob('*.webp')),
}
(ROOT / 'sequence.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(metadata), flush=True)
