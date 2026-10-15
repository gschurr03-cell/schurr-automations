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
const inboundWaits=[],backgroundTasks=[];
let beforeAlertSendCheck=null,beforeCustomerAttempt=null;
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
const sql = new DatabaseSync(':memory:');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  async first() {
    if(beforeAlertSendCheck&&this.query.includes('SET attempts=attempts+1')){const before=beforeAlertSendCheck;beforeAlertSendCheck=null;before();}
    if(beforeCustomerAttempt&&this.query.includes('customer_first_emails SET attempts=attempts+1')){const before=beforeCustomerAttempt;beforeCustomerAttempt=null;before();}
    return sql.prepare(this.query).get(...this.values) || null;
  }
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
    if (name === 'cloudflare:workers') return { env: runtime, waitUntil:promise=>backgroundTasks.push(promise) };
    if (name === '@/app/chatgpt-auth') return {
      getChatGPTUser: async () => currentUser && currentUser.userId && currentUser.email ? currentUser : null,
      requireChatGPTUser: async () => { if (!currentUser?.userId || !currentUser?.email) throw new Error('SIGN_IN_REDIRECT'); return currentUser; },
    };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), `${name}.ts`));
    return require(name);
  };
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, Date, AbortSignal, setTimeout:(resolve,ms)=>{inboundWaits.push(ms);queueMicrotask(resolve);}, fetch: (...args) => fakeFetch(...args), console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

