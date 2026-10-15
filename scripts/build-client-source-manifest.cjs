const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{files}=require('./client-source-files.cjs');
const root=path.resolve(__dirname,'..'),sha=b=>createHash('sha256').update(b).digest('hex');
const entries=files(root).map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
const fingerprint=sha(JSON.stringify(entries));
fs.writeFileSync(path.join(root,'scripts/client-source-manifest.json'),JSON.stringify({format:1,fingerprint,entries},null,2)+'\n');
fs.writeFileSync(path.join(root,'lib/client-source-version.ts'),'// Generated from reviewed source. No credentials or customer data.\nexport const CLIENT_SOURCE_VERSION='+JSON.stringify(fingerprint)+';\n');
console.log('Client preparation source manifest: '+entries.length+' files');
