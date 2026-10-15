# Amethyst signal core

An original deterministic 3D scroll sequence rendered from analytic solid geometry. It uses no image generation, image deformation, CSS geometry, SVG, or frame interpolation.

## Assets

- `frames/frame-000.webp` through `frames/frame-047.webp`: 48 square 720 px images, lossless WebP.
- `poster.webp`: an exact byte copy of `frames/frame-000.webp`.
- `preview-000.png`, `preview-024.png`, `preview-047.png`: review stills from the final sequence.
- `sequence.json`: dimensions, background, geometry and motion metadata.

All primary rays missing the object return exactly RGB `(20, 15, 27)`, `#140F1B`. There is no backdrop gradient, glow, text or particle layer.

## Modeled object

Three rounded-rectangle solid modules share one depth axis. Each consists of a machined titanium housing with generous continuous rounded bevels, a darker mid-wall band, a machined inset pocket, a black reveal, and a separately modeled recessed amethyst lacquer insert. Faces and silhouettes are intersected in three dimensions; contact occlusion, geometric reflections and two reflection bounces use the same scene.

The object is presented as a studio product study, with white rectangular softboxes and a restrained lavender edge card. A broad off-axis white card is visible in the smoked face. Bevel surface normals are continuous. Pixel sample locations are invariant across frames to avoid temporal sampling shimmer.

Scroll assembles the three modules along their common depth axis using cubic easing. A restrained simultaneous turn changes yaw by 11 degrees, pitch by 8 degrees and roll by 8 degrees. The camera is fixed with generous background margin throughout.

## Reproduction

Requires a C++17 compiler with OpenMP, Python 3 and Pillow. No network, model download or extra package installation is needed.

```bash
g++ -O3 -fopenmp -std=c++17 render.cpp -o render
python render_sequence.py
```

For one still:

```bash
OMP_NUM_THREADS=8 ./render 720 12 0 48 preview.ppm
```

Arguments are image size, samples per pixel, frame index, total frames, and output PPM path. The encoder generates lossless WebP and copies the first frame to the poster rather than re-encoding it.
