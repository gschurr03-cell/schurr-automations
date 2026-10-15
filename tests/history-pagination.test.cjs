const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const dependencyRequire = createRequire(process.env.SCHURR_PACKAGE_JSON || '/workspace/sites/schurr-automations/package.json');
const ts = dependencyRequire('typescript');
const root = process.env.SCHURR_PROJECT_ROOT || (fs.existsSync(path.join(__dirname,'candidate'))?'/workspace/sites/schurr-automations':path.resolve(__dirname,'..'));
const candidate = path.join(__dirname,'candidate');
const runtime = { INQUIRY_SIGNING_SECRET: 'test-only-'.repeat(8), OWNER_EMAIL: 'owner@example.com' };
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
let activeKey='test-provider-key';let sends=[];let providerBehavior='ok';let connectionHook=null;
let beforeFirst=null;let providerEmailId='12345678-1234-4234-8234-123456789abc';
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  async first() { if(beforeFirst)await beforeFirst(this);return sql.prepare(this.query).get(...this.values) || null; }
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
  if(relative==='lib/owner-alerts.ts')return {verifiedEmailConnection:async()=>{if(connectionHook){const hook=connectionHook;connectionHook=null;hook();}return activeKey?{apiKey:activeKey,verifiedAt:new Date().toISOString()}:null;}};
  if(!fs.existsSync(path.join(root,relative))&&!fs.existsSync(path.join(candidate,relative))&&(fs.existsSync(path.join(root,relative+'x'))||fs.existsSync(path.join(candidate,relative+'x'))))relative+='x';
  if (modules.has(relative)) return modules.get(relative);
  const staged=path.join(candidate,relative);
  const source = fs.readFileSync(fs.existsSync(staged)?staged:path.join(root,relative),'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  const customRequire = name => {
    if(name.endsWith('?raw'))return {default:fs.readFileSync(path.join(root,name.slice(2,-4)),'utf8')};
    if (name.endsWith('.css')) return {};
    if (name === 'next/navigation') return {useRouter:()=>({refresh(){}}),redirect: location=>{throw new Error('REDIRECT:'+location);}};
    if (name === 'cloudflare:workers') return { env: runtime };
    if (name === '@/app/chatgpt-auth') return {
      getChatGPTUser: async () => currentUser && currentUser.userId && currentUser.email ? currentUser : null,
      chatGPTSignInPath: target => '/signin-with-chatgpt?return_to='+encodeURIComponent(target),
      chatGPTSignOutPath: target => '/signout-with-chatgpt?return_to='+encodeURIComponent(target||'/'),
      requireChatGPTUser: async () => { if (!currentUser?.userId || !currentUser?.email) throw new Error('SIGN_IN_REDIRECT'); return currentUser; },
    };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), `${name}.ts`));
    return dependencyRequire(name);
  };
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, ReadableStream, Date, Intl, AbortSignal, fetch:async(url,options)=>{sends.push({url,...options});if(providerBehavior==='timeout')throw new Error('timeout');if(typeof providerBehavior==='object')return Response.json({name:providerBehavior.name},{status:providerBehavior.status});if(providerBehavior==='limited')return new Response('Rate limited',{status:429,headers:{'Retry-After':'3600'}});return Response.json({id:providerEmailId});}, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}




