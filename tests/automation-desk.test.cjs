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
  if(!fs.existsSync(path.join(root,relative)) && fs.existsSync(path.join(root,relative+'x'))) relative += 'x';
  if (modules.has(relative)) return modules.get(relative);
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
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



const desk=load('lib/automation-desk.ts'), delivery=load('lib/review-delivery.ts'), routes=load('app/api/manage/automations/route.ts'), publicRoute=load('app/api/assistant/route.ts');
const request=data=>new Request('https://schurrautomations.com/api/manage/automations',{method:'POST',headers:{Origin:'https://schurrautomations.com','Content-Type':'application/json'},body:JSON.stringify(data)});
const row=id=>sql.prepare('SELECT * FROM review_requests WHERE id=?').get(id);
(async()=>{
 let checks=0;const pass=s=>{checks++;console.log('PASS '+s);};
 const policy=load('lib/request-policy.ts');
 assert.equal(policy.rejectUnsupportedRequest(request({action:'settings'})),null);
 assert.equal(policy.rejectUnsupportedRequest(new Request('https://schurrautomations.com/api/manage/automations',{method:'DELETE'})).status,405);
 assert.equal(policy.rejectUnsupportedRequest(new Request('https://schurrautomations.com/api/manage/automations',{method:'POST',headers:{'content-type':'text/plain'}})).status,415);
 pass('production request gate permits the automation API while rejecting unsupported methods and content types');
 currentUser=null;let response=await routes.POST(request({action:'settings'}));assert.equal(response.status,401);currentUser={userId:'other',email:'other@example.com'};response=await routes.POST(request({action:'settings'}));assert.equal(response.status,403);assert.equal(sql.prepare('SELECT count(*) AS n FROM automation_settings').get().n,0);currentUser={userId:'owner-id',email:'owner@example.com'};pass('anonymous and other users cannot configure or execute private workflows');
 let settings=await desk.getAutomationSettings();settings.profile.internalKnowledge='Private question | PRIVATE_ONLY_SENTINEL | Staff manual';settings.profile.priceBook='BASE | Base service | 125.25\nEXTRA | Additional service | 10.50';settings.profile.reviewLink='https://g.page/r/test-only/review';
 await desk.saveAutomationSettings({...settings,googleEligibility:'visits_customers'});await assert.rejects(()=>desk.saveAutomationSettings({...settings,googleEligibility:'visits_customers'}),/changed/);settings=await desk.getAutomationSettings();assert.equal(settings.revision,1);
 const publicData=await (await publicRoute.GET()).json();assert.ok(publicData.questions.length>0);assert.ok(!JSON.stringify(publicData).includes('PRIVATE_ONLY_SENTINEL'));assert.ok(!JSON.stringify(publicData).includes('125.25'));assert.ok(!JSON.stringify(publicData).includes('gschurr03@gmail.com'));pass('settings use optimistic revisions and public answers exclude private fields');
 const quote=await desk.prepareOperation({kind:'quote',eventKey:'quote-001',revision:1,customer:'Example customer',lines:[{serviceCode:'BASE',quantity:3},{serviceCode:'EXTRA',quantity:2}]});assert.equal(quote.output.subtotalCents,39675);await desk.operationAction({action:'approve',id:quote.id});await assert.rejects(()=>desk.prepareOperation({kind:'quote',eventKey:'quote-bad',revision:1,customer:'Example',lines:[{serviceCode:'MISSING',quantity:1}]}),/approved price/);assert.equal(sends.length,0);pass('multi-line quote arithmetic is exact, unknown services fail closed, approval sends nothing');
 const event={kind:'review_request',eventKey:'job-001',revision:1,customer:'Example Customer',email:'customer@example.com',consentEvidence:'Customer explicitly requested one review email.',completed:true,permission:true};
 await assert.rejects(()=>desk.prepareOperation({...event,permission:false}),/permission/);await assert.rejects(()=>desk.prepareOperation({...event,completed:false}),/completed/);
 const first=await desk.prepareOperation(event),again=await desk.prepareOperation(event);assert.equal(first.id,again.id);assert.equal(sql.prepare('SELECT count(*) AS n FROM review_requests').get().n,1);await assert.rejects(()=>desk.prepareOperation({...event,email:'changed@example.com'}),/different information/);assert.equal(sends.length,0);pass('completed-service permission and stable-job deduplication precede saved invitations');
 const results=await Promise.allSettled([delivery.deliverReviewRequest(first.id),delivery.deliverReviewRequest(first.id)]);assert.equal(sends.length,1);assert.equal(row(first.id).status,'accepted');assert.equal(JSON.parse(sends[0].body).to[0],'customer@example.com');assert.equal(sends[0].headers['Idempotency-Key'],'schurr-review/'+first.id);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);pass('concurrent delivery claims send one frozen payload with a stable idempotency key');
 const stopped=await desk.prepareOperation({...event,eventKey:'job-stopped',email:'stopped@example.com'});await desk.operationAction({action:'cancel',id:stopped.id});await assert.rejects(()=>delivery.deliverReviewRequest(stopped.id));assert.equal(sends.length,1);
 sql.prepare('INSERT INTO outreach_suppressions(email,reason,created_at) VALUES(?,?,?)').run('suppressed@example.com','test',new Date().toISOString());await assert.rejects(()=>desk.prepareOperation({...event,eventKey:'job-suppressed',email:'suppressed@example.com'}),/suppressed/);pass('stopped and suppressed requests cannot be sent or recreated');
 providerBehavior='timeout';const retry=await desk.prepareOperation({...event,eventKey:'job-retry',email:'retry@example.com'});await delivery.deliverReviewRequest(retry.id);assert.equal(row(retry.id).status,'failed');sql.prepare('UPDATE review_requests SET lock_until=0 WHERE id=?').run(retry.id);activeKey='different-provider-account';await assert.rejects(()=>delivery.deliverReviewRequest(retry.id));assert.equal(row(retry.id).status,'uncertain');assert.equal(sends.length,2);activeKey='test-provider-key';providerBehavior='ok';pass('ambiguous attempts cannot move to a different provider account');
 const emailId=row(first.id).email_id;sql.prepare('INSERT INTO customer_email_events(id,email_id,type,event_at) VALUES(?,?,?,?)').run('event-bounced',emailId,'email.bounced',new Date().toISOString());await delivery.applyReviewEmailEvents(emailId);assert.equal(row(first.id).status,'bounced');assert.ok(sql.prepare('SELECT email FROM outreach_suppressions WHERE email=?').get('customer@example.com'));await delivery.applyReviewEmailEvents(emailId);assert.equal(row(first.id).status,'bounced');pass('verified delivery-event reconciliation is repeatable and suppresses bounced recipients');
 const seo=await load('lib/site-seo.ts').runSeoAudit(webcrypto.randomUUID());assert.equal(seo.output.pages.length,7);assert.equal(seo.output.total,56);assert.ok(seo.output.scope.includes('Not Google indexing'));const kit=await desk.deploymentKit();assert.equal(kit.credentialsIncluded,false);assert.equal(kit.enabled,false);assert.ok(!JSON.stringify(kit).includes(activeKey));pass('SEO checks actual source pages and installation kit excludes provider secrets/activation');

 const baseBatch=runtime.DB.batch;
 runtime.DB.batch=async statements=>baseBatch([...statements,new Statement('INSERT INTO missing_test_table VALUES(1)')]);
 await assert.rejects(()=>desk.prepareOperation({...event,eventKey:'job-rollback',email:'rollback@example.com'}));
 runtime.DB.batch=baseBatch;
 assert.equal(sql.prepare('SELECT count(*) AS n FROM automation_runs WHERE event_key=?').get('job-rollback').n,0);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM review_requests WHERE job_id=?').get('job-rollback').n,0);
 pass('a failed outbox transaction rolls back its operation receipt');
 const limited=await desk.prepareOperation({...event,eventKey:'job-rate-limited',email:'limited@example.com'});providerBehavior='limited';
 const start=Date.now();await delivery.deliverReviewRequest(limited.id);assert.ok(row(limited.id).lock_until>=start+3600000);
 const sendCount=sends.length;await assert.rejects(()=>delivery.deliverReviewRequest(limited.id));assert.equal(sends.length,sendCount);providerBehavior='ok';
 pass('provider Retry-After prevents an early retry');
 const race=await desk.prepareOperation({...event,eventKey:'job-config-race',email:'race@example.com'});
 connectionHook=()=>sql.prepare("UPDATE automation_settings SET revision=revision+1 WHERE id='business'").run();
 await assert.rejects(()=>delivery.deliverReviewRequest(race.id));assert.equal(sends.length,sendCount);assert.equal(row(race.id).status,'cancelled');
 await assert.rejects(()=>desk.saveOperation('knowledge','stale-save',{question:'test'},{answer:'old'},1),/different information/);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM automation_runs WHERE event_key=?').get('stale-save').n,0);
 pass('configuration changes during connection checks prevent stale sends and saves');

 const beforeBlockedReply=sends.length;
 settings=await desk.getAutomationSettings();const approvalOwner=settings.profile.contactName;
 await desk.saveAutomationSettings({...settings,profile:{...settings.profile,contactName:''}});
 const missingApproverRevision=(await desk.getAutomationSettings()).revision;
 const blockedReply=await routes.POST(request({action:'prepare',kind:'review_reply',eventKey:'reply-missing-approver',revision:missingApproverRevision,reviewText:'Thank you for the service.'}));
 assert.equal(blockedReply.status,400);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM automation_runs WHERE event_key=?').get('reply-missing-approver').n,0);
 assert.equal(sends.length,beforeBlockedReply);
 settings=await desk.getAutomationSettings();await desk.saveAutomationSettings({...settings,profile:{...settings.profile,contactName:approvalOwner}});
 pass('a review response without its required approver is rejected without creating an approvable record');

 const freshReview=async(eventKey,email)=>desk.prepareOperation({...event,eventKey,email,revision:(await desk.getAutomationSettings()).revision});
 const beforeFinalCheck=(id,mutate)=>{
  beforeFirst=statement=>{
   if(statement.query.startsWith('SELECT id FROM review_requests WHERE id=? AND lock_token=?')&&statement.values[0]===id){beforeFirst=null;mutate();}
  };
 };
 const assertReleased=(id,status)=>{const saved=row(id);assert.equal(saved.status,status);assert.equal(saved.retryable,0);assert.equal(saved.lock_until,0);assert.equal(saved.lock_token,'');if(status==='cancelled'){assert.equal(saved.first_attempt_at,0);assert.equal(saved.connection_fingerprint,'');}};
 const beforeNoSends=sends.length;
 const changedAfterClaim=await freshReview('job-after-claim-config','after-claim-config@example.com');
 beforeFinalCheck(changedAfterClaim.id,()=>sql.prepare("UPDATE automation_settings SET revision=revision+1 WHERE id='business'").run());
 try{await assert.rejects(()=>delivery.deliverReviewRequest(changedAfterClaim.id),error=>error.status===409&&/No email was sent/.test(error.message));}finally{beforeFirst=null;}
 assertReleased(changedAfterClaim.id,'cancelled');
 const suppressedAfterClaim=await freshReview('job-after-claim-suppression','after-claim-suppression@example.com');
 beforeFinalCheck(suppressedAfterClaim.id,()=>sql.prepare('INSERT INTO outreach_suppressions(email,reason,created_at) VALUES(?,?,?)').run('after-claim-suppression@example.com','Withdrawn before provider send',new Date().toISOString()));
 try{await assert.rejects(()=>delivery.deliverReviewRequest(suppressedAfterClaim.id),error=>error.status===409);}finally{beforeFirst=null;}
 assertReleased(suppressedAfterClaim.id,'cancelled');
 for(const [suffix,damage] of [['invalid-json',()=>'{'],['wrong-sender',payload=>JSON.stringify({...JSON.parse(payload),from:'Unapproved <sender@example.com>'})]]){
  const corrupt=await freshReview('job-corrupt-'+suffix,'corrupt-'+suffix+'@example.com');
  sql.prepare('UPDATE review_requests SET payload=? WHERE id=?').run(damage(row(corrupt.id).payload),corrupt.id);
  await assert.rejects(()=>delivery.deliverReviewRequest(corrupt.id),error=>error.status===409);
  assertReleased(corrupt.id,'cancelled');
 }
 assert.equal(sends.length,beforeNoSends);
 pass('configuration or suppression changes after claim and corrupt saved payloads release leases without sending');

 const beforeCorrectedSends=sends.length;
 for(const [suffix,email] of [['config','after-claim-config@example.com'],['invalid-json','corrupt-invalid-json@example.com'],['wrong-sender','corrupt-wrong-sender@example.com']]){
  const corrected=await freshReview('job-corrected-'+suffix,email);providerEmailId=webcrypto.randomUUID();
  await delivery.deliverReviewRequest(corrected.id);
  assert.equal(row(corrected.id).status,'accepted');assert.equal(row(corrected.id).email_id,providerEmailId);
  assert.ok(row(corrected.id).first_attempt_at>0);assert.ok(row(corrected.id).connection_fingerprint);
  assert.equal(JSON.parse(sends.at(-1).body).to[0],email);
 }
 assert.equal(sends.length,beforeCorrectedSends+3);
 pass('definitely unsent attempts do not consume the recipient cap and corrected invitations can send');

 const ambiguous=await freshReview('job-ambiguous-then-stop','ambiguous-then-stop@example.com');
 providerBehavior='timeout';try{await delivery.deliverReviewRequest(ambiguous.id);}finally{providerBehavior='ok';}
 assert.equal(row(ambiguous.id).status,'failed');assert.equal(row(ambiguous.id).attempts,1);
 const ambiguousFirstAttempt=row(ambiguous.id).first_attempt_at,ambiguousFingerprint=row(ambiguous.id).connection_fingerprint;
 assert.ok(ambiguousFirstAttempt>0);assert.ok(ambiguousFingerprint);
 const afterAmbiguousAttempt=sends.length;sql.prepare('UPDATE review_requests SET lock_until=0 WHERE id=?').run(ambiguous.id);
 beforeFinalCheck(ambiguous.id,()=>sql.prepare("UPDATE automation_settings SET revision=revision+1 WHERE id='business'").run());
 try{await assert.rejects(()=>delivery.deliverReviewRequest(ambiguous.id),error=>error.status===409&&/earlier attempt may have been accepted/.test(error.message));}finally{beforeFirst=null;}
 assertReleased(ambiguous.id,'uncertain');assert.equal(row(ambiguous.id).attempts,2);assert.equal(row(ambiguous.id).email_id,null);
 assert.equal(row(ambiguous.id).first_attempt_at,ambiguousFirstAttempt);assert.equal(row(ambiguous.id).connection_fingerprint,ambiguousFingerprint);
 const duplicateAmbiguousRecipient=await freshReview('job-after-ambiguous-stop','ambiguous-then-stop@example.com');
 await assert.rejects(()=>delivery.deliverReviewRequest(duplicateAmbiguousRecipient.id),error=>error.status===409);
 assert.equal(row(duplicateAmbiguousRecipient.id).first_attempt_at,0);
 assert.equal(sends.length,afterAmbiguousAttempt);
 pass('a stopped retry preserves the earlier ambiguous timestamp, credential binding and recipient cap without sending again');

 const early=await freshReview('job-early-bounce','early-bounce@example.com');
 const pendingSameRecipient=await freshReview('job-early-bounce-pending','early-bounce@example.com');
 providerEmailId=webcrypto.randomUUID();const earlyEmailId=providerEmailId,earlyEventAt=new Date().toISOString();
 sql.prepare('INSERT INTO customer_email_events(id,email_id,type,event_at) VALUES(?,?,?,?)').run('event-early-bounce',earlyEmailId,'email.bounced',earlyEventAt);
 await delivery.applyReviewEmailEvents(earlyEmailId);
 assert.equal(row(early.id).email_id,null);assert.equal(sql.prepare('SELECT count(*) AS n FROM outreach_suppressions WHERE email=?').get('early-bounce@example.com').n,0);
 let failuresRemaining=2;
 runtime.DB.batch=async statements=>{
  if(failuresRemaining>0&&statements.some(statement=>statement.query.startsWith('UPDATE review_requests SET status=?,event_rank='))){failuresRemaining--;return baseBatch([...statements,new Statement('INSERT INTO missing_reconciliation_test_table VALUES(1)')]);}
  return baseBatch(statements);
 };
 const beforeEarlySend=sends.length;
 try{
  await delivery.deliverReviewRequest(early.id);
  assert.equal(sends.length,beforeEarlySend+1);assert.equal(row(early.id).email_id,earlyEmailId);
  assert.equal(row(early.id).status,'accepted');assert.equal(row(early.id).event_rank,0);assert.equal(row(early.id).retryable,0);
  assert.match(row(early.id).last_error,/delivery report is pending/i);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM outreach_suppressions WHERE email=?').get('early-bounce@example.com').n,0);
  await delivery.listReviewRequests();
  assert.equal(failuresRemaining,0);assert.equal(row(early.id).event_rank,0);assert.match(row(early.id).last_error,/delivery report is pending/i);
 }finally{runtime.DB.batch=baseBatch;}
 // Recovery must reach an unresolved callback even after it falls outside the display window.
 sql.prepare('UPDATE review_requests SET created_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',early.id);
 for(let i=0;i<51;i++)await freshReview('job-newer-display-'+i,'newer-display-'+i+'@example.com');
 const recoveredList=await delivery.listReviewRequests();
 assert.equal(recoveredList.length,50);assert.ok(recoveredList.every(item=>item.id!==early.id));
 assert.equal(row(early.id).status,'bounced');assert.equal(row(early.id).event_rank,5);assert.equal(row(early.id).retryable,0);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM outreach_suppressions WHERE email=?').get('early-bounce@example.com').n,1);
 assert.equal(row(pendingSameRecipient.id).status,'cancelled');assert.equal(row(pendingSameRecipient.id).retryable,0);
 sql.prepare('INSERT INTO customer_email_events(id,email_id,type,event_at) VALUES(?,?,?,?)').run('event-late-sent',earlyEmailId,'email.sent',new Date(Date.parse(earlyEventAt)+1000).toISOString());
 await Promise.all([delivery.listReviewRequests(),delivery.listReviewRequests()]);
 assert.equal(row(early.id).status,'bounced');assert.equal(sql.prepare('SELECT count(*) AS n FROM outreach_suppressions WHERE email=?').get('early-bounce@example.com').n,1);
 assert.equal(sends.length,beforeEarlySend+1);
 pass('owner refresh recovers an early bounced delivery after transactional failures, including older records, without resending');

 // Explicit first-attempt validation rejection may release the recipient reservation;
 // ambiguous attempts and unknown provider errors must never do so.
 for(const [status,name,release] of [[400,'validation_error',true],[422,'invalid_parameter',true],[422,'unknown_error',false],[500,'validation_error',false]]){
  const key='provider-'+status+'-'+name,email=key+'@example.com';
  const rejected=await freshReview(key,email);providerBehavior={status,name};
  await delivery.deliverReviewRequest(rejected.id);providerBehavior='ok';
  assert.equal(row(rejected.id).status,'failed');assert.equal(row(rejected.id).first_attempt_at===0,release);
  const corrected=await freshReview(key+'-corrected',email);
  if(release){providerEmailId=webcrypto.randomUUID();await delivery.deliverReviewRequest(corrected.id);assert.equal(row(corrected.id).status,'accepted');}
  else await assert.rejects(()=>delivery.deliverReviewRequest(corrected.id),error=>error.status===409);
 }
 const exhausted=await freshReview('five-ambiguous-attempts','five-attempts@example.com');providerBehavior='timeout';
 for(let i=0;i<5;i++){sql.prepare('UPDATE review_requests SET lock_until=0 WHERE id=?').run(exhausted.id);await delivery.deliverReviewRequest(exhausted.id);}
 assert.equal(row(exhausted.id).attempts,5);assert.equal(row(exhausted.id).retryable,0);assert.match(row(exhausted.id).last_error,/retry limit/);assert.ok(row(exhausted.id).first_attempt_at>0);
 const countAtLimit=sends.length;await assert.rejects(()=>delivery.deliverReviewRequest(exhausted.id),error=>error.status===409);assert.equal(sends.length,countAtLimit);providerBehavior='ok';
 const priorUnknown=await freshReview('unknown-then-rejected','unknown-then-rejected@example.com');providerBehavior='timeout';await delivery.deliverReviewRequest(priorUnknown.id);
 const priorTimestamp=row(priorUnknown.id).first_attempt_at;sql.prepare('UPDATE review_requests SET lock_until=0 WHERE id=?').run(priorUnknown.id);
 providerBehavior={status:400,name:'validation_error'};await delivery.deliverReviewRequest(priorUnknown.id);providerBehavior='ok';assert.equal(row(priorUnknown.id).first_attempt_at,priorTimestamp);assert.equal(row(priorUnknown.id).retryable,0);
 pass('only known first-attempt validation rejection releases frequency reservation; ambiguous attempts retain it and terminate at five tries');

 const reports=load('lib/search-reports.ts'),csv='Date,Clicks,Impressions,CTR,Position\n2026-09-01,1,3,33.33%,2\n2026-09-02,9,100,9%,4';
 const reportInput={action:'search_import',property:'sc-domain:schurrautomations.com',searchType:'web',startDate:'2026-09-01',endDate:'2026-09-02',unfiltered:true,csv};
 const report=reports.parseSearchReport(reportInput);assert.equal(report.clicks,10);assert.equal(report.impressions,103);assert.equal(report.ctr,10/103);assert.equal(report.position,406/103);assert.equal(report.complete,true);
 const quoted=reports.parseSearchReport({...reportInput,csv:'\uFEFFDate,Clicks,Impressions,CTR,Position\r\n2026-09-01,1,"1,000",0.1%,2\r\n2026-09-02,0,0,0%,0'});assert.equal(quoted.impressions,1000);assert.equal(quoted.rows[1].position,null);
 const missing=reports.parseSearchReport({...reportInput,endDate:'2026-09-03'});assert.equal(missing.reportedDays,2);assert.equal(missing.complete,false);
 for(const change of [{unfiltered:false},{startDate:'2026-02-30'},{property:'sc-domain:other.example'},{csv:csv.replace('Date,','Query,')},{csv:csv+'\n2026-09-01,1,3,33.33%,2'},{csv:csv.replace('33.33%','99%')},{csv:'x'.repeat(40001)},{endDate:'2028-09-01'}])assert.throws(()=>reports.parseSearchReport({...reportInput,...change}));
 const previous={...report,startDate:'2026-08-30',endDate:'2026-08-31',clicks:0,ctr:0};assert.equal(reports.compareSearchReports(report,previous).clicksPercent,null);assert.equal(reports.compareSearchReports(report,{...previous,property:'other'}),null);assert.equal(reports.compareSearchReports(report,report),null);assert.equal(reports.compareSearchReports(missing,previous),null);
 const callsBeforeSearch=sends.length,firstImport=await routes.POST(request(reportInput));assert.equal(firstImport.status,200);const savedSearch=(await firstImport.json()).result;const repeatImport=(await (await routes.POST(request(reportInput))).json()).result;assert.equal(savedSearch.id,repeatImport.id);assert.equal(sql.prepare("SELECT count(*) n FROM automation_runs WHERE kind='search_import'").get().n,1);assert.equal(sends.length,callsBeforeSearch);
 currentUser=null;assert.equal((await routes.POST(request(reportInput))).status,401);currentUser={userId:'owner-id',email:'owner@example.com'};assert.equal((await routes.POST(new Request('https://schurrautomations.com/api/manage/automations',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify(reportInput)}))).status,403);
 pass('search imports validate bounded daily data, calculate weighted metrics, reject incompatible comparisons, deduplicate and require owner/origin access without external calls');
 sql.prepare("UPDATE automation_runs SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(savedSearch.id);
 for(let i=0;i<55;i++)await desk.saveOperation('knowledge','history-test-'+i,{question:'Q'+i},{answer:'A'+i},(await desk.getAutomationSettings()).revision);
 assert.ok(!(await desk.listOperationRuns()).some(run=>run.id===savedSearch.id));
 assert.ok((await reports.listSearchReportRuns()).some(run=>run.id===savedSearch.id));
 assert.ok((await desk.listOperationRuns(true)).every(run=>run.kind!=='search_import'));
 pass('saved search reports remain available after more than 50 unrelated operations');
 console.log(checks+' automation checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
