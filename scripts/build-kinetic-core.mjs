import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve('vite/package.json'));
const {build}=viteRequire('esbuild');
await build({entryPoints:['scripts/hero/kinetic-core.js'],bundle:true,minify:true,format:'esm',target:['es2020'],outfile:'public/kinetic-core.js',legalComments:'linked'});
console.log('Built self-hosted kinetic hero.');
