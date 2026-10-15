const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite'),{createRequire}=require('node:module');
const proposal=path.resolve(__dirname,'..'),repo=path.resolve(process.env.SCHURR_ROOT||proposal),ts=createRequire(path.join(repo,'package.json'))('typescript');
const {build}=require('../scripts/build-operational-backup-schema.cjs');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'schurr-gmail-backup-test-'));
// A disposable test contract only; never overwrite the application's generated
// manifest or public restore kit from a focused test.
const schema=build(repo,path.join(temporary,'schema.json'));
const sql=new DatabaseSync(':memory:');for(const migration of schema.migrations)sql.exec(fs.readFileSync(path.join(repo,'drizzle',migration.name),'utf8'));
const restoreModule={exports:{}};const requireRestore=name=>name==='../lib/operational-backup-schema.json'?schema:require(name);
vm.runInNewContext(fs.readFileSync(path.join(proposal,'scripts/restore-operational-backup.cjs'),'utf8'),{module:restoreModule,exports:restoreModule.exports,require:requireRestore,__dirname:path.join(proposal,'scripts'),process,console,Buffer},{filename:'restore-operational-backup.cjs'});
const restore=restoreModule.exports;
const exportModule={exports:{}};class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
const db={prepare:query=>({query}),batch:async statements=>{sql.exec('BEGIN');try{const results=statements.map(s=>({results:sql.prepare(s.query).all()}));sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const code=ts.transpileModule(fs.readFileSync(path.join(repo,'lib/operational-backup.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
vm.runInNewContext(code,{module:exportModule,exports:exportModule.exports,require:name=>{if(name==='./operational-backup-schema.json')return schema;if(name==='./inquiries')return {database:()=>db,RequestError};throw Error(name);},TextEncoder,Date,console,fetch:()=>{throw Error('Network is forbidden');}},{filename:'operational-backup.ts'});
const exporter=exportModule.exports;const stamp='2026-10-03T01:00:00.000Z';let groups=0;const pass=name=>{groups++;console.log('PASS '+name);};
function insert(table,record){const keys=Object.keys(record);sql.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>record[k]));}
const base={mailbox_email:'owner@example.com',connection_revision:7,draft_revision:3,sender_revision:4,prospect_id:'prospect',campaign_id:'campaign',recipient:'prospect@example.com',subject:'Synthetic approved inquiry',body:'Approved content; no live recipients contacted.',raw_mime:Buffer.from('Message-ID: <fixture@example.com>\r\n\r\nApproved immutable content').toString('base64url'),raw_hash:'immutable-content-hash',first_attempt_at:0,attempts:0,gmail_message_id:'',thread_id:'',last_error:'',lock_token:'DO-NOT-EXPORT-GMAIL-LEASE',lock_until:1900000000000,last_checked_at:stamp,created_at:stamp,updated_at:stamp};
const rows=[
 {id:'prepared',draft_id:'draft-prepared',rfc_message_id:'<prepared@example.com>',status:'prepared'},
 {id:'sending',draft_id:'draft-sending',rfc_message_id:'<sending@example.com>',status:'sending',first_attempt_at:1790998800000,attempts:1},
 {id:'accepted',draft_id:'draft-accepted',rfc_message_id:'<accepted@example.com>',status:'accepted',first_attempt_at:1790998700000,attempts:1,gmail_message_id:'gmail-accepted',thread_id:'gmail-thread'},
 {id:'uncertain',draft_id:'draft-uncertain',rfc_message_id:'<uncertain@example.com>',status:'uncertain',first_attempt_at:1790998600000,attempts:1},
 {id:'cancelled',draft_id:'draft-cancelled',rfc_message_id:'<cancelled@example.com>',status:'cancelled'},
];
for(const value of rows)insert('gmail_outbox',{...base,...value});
insert('gmail_replies',{id:'reply',mailbox_email:'owner@example.com',message_id:'gmail-reply',thread_id:'gmail-thread',outbox_id:'accepted',sender_email:'prospect@example.com',subject:'Re: Synthetic approved inquiry',body:'Please stop contacting me.',received_at:stamp,kind:'opt_out',import_token:'DO-NOT-EXPORT-GMAIL-IMPORT',created_at:stamp});
insert('gmail_app_config',{id:'gmail',client_id:'DO-NOT-EXPORT-GMAIL-CLIENT',client_secret_ciphertext:'DO-NOT-EXPORT-GMAIL-SECRET',redirect_uri:'https://example.com/api/manage/gmail/callback',expected_email:'owner@example.com',revision:1,updated_at:stamp});
insert('gmail_connections',{id:'gmail',email:'owner@example.com',status:'connected',token_ciphertext:'DO-NOT-EXPORT-GMAIL-TOKEN',scopes:'DO-NOT-EXPORT-GMAIL-SCOPES',revision:7,connected_at:stamp,updated_at:stamp});
insert('gmail_oauth_states',{state_hash:'DO-NOT-EXPORT-GMAIL-STATE',owner_email:'owner@example.com',browser_hash:'DO-NOT-EXPORT-GMAIL-BROWSER',verifier_ciphertext:'DO-NOT-EXPORT-GMAIL-PKCE',redirect_uri:'https://example.com/api/manage/gmail/callback',expires_at:1900000000000,connection_revision:7,config_fingerprint:'DO-NOT-EXPORT-GMAIL-CONFIG',created_at:stamp});
(async()=>{
 const byName=Object.fromEntries(schema.tables.map(t=>[t.name,t]));
 for(const name of ['gmail_app_config','gmail_connections','gmail_oauth_states']){assert.ok(schema.omittedTables.includes(name));assert.equal(byName[name],undefined);}
 for(const key of ['lock_token','lock_until']){assert.ok(byName.gmail_outbox.omittedColumns.includes(key));assert.ok(!byName.gmail_outbox.columns.some(c=>c.name===key));}
 assert.ok(byName.gmail_replies.omittedColumns.includes('import_token'));pass('schema includes mailbox history and excludes all Google authorization/configuration and leases');
 const raw=await exporter.operationalBackup(),backup=JSON.parse(raw);restore.validateBackup(backup);
 assert.equal(raw.includes('DO-NOT-EXPORT'),false);assert.equal(backup.counts.gmail_outbox,5);assert.equal(backup.counts.gmail_replies,1);
 const accepted=backup.tables.gmail_outbox.find(x=>x.id==='accepted');assert.equal(accepted.raw_mime,base.raw_mime);assert.equal(accepted.raw_hash,base.raw_hash);assert.equal(accepted.gmail_message_id,'gmail-accepted');assert.equal(accepted.first_attempt_at,1790998700000);
 assert.equal(backup.tables.gmail_replies[0].kind,'opt_out');assert.equal(backup.tables.gmail_replies[0].outbox_id,'accepted');pass('real snapshot retains immutable receipts and opt-out reply history without credentials');
 const output=path.join(temporary,'gmail-offline.sqlite');restore.restoreBackup(backup,output,{migrationRoot:repo});const restored=new DatabaseSync(output);
 try{
  const state=Object.fromEntries(restored.prepare('SELECT id,status FROM gmail_outbox').all().map(x=>[x.id,x.status]));assert.deepEqual(state,{prepared:'cancelled',sending:'uncertain',accepted:'accepted',uncertain:'uncertain',cancelled:'cancelled'});
  for(const original of backup.tables.gmail_outbox){const actual=restored.prepare('SELECT * FROM gmail_outbox WHERE id=?').get(original.id);for(const key of ['raw_mime','raw_hash','rfc_message_id','recipient','subject','body','first_attempt_at','attempts','gmail_message_id','thread_id'])assert.equal(actual[key],original[key]);assert.equal(actual.lock_token,'');assert.equal(actual.lock_until,0);}
  for(const name of ['gmail_app_config','gmail_connections','gmail_oauth_states'])assert.equal(restored.prepare(`SELECT count(*) n FROM ${name}`).get().n,0);
  const reply=restored.prepare('SELECT * FROM gmail_replies').get();assert.equal(reply.import_token,'');for(const key of ['id','message_id','thread_id','outbox_id','sender_email','subject','body','received_at','kind'])assert.equal(reply[key],backup.tables.gmail_replies[0][key]);
  assert.equal(restored.prepare("SELECT count(*) n FROM gmail_outbox WHERE status IN ('prepared','sending') OR lock_until>0 OR lock_token!=''").get().n,0);
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
  const original=JSON.parse(restored.prepare("SELECT original_record FROM operational_restore_changes WHERE table_name='gmail_outbox' AND record_key='[\"sending\"]'").get().original_record);assert.equal(original.status,'sending');assert.equal(original.first_attempt_at,1790998800000);
  pass('offline restore cancels dispatches, preserves uncertain/accepted history, clears locks and stays disconnected');
 }finally{restored.close();}
 for(const [status,attempts,first,expected]of [['prepared',0,0,'cancelled'],['prepared',1,0,'uncertain'],['sending',0,0,'uncertain'],['sending',1,123,'uncertain'],['failed',0,0,'cancelled'],['failed',0,123,'uncertain'],['accepted',1,123,'accepted'],['uncertain',1,123,'uncertain']]){const original={...base,status,attempts,first_attempt_at:first},safe=restore.safeRow('gmail_outbox',original);assert.equal(safe.status,expected);assert.equal(safe.first_attempt_at,first);assert.equal(safe.attempts,attempts);assert.equal(safe.lock_token,'');assert.equal(safe.lock_until,0);assert.equal(safe.raw_hash,original.raw_hash);}
 pass('all pending/attempted status variants remain inert without losing first-attempt fences');
 for(const mutate of [v=>v.tables.gmail_outbox[0].lock_token='injected',v=>v.tables.gmail_replies[0].import_token='injected',v=>v.tables.gmail_connections=[],v=>v.tables.gmail_outbox[0].first_attempt_at='123']){const bad=structuredClone(backup);mutate(bad);assert.throws(()=>restore.validateBackup(bad));}
 pass('restore rejects injected provider tables, transport controls and corrupted attempt types');
 const empty=structuredClone(backup);for(const name of Object.keys(empty.tables)){empty.tables[name]=[];empty.counts[name]=0;}const emptyFile=path.join(temporary,'empty.sqlite');restore.restoreBackup(empty,emptyFile,{migrationRoot:repo});const emptyDb=new DatabaseSync(emptyFile);try{for(const name of ['gmail_outbox','gmail_replies','gmail_app_config','gmail_connections','gmail_oauth_states'])assert.equal(emptyDb.prepare(`SELECT count(*) n FROM ${name}`).get().n,0);}finally{emptyDb.close();}
 pass('empty archives cannot seed Gmail connections or send jobs');
 console.log(`${groups} Gmail operational-backup groups passed (synthetic SQLite, no network or canonical artifact writes).`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{sql.close();fs.rmSync(temporary,{recursive:true,force:true});});
