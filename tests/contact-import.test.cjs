const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite'),{webcrypto,createHash}=require('node:crypto');
const ts=require('typescript'),root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',f),'utf8'));
const runtime={};let queryCount=0;
class Statement{constructor(query,values=[]){this.query=query;this.values=values;}bind(...v){return new Statement(this.query,v);}async first(){queryCount++;return sql.prepare(this.query).get(...this.values)||null;}async all(){queryCount++;return{results:sql.prepare(this.query).all(...this.values)};}}
runtime.DB={prepare(q){return new Statement(q)},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)sql.prepare(s.query).run(...s.values);sql.exec('COMMIT');return [];}catch(e){sql.exec('ROLLBACK');throw e;}}};
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/colorado-contact-manifest.json'),'utf8')),modules=new Map();
function load(file){if(modules.has(file))return modules.get(file);const module={exports:{}};const requireModule=name=>{if(name==='cloudflare:workers')return{env:runtime};if(name==='@/data/colorado-contact-manifest.json')return{default:manifest};if(name==='@/data/colorado-dedup-manifest.json')return{default:JSON.parse(fs.readFileSync(path.join(root,'data/colorado-dedup-manifest.json'),'utf8'))};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.posix.join(path.posix.dirname(file),name+'.ts'));return require(name);};const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});new vm.Script(compiled.outputText).runInNewContext({module,exports:module.exports,require:requireModule,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,URL,Date,console});modules.set(file,module.exports);return module.exports;}
const api=load('lib/contact-import.ts'),url='https://example.chatgpt.site/api/manage/contact-import';
const secret='fixture-'.repeat(10),request=(body,token=secret)=>new Request(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body});
const rejects=(fn,status)=>assert.rejects(fn,e=>e.status===status);
(async()=>{
 await rejects(()=>api.contactImport(request('{}')),404);runtime.OUTREACH_CONTACT_IMPORT_SECRET=secret;runtime.OUTREACH_CONTACT_IMPORT_EXPIRES=new Date(Date.now()+3600000).toISOString();await rejects(()=>api.contactImport(request('{}','wrong')),401);assert.equal(queryCount,0);await rejects(()=>api.contactImport(request('{}')),400);
 runtime.OUTREACH_CONTACT_IMPORT_EXPIRES='invalid';await rejects(()=>api.contactImport(request('{}')),404);runtime.OUTREACH_CONTACT_IMPORT_EXPIRES=new Date(Date.now()+3600000).toISOString();
 const dataPath=process.argv[2];assert.ok(dataPath,'Pass the prepared import directory for full dataset verification.');
 const old=JSON.parse(fs.readFileSync(path.join(dataPath,'existing-crm-all.json'),'utf8'));
 for(const r of old){const keys=Object.keys(r);sql.prepare(`INSERT INTO outreach_prospects(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(r));}
 const before=JSON.stringify(sql.prepare('SELECT * FROM outreach_prospects ORDER BY id').all());
 const files=fs.readdirSync(path.join(dataPath,'import-batches')).filter(f=>f.endsWith('.json')).sort();let selected=0,inserted=0,existing=0;
 for(const f of files){const raw=fs.readFileSync(path.join(dataPath,'import-batches',f),'utf8');let result;try{result=await api.contactImport(request(raw));}catch(e){for(const r of JSON.parse(raw).rows){try{load('lib/outreach-contact.ts').contactWebsite(r.website);}catch{console.error('Invalid stored URL',r.import_identity,r.website);}}throw e;}selected+=result.selected;inserted+=result.inserted;existing+=result.existing;assert.deepEqual(await api.contactImport(request(raw)),result);}
 assert.equal(selected,17518);assert.equal(existing,101);assert.equal(inserted,17417);assert.equal(sql.prepare('SELECT count(*) n FROM outreach_prospects').get().n,17517);
 const legacy=sql.prepare('SELECT * FROM outreach_prospects WHERE import_identity IS NULL ORDER BY id').all();assert.equal(JSON.stringify(legacy),before);
 assert.equal(sql.prepare("SELECT count(*) n FROM outreach_prospects WHERE import_identity IS NOT NULL AND (status<>'needs_review' OR evidence<>'' OR observed_at<>'')").get().n,0);
 const source=JSON.parse(fs.readFileSync(path.join(dataPath,'crm-contacts.json'),'utf8'));const keyFn=load('lib/outreach-contact.ts').contactRecordKey;
 const live=sql.prepare('SELECT * FROM outreach_prospects WHERE import_identity IS NOT NULL').all();for(const r of live){assert.ok(r.email||r.phone);assert.equal(r.record_key,keyFn(r));assert.ok(r.source_notes.includes(r.import_identity));}
 const raw=fs.readFileSync(path.join(dataPath,'import-batches',files[0]),'utf8');await rejects(()=>api.contactImport(request(raw.replace('Alma House','Changed company'))),400);
 const emailSet=()=>sql.prepare("SELECT DISTINCT lower(email) email FROM outreach_prospects WHERE email<>'' ORDER BY email").all().map(x=>x.email);const emailsBefore=emailSet();
 let merged=0;for(const f of fs.readdirSync(path.join(dataPath,'dedup-batches')).sort()){const raw=fs.readFileSync(path.join(dataPath,'dedup-batches',f),'utf8');const result=await api.contactImport(request(raw));merged+=result.merged;assert.deepEqual(await api.contactImport(request(raw)),result);}
 assert.equal(merged,84);assert.equal(sql.prepare('SELECT count(*) n FROM outreach_prospects').get().n,17433);assert.deepEqual(emailSet(),emailsBefore);assert.equal(sql.prepare("SELECT count(*) n FROM outreach_prospects WHERE email<>''").get().n,1617);
 const audit=JSON.parse(fs.readFileSync(path.join(dataPath,'contact-duplicate-audit.json'),'utf8'));for(const pair of audit.duplicate_mappings){const keep=sql.prepare('SELECT source_notes FROM outreach_prospects WHERE id=?').get(pair.survivor_crm_id);assert.ok(keep.source_notes.includes(pair.duplicate_source_id));assert.equal(sql.prepare('SELECT id FROM outreach_prospects WHERE id=?').get(pair.duplicate_crm_id),undefined);}
 const status=await api.contactImport(request('{"action":"status"}'));assert.equal(status.counts.total,17433);assert.equal(status.receipts.selected,17518);
 console.log(JSON.stringify({selected,inserted,existing,merged,total:17433,authenticated:true,fullReplayIdempotent:true,originalRecordsUnchanged:true,allEmailsPreserved:true}));sql.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
