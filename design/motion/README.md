# Signal journey

The homepage uses a single, local Three.js scene. Forty-eight titanium pieces move through authored waveform, follow-up route, and calendar poses. Scroll progress or the three native stage buttons drives the scene. No network requests, image sequences, or animation loops are required after the bundle loads.

## Rebuild

From the project root:

```sh
node_modules/.bin/esbuild design/motion/signal-journey.source.js --bundle --minify --format=iife --target=es2020 --outfile=public/signal-journey.js
```

The source imports the existing `three` package and its `RoundedBoxGeometry` and `RoomEnvironment` examples. The generated bundle includes the upstream Three.js license notice.

## Fallbacks and controls

- `data-signal-journey` exposes `data-active="0|1|2"` and `data-render-mode="webgl|vector"` for QA.
- The inline SVG is the initial, no-script, failed-WebGL, and lost-context illustration. With JavaScript available it continuously moves the same 48 authored pieces through the same interpolated poses as WebGL, including metallic front and depth faces.
- `data-signal-step` buttons work in both render modes.
- Reduced-motion preference removes sticky scrolling and transitions; buttons choose still poses.
- Pause stops scroll changes. Direct stage buttons remain available.
- Offscreen or hidden documents do not schedule animation frames.
- Renderer pixel ratio is capped at 1.75 on desktop and 1.4 on narrow screens.

Review the homepage at wide and narrow widths, each stage via a button, scroll progression, pause/resume, reduced motion, and the vector fallback before publishing. The diagram is illustrative; the HTML captions explain each step without depending on the canvas.
