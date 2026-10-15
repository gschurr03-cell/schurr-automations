# Atlantic / Copper mechanical optical assembly

A deterministic 60-frame, 720 × 720 product rotation for a scroll-controlled website. Frame 0 and the poster use identical pixels. All frames are lossless WebP; the outside border is exactly RGB (12, 38, 48), `#0C2630`.

## Modeled scene

- Thick titanium housing with modeled bevels and front/rear reveals.
- Six subtractive conical/cylindrical fastener recesses with recessed steel heads.
- Copper annular bezel with a restrained 0.032-unit axial shift through the turn.
- Black anodized retaining rings and five internal barrel baffles.
- Two optical elements, each bounded by spherical caps and a cylindrical edge.
- A recessed optical backplate, grounded contact shadow and faint floor reflection.

The sequence rotates the same assembly from −28° to +30° about its vertical axis, with small continuous pitch/roll changes. Lighting and geometry remain fixed apart from the explicit transform and bezel displacement.

## Rendering

`render.cpp` is a standalone C++17 analytic CPU ray tracer. It does not require a 3D package, downloaded model, or GPU. It uses exact intersections with revolved conical/planar segments and spherical optical surfaces, recursive self-reflection, Snell refraction, wavelength-selective optical absorption, a low-reflection glass coating, studio-card illumination, roughness-dependent soft reflection edges and fine concentric machining normals. Twelve deterministic subpixel samples provide antialiasing without frame-to-frame random noise.

The output is a product visualization, not an optical engineering simulation. Brushed metal's broad response and antireflection coating are appearance models.

Build and render:

```bash
g++ -O3 -fopenmp -ffast-math -std=c++17 render.cpp -o render
python render_sequence.py
```

The script uses eight CPU threads. It renders frames 0, 29 and 59 first for composition review, then fills the remaining sequence. Typical runtime is approximately 10 seconds per 720px frame on the current eight-thread environment.

## Deliverables

- `poster.webp`, `poster.png`: the exact first-frame image.
- `frames/frame-000.webp` through `frames/frame-059.webp`: production sequence.
- `frames/frame-000.png`, `frame-029.png`, `frame-059.png`: review stills.
- `sequence.json`: final dimensions, frame count, color and byte-size metadata.
- `render.cpp`, `render_sequence.py`: reproducible source and encoding pipeline.

The earlier `beauty*` images are material-development previews. Use the poster and production frames for integration.
