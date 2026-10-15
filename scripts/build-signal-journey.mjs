import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
await build({entryPoints:['design/motion/signal-journey.source.js'],bundle:true,minify:true,format:'iife',target:['es2020'],outfile:'public/signal-journey.js',legalComments:'linked'});
console.log('Built Fusion customer journey');