const desk=load('lib/automation-desk.ts'),delivery=load('lib/review-delivery.ts'),follow=load('lib/followups.ts');
const id=n=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const instant='2026-10-01T12:00:00.000Z';
function operation(n,kind,status='draft',createdAt=instant){
 sql.prepare('INSERT INTO automation_runs(id,kind,event_key,body_hash,profile_revision,input,output,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id(n),kind,'fixture-'+n,'test',1,'{}','{}',status,createdAt,createdAt);
}
async function allPages(getPage){let cursor,items=[],pages=0;do{const page=await getPage(cursor);items.push(...page.items);cursor=page.nextCursor;assert.ok(++pages<20,'cursor must advance');}while(cursor);return items;}
function reminder(n,status,due){
 const lead=id(10000+n),request=id(20000+n),reminder=id(30000+n),phone='+13035550123';
 sql.prepare('INSERT INTO crm_leads(id,name,phone,preferred_contact,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(lead,'Fictional caller '+n,phone,'phone',instant,instant);
 sql.prepare('INSERT INTO response_jobs(id,lead_id,source_key,body_hash,channel,consent_scope,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(request,lead,'fixture:'+n,'test','phone','Test permission',instant,instant);
 sql.prepare('INSERT INTO response_followups(id,response_id,body_hash,channel,recipient,due_ms,status,note,permission_evidence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(reminder,request,'test','phone',phone,due,status,'Fictional reminder','Test permission',instant,instant);
 return {id:reminder,responseId:request};
}
(async()=>{
 let checks=0;const pass=message=>{checks++;console.log('PASS '+message);};
 for(let n=1;n<=120;n++){
  operation(n,'review_request');
  sql.prepare('INSERT INTO review_requests(id,job_id,recipient,consent_evidence,payload,profile_revision,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id(n),'fixture-'+n,'fixture'+n+'@example.com','Test permission','{}',1,n%2?'delivered':'failed',instant);
 }
 for(let n=201;n<=265;n++)operation(n,'quote',n===201?'approved':'draft','2026-10-02T12:00:00.000Z');
 operation(900,'search_import','draft','2026-10-03T12:00:00.000Z');
 const original=await desk.listOperationRuns();assert.equal(original.length,50);assert.ok(original.some(r=>r.id===id(900)));
 assert.equal((await desk.listOperationRuns(true)).length,50);assert.ok((await desk.listOperationRuns(true)).every(r=>r.kind!=='search_import'));
 const operations=await allPages(cursor=>desk.listOperationRunsPage({excludeSearch:true,cursor}));
 assert.equal(operations.length,185);assert.equal(new Set(operations.map(r=>r.id)).size,185);
 assert.deepEqual(Array.from(operations,r=>r.id),sql.prepare("SELECT id FROM automation_runs WHERE kind!='search_import' ORDER BY created_at DESC,id DESC").all().map(r=>r.id));
 pass('operation cursors traverse tied timestamps without omissions and preserve legacy list defaults and the separate search window');
 const failures=await allPages(cursor=>desk.listOperationRunsPage({excludeSearch:true,kind:'review_request',status:'failed',cursor}));
 assert.equal(failures.length,60);assert.ok(failures.some(r=>r.id===id(2)));assert.ok(failures.every(r=>r.kind==='review_request'&&r.status==='draft'));
 const oldReview=await delivery.reviewRequestsForRuns([id(2)]);assert.equal(oldReview[0].status,'failed');assert.ok(!(await delivery.listReviewRequests()).some(r=>r.id===id(2)));
 assert.equal((await desk.listOperationRunsPage({excludeSearch:true,kind:'quote',status:'approved'})).items[0].id,id(201));
 pass('saved-work status filtering uses delivery status and older invitations retain their exact delivery details');
 const invitations=await allPages(cursor=>delivery.listReviewRequestsPage({status:'failed',cursor}));assert.equal(invitations.length,60);assert.equal(new Set(invitations.map(r=>r.id)).size,60);
 assert.equal((await delivery.listReviewRequests()).length,50);assert.equal((await delivery.reviewRequestsForRuns([])).length,0);
 for(const get of [()=>desk.listOperationRunsPage({cursor:'invalid!'}),()=>delivery.listReviewRequestsPage({cursor:'invalid!'}),()=>desk.listOperationRunsPage({status:'not-a-status'}),()=>delivery.listReviewRequestsPage({status:'not-a-status'})])await assert.rejects(get);
 pass('review invitation paging reaches older failed invitations and rejects malformed cursors and filters');
 const emailId=id(500);sql.prepare("UPDATE review_requests SET email_id=?,status='accepted',event_rank=0 WHERE id=?").run(emailId,id(2));
 sql.prepare('INSERT INTO customer_email_events(id,email_id,type,event_at) VALUES(?,?,?,?)').run('fixture-bounce',emailId,'email.bounced',instant);
 const emptyDraftPage=await delivery.listReviewRequestsPage({status:'draft'});assert.equal(emptyDraftPage.items.length,0);
 assert.equal(sql.prepare('SELECT status FROM review_requests WHERE id=?').get(id(2)).status,'bounced');assert.ok(sql.prepare('SELECT email FROM outreach_suppressions WHERE email=?').get('fixture2@example.com'));
 assert.equal((await desk.listOperationRunsPage({kind:'review_request',status:'bounced'})).items[0].id,id(2));
 pass('review delivery reconciliation processes an invitation outside the selected page without sending email');
 const past=Date.now()-86400000,future=Date.now()+86400000;let outside;
 for(let n=1;n<=205;n++)outside=reminder(n,'open',past);
 for(let n=206;n<=210;n++)reminder(n,'open',future);
 for(let n=211;n<=325;n++)reminder(n,'completed',past);
 for(let n=326;n<=337;n++)reminder(n,'cancelled',past);
 sql.prepare("UPDATE response_jobs SET status='paused' WHERE id=?").run(outside.responseId);
 const completedFirst=await follow.listFollowupsPage({status:'completed'});assert.equal(completedFirst.items.length,100);assert.ok(completedFirst.nextCursor);assert.equal(completedFirst.dueCount,204);
 assert.equal(sql.prepare('SELECT status FROM response_followups WHERE id=?').get(outside.id).status,'cancelled');
 const open=await allPages(cursor=>follow.listFollowupsPage({status:'open',cursor}));assert.equal(open.length,209);assert.equal(new Set(open.map(r=>r.id)).size,209);
 assert.deepEqual(Array.from(open,r=>r.id),sql.prepare("SELECT id FROM response_followups WHERE status='open' ORDER BY due_ms,id").all().map(r=>r.id));
 const completed=await allPages(cursor=>follow.listFollowupsPage({status:'completed',cursor}));assert.equal(completed.length,115);assert.equal(new Set(completed.map(r=>r.id)).size,115);
 assert.ok((await follow.listFollowupsPage({status:'cancelled'})).items.some(r=>r.id===outside.id));
 pass('follow-up pages reach all open and completed reminders with tied due times and a global due count');
 const legacyFollowups=await follow.listFollowups();assert.equal(legacyFollowups.length,100);assert.ok(legacyFollowups.every(r=>r.status==='open'));
 await assert.rejects(()=>follow.listFollowupsPage({status:'all'}));await assert.rejects(()=>follow.listFollowupsPage({cursor:'invalid!'}));
 assert.equal(sends.length,0);pass('follow-up cleanup remains global across filters, legacy defaults remain intact, and history operations send nothing');
 for(const relative of ['lib/review-delivery.ts','lib/automation-desk.ts','lib/followups.ts','app/manage/automations/page.tsx','app/manage/schedule/page.tsx','app/manage/history-controls.tsx']){
  const sourcePath=fs.existsSync(path.join(candidate,relative))?path.join(candidate,relative):path.join(root,relative);
  const parsed=ts.transpileModule(fs.readFileSync(sourcePath,'utf8'),{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
  assert.deepEqual((parsed.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[],relative+' must parse');
 }

 const navigation=[],controlModule={exports:{}},jsx=(type,props)=>({type,props});
 const controlFile='app/manage/history-controls.tsx',controlSource=fs.readFileSync(fs.existsSync(path.join(candidate,controlFile))?path.join(candidate,controlFile):path.join(root,controlFile),'utf8');
 const controlCode=ts.transpileModule(controlSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(controlCode,{module:controlModule,exports:controlModule.exports,require:name=>name==='next/navigation'?{useRouter:()=>({push:href=>navigation.push(href)})}:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:{},URL,URLSearchParams,FormData:class{constructor(form){this.values=form.values;}[Symbol.iterator](){return this.values[Symbol.iterator]();}}});
 const {HistoryFilter,HistoryLink}=controlModule.exports;let prevented=0;
 const filter=HistoryFilter({action:'/manage/automations#activity',children:null});
 filter.props.onSubmit({preventDefault(){prevented++;},currentTarget:{values:[['activityKind','review_request'],['activityStatus','failed']]}});
 assert.equal(navigation[0],'/manage/automations?activityKind=review_request&activityStatus=failed#activity');assert.equal(prevented,1);
 const target='/manage/schedule?followupStatus=open&followupCursor=cursor#followup-queue',link=HistoryLink({href:target,current:true,children:'Next'});
 assert.equal(link.props.href,target);assert.equal(link.props['aria-current'],'page');
 link.props.onClick({button:0,preventDefault(){prevented++;}});assert.equal(navigation[1],target);assert.equal(prevented,2);
 for(const modifiers of [{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{button:1}])link.props.onClick({button:0,...modifiers,preventDefault(){throw Error('Modified clicks must retain native browser behavior.');}});
 assert.equal(navigation.length,2);pass('same-page history controls use router navigation while preserving modifier clicks and native fallback URLs');
 console.log(checks+' history pagination groups passed; all data fictional and zero external sends.');
})().catch(error=>{console.error(error);process.exit(1);});