const {createHash,createHmac}=require('node:crypto');
const app=load('lib/inquiries.ts'),delivery=load('lib/customer-email.ts'),api=load('app/api/inquiries/route.ts'),retryRoute=load('app/api/manage/customer-email/route.ts'),webhook=load('app/api/resend/events/route.ts'),desk=load('lib/response-desk.ts'),content=load('lib/customer-email-content.ts');
const key='re_customer_test_only_123456789',origin='https://example.chatgpt.site';
runtime.CUSTOMER_EMAIL_ENABLED='true';runtime.RESEND_API_KEY=key;runtime.RESEND_VERIFIED_AT=new Date().toISOString();
function prove(){runtime.RESEND_VERIFIED_FINGERPRINT=createHash('sha256').update(runtime.RESEND_API_KEY+'\n'+'gavin@schurrautomations.com'+'\n'+'Schurr Automations <alerts@notify.schurrautomations.com>').digest('hex');}prove();
const attempts=[],accepted=new Map();let mode='ok',sequence=0;
const customers=()=>attempts.filter(r=>r.payload.tags?.[0]?.value==='inquiry_confirmation');
async function fakeFetch(url,init){
 assert.equal(url,'https://api.resend.com/emails');assert.equal(init.redirect,'manual');
 const payload=JSON.parse(init.body),id=init.headers['Idempotency-Key'];attempts.push({payload,id,body:init.body});
 const customer=Boolean(payload.tags);
 if(customer){assert.equal(payload.from,'Schurr Automations <alerts@notify.schurrautomations.com>');assert.equal(payload.reply_to,'gavin@schurrautomations.com');assert.equal(payload.to.length,1);assert.ok(!payload.text.includes('/manage/'));}
 if(customer&&mode==='outage')throw Error('network');
 if(customer&&mode==='quota')return new Response('{}',{status:429,headers:{'retry-after':'3600'}});
 if(accepted.has(id)){assert.equal(accepted.get(id).body,init.body);return Response.json({id:accepted.get(id).id});}
 const item={id:webcrypto.randomUUID(),body:init.body};accepted.set(id,item);
 if(customer&&mode==='lost'){mode='ok';throw Error('accepted without response');}
 return Response.json({id:item.id});
}
async function input(overrides={}){const token=await app.issueInquiryToken(origin);return {name:'Test Person',business:'Owner test',email:webcrypto.randomUUID()+'@example.com',phone:'',service:'calls',message:'Please explain your receptionist setup.',preferredContact:'email',consent:true,automaticEmailConsent:true,automaticEmailConsentVersion:'website_confirmation_v1',website:'',submissionKey:token.submissionKey,token:token.token,...overrides};}
const request=(path,data,extra={})=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':'198.51.100.'+(++sequence),...extra},body:JSON.stringify(data)});
const flush=async()=>{await Promise.all(backgroundTasks.splice(0));};
const row=id=>sql.prepare('SELECT * FROM customer_first_emails WHERE id=?').get(id);
const fresh=async(overrides={})=>{const data=await input(overrides),result=await app.saveInquiry(app.validateInquiry(data));return {...result,data};};
(async()=>{
 let checks=0;const pass=s=>{checks++;console.log('PASS '+s);};
 const validInput=await input();
 for(const bad of ['true',1,{},null])assert.throws(()=>app.validateInquiry({...validInput,automaticEmailConsent:bad}));
 assert.throws(()=>app.validateInquiry({...validInput,automaticEmailConsentVersion:'old'}));
 assert.throws(()=>app.validateInquiry({...validInput,preferredContact:'phone',phone:'9852328337'}));
 for(const consent of [undefined,false]){const value=await fresh({automaticEmailConsent:consent});assert.equal(row(value.receipt),undefined);}
 const legacy=await input({automaticEmailConsent:undefined});const legacyHash=await app.inquiryDigest(app.validateInquiry(legacy));assert.equal(legacyHash,await app.inquiryDigest(app.validateInquiry({...legacy,automaticEmailConsent:false})));assert.notEqual(legacyHash,await app.inquiryDigest(app.validateInquiry({...legacy,automaticEmailConsent:true})));
 pass('explicit current opt-in required; absent/false remains manual and keeps historical digest');
 for(const badEmail of ['Name<person@example.com>','person@example.com;','person@example.com,'])assert.throws(()=>app.validateInquiry({...validInput,email:badEmail}));
 const html=fs.readFileSync(path.join(root,'site-html/inquire.html'),'utf8');const checkbox=html.match(/<input\b[^>]*name="automaticEmailConsent"[^>]*>/)[0];assert.ok(!/required|checked/.test(checkbox));
 const handlers={},fields={requestType:{value:'quote',addEventListener(){}},preferredContact:{value:'email',addEventListener(type,callback){handlers[type]=callback;}},email:{value:'',addEventListener(){}},phone:{},automaticEmailConsent:{checked:false},automaticCallConsent:{checked:false},service:{options:[{value:'calls'}],value:'calls'}};
 const form={elements:{namedItem:name=>fields[name]},classList:{contains:()=>false},hasAttribute:()=>false,addEventListener(){}},submit={},option={hidden:false};
 const browserContext={window:{},location:{pathname:'/',search:''},URLSearchParams,fetch:()=>Promise.resolve({json:async()=>({callbacksEnabled:false,emailEnabled:true})}),document:{querySelector:selector=>({'#inquiry-form':form,'#inquiry-submit':submit,'#inquiry-status':{},'#automatic-email-option':option,'#automatic-call-option':{hidden:true}}[selector]),addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'public/site.js'),'utf8'),browserContext);
 assert.equal(option.hidden,true);await new Promise(resolve=>setImmediate(resolve));assert.equal(option.hidden,false);
 fields.automaticEmailConsent.checked=true;fields.preferredContact.value='phone';handlers.change();assert.equal(option.hidden,true);assert.equal(fields.automaticEmailConsent.disabled,true);assert.equal(fields.automaticEmailConsent.checked,false);
 fields.preferredContact.value='email';handlers.change();assert.equal(option.hidden,false);assert.equal(fields.automaticEmailConsent.disabled,false);assert.equal(fields.automaticEmailConsent.checked,false);
 pass('public checkbox is optional and unchecked; switching channels clears consent and cannot restore it');
 browserContext.location.search='?request=call';vm.runInNewContext(fs.readFileSync(path.join(root,'public/site.js'),'utf8'),browserContext);assert.equal(fields.requestType.value,'call');assert.equal(fields.preferredContact.value,'phone');assert.equal(fields.phone.required,true);assert.equal(fields.email.required,false);assert.equal(fields.automaticEmailConsent.checked,false);pass('website call-request link selects phone contact and requires a callback number');

 const data=await input(),before=customers().length;const pair=await Promise.all([api.POST(request('/api/inquiries',data)),api.POST(request('/api/inquiries',data))]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,201]);const receipt=(await pair[0].json()).receipt;await flush();assert.equal(customers().length,before+1);assert.equal(row(receipt).status,'accepted');assert.equal(sql.prepare('SELECT status FROM response_jobs WHERE id=?').get(receipt).status,'needs_review');
 assert.equal((await api.POST(request('/api/inquiries',{...data,automaticEmailConsent:false}))).status,409);
 await api.POST(request('/api/inquiries',data));await flush();assert.equal(customers().length,before+1);
 pass('new inquiries atomically send once under concurrent/repeated submission; consent cannot be changed and follow-up remains needed');
 const unsent=await fresh({automaticEmailConsent:false});sql.prepare('DELETE FROM owner_alerts WHERE id=?').run(unsent.receipt);await api.POST(request('/api/inquiries',unsent.data));assert.equal(row(unsent.receipt),undefined);assert.equal(sql.prepare('SELECT id FROM owner_alerts WHERE id=?').get(unsent.receipt),undefined);
 pass('historical/manual inquiry retries never backfill customer or owner sends');
 const original=await fresh();sql.prepare('UPDATE crm_leads SET email=? WHERE id=?').run('corrected@example.com',original.receipt);const originalPayload=row(original.receipt).payload;const beforeCorrection=customers().length;await delivery.deliverCustomerEmail(original.receipt);assert.equal(row(original.receipt).status,'cancelled');assert.equal(row(original.receipt).payload,originalPayload);assert.equal(customers().length,beforeCorrection);
 for(const status of ['contacted','paused']){const v=await fresh();await desk.updateResponseJob({id:v.receipt,revision:1,status});await delivery.deliverCustomerEmail(v.receipt);assert.equal(row(v.receipt).status,'cancelled');}
 const late=await fresh();beforeCustomerAttempt=()=>sql.prepare("UPDATE response_jobs SET status='paused' WHERE id=?").run(late.receipt);await delivery.deliverCustomerEmail(late.receipt);assert.equal(row(late.receipt).status,'cancelled');assert.equal(customers().length,beforeCorrection);
 pass('CRM corrections, handled/paused states and withdrawal after claim stop sends without changing payloads');
 const suppression=await fresh();sql.prepare('INSERT INTO outreach_suppressions(email,reason,created_at) VALUES(?,?,?)').run(suppression.data.email,'Opted out',new Date().toISOString());await delivery.deliverCustomerEmail(suppression.receipt);assert.equal(row(suppression.receipt).status,'cancelled');sql.prepare('DELETE FROM outreach_suppressions WHERE email=?').run(suppression.data.email);await delivery.deliverCustomerEmail(suppression.receipt);assert.equal(customers().length,beforeCorrection);
 const removed=await fresh();await app.deleteInquiry(removed.receipt);assert.equal(row(removed.receipt),undefined);const refreshed=await app.issueInquiryToken(origin,removed.data.submissionKey);assert.equal((await api.POST(request('/api/inquiries',{...removed.data,token:refreshed.token}))).status,410);assert.equal(sql.prepare('SELECT id FROM inquiries WHERE submission_key=?').get(removed.data.submissionKey),undefined);
 pass('suppression survives retry; deletion removes pending emails and durable receipt blocks refreshed-token replay');
 mode='lost';const lost=await fresh();const b=customers().length;await Promise.all([delivery.deliverCustomerEmail(lost.receipt),delivery.deliverCustomerEmail(lost.receipt)]);assert.equal(row(lost.receipt).status,'accepted');assert.equal(customers().length,b+2);assert.equal(accepted.get('schurr-first-email/'+lost.receipt).body,row(lost.receipt).payload);
 pass('lost provider response and concurrent retry recover one accepted email using identical bytes and key');
 mode='outage';const failureData=await input();const response=await api.POST(request('/api/inquiries',failureData));assert.equal(response.status,201);const failureId=(await response.json()).receipt;await flush();assert.equal(row(failureId).status,'failed');assert.ok(sql.prepare('SELECT id FROM inquiries WHERE id=?').get(failureId));assert.ok(sql.prepare('SELECT id FROM owner_alerts WHERE id=?').get(failureId));
 runtime.RESEND_API_KEY='re_replacement_customer_test_123456789';prove();sql.prepare('UPDATE customer_first_emails SET next_attempt_at=0 WHERE id=?').run(failureId);const beforeChange=customers().length;await delivery.deliverCustomerEmail(failureId);assert.equal(row(failureId).status,'uncertain');assert.equal(customers().length,beforeChange);runtime.RESEND_API_KEY=key;prove();mode='ok';
 const expiry=await fresh();sql.prepare('UPDATE customer_first_emails SET first_attempt_at=?,connection_fingerprint=?,attempts=1 WHERE id=?').run(Date.now()-24*3600000,createHash('sha256').update(key).digest('hex'),expiry.receipt);await delivery.deliverCustomerEmail(expiry.receipt);assert.equal(row(expiry.receipt).status,'uncertain');
 pass('email failure preserves inquiry and owner alert; credential changes and expiry cannot create duplicate customer sends');
 const cooldownA=await fresh(),cooldownB=await fresh({email:cooldownA.data.email});const beforeCooldown=customers().length;await Promise.all([delivery.deliverCustomerEmail(cooldownA.receipt),delivery.deliverCustomerEmail(cooldownB.receipt)]);assert.equal(customers().length,beforeCooldown+1);assert.deepEqual([row(cooldownA.receipt).status,row(cooldownB.receipt).status].sort(),['accepted','cancelled']);
 mode='quota';const quota=await fresh();await delivery.deliverCustomerEmail(quota.receipt);assert.ok(row(quota.receipt).next_attempt_at>Date.now()+3500000);const bq=customers().length;await delivery.deliverCustomerEmail(quota.receipt);assert.equal(customers().length,bq);mode='ok';
 pass('atomic recipient cooldown prevents repeated confirmations and provider retry-after is honored');
 currentUser=null;assert.equal((await retryRoute.POST(request('/api/manage/customer-email',{action:'retry',id:quota.receipt}))).status,401);currentUser={userId:'other',email:'other@example.com'};assert.equal((await retryRoute.POST(request('/api/manage/customer-email',{action:'retry',id:quota.receipt}))).status,403);currentUser={userId:'owner-id',email:'owner@example.com'};assert.equal((await retryRoute.POST(request('/api/manage/customer-email',{action:'retry',id:quota.receipt},{origin:'https://attacker.test'}))).status,403);
 pass('manual retry is owner-only, origin-bound and limited to existing saved confirmation');
 const webhookKey=Buffer.from('test-webhook-secret-32-characters');runtime.RESEND_WEBHOOK_SECRET='whsec_'+webhookKey.toString('base64');
 function eventRequest(type,emailId,options={}){const id=options.id||'msg_'+webcrypto.randomUUID(),time=options.time||String(Math.floor(Date.now()/1000)),body=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:emailId}}),signature=createHmac('sha256',webhookKey).update(id+'.'+time+'.'+body).digest('base64');return new Request(origin+'/api/resend/events',{method:'POST',headers:{'content-type':'application/json','svix-id':id,'svix-timestamp':time,'svix-signature':options.bad?'v1,bad':'v2,ignored v1,'+signature},body});}
 const emailId=row(lost.receipt).email_id;assert.equal((await webhook.POST(eventRequest('email.delivered',emailId,{bad:true}))).status,401);assert.equal((await webhook.POST(eventRequest('email.delivered',emailId,{time:'1000000000'}))).status,401);assert.equal(row(lost.receipt).status,'accepted');
 const ev='msg_'+webcrypto.randomUUID();assert.equal((await webhook.POST(eventRequest('email.delivered',emailId,{id:ev}))).status,200);assert.equal((await webhook.POST(eventRequest('email.delivered',emailId,{id:ev}))).status,200);assert.equal(row(lost.receipt).status,'delivered');await webhook.POST(eventRequest('email.sent',emailId));assert.equal(row(lost.receipt).status,'delivered');await webhook.POST(eventRequest('email.complained',emailId));await webhook.POST(eventRequest('email.delivered',emailId));assert.equal(row(lost.receipt).status,'complained');assert.ok(sql.prepare('SELECT email FROM outreach_suppressions WHERE email=?').get(lost.data.email));
 const early=await fresh(),earlyId=webcrypto.randomUUID();await webhook.POST(eventRequest('email.delivered',earlyId));sql.prepare("UPDATE customer_first_emails SET email_id=?,status='accepted' WHERE id=?").run(earlyId,early.receipt);await delivery.applyCustomerEmailEvents(earlyId);assert.equal(row(early.receipt).status,'delivered');
 pass('signed delivery events reject forged/stale calls, dedupe replays, preserve stronger outcomes, suppress complaints and reconcile early arrival');
 sql.exec("CREATE TRIGGER break_email BEFORE INSERT ON customer_first_emails BEGIN SELECT RAISE(ABORT,'test'); END;");const fail=await input();const ni=sql.prepare('SELECT count(*) n FROM inquiries').get().n;assert.equal((await api.POST(request('/api/inquiries',fail))).status,503);assert.equal(sql.prepare('SELECT count(*) n FROM inquiries').get().n,ni);assert.equal(sql.prepare('SELECT receipt_id FROM inquiry_receipts WHERE submission_key=?').get(fail.submissionKey),undefined);sql.exec('DROP TRIGGER break_email');
 pass('customer outbox failure rolls back the whole new-inquiry transaction including replay receipt');
 {
  const outage=await fresh(),originalFetch=fakeFetch,originalBatch=runtime.DB.batch;
  let failures=0,providerId='',earlyStatus=0;
  runtime.DB.batch=async statements=>{
   if(failures&&statements[0].query.startsWith('UPDATE customer_first_emails SET status=?')&&statements[0].values.includes(providerId)){failures--;throw Error('Simulated reconciliation outage');}
   return originalBatch(statements);
  };
  fakeFetch=async(url,init)=>{
   const response=await originalFetch(url,init);
   if(init.headers['Idempotency-Key']==='schurr-first-email/'+outage.receipt){
    providerId=accepted.get(init.headers['Idempotency-Key']).id;
    earlyStatus=(await webhook.POST(eventRequest('email.bounced',providerId))).status;
    failures=2;
   }
   return response;
  };
  const beforeOutageSends=customers().length;
  try{
   await delivery.deliverCustomerEmail(outage.receipt);
   fakeFetch=originalFetch;
   assert.equal(earlyStatus,200);assert.equal(failures,1);
   assert.equal(row(outage.receipt).status,'accepted');
   assert.match(row(outage.receipt).last_error,/delivery report is pending/i);
   assert.equal(customers().length,beforeOutageSends+1);
   await delivery.customerEmailRecord(outage.receipt);
   assert.equal(failures,0);assert.match(row(outage.receipt).last_error,/delivery report is pending/i);
   assert.equal(sql.prepare('SELECT email FROM outreach_suppressions WHERE email=?').get(outage.data.email),undefined);
   // Older than >100 email records and outside the visible response page.
   sql.prepare("UPDATE customer_first_emails SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(outage.receipt);
   sql.prepare("UPDATE response_jobs SET status='contacted',created_at='2002-01-01T00:00:00.000Z' WHERE id=?").run(outage.receipt);
   for(let n=0;n<105;n++){const newer=await fresh();sql.prepare("UPDATE response_jobs SET status='contacted',created_at='2001-01-01T00:00:00.000Z' WHERE id=?").run(newer.receipt);}
   const sameRecipient=await fresh({email:outage.data.email});
   const refreshed=await Promise.all([desk.listResponseJobs('contacted'),desk.listResponseJobs('contacted')]);
   assert.ok(refreshed.every(page=>page.items.every(item=>item.id!==outage.receipt)));
   assert.equal(row(outage.receipt).status,'bounced');assert.equal(row(outage.receipt).event_rank,5);
   assert.equal(row(outage.receipt).last_error.includes('report is pending'),false);
   assert.ok(sql.prepare('SELECT email FROM outreach_suppressions WHERE email=?').get(outage.data.email));
   assert.equal(row(sameRecipient.receipt).status,'cancelled');
   await webhook.POST(eventRequest('email.sent',providerId));
   await retryRoute.POST(request('/api/manage/customer-email',{action:'retry',id:outage.receipt}));
   assert.equal(row(outage.receipt).status,'bounced');assert.equal(row(outage.receipt).email_id,providerId);
   assert.equal(customers().length,beforeOutageSends+1);
   pass('early bounce survives report outages; owner reads reconcile outside the visible page, suppress later contact and never resend');
  }finally{fakeFetch=originalFetch;runtime.DB.batch=originalBatch;}
 }
 {
  const unmarked=await fresh(),providerId=webcrypto.randomUUID();
  assert.equal((await webhook.POST(eventRequest('email.bounced',providerId))).status,200);
  sql.prepare("UPDATE customer_first_emails SET email_id=?,status='accepted',retryable=0 WHERE id=?").run(providerId,unmarked.receipt);
  const originalBatch=runtime.DB.batch,originalRun=Statement.prototype.run,before=customers().length;
  let failReport=true,failMarker=true;
  runtime.DB.batch=async statements=>{
   if(failReport&&statements[0].query.startsWith('UPDATE customer_first_emails SET status=?')&&statements[0].values.includes(providerId)){failReport=false;throw Error('Report storage unavailable');}
   return originalBatch(statements);
  };
  Statement.prototype.run=async function(){
   if(failMarker&&this.query.startsWith('UPDATE customer_first_emails SET last_error=?')&&this.values.includes(providerId)){failMarker=false;throw Error('Marker storage unavailable');}
   return originalRun.call(this);
  };
  try{
   const result=await delivery.customerEmailRecord(unmarked.receipt);
   assert.equal(result.status,'accepted');assert.equal(result.lastError,'');
   assert.equal(failReport,false);assert.equal(failMarker,false);
  }finally{runtime.DB.batch=originalBatch;Statement.prototype.run=originalRun;}
  await desk.listResponseJobs();
  assert.equal(row(unmarked.receipt).status,'bounced');
  assert.ok(sql.prepare('SELECT email FROM outreach_suppressions WHERE email=?').get(unmarked.data.email));
  assert.equal(customers().length,before);
  pass('persisted event recovery does not depend on successfully writing the pending-report marker');
 }
 console.log(checks+' customer-email integration groups passed (SQLite/WebCrypto; simulated provider).');
})().catch(e=>{console.error(e);process.exit(1);});
