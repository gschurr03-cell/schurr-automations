const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const dependencyRequire = createRequire(process.env.SCHURR_PACKAGE_JSON || path.join(process.cwd(), 'package.json'));
const ts = dependencyRequire('typescript');
const root = path.resolve(__dirname, '..');
const runtime = { INQUIRY_SIGNING_SECRET: 'test-only-'.repeat(8), OWNER_EMAIL: 'owner@example.com' };
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  async first() { return sql.prepare(this.query).get(...this.values) || null; }
  async all() { return { results: sql.prepare(this.query).all(...this.values) }; }
  async run() { return sql.prepare(this.query).run(...this.values); }
}
runtime.DB = {
  prepare(query) { return new Statement(query); },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const output = statements.map(statement => ({ results: sql.prepare(statement.query).all(...statement.values) }));
      sql.exec('COMMIT');
      return output;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};

function load(relative) {
  if (modules.has(relative)) return modules.get(relative);
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  const customRequire = name => {
    if (name === 'cloudflare:workers') return { env: runtime };
    if (name === '@/app/chatgpt-auth') return {
      getChatGPTUser: async () => currentUser && currentUser.userId && currentUser.email ? currentUser : null,
      requireChatGPTUser: async () => { if (!currentUser?.userId || !currentUser?.email) throw new Error('SIGN_IN_REDIRECT'); return currentUser; },
    };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), `${name}.ts`));
    return require(name);
  };
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, ReadableStream, Date, Intl, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

