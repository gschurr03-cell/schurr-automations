const fs=require('node:fs'),path=require('node:path');
const dirs=['app','components','hooks','vendor','db','drizzle','lib','scripts','build'];
const top=['public/assistant.js','public/assistant.css','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','raw.d.ts','cloudflare-env.d.ts','drizzle.config.ts','eslint.config.mjs','next.config.ts','next-env.d.ts','postcss.config.mjs','vite.config.ts','components.json','build/sites-vite-plugin.LICENSE','vendor/shadcn-tailwind-4.13.0.LICENSE.md'];
const excluded=new Set(['scripts/client-source-manifest.json','lib/client-source-version.ts']);
function files(root){const result=[];function walk(rel){const p=path.join(root,rel),st=fs.lstatSync(p);if(st.isSymbolicLink())throw Error('Source symlink is not allowed: '+rel);if(st.isDirectory()){for(const name of fs.readdirSync(p).sort()){if(name.startsWith('.')||name==='node_modules'||name==='__pycache__')continue;walk(rel+'/'+name);}}else if(st.isFile()&&!excluded.has(rel)&&/\.(?:(?:[mc]?ts|tsx)|m?js|cjs|json|sql|css|sh|py)$/.test(rel))result.push(rel);}
 for(const dir of dirs)if(fs.existsSync(path.join(root,dir)))walk(dir);
 for(const name of top)if(fs.existsSync(path.join(root,name))&&!result.includes(name)){if(fs.lstatSync(path.join(root,name)).isSymbolicLink())throw Error('Source symlink: '+name);result.push(name);}
 const downloads=path.join(root,'public/downloads');if(fs.existsSync(downloads))for(const name of fs.readdirSync(downloads))if(/^schurr-operational-restore-kit-[a-f0-9]+\.tar\.gz$/.test(name)){const file='public/downloads/'+name;if(fs.lstatSync(path.join(root,file)).isSymbolicLink())throw Error('Source symlink: '+file);result.push(file);}
 return result.sort();}
module.exports={files};
