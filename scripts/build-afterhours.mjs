import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);const {build}=createRequire(require.resolve('vite/package.json'))('esbuild');
await build({entryPoints:['scripts/hero/afterhours-scene.js'],bundle:true,minify:true,format:'esm',target:['es2020'],outfile:'public/afterhours-scene.js',legalComments:'linked'});
console.log('Built Afterhours scroll scene');