const crm=load('lib/crm.ts');
const intake=load('lib/inquiries.ts');
const api=load('app/api/manage/crm/route.ts');
const exporter=load('app/api/manage/export/route.ts');
const policy=load('lib/request-policy.ts');
const origin='https://example.chatgpt.site';
const command=(action,fields={})=>({action,mutationId:webcrypto.randomUUID(),...fields});
const request=(data,headers={})=>new Request(origin+'/api/manage/crm',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(data)});
const leadInput={name:'Ada Example',business:'Example Business',email:'ada@example.com',phone:'',preferredContact:'email',service:'calls',source:'referral',stage:'new',monthlyValue:'2000.50',setupValue:'1000',note:'Initial contact note'};
const mutate=(action,fields={})=>crm.mutateCrm(command(action,fields));
const count=table=>Number(sql.prepare(`SELECT count(*) AS count FROM ${table}`).get().count);
const status=expected=>error=>error.status===expected;
(async()=>{
 let checks=0; const pass=description=>{checks++;process.stdout.write('PASS '+description+'\n');};
 const post=command('createLead',leadInput);
 const baseDB=runtime.DB; let queries=0;
 runtime.DB={prepare(...args){queries++;return baseDB.prepare(...args);},batch(...args){queries++;return baseDB.batch(...args);}};
 currentUser=null;
 assert.equal((await api.POST(request(post))).status,401);
 assert.equal((await exporter.GET(new Request(origin+'/api/manage/export'))).status,401);
 currentUser={userId:'other',email:'other@example.com'};
 assert.equal((await api.POST(request(post))).status,403);
 assert.equal((await exporter.GET(new Request(origin+'/api/manage/export'))).status,403);
 assert.equal(queries,0);
 currentUser={userId:'owner',email:'owner@example.com'};
 assert.equal((await api.POST(request(post,{origin:'https://attacker.example'}))).status,403);
 assert.equal((await api.POST(request(post,{'content-type':'text/plain'}))).status,415);
 assert.equal((await api.POST(request({...post,note:'x'.repeat(25000)}))).status,413);
 assert.equal(queries,0);runtime.DB=baseDB;
 pass('anonymous and non-owner CRM reads/writes are denied before storage; origin/body/type enforced');

 const made=await api.POST(request(post));assert.equal(made.status,200);assert.match((await made.json()).redirect,/saved=created/);
 const leadId=post.mutationId;
 let lead=await crm.getLead(leadId);
 assert.equal(lead.monthlyCents,200050);assert.equal(lead.setupCents,100000);assert.equal(lead.source,'referral');assert.equal(lead.consentAt,'');assert.equal(count('inquiries'),0);
 await crm.mutateCrm(post);assert.equal(count('crm_leads'),1);assert.equal(count('crm_events'),1);
 await assert.rejects(()=>crm.mutateCrm({...post,name:'Different'}),status(409));
 pass('manual creation persists real fees without website consent/quota; retries are idempotent');

 const token=await intake.issueInquiryToken(origin);
 const submitted={...token,name:'Original person',business:'Original company',email:'original@example.com',phone:'',service:'audit',message:'Original request that must stay unchanged.',preferredContact:'email',consent:true};
 const saved=await intake.saveInquiry(submitted);
 const original=sql.prepare('SELECT * FROM inquiries WHERE id=?').get(saved.receipt);
 let website=await crm.getLead(saved.receipt);assert.equal(website.stage,'new');assert.equal(website.source,'website');assert.equal(count('crm_leads'),2);
 const {source,note,...edit}=leadInput;
 await mutate('updateLead',{...edit,leadId:website.id,revision:'1',name:'Updated CRM contact',email:'new@example.com',stage:'proposal'});
 website=await crm.getLead(website.id);assert.equal(website.name,'Updated CRM contact');assert.equal(website.revision,2);assert.equal(website.message,submitted.message);
 assert.deepEqual(sql.prepare('SELECT * FROM inquiries WHERE id=?').get(website.id),original);
 assert.equal((await intake.saveInquiry(submitted)).receipt,website.id);
 pass('all website inquiries appear immediately and CRM edits preserve original input, consent, and retry hashes');

 const beforeEvents=count('crm_events');
 const competing=await Promise.allSettled([mutate('stage',{leadId,revision:'1',stage:'contacted'}),mutate('stage',{leadId,revision:'1',stage:'discovery'})]);
 assert.equal(competing.filter(x=>x.status==='fulfilled').length,1);assert.equal(competing.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
 assert.equal(count('crm_events'),beforeEvents+1);assert.equal((await crm.getLead(leadId)).revision,2);
 const staleCount=count('crm_events');await assert.rejects(()=>mutate('stage',{leadId,revision:'1',stage:'won'}),status(409));assert.equal(count('crm_events'),staleCount);
 pass('competing/stale edits produce one winning change and no false history');

 const noteCommand=command('addNote',{leadId,kind:'call',body:'<img src=x onerror=alert(1)> call note'});
 await Promise.all([crm.mutateCrm(noteCommand),crm.mutateCrm(noteCommand)]);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM crm_events WHERE id=?').get(noteCommand.mutationId).n,1);
 await assert.rejects(()=>mutate('deleteNote',{leadId:website.id,noteId:noteCommand.mutationId}),status(409));
 assert.ok(sql.prepare('SELECT id FROM crm_events WHERE id=?').get(noteCommand.mutationId));
 await mutate('deleteNote',{leadId,noteId:noteCommand.mutationId});
 assert.equal(sql.prepare('SELECT id FROM crm_events WHERE id=?').get(noteCommand.mutationId),undefined);
 pass('notes persist literally, duplicate notes are prevented, and removal is scoped to its parent');

 const taskCommand=command('createTask',{leadId:website.id,title:'Send the proposal',dueDate:'2026-09-29'});
 await Promise.all([crm.mutateCrm(taskCommand),crm.mutateCrm(taskCommand)]);assert.equal(count('crm_tasks'),1);
 const taskId=taskCommand.mutationId;
 assert.equal((await crm.listTasks({status:'overdue',today:'2026-09-30'})).items.length,1);
 await mutate('taskStatus',{taskId,revision:'1',status:'done'});assert.equal((await crm.listTasks({status:'done'})).items.length,1);
 await mutate('taskStatus',{taskId,revision:'2',status:'open'});assert.equal((await crm.listTasks({status:'open'})).items.length,1);
 await mutate('updateTask',{taskId,revision:'3',title:'Call about proposal',dueDate:'2026-10-02'});
 await assert.rejects(()=>mutate('taskStatus',{taskId,revision:'3',status:'done'}),status(409));
 await assert.rejects(()=>mutate('createTask',{title:'Invalid date',dueDate:'2026-02-30'}),status(400));
 await assert.rejects(()=>mutate('createTask',{leadId:webcrypto.randomUUID(),title:'Missing lead',dueDate:'2026-10-02'}),status(404));
 assert.equal(crm.dayInTimezone('America/Denver',new Date('2026-10-01T01:00:00Z')),'2026-09-30');
 pass('tasks support due/overdue, complete/reopen, edits, stale protection, and timezone-aware day boundaries');

 const settings=await crm.getSettings();assert.equal(settings.timezone,'America/Denver');assert.equal(settings.setupComplete,0);
 const prefs={revision:'1',businessName:'Schurr Automations',ownerName:'Gavin Schurr',replyEmail:'business@example.com',replyPhone:'9852328337',timezone:'America/Chicago'};
 await mutate('settings',prefs);assert.equal((await crm.getSettings()).setupComplete,1);assert.equal((await crm.getSettings()).replyEmail,'business@example.com');
 await assert.rejects(()=>mutate('settings',{...prefs,revision:'2',OWNER_EMAIL:'stranger@example.com'}),status(400));
 await assert.rejects(()=>mutate('settings',{...prefs,revision:'2',timezone:'Wrong/Zone'}),status(400));
 assert.equal(runtime.OWNER_EMAIL,'owner@example.com');
 pass('workspace settings persist without permitting authorization changes');

 for(const payload of [{...leadInput,source:'website'},{...leadInput,stage:'constructor'},{...leadInput,monthlyValue:'1e10'},{...leadInput,phone:'javascript:alert(1)'},{...leadInput,email:'a\nb@example.com'},{...leadInput,name:'x'.repeat(101)},{...leadInput,monthlyValue:'-1'}]) await assert.rejects(()=>mutate('createLead',payload),status(400));
 await assert.rejects(()=>crm.listLeads({stage:'constructor'}),status(400));
 const malformed=btoa(JSON.stringify(['2026-09-30T00:00:00.000Z',[leadId]])).replace(/=+$/,'');await assert.rejects(()=>crm.listLeads({cursor:malformed}),status(400));
 assert.equal((await crm.listLeads({q:"'; DROP TABLE inquiries; --"})).items.length,0);
 pass('action values, fees, contact fields, cursors and SQL-bound searches reject hostile input');

 const match=command('createLead',{...leadInput,name:'=SUM(1,1)',email:'formula@example.com',business:'50%_Match '+ 'long-name-'.repeat(8),note:''});await crm.mutateCrm(match);
 assert.equal((await crm.listLeads({q:'%_'})).items.length,1);
 assert.equal((await crm.listLeads({q:'long-name-'.repeat(8)})).items.length,1);
 const longExport=await exporter.GET(new Request(origin+'/api/manage/export?q='+encodeURIComponent('long-name-'.repeat(8))));assert.equal(longExport.status,200);assert.equal((await longExport.text()).trim().split('\r\n').length,2);
 for(let i=0;i<103;i++) await mutate('createLead',{...leadInput,name:'Export '+i,email:`export${i}@example.com`,note:''});
 const all=[];let cursor;do{const page=await crm.listLeads({cursor},50);all.push(...page.items);cursor=page.nextCursor;}while(cursor);
 assert.equal(new Set(all.map(x=>x.id)).size,all.length);assert.equal(all.length,106);
 const response=await exporter.GET(new Request(origin+'/api/manage/export'));
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 const csv=await response.text();assert.equal(csv.trim().split('\r\n').length,107);assert.ok(csv.includes("\"'=SUM(1,1)\""));
 for(const value of ['=1','+1','-1','@test','  =x','\t=1','\r123']) assert.ok(crm.csvCell(value).startsWith('"\''));
 const filtered=await exporter.GET(new Request(origin+'/api/manage/export?q=50%25_Match'));assert.equal((await filtered.text()).trim().split('\r\n').length,2);
 pass('pagination and export traverse all records; literal search and CSV formula protection work');

 const badKey=webcrypto.randomUUID();const cross=await Promise.allSettled([crm.mutateCrm({action:'createLead',mutationId:badKey,...leadInput,name:'Race lead',email:'race-lead@example.com'}),crm.mutateCrm({action:'createTask',mutationId:badKey,title:'Race task',dueDate:'2026-10-02'})]);
 assert.equal(cross.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(Number(!!sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(badKey))+Number(!!sql.prepare('SELECT id FROM crm_tasks WHERE id=?').get(badKey)),1);
 pass('a reused mutation key with competing actions cannot create unreceipted records');

 const rev=(await crm.getLead(website.id)).revision;
 await assert.rejects(()=>mutate('deleteLead',{leadId:website.id,revision:String(rev),confirmation:'no'}),status(400));
 await assert.rejects(()=>mutate('deleteLead',{leadId:website.id,revision:String(rev-1),confirmation:'DELETE'}),status(409));
 await mutate('deleteLead',{leadId:website.id,revision:String(rev),confirmation:'DELETE'});
 assert.equal(await crm.getLead(website.id),null);
 assert.ok(sql.prepare('SELECT id FROM inquiries WHERE id=?').get(website.id), 'inquiry consent row must survive soft-delete');
 assert.equal(sql.prepare('SELECT consent_at FROM inquiries WHERE id=?').get(website.id).consent_at, original.consent_at);
 assert.ok(sql.prepare('SELECT deleted_at FROM crm_leads WHERE id=?').get(website.id).deleted_at);
 assert.ok(sql.prepare('SELECT count(*) AS n FROM crm_events WHERE lead_id=?').get(website.id).n >= 1);
 assert.ok(sql.prepare('SELECT id FROM crm_tasks WHERE id=?').get(taskId), 'tasks remain after soft-delete');
 assert.equal((await crm.listLeads({})).items.some(l=>l.id===website.id), false);
 assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
 pass('confirmed revision-checked soft-delete keeps inquiry consent and hides the lead from lists');


 // High-finding coverage: unique email merge-on-create and list/export filters.
 const firstEmail=command('createLead',{...leadInput,name:'Dedupe One',email:'dealer@example.com',note:'first'});
 await crm.mutateCrm(firstEmail);
 const mergeCreate=command('createLead',{...leadInput,name:'Dedupe Two',email:'dealer@example.com',note:'merged note',stage:'contacted'});
 const merged=await crm.mutateCrm(mergeCreate);
 assert.match(merged.redirect,/\/manage\/leads\//);
 assert.equal(sql.prepare("SELECT count(*) AS n FROM crm_leads WHERE email='dealer@example.com' AND deleted_at IS NULL").get().n,1);
 const survivor=await crm.getLead(firstEmail.mutationId);
 assert.equal(survivor.name,'Dedupe Two');assert.equal(survivor.stage,'contacted');
 assert.ok(sql.prepare("SELECT count(*) AS n FROM crm_events WHERE lead_id=? AND (body LIKE 'merged note%' OR kind='note')").get(firstEmail.mutationId).n >= 1);
 const clashUpdate=command('createLead',{...leadInput,name:'Other Lead',email:'other-dealer@example.com',note:''});
 await crm.mutateCrm(clashUpdate);
 const beforeMerge=await crm.getLead(clashUpdate.mutationId);
 await mutate('updateLead',{leadId:clashUpdate.mutationId,revision:String(beforeMerge.revision),name:'Merged By Email',business:'Biz',email:'dealer@example.com',phone:'',preferredContact:'email',service:'calls',stage:'proposal',monthlyValue:'0',setupValue:'0'});
 assert.equal(await crm.getLead(clashUpdate.mutationId),null);
 assert.ok(sql.prepare('SELECT deleted_at FROM crm_leads WHERE id=?').get(clashUpdate.mutationId).deleted_at);
 assert.equal((await crm.getLead(firstEmail.mutationId)).name,'Merged By Email');
 assert.equal(sql.prepare("SELECT count(*) AS n FROM crm_leads WHERE email='dealer@example.com' AND deleted_at IS NULL").get().n,1);
 const exportAfter=await exporter.GET(new Request(origin+'/api/manage/export'));
 assert.equal(exportAfter.status,200);
 const exportBody=await exportAfter.text();
 assert.ok(!exportBody.includes(clashUpdate.mutationId));
 assert.ok(exportBody.includes('dealer@example.com'));
 pass('merge-on-create/update keeps one active email and export omits soft-deleted leads');

 const rollback=command('createLead',{...leadInput,name:'Rollback test',email:'rollback@example.com'});
 sql.exec("CREATE TRIGGER fail_crm_event BEFORE INSERT ON crm_events BEGIN SELECT RAISE(ABORT,'simulated event failure'); END");
 try { assert.equal((await api.POST(request(rollback))).status,503); } finally { sql.exec('DROP TRIGGER fail_crm_event'); }
 assert.equal(sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(rollback.mutationId),undefined);
 assert.equal(sql.prepare('SELECT id FROM crm_mutations WHERE id=?').get(rollback.mutationId),undefined);
 assert.equal((await api.POST(request(rollback))).status,200);
 pass('partial failures roll back lead, receipt and history together; a safe retry completes');

 for(const path of ['/manage','/manage/leads','/login','/crm','/api/manage/crm','/api/manage/export']){
  const req=new Request(origin+path);const secured=policy.secureResponse(req,new Response('test',{headers:{'content-type':'text/html'}}));
  assert.equal(secured.headers.get('X-Frame-Options'),'DENY');assert.equal(secured.headers.get('Cache-Control'),'private, no-store');
 }
 assert.equal(policy.rejectUnsupportedRequest(request(command('stage',{leadId,revision:'2',stage:'won'}))),null);
 assert.equal(policy.rejectUnsupportedRequest(request({}, {'next-action':'action'})).status,403);
 assert.equal(policy.rejectUnsupportedRequest(new Request(origin+'/api/manage/crm',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body:'x'})).status,415);
 const form=fs.readFileSync(path.join(root,'app/manage/crm-form.tsx'),'utf8');assert.match(form,/<form method="post" action="\/api\/manage\/crm"/);
 pass('CRM/login/export share private response protections and forms do not fall back to PII-in-URL GET');
 console.log(`\n${checks} CRM integration/security groups passed against real SQLite with foreign keys enabled.`);
 sql.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
