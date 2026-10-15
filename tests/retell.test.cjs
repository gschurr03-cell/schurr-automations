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
let beforeAlertSendCheck=null;
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
const sql = new DatabaseSync(':memory:');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  async first() {
    if(beforeAlertSendCheck&&this.query.includes('SET attempts=attempts+1')){const before=beforeAlertSendCheck;beforeAlertSendCheck=null;before();}
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

const {createHmac}=require('node:crypto');
const ownerRoute=load('app/api/manage/receptionist/route.ts');
const alertRoute=load('app/api/manage/owner-alerts/route.ts');
const alerts=load('lib/owner-alerts.ts');
const toolsRoute=load('app/api/retell/tools/route.ts');
const inboundRoute=load('app/api/retell/inbound/route.ts');
const requestPolicy=load('lib/request-policy.ts');
const retell=load('lib/retell.ts');
const vault=load('lib/integration-secret.ts');
const key='test_retell_webhook_key_only_123456789';
const origin='https://schurrautomations.com';
let failCreateAgent=false,uncertainCreateLLM=false,delayLookup=null,requestLog=[];
let remoteLLMs=[],remoteAgents=[],phoneAssigned=true;
const actualCalls=new Map();
let emailMode='ok',emailAttempts=[],acceptedEmails=new Map();
const emailKey='re_test_key_for_owner_alerts_123456789';
let acceptedEmailKey=emailKey;
async function fakeFetch(url,init={}){
  assert.equal(init.redirect,'manual','Cloudflare request must use supported no-follow redirect handling');
  if(new URL(url).hostname==='api.resend.com'){
    const payload=JSON.parse(init.body),id=init.headers['Idempotency-Key'];
    emailAttempts.push({payload,id,raw:init.body});
    assert.deepEqual(payload.to,[id.startsWith('schurr-business-inbox/')?'gavin@schurrautomations.com':'gavin@schurrautomations.com']);
    assert.equal(payload.from,'Schurr Automations <alerts@notify.schurrautomations.com>');
    if(init.headers.Authorization!==`Bearer ${acceptedEmailKey}`)return Response.json({message:'provider details secret'}, {status:401});
    if(emailMode==='redirect')return new Response(null,{status:307,headers:{location:'https://attacker.test'}});
    if(emailMode==='forbidden')return Response.json({message:'private provider error'}, {status:403});
    if(emailMode==='quota')return Response.json({message:'quota'}, {status:429,headers:{'retry-after':'3600'}});
    if(emailMode==='outage')throw new Error('network');
    if(acceptedEmails.has(id)){assert.equal(acceptedEmails.get(id).body,init.body);return Response.json({id:acceptedEmails.get(id).id});}
    const receipt={id:webcrypto.randomUUID(),body:init.body};acceptedEmails.set(id,receipt);
    if(emailMode==='lost-response'){emailMode='ok';throw new Error('accepted but connection lost');}
    return Response.json({id:receipt.id});
  }
  const path=new URL(url).pathname;
  requestLog.push({path,method:init.method,body:init.body?JSON.parse(init.body):null});
  const json=(data,status=200)=>Response.json(data,{status});
  if(init.headers.Authorization!==`Bearer ${key}`)return json({error:'DO NOT LEAK PROVIDER ERROR'},401);
  if(path==='/list-voices')return json([{voice_id:'retell-test',voice_name:'Test voice',provider:'platform'},{voice_id:'el-test',voice_name:'Second voice',provider:'elevenlabs'}]);
  if(path==='/create-retell-llm'){
    const made={...JSON.parse(init.body),llm_id:`llm_${remoteLLMs.length+1}`,version:0,is_published:false};remoteLLMs.push(made);
    if(uncertainCreateLLM){uncertainCreateLLM=false;throw new Error('Timed out after remote write');}return json(made);
  }
  if(path==='/v2/list-retell-llms')return json({items:remoteLLMs,has_more:false});
  if(path.startsWith('/update-retell-llm/')){const llm=remoteLLMs.find(row=>row.llm_id===path.split('/').pop());Object.assign(llm,JSON.parse(init.body));return json(llm);}
  if(path.startsWith('/get-retell-llm/'))return json(remoteLLMs.find(row=>row.llm_id===path.split('/').pop())||{},200);
  if(path==='/create-agent'){
    if(failCreateAgent){failCreateAgent=false;return json({error:'Bad field'},400);}
    const made={...JSON.parse(init.body),agent_id:`agent_${remoteAgents.length+1}`,version:0,is_published:false};made.response_engine.version=0;remoteAgents.push(made);return json(made);
  }
  if(path==='/v2/list-agents')return json({items:remoteAgents,has_more:false});
  if(path.startsWith('/get-agent/'))return json(remoteAgents.find(row=>row.agent_id===path.split('/').pop())||{});
  if(path.startsWith('/get-phone-number/'))return json({phone_number:'+13035550123',inbound_agents:phoneAssigned?[{agent_id:remoteAgents.at(-1)?.agent_id,agent_version:0,weight:1}]:[]});
  if(path.startsWith('/v2/get-call/')){if(delayLookup){const fn=delayLookup;delayLookup=null;await fn();}return actualCalls.has(path.split('/').pop())?json(actualCalls.get(path.split('/').pop())):json({error:'Unknown call'},404);}
  throw new Error('Unexpected provider request '+path);
}
function admin(payload,headers={}){return new Request(origin+'/api/manage/receptionist',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(payload)});}
function signed(payload,{time=String(Date.now()),secret=key,format=false}={}){const body=JSON.stringify(payload,null,format?2:undefined);return new Request(origin+'/api/retell/tools',{method:'POST',headers:{'content-type':'application/json','x-retell-signature':`v=${time},d=${createHmac('sha256',secret).update(body+time).digest('hex')}`},body});}
const details={name:'Sample Caller',business:'Test business',email:'caller@example.com',phone:'',service:'calls',summary:'Would like help answering calls during jobs.',preferredContact:'email',callbackConsent:true,consentEvidence:'Yes, Gavin may email me about this request.'};
function envelope(callId='call_example',extras={}){const agentId=remoteAgents.at(-1).agent_id;return {name:'capture_lead',call:{call_id:callId,agent_id:agentId,call_type:'phone_call',direction:'inbound',to_number:'+13035550123'},args:{...details},...extras};}
function actual(payload,overrides={}){actualCalls.set(payload.call.call_id,{...payload.call,call_status:'ongoing',start_timestamp:Date.now(),...overrides});}
const count=(table)=>Number(sql.prepare(`SELECT count(*) n FROM ${table}`).get().n);
(async()=>{
  let checks=0;const pass=label=>{checks++;console.log('PASS '+label);};
  currentUser=null;assert.equal((await ownerRoute.POST(admin({action:'connect',apiKey:key}))).status,401);
  currentUser={userId:'other',email:'other@example.com'};assert.equal((await ownerRoute.POST(admin({action:'connect',apiKey:key}))).status,403);
  currentUser={userId:'owner',email:'owner@example.com'};assert.equal((await ownerRoute.POST(admin({action:'connect',apiKey:key},{origin:'https://attacker.test'}))).status,403);
  assert.equal(requestLog.length,0);pass('owner actions reject anonymous, other-account and cross-origin requests before provider access');

  assert.equal((await toolsRoute.POST(signed({}))).status,503);
  runtime.RETELL_API_KEY=key;await retell.initializeRetellConnection();assert.equal((await retell.retellSetup()).connected,true);
  const initializedMarker=sql.prepare('SELECT marker FROM retell_connection').get().marker;
  await retell.initializeRetellConnection();assert.equal(sql.prepare('SELECT marker FROM retell_connection').get().marker,initializedMarker);delete runtime.RETELL_API_KEY;
  const connected=await ownerRoute.POST(admin({action:'connect',apiKey:key}));assert.equal(connected.status,200);const connectText=await connected.text();assert.equal(connectText.includes(key),false);
  const stored=sql.prepare('SELECT api_key_ciphertext FROM retell_connection').get().api_key_ciphertext;
  assert.ok(!stored.includes(key));assert.equal(await vault.decryptIntegrationSecret(stored),key);
  await assert.rejects(()=>vault.decryptIntegrationSecret(stored.slice(0,-5)+'AAAAA'));
  assert.equal((await retell.retellSetup()).mode,'test');pass('key encrypted with authenticated encryption, never returned, intake closed before connection');

  const bad=await ownerRoute.POST(admin({action:'connect',apiKey:'bad_provider_key_123456789'}));assert.equal(bad.status,502);assert.equal((await bad.text()).includes('DO NOT LEAK'),false);
  uncertainCreateLLM=true;
  assert.equal((await ownerRoute.POST(admin({action:'provision',voiceId:'retell-test'}))).status,502);
  assert.equal(remoteLLMs.length,1);assert.equal((await retell.retellSetup()).phase,'llm_requested');
  failCreateAgent=true;
  assert.equal((await ownerRoute.POST(admin({action:'provision',voiceId:'retell-test'}))).status,502);
  assert.equal(remoteLLMs.length,1);assert.equal((await retell.retellSetup()).phase,'llm_ready');
  const created=await ownerRoute.POST(admin({action:'provision',voiceId:'retell-test'}));assert.equal(created.status,200);assert.equal(remoteLLMs.length,1);assert.equal(remoteAgents.length,1);
  assert.equal(remoteLLMs[0].general_tools[0].args_at_root,false);assert.equal(remoteAgents[0].data_storage_setting,'basic_attributes_only');
  assert.equal(remoteLLMs[0].general_tools[0].url,origin+'/api/retell/tools');pass('uncertain create recovers the original LLM and agent retry reuses it without duplicate resources');

  runtime.RETELL_INBOUND_NUMBER='+13035550123';
  const inbound={event:'call_inbound',call_inbound:{call_id:'call_ring_test',agent_id:remoteAgents[0].agent_id,agent_version:0,from_number:'+13035550999',to_number:runtime.RETELL_INBOUND_NUMBER}};
  const beforeInboundRequests=requestLog.length;
  assert.equal(requestPolicy.rejectUnsupportedRequest(new Request(origin+'/api/retell/inbound',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})),null);
  assert.equal((await inboundRoute.POST(signed(inbound,{secret:'forged'}))).status,401);
  assert.equal((await inboundRoute.POST(signed(inbound,{time:String(Date.now()-400000)}))).status,401);
  for(const call of [{...inbound.call_inbound,to_number:'+13035550888'},{...inbound.call_inbound,agent_id:'agent_other'}])assert.equal((await inboundRoute.POST(signed({...inbound,call_inbound:call}))).status,403);
  assert.equal((await inboundRoute.POST(signed({...inbound,event:'chat_inbound'}))).status,400);
  assert.equal(count('retell_inbound_delays'),0);assert.equal(inboundWaits.length,0);
  const answered=await inboundRoute.POST(signed(inbound));assert.equal(answered.status,200);assert.deepEqual(await answered.json(),{call_inbound:{}});
  assert.ok(inboundWaits[0]>1000&&inboundWaits[0]<=2000);
  const firstDeadline=sql.prepare('SELECT ready_at FROM retell_inbound_delays WHERE call_id=?').get(inbound.call_inbound.call_id).ready_at;
  await Promise.all([inboundRoute.POST(signed(inbound)),inboundRoute.POST(signed(inbound))]);
  assert.equal(count('retell_inbound_delays'),1);assert.equal(sql.prepare('SELECT ready_at FROM retell_inbound_delays WHERE call_id=?').get(inbound.call_inbound.call_id).ready_at,firstDeadline);
  sql.prepare('UPDATE retell_inbound_delays SET ready_at=? WHERE call_id=?').run(Date.now()-1,inbound.call_inbound.call_id);
  const waitsBeforeRetry=inboundWaits.length;assert.equal((await inboundRoute.POST(signed(inbound))).status,200);assert.equal(inboundWaits.length,waitsBeforeRetry);
  sql.prepare('INSERT INTO retell_inbound_delays (call_id,ready_at) VALUES (?,?)').run('call_old_ring',Date.now()-86401000);
  assert.equal((await inboundRoute.POST(signed(inbound))).status,200);assert.equal(count('retell_inbound_delays'),1);
  const realBatch=runtime.DB.batch;runtime.DB.batch=async()=>{throw new Error('Timing storage unavailable');};
  assert.deepEqual(await (await inboundRoute.POST(signed(inbound))).json(),{call_inbound:{}});runtime.DB.batch=realBatch;
  assert.equal(inboundWaits.length,waitsBeforeRetry);assert.equal(requestLog.length,beforeInboundRequests);assert.equal(count('crm_leads'),0);assert.equal((await retell.retellSetup()).lastVerifiedAt,'');
  delete runtime.RETELL_INBOUND_NUMBER;
  pass('pre-answer delay authenticates destination, preserves routing, deduplicates concurrent retries, bounds waits and continues on timing-store failure');

  const msg=envelope();
  assert.equal((await toolsRoute.POST(signed(msg,{secret:'forged'}))).status,401);
  assert.equal((await toolsRoute.POST(signed(msg,{time:String(Date.now()-400000)}))).status,401);
  assert.equal((await toolsRoute.POST(signed(msg,{time:String(Date.now()+400000)}))).status,401);
  const raw=JSON.stringify(msg)+' ',time=String(Date.now());
  const invalidRaw=new Request(origin+'/api/retell/tools',{method:'POST',headers:{'content-type':'application/json','x-retell-signature':`v=${time},d=${createHmac('sha256',key).update(JSON.stringify(msg)+time).digest('hex')}`},body:raw});
  assert.equal((await toolsRoute.POST(invalidRaw)).status,401);assert.equal((await toolsRoute.POST(signed({...msg,call:{...msg.call,agent_id:'agent_other'}}))).status,403);
  pass('raw-body signatures, freshness in both directions and agent authorization enforced');

  assert.equal((await toolsRoute.POST(signed({...msg,args:{...details,callbackConsent:false}}))).status,400);
  await toolsRoute.POST(signed({...msg,name:'stop_contact',args:{}}));assert.equal((await retell.retellSetup()).lastVerifiedAt,'');
  assert.equal((await ownerRoute.POST(admin({action:'mode',mode:'live',number:'+13035550123'}))).status,409);
  const sample=await (await toolsRoute.POST(signed(msg,{format:true}))).json();assert.equal(sample.status,'dry_run');
  const playground={...msg,call:{...msg.call,call_id:'playground'}};assert.equal((await toolsRoute.POST(signed(playground))).status,200);
  assert.equal(count('crm_leads'),0);assert.ok((await retell.retellSetup()).lastVerifiedAt);pass('only validated capture verifies the connection; test and playground requests do not create contacts');

  phoneAssigned=false;assert.equal((await ownerRoute.POST(admin({action:'mode',mode:'live',number:'+13035550123'}))).status,409);phoneAssigned=true;
  assert.equal((await ownerRoute.POST(admin({action:'mode',mode:'live',number:'+13035550123'}))).status,200);
  const web=envelope('call_web',{call:{...msg.call,call_id:'call_web',call_type:'web_call'}});assert.equal((await (await toolsRoute.POST(signed(web))).json()).status,'dry_run');
  assert.equal((await toolsRoute.POST(signed(playground))).status,403);
  for(const override of [{direction:'outbound'},{to_number:'+13035550999'},{agent_id:'agent_other'},{call_status:'registered'},{call_type:'web_call'}]){
    actual(msg,override);assert.equal((await toolsRoute.POST(signed(msg))).status,403);
  }
  actualCalls.delete(msg.call.call_id);assert.equal((await toolsRoute.POST(signed(msg))).status,502);assert.equal(count('crm_leads'),0);pass('live activation checks assigned number and only canonical connected inbound phone calls pass');

  actual(msg);const first=await toolsRoute.POST(signed(msg));assert.equal(first.status,200);assert.equal((await first.json()).status,'saved');
  const repeated=await toolsRoute.POST(signed(msg));assert.equal((await repeated.json()).duplicate,true);
  assert.equal(count('crm_leads'),1);assert.equal(count('response_jobs'),1);assert.equal(count('crm_events'),1);
  assert.equal((await toolsRoute.POST(signed({...msg,args:{...details,email:'changed@example.com'}}))).status,409);pass('live save creates one CRM contact, permission note and response; retries cannot overwrite confirmed details');

  await ownerRoute.POST(admin({action:'mode',mode:'test'}));
  assert.equal((await (await toolsRoute.POST(signed({...msg,name:'stop_contact',args:{}}))).json()).status,'paused');
  assert.equal(sql.prepare('SELECT status FROM response_jobs').get().status,'paused');
  await ownerRoute.POST(admin({action:'mode',mode:'live',number:'+13035550123'}));
  assert.equal((await toolsRoute.POST(signed(msg))).status,409);pass('withdrawal still pauses saved calls after switching to test and replay cannot reopen them');

  const race=envelope('call_race');actual(race);
  await Promise.all([toolsRoute.POST(signed(race)),toolsRoute.POST(signed({...race,name:'stop_contact',args:{}}))]);
  const raceRow=sql.prepare('SELECT status FROM response_jobs WHERE source_key=?').get('call:retell:call_race');assert.ok(!raceRow||raceRow.status==='paused');
  const guarded=envelope('call_pause_race');actual(guarded);const before=count('crm_leads');
  delayLookup=()=>retell.setRetellMode('test');assert.equal((await toolsRoute.POST(signed(guarded))).status,409);assert.equal(count('crm_leads'),before);pass('opt-out wins capture races and a switch to test mode blocks an in-flight new capture');

  await ownerRoute.POST(admin({action:'mode',mode:'live',number:'+13035550123'}));
  const committed=envelope('call_committed_status_failure');actual(committed);
  const beforeCommitted={leads:count('crm_leads'),responses:count('response_jobs'),events:count('crm_events')};
  const realPrepare=runtime.DB.prepare;
  runtime.DB.prepare=query=>{if(query.startsWith('UPDATE retell_connection SET last_verified_at=?,last_captured_at='))throw new Error('Connection status unavailable');return realPrepare(query);};
  try{
    const saved=await toolsRoute.POST(signed(committed));assert.equal(saved.status,200);assert.equal((await saved.json()).status,'saved');
    const retried=await toolsRoute.POST(signed(committed));assert.equal(retried.status,200);assert.equal((await retried.json()).duplicate,true);
  }finally{runtime.DB.prepare=realPrepare;}
  assert.equal(count('crm_leads'),beforeCommitted.leads+1);assert.equal(count('response_jobs'),beforeCommitted.responses+1);assert.equal(count('crm_events'),beforeCommitted.events+1);
  const savedLead=sql.prepare('SELECT c.* FROM crm_leads c JOIN response_jobs j ON j.lead_id=c.id WHERE j.source_key=?').get('call:retell:call_committed_status_failure');
  for(const field of ['name','business','email','phone','service'])assert.equal(savedLead[field],details[field]);
  assert.equal(savedLead.preferred_contact,details.preferredContact);
  pass('committed capture stays successful and exact retries stay unique when connection timestamps fail');

  const stoppedCommitted={...committed,name:'stop_contact',args:{}};
  actual(committed,{call_status:'error',to_number:'+13035550999'});assert.equal((await toolsRoute.POST(signed(stoppedCommitted))).status,403);
  actual(committed,{call_status:'error'});assert.equal((await toolsRoute.POST(signed(committed))).status,403);
  assert.equal((await (await toolsRoute.POST(signed(stoppedCommitted))).json()).status,'paused');
  assert.equal(sql.prepare('SELECT status FROM response_jobs WHERE source_key=?').get('call:retell:call_committed_status_failure').status,'paused');
  assert.ok(sql.prepare('SELECT call_sid FROM voice_call_controls WHERE call_sid=?').get('retell:call_committed_status_failure'));
  const neverCaptured=envelope('call_uncaptured_error');actual(neverCaptured,{call_status:'error'});
  assert.equal((await toolsRoute.POST(signed({...neverCaptured,name:'stop_contact',args:{}}))).status,403);
  pass('withdrawal of an existing verified request survives a later provider error without allowing new captures or wrong destinations');

  await Promise.all(backgroundTasks.splice(0));
  assert.equal(count('owner_alerts'),count('crm_leads'));assert.equal(emailAttempts.length,0);
  currentUser=null;assert.equal((await alertRoute.POST(admin({action:'connect',apiKey:emailKey}))).status,401);
  currentUser={userId:'other',email:'other@example.com'};assert.equal((await alertRoute.POST(admin({action:'connect',apiKey:emailKey}))).status,403);
  currentUser={userId:'owner',email:'owner@example.com'};assert.equal((await alertRoute.POST(admin({action:'connect',apiKey:emailKey},{origin:'https://attacker.test'}))).status,403);
  assert.equal(emailAttempts.length,0);
  runtime.RESEND_API_KEY=emailKey;runtime.RESEND_VERIFIED_AT=new Date().toISOString();
  assert.equal((await alerts.ownerAlertSetup()).connected,false);
  runtime.RESEND_VERIFIED_FINGERPRINT=require('node:crypto').createHash('sha256').update(emailKey+'\n'+'gavin@schurrautomations.com').digest('hex');
  assert.equal((await alerts.ownerAlertSetup()).connected,false);
  runtime.RESEND_VERIFIED_FINGERPRINT=require('node:crypto').createHash('sha256').update(emailKey+'\n'+'gavin@schurrautomations.com'+'\n'+'Schurr Automations <alerts@notify.schurrautomations.com>').digest('hex');
  assert.equal((await alerts.ownerAlertSetup()).connected,true);assert.equal(JSON.stringify(await alerts.ownerAlertSetup()).includes(emailKey),false);
  runtime.RESEND_API_KEY='re_replaced_key_not_yet_verified';assert.equal((await alerts.ownerAlertSetup()).connected,false);runtime.RESEND_API_KEY=emailKey;
  runtime.RESEND_VERIFIED_FINGERPRINT=require('node:crypto').createHash('sha256').update(emailKey+'\n'+'wrong@example.com').digest('hex');assert.equal((await alerts.ownerAlertSetup()).connected,false);
  delete runtime.RESEND_API_KEY;delete runtime.RESEND_VERIFIED_AT;delete runtime.RESEND_VERIFIED_FINGERPRINT;
  pass('trusted runtime connection requires verification bound to key, recipient and sender and never returns its key');
  emailMode='forbidden';assert.equal((await alertRoute.POST(admin({action:'connect',apiKey:emailKey}))).status,502);assert.equal((await alerts.ownerAlertSetup()).connected,false);
  emailMode='ok';assert.equal((await alertRoute.POST(admin({action:'connect',apiKey:emailKey}))).status,200);
  const emailCipher=sql.prepare('SELECT api_key_ciphertext FROM owner_alert_connection').get().api_key_ciphertext;
  assert.equal(JSON.parse(await vault.decryptIntegrationSecret(emailCipher,'lead-alerts')).apiKey,emailKey);await assert.rejects(()=>vault.decryptIntegrationSecret(emailCipher));assert.equal(emailCipher.includes(emailKey),false);
  assert.equal(JSON.stringify(await alerts.ownerAlertSetup()).includes(emailKey),false);
  pass('owner alert recipient is fixed, auth/origin enforced, sender test required and key encrypted with separate purpose');

  const delivery=envelope('call_owner_alert');actual(delivery);emailMode='lost-response';
  assert.equal((await toolsRoute.POST(signed(delivery))).status,200);await Promise.all(backgroundTasks.splice(0));
  const deliveryRow=sql.prepare('SELECT a.* FROM owner_alerts a JOIN response_jobs j ON a.lead_id=j.lead_id WHERE j.source_key=?').get('call:retell:call_owner_alert');
  assert.equal(deliveryRow.status,'accepted');assert.equal(deliveryRow.attempts,2);
  const leadEmails=[...acceptedEmails.keys()].filter(id=>id.startsWith('schurr-owner-lead/'));assert.equal(leadEmails.length,1);
  const sentCount=emailAttempts.length;await Promise.all([alerts.deliverOwnerAlert(deliveryRow.id),alerts.deliverOwnerAlert(deliveryRow.id)]);assert.equal(emailAttempts.length,sentCount);
  const payload=JSON.parse(deliveryRow.payload);assert.ok(payload.text.includes(details.summary));assert.ok(payload.text.includes('/manage/leads/'+deliveryRow.id));
  pass('live capture queues once and background delivery recovers a lost response with one provider email, unchanged payload and stable idempotency');

  const failure=envelope('call_email_failure');actual(failure);emailMode='outage';assert.equal((await toolsRoute.POST(signed(failure))).status,200);await Promise.all(backgroundTasks.splice(0));
  let failureRow=sql.prepare('SELECT a.* FROM owner_alerts a JOIN response_jobs j ON a.lead_id=j.lead_id WHERE j.source_key=?').get('call:retell:call_email_failure');
  assert.equal(failureRow.status,'failed');assert.equal(failureRow.attempts,2);assert.ok(sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(failureRow.id));
  sql.prepare('UPDATE owner_alerts SET next_attempt_at=0 WHERE id=?').run(failureRow.id);emailMode='ok';
  const beforeRetry=emailAttempts.length;await Promise.all([alerts.deliverOwnerAlert(failureRow.id),alerts.deliverOwnerAlert(failureRow.id)]);assert.equal(emailAttempts.length,beforeRetry+1);
  assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(failureRow.id).status,'accepted');
  pass('email outages cannot undo capture; persistent failed alerts retry safely under concurrent requests');

  const expired=envelope('call_expired_alert');actual(expired);emailMode='quota';await toolsRoute.POST(signed(expired));await Promise.all(backgroundTasks.splice(0));
  const expiredId=sql.prepare('SELECT lead_id FROM response_jobs WHERE source_key=?').get('call:retell:call_expired_alert').lead_id;
  assert.equal(sql.prepare('SELECT attempts FROM owner_alerts WHERE id=?').get(expiredId).attempts,1);
  const beforeLimit=emailAttempts.length;await alerts.deliverOwnerAlert(expiredId);assert.equal(emailAttempts.length,beforeLimit);
  sql.prepare('UPDATE owner_alerts SET first_attempt_at=?,next_attempt_at=0 WHERE id=?').run(Date.now()-24*3600000,expiredId);await alerts.deliverOwnerAlert(expiredId);assert.equal(emailAttempts.length,beforeLimit);assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(expiredId).status,'uncertain');
  const pausedId=sql.prepare('SELECT lead_id FROM response_jobs WHERE source_key=?').get('call:retell:call_committed_status_failure').lead_id;
  await alerts.deliverOwnerAlert(pausedId);assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(pausedId).status,'cancelled');assert.equal(emailAttempts.length,beforeLimit);
  emailMode='redirect';const redirectResult=await alertRoute.POST(admin({action:'connect',apiKey:emailKey}));assert.equal(redirectResult.status,502);assert.ok(!(await redirectResult.text()).includes('private provider'));
  pass('quota Retry-After is honored, expired ambiguous deliveries never auto-resend, paused requests cancel and redirects never forward keys');

  emailMode='ok';
  const existingLead=sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(deliveryRow.id).id;
  const untouched=webcrypto.randomUUID(),attempted=webcrypto.randomUUID();
  const oldPayload=JSON.stringify({...JSON.parse(deliveryRow.payload),to:['gschurr03@berkeley.edu']});
  sql.prepare("INSERT INTO owner_alerts(id,lead_id,payload,created_at) VALUES(?,?,?,?)").run(untouched,existingLead,oldPayload,new Date().toISOString());
  sql.prepare("INSERT INTO owner_alerts(id,lead_id,payload,created_at,first_attempt_at,attempts,status) VALUES(?,?,?,?,?,1,'failed')").run(attempted,existingLead,oldPayload,new Date().toISOString(),Date.now());
  const beforeRetarget=emailAttempts.length;
  await alerts.deliverOwnerAlert(untouched);assert.equal(emailAttempts.length,beforeRetarget+1);assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(untouched).status,'accepted');
  await alerts.deliverOwnerAlert(attempted);assert.equal(emailAttempts.length,beforeRetarget+1);assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(attempted).status,'uncertain');
  pass('recipient change retargets only untouched messages; prior attempts never reuse a modified payload or send to the old address');

  const pageLead=sql.prepare('SELECT id FROM crm_leads LIMIT 1').get().id;
  const pagedIds=[];
  for(let n=0;n<27;n++){const id=webcrypto.randomUUID();pagedIds.push(id);sql.prepare("INSERT INTO owner_alerts(id,lead_id,payload,status,created_at) VALUES(?,?,?,'accepted',?)").run(id,pageLead,'{}',`2099-01-01T00:00:${String(n).padStart(2,'0')}.000Z`);}
  const newest=await alerts.ownerAlertSetup();assert.equal(newest.recent.length,25);assert.equal(newest.hasMore,true);
  const older=await (await alertRoute.POST(admin({action:'refresh',offset:25}))).json();assert.ok(older.setup.recent.some(item=>item.id===expiredId));
  assert.equal((await alertRoute.POST(admin({action:'refresh',offset:-1}))).status,400);
  for(const id of pagedIds)sql.prepare('DELETE FROM owner_alerts WHERE id=?').run(id);
  pass('older unresolved alerts remain reachable after newer messages through validated paginated history');

  const intake=load('lib/inquiries.ts'),websiteRoute=load('app/api/inquiries/route.ts');
  let websiteRequestCount=0;
  const websiteRequest=payload=>new Request(origin+'/api/inquiries',{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':`198.51.100.${++websiteRequestCount}`},body:JSON.stringify(payload)});
  const websiteInput=async()=>{const {token,submissionKey}=await intake.issueInquiryToken(origin);return {token,submissionKey,name:'Website Example',business:'Website Company',email:'visitor@example.com',phone:'',service:'leads',message:'Please help us respond to website inquiries quickly.',preferredContact:'email',consent:true,website:''};};
  const webInput=await websiteInput(),beforeWebsiteTasks=backgroundTasks.length,beforeWebsiteAttempts=emailAttempts.length;
  const webPair=await Promise.all([websiteRoute.POST(websiteRequest(webInput)),websiteRoute.POST(websiteRequest(webInput))]);assert.deepEqual(webPair.map(response=>response.status).sort(),[200,201]);
  const webReceipts=await Promise.all(webPair.map(response=>response.json()));assert.equal(webReceipts[0].receipt,webReceipts[1].receipt);const webId=webReceipts[0].receipt;
  assert.equal(backgroundTasks.length,beforeWebsiteTasks+2);await Promise.all(backgroundTasks.splice(0));
  const webAlert=sql.prepare('SELECT * FROM owner_alerts WHERE id=?').get(webId),webPayload=JSON.parse(webAlert.payload);
  assert.equal(webAlert.lead_id,webId);assert.equal(webAlert.status,'accepted');assert.equal(sql.prepare('SELECT inquiry_id FROM crm_leads WHERE id=?').get(webId).inquiry_id,webId);assert.equal(sql.prepare('SELECT lead_id FROM response_jobs WHERE id=?').get(webId).lead_id,null);
  assert.equal(emailAttempts.length,beforeWebsiteAttempts+1);assert.equal(webPayload.subject,'New Schurr website inquiry');assert.ok(webPayload.text.includes('A website visitor asked Gavin to follow up.'));assert.ok(webPayload.text.includes(webInput.message));assert.ok(webPayload.text.includes('/manage/leads/'+webId));assert.deepEqual(webPayload.to,['gavin@schurrautomations.com']);assert.equal(webPayload.from,'Schurr Automations <alerts@notify.schurrautomations.com>');
  sql.prepare("UPDATE crm_leads SET name='Corrected website contact',revision=2 WHERE id=?").run(webId);
  const duplicateWebsite=await websiteRoute.POST(websiteRequest(webInput));assert.equal(duplicateWebsite.status,200);await Promise.all(backgroundTasks.splice(0));assert.equal(backgroundTasks.length,0);await intake.saveInquiry(intake.validateInquiry(webInput));
  assert.equal(sql.prepare('SELECT payload FROM owner_alerts WHERE id=?').get(webId).payload,webAlert.payload);assert.equal(sql.prepare('SELECT name FROM crm_leads WHERE id=?').get(webId).name,'Corrected website contact');assert.equal(emailAttempts.length,beforeWebsiteAttempts+1);
  assert.equal(JSON.parse(deliveryRow.payload).subject,'New Schurr receptionist request');assert.equal(sql.prepare('SELECT payload FROM owner_alerts WHERE id=?').get(deliveryRow.id).payload,deliveryRow.payload);
  pass('concurrent website submissions commit the overlay and outbox once, recover delivery on exact retries, keep the owner fixed and preserve voice alerts');

  const legacyInput=await websiteInput(),legacy=await intake.saveInquiry(intake.validateInquiry(legacyInput));
  sql.prepare('DELETE FROM crm_leads WHERE id=?').run(legacy.receipt);
  assert.equal((await websiteRoute.POST(websiteRequest(legacyInput))).status,200);await Promise.all(backgroundTasks.splice(0));await intake.saveInquiry(intake.validateInquiry(legacyInput));
  assert.equal(sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(legacy.receipt),undefined);assert.equal(sql.prepare('SELECT id FROM owner_alerts WHERE id=?').get(legacy.receipt),undefined);assert.equal(backgroundTasks.length,0);
  pass('an existing receipt does not backfill a removed or historical website overlay or owner alert');

  for(const table of ['crm_leads','owner_alerts']){
    const before=Object.fromEntries(['inquiries','crm_leads','response_jobs','owner_alerts'].map(name=>[name,count(name)])),beforeMetric=sql.prepare("SELECT sum(count) AS n FROM daily_metrics WHERE event='inquiry_received'").get().n;
    sql.exec(`CREATE TRIGGER fail_website_save BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'test'); END;`);
    assert.equal((await websiteRoute.POST(websiteRequest(await websiteInput()))).status,503);sql.exec('DROP TRIGGER fail_website_save');
    for(const [name,value] of Object.entries(before))assert.equal(count(name),value);assert.equal(sql.prepare("SELECT sum(count) AS n FROM daily_metrics WHERE event='inquiry_received'").get().n,beforeMetric);assert.equal(backgroundTasks.length,0);
  }
  pass('overlay or owner-outbox storage failure rolls back intake, metrics and response together without scheduling delivery');

  const pausedWebsite=await intake.saveInquiry(intake.validateInquiry(await websiteInput())),beforePausedWebsite=emailAttempts.length;
  sql.prepare("UPDATE response_jobs SET status='paused' WHERE inquiry_id=?").run(pausedWebsite.receipt);await alerts.deliverOwnerAlert(pausedWebsite.receipt);
  assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(pausedWebsite.receipt).status,'cancelled');assert.equal(emailAttempts.length,beforePausedWebsite);
  const latePause=await intake.saveInquiry(intake.validateInquiry(await websiteInput()));
  beforeAlertSendCheck=()=>sql.prepare("UPDATE response_jobs SET status='paused' WHERE inquiry_id=?").run(latePause.receipt);await alerts.deliverOwnerAlert(latePause.receipt);
  assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(latePause.receipt).status,'cancelled');assert.equal(emailAttempts.length,beforePausedWebsite);
  const deletedWebsite=await intake.saveInquiry(intake.validateInquiry(await websiteInput()));
  beforeAlertSendCheck=()=>sql.prepare('DELETE FROM inquiries WHERE id=?').run(deletedWebsite.receipt);await alerts.deliverOwnerAlert(deletedWebsite.receipt);await alerts.deliverOwnerAlert(deletedWebsite.receipt);
  assert.equal(sql.prepare('SELECT id FROM owner_alerts WHERE id=?').get(deletedWebsite.receipt),undefined);assert.equal(sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(deletedWebsite.receipt),undefined);assert.equal(sql.prepare('SELECT id FROM response_jobs WHERE inquiry_id=?').get(deletedWebsite.receipt),undefined);assert.equal(emailAttempts.length,beforePausedWebsite);
  pass('website pause before or after claim and inquiry deletion before send prevent owner delivery');

  emailMode='outage';const failedWebsiteResponse=await websiteRoute.POST(websiteRequest(await websiteInput()));assert.equal(failedWebsiteResponse.status,201);const failedWebsiteId=(await failedWebsiteResponse.json()).receipt;await Promise.all(backgroundTasks.splice(0));
  const failedWebsite=sql.prepare('SELECT * FROM owner_alerts WHERE id=?').get(failedWebsiteId);assert.equal(failedWebsite.status,'failed');assert.equal(failedWebsite.attempts,2);assert.ok(sql.prepare('SELECT id FROM inquiries WHERE id=?').get(failedWebsiteId));assert.ok(sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(failedWebsiteId));
  emailMode='lost-response';sql.prepare('UPDATE owner_alerts SET next_attempt_at=0 WHERE id=?').run(failedWebsiteId);await Promise.all([alerts.deliverOwnerAlert(failedWebsiteId),alerts.deliverOwnerAlert(failedWebsiteId)]);
  assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(failedWebsiteId).status,'accepted');assert.equal(sql.prepare('SELECT payload FROM owner_alerts WHERE id=?').get(failedWebsiteId).payload,failedWebsite.payload);assert.equal(acceptedEmails.get('schurr-owner-lead/'+failedWebsiteId).body,failedWebsite.payload);
  pass('website email outages preserve a successful receipt and immutable outbox, with safe retry after a lost provider response');

  const savedVerifiedAt=sql.prepare("SELECT verified_at FROM owner_alert_connection WHERE id='owner'").get().verified_at;
  const migrationLead=sql.prepare("SELECT a.lead_id,a.payload FROM owner_alerts a JOIN response_jobs j ON j.lead_id=a.lead_id LIMIT 1").get();
  const migrationStatus=sql.prepare('SELECT status FROM response_jobs WHERE lead_id=?').get(migrationLead.lead_id).status;sql.prepare("UPDATE response_jobs SET status='needs_review' WHERE lead_id=?").run(migrationLead.lead_id);
  const nextAlert=()=>{const id=webcrypto.randomUUID();sql.prepare("INSERT INTO owner_alerts(id,lead_id,payload,created_at) VALUES(?,?,?,?)").run(id,migrationLead.lead_id,migrationLead.payload,new Date().toISOString());return id;};
  sql.prepare("UPDATE owner_alert_connection SET verified_at='2020-01-01T00:00:00.000Z' WHERE id='owner'").run();
  runtime.RESEND_API_KEY='re_runtime_replacement_test_only_123456789';runtime.RESEND_VERIFIED_AT='2021-01-01T00:00:00.000Z';
  runtime.RESEND_VERIFIED_FINGERPRINT=require('node:crypto').createHash('sha256').update(runtime.RESEND_API_KEY+'\n'+'gavin@schurrautomations.com'+'\n'+'Schurr Automations <alerts@notify.schurrautomations.com>').digest('hex');
  acceptedEmailKey=runtime.RESEND_API_KEY;const nativeReplacement=nextAlert();await alerts.deliverOwnerAlert(nativeReplacement);assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(nativeReplacement).status,'accepted');assert.equal((await alerts.ownerAlertSetup()).verifiedAt,runtime.RESEND_VERIFIED_AT);
  sql.prepare("UPDATE owner_alert_connection SET verified_at='2022-01-01T00:00:00.000Z' WHERE id='owner'").run();acceptedEmailKey=emailKey;
  const laterDashboard=nextAlert();await alerts.deliverOwnerAlert(laterDashboard);assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(laterDashboard).status,'accepted');assert.equal((await alerts.ownerAlertSetup()).verifiedAt,'2022-01-01T00:00:00.000Z');
  const verifiedCipher=sql.prepare("SELECT api_key_ciphertext FROM owner_alert_connection WHERE id='owner'").get().api_key_ciphertext;
  for(const proof of [emailKey,JSON.stringify({version:2,apiKey:emailKey,verifiedFingerprint:'old-sender-proof'})]){
    sql.prepare("UPDATE owner_alert_connection SET api_key_ciphertext=?,verified_at='2023-01-01T00:00:00.000Z' WHERE id='owner'").run(await vault.encryptIntegrationSecret(proof,'lead-alerts'));
    assert.equal((await alerts.ownerAlertSetup()).verifiedAt,runtime.RESEND_VERIFIED_AT);
    const validProof=runtime.RESEND_VERIFIED_FINGERPRINT;runtime.RESEND_VERIFIED_FINGERPRINT='unverified';assert.equal((await alerts.ownerAlertSetup()).connected,false);runtime.RESEND_VERIFIED_FINGERPRINT=validProof;
  }
  sql.prepare("UPDATE owner_alert_connection SET api_key_ciphertext=? WHERE id='owner'").run(verifiedCipher);
  pass('legacy or mismatched dashboard verification cannot override a valid runtime proof or activate on its own');
  const legacyPayload=JSON.stringify({...JSON.parse(migrationLead.payload),from:'Schurr Automations <onboarding@resend.dev>'});
  const freshSender=nextAlert();sql.prepare('UPDATE owner_alerts SET payload=? WHERE id=?').run(legacyPayload,freshSender);
  await alerts.deliverOwnerAlert(freshSender);assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(freshSender).status,'accepted');
  assert.equal(JSON.parse(sql.prepare('SELECT payload FROM owner_alerts WHERE id=?').get(freshSender).payload).from,'Schurr Automations <alerts@notify.schurrautomations.com>');
  const attemptedSender=nextAlert();sql.prepare("UPDATE owner_alerts SET payload=?,status='failed',attempts=1,first_attempt_at=? WHERE id=?").run(legacyPayload,Date.now(),attemptedSender);
  const beforeSenderRetry=emailAttempts.length;await alerts.deliverOwnerAlert(attemptedSender);
  assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(attemptedSender).status,'uncertain');assert.equal(sql.prepare('SELECT payload FROM owner_alerts WHERE id=?').get(attemptedSender).payload,legacyPayload);assert.equal(emailAttempts.length,beforeSenderRetry);
  const acceptedSender=nextAlert();sql.prepare("UPDATE owner_alerts SET payload=?,status='accepted',attempts=1,first_attempt_at=? WHERE id=?").run(legacyPayload,Date.now(),acceptedSender);await alerts.deliverOwnerAlert(acceptedSender);
  assert.equal(sql.prepare('SELECT status FROM owner_alerts WHERE id=?').get(acceptedSender).status,'accepted');assert.equal(sql.prepare('SELECT payload FROM owner_alerts WHERE id=?').get(acceptedSender).payload,legacyPayload);assert.equal(emailAttempts.length,beforeSenderRetry);
  const connectionReference=emailAttempts.find(attempt=>attempt.id.startsWith('schurr-owner-connection/')).id;
  const oldReference='schurr-owner-connection/'+require('node:crypto').createHash('sha256').update(emailKey+'\n'+'gavin@schurrautomations.com').digest('hex');assert.notEqual(connectionReference,oldReference);
  pass('sender cutover updates only untouched messages, preserves attempted and accepted history, and uses a new connection-test reference');
  sql.prepare("UPDATE owner_alert_connection SET verified_at=? WHERE id='owner'").run(savedVerifiedAt);
  sql.prepare('UPDATE response_jobs SET status=? WHERE lead_id=?').run(migrationStatus,migrationLead.lead_id);
  delete runtime.RESEND_API_KEY;delete runtime.RESEND_VERIFIED_AT;delete runtime.RESEND_VERIFIED_FINGERPRINT;
  pass('new verified native key supersedes an old DB key, and a later verified dashboard key can replace it');

  const currentCipher=sql.prepare('SELECT api_key_ciphertext FROM retell_connection').get().api_key_ciphertext;
  const oldSecret=runtime.INQUIRY_SIGNING_SECRET;runtime.INQUIRY_SIGNING_SECRET='rotated-'.repeat(10);await assert.rejects(()=>vault.decryptIntegrationSecret(currentCipher));runtime.INQUIRY_SIGNING_SECRET=oldSecret;
  assert.equal(JSON.stringify(await retell.retellSetup()).includes('ciphertext'),false);pass('secret rotation fails closed and setup state contains no credential material');
  const booking=load('lib/booking.ts');const initialSchedule=await booking.bookingSetup();const enabledSchedule=await booking.saveBookingSetup({revision:initialSchedule.revision,config:{...initialSchedule.config,enabled:true,handoffEnabled:true,notice:0,hours:initialSchedule.config.hours.map(d=>({...d,enabled:true}))},confirmRules:true});
  const phoneMsg=envelope('call_booking_ops',{args:{...details,email:'',phone:'+13035550987',preferredContact:'phone',consentEvidence:'Please call this confirmed number.'}});actual(phoneMsg);sql.prepare("UPDATE retell_connection SET mode='live'").run();
  const tool=(name,args={})=>toolsRoute.POST(signed({...phoneMsg,name,args}));
  assert.equal((await tool('book_appointment',{start:Date.now(),revision:enabledSchedule.revision,confirmed:true})).status,409);
  assert.equal((await toolsRoute.POST(signed(phoneMsg))).status,200);
  const rules=await (await tool('check_availability')).json();assert.equal(rules.timezone,'America/Denver');assert.equal(rules.enabled,true);
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);const availability=await (await tool('check_availability',{date:tomorrow})).json();assert.ok(availability.slots.length);
  const args={start:availability.slots[0].start,revision:availability.revision,confirmed:true};const booked=await (await tool('book_appointment',args)).json();assert.equal(booked.status,'booked');assert.match(booked.label,/2026/);assert.equal((await (await tool('book_appointment',args)).json()).reference,booked.reference);
  await booking.cancelAppointment({id:booked.reference,revision:1});assert.equal((await (await tool('book_appointment',args)).json()).status,'cancelled');
  const callbackMsg=envelope('call_callback_ops',{args:phoneMsg.args});actual(callbackMsg);await toolsRoute.POST(signed(callbackMsg));const callback=()=>toolsRoute.POST(signed({...callbackMsg,name:'request_handoff',args:{confirmed:true}}));assert.equal((await (await callback()).json()).status,'saved');assert.equal((await (await callback()).json()).duplicate,true);
  await toolsRoute.POST(signed({...callbackMsg,name:'stop_contact',args:{}}));assert.equal((await callback()).status,409);
  const agentBefore=JSON.stringify(remoteAgents.at(-1)),llm=remoteLLMs.at(-1),toolsBefore=JSON.parse(JSON.stringify(llm.general_tools));await retell.syncVoiceOperations(origin);assert.equal(JSON.stringify(remoteAgents.at(-1)),agentBefore);assert.ok(toolsBefore.every(t=>llm.general_tools.some(n=>n.name===t.name)));assert.equal(llm.general_tools.filter(t=>t.name==='book_appointment').length,1);await retell.syncVoiceOperations(origin);assert.equal(llm.general_tools.filter(t=>t.name==='book_appointment').length,1);assert.equal(llm.general_prompt.split('[SCHURR OPERATIONS V1]').length,2);
  pass('signed inbound operations check rules, book once, preserve cancelled receipts, save/stop callbacks and install tools without changing the voice');

  {
    const boundaryCall=envelope('call_ops_boundary',{args:phoneMsg.args});
    const boundaryTool=(name,args={},callOverride={})=>toolsRoute.POST(signed({...boundaryCall,name,args,call:{...boundaryCall.call,...callOverride}}));
    sql.prepare("UPDATE retell_connection SET mode='live'").run();actual(boundaryCall);
    assert.equal((await toolsRoute.POST(signed(boundaryCall))).status,200);
    const available=await (await boundaryTool('check_availability',{date:tomorrow})).json();assert.ok(available.slots.length);
    const bookArgs={start:available.slots[0].start,revision:available.revision,confirmed:true};
    const booked=await (await boundaryTool('book_appointment',bookArgs)).json();assert.equal(booked.status,'booked');assert.match(booked.label,/2026/);
    const snapshot=()=>JSON.stringify({appointment:sql.prepare('SELECT * FROM appointments WHERE id=?').get(booked.reference),response:sql.prepare('SELECT * FROM response_jobs WHERE source_key=?').get('call:retell:'+boundaryCall.call.call_id),operations:sql.prepare('SELECT * FROM appointment_operations ORDER BY id').all(),stops:sql.prepare('SELECT * FROM voice_call_controls ORDER BY call_sid').all()});
    const cancel={action:'cancel',appointmentRevision:1,confirmed:true};
    const other=envelope('call_ops_other',{args:phoneMsg.args});actual(other);assert.equal((await toolsRoute.POST(signed(other))).status,200);
    const beforeOther=snapshot(),forged={id:booked.reference,appointmentId:booked.reference,phone:phoneMsg.args.phone,callSid:'retell:'+boundaryCall.call.call_id};
    const lookup=await toolsRoute.POST(signed({...other,name:'current_appointment',args:forged}));assert.equal(lookup.status,200);assert.equal((await lookup.json()).appointment,null);
    assert.equal((await toolsRoute.POST(signed({...other,name:'change_appointment',args:{...cancel,...forged}}))).status,404);assert.equal(snapshot(),beforeOther);
    pass('matching phone data and model-supplied IDs cannot access another call’s booking');
    sql.prepare("UPDATE retell_connection SET mode='test'").run();actual(boundaryCall,{call_status:'error'});
    const beforeWeb=snapshot(),beforeWebLookups=requestLog.length;
    for(const [name,args] of [['current_appointment',{}],['change_appointment',cancel],['change_appointment',{action:'reschedule',appointmentRevision:1,start:booked.start+3600000,scheduleRevision:available.revision,confirmed:true}],['stop_contact',{}],['capture_lead',phoneMsg.args],['book_appointment',bookArgs],['request_handoff',{confirmed:true}],['check_availability',{date:tomorrow}]]){
      const response=await boundaryTool(name,args,{call_type:'web_call'});assert.equal(response.status,200);const body=await response.json();assert.equal(body.status,'dry_run',name);for(const key of ['appointment','reference','start'])assert.equal(body[key],undefined,name);
    }
    assert.equal(requestLog.length,beforeWebLookups);assert.equal(snapshot(),beforeWeb);pass('web simulations cannot reuse a phone-call ID to reach lookup, cancellation or withdrawal exemptions');
    const beforeRejected=snapshot();
    for(const override of [{direction:'outbound'},{to_number:'+13035550999'},{agent_id:'agent_other'},{call_id:'call_other_canonical'},{call_type:'web_call'},{call_status:'registered'},{start_timestamp:undefined}]){actual(boundaryCall,override);assert.equal((await boundaryTool('current_appointment')).status,403);assert.equal((await boundaryTool('change_appointment',cancel)).status,403);}
    assert.equal(snapshot(),beforeRejected);pass('lookup and cancellation exemptions retain canonical call identity, destination and status checks');
    actual(boundaryCall,{call_status:'error'});const setup=await booking.bookingSetup();await booking.saveBookingSetup({revision:setup.revision,config:{...setup.config,enabled:false,handoffEnabled:false},confirmRules:true});
    assert.equal((await boundaryTool('stop_contact')).status,200);assert.equal(sql.prepare('SELECT status FROM response_jobs WHERE source_key=?').get('call:retell:'+boundaryCall.call.call_id).status,'paused');
    const currentResponse=await boundaryTool('current_appointment');assert.equal(currentResponse.status,200);const current=(await currentResponse.json()).appointment;assert.equal(current.status,'booked');assert.equal(current.revision,1);assert.deepEqual(Object.keys(current).sort(),['end','label','revision','start','status','timezone']);
    const beforeMove=snapshot(),beforeMoveLookups=requestLog.length;
    assert.equal((await (await boundaryTool('change_appointment',{action:'reschedule',appointmentRevision:1,start:booked.start+3600000,scheduleRevision:available.revision,confirmed:true})).json()).status,'dry_run');assert.equal(requestLog.length,beforeMoveLookups);assert.equal(snapshot(),beforeMove);
    assert.equal((await boundaryTool('change_appointment',{...cancel,confirmed:false})).status,400);assert.equal(snapshot(),beforeMove);
    const beforeCount=count('appointment_operations'),cancelResponse=await boundaryTool('change_appointment',cancel);assert.equal(cancelResponse.status,200);const cancelled=await cancelResponse.json();assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.revision,2);assert.equal(count('appointment_operations'),beforeCount+1);
    const retry=await (await boundaryTool('change_appointment',cancel)).json();assert.equal(retry.status,'cancelled');assert.equal(retry.duplicate,true);assert.equal(retry.revision,2);assert.equal(count('appointment_operations'),beforeCount+1);assert.equal(sql.prepare('SELECT outcome FROM response_outcomes WHERE response_id=(SELECT response_id FROM appointments WHERE id=?)').get(booked.reference).outcome,'booking_cancelled');
    pass('explicit same-call cancellation survives test mode, provider error, withdrawal and booking disablement with idempotent retries');
    const afterSetup=await booking.bookingSetup();await booking.saveBookingSetup({revision:afterSetup.revision,config:setup.config,confirmRules:true});sql.prepare("UPDATE retell_connection SET mode='live'").run();actual(boundaryCall,{call_status:'ended'});
  }
  {
    currentUser={userId:'owner',email:'owner@example.com'};emailMode='ok';acceptedEmailKey=emailKey;
    await alerts.connectOwnerAlerts(emailKey);
    const original=sql.prepare("SELECT * FROM owner_alert_connection WHERE id='owner'").get();
    const queueSnapshot=()=>JSON.stringify(['owner_alerts','customer_first_emails','review_requests'].map(table=>sql.prepare('SELECT * FROM '+table+' ORDER BY id').all()));
    const queues=queueSnapshot(),before=emailAttempts.length;
    currentUser=null;assert.equal((await alertRoute.POST(admin({action:'test_business_inbox'}))).status,401);
    currentUser={userId:'other',email:'other@example.com'};assert.equal((await alertRoute.POST(admin({action:'test_business_inbox'}))).status,403);
    currentUser={userId:'owner',email:'owner@example.com'};assert.equal((await alertRoute.POST(admin({action:'test_business_inbox'},{origin:'https://attacker.test'}))).status,403);assert.equal(emailAttempts.length,before);
    emailMode='forbidden';assert.equal((await alertRoute.POST(admin({action:'test_business_inbox'}))).status,502);assert.equal(sql.prepare("SELECT count(*) AS n FROM owner_alert_connection WHERE id='business-inbox'").get().n,0);assert.deepEqual(sql.prepare("SELECT * FROM owner_alert_connection WHERE id='owner'").get(),original);
    emailMode='lost-response';assert.equal((await alertRoute.POST(admin({action:'test_business_inbox'}))).status,502);assert.equal(sql.prepare("SELECT count(*) AS n FROM owner_alert_connection WHERE id='business-inbox'").get().n,0);
    const result=await alertRoute.POST(admin({action:'test_business_inbox',recipient:'attacker@example.com',apiKey:'untrusted'}));assert.equal(result.status,200);const body=await result.json();assert.equal(JSON.stringify(body).includes(emailKey),false);assert.equal(body.setup.recipient,'gavin@schurrautomations.com');assert.equal(body.setup.businessInbox.recipient,'gavin@schurrautomations.com');assert.ok(body.setup.businessInbox.verifiedAt);assert.equal(body.setup.connected,true);
    const prepared=sql.prepare("SELECT * FROM owner_alert_connection WHERE id='business-inbox'").get();const proof=JSON.parse(await vault.decryptIntegrationSecret(prepared.api_key_ciphertext,'lead-alerts'));assert.equal(proof.apiKey,emailKey);assert.equal(proof.verifiedFingerprint,require('node:crypto').createHash('sha256').update(emailKey+'\n'+'gavin@schurrautomations.com'+'\n'+'Schurr Automations <alerts@notify.schurrautomations.com>').digest('hex'));assert.equal(prepared.api_key_ciphertext.includes(emailKey),false);
    assert.deepEqual(sql.prepare("SELECT * FROM owner_alert_connection WHERE id='owner'").get(),original);assert.equal(queueSnapshot(),queues);assert.equal([...acceptedEmails.keys()].filter(id=>id.startsWith('schurr-business-inbox/')).length,1);
    sql.prepare("DELETE FROM owner_alert_connection WHERE id='owner'").run();assert.equal((await alerts.ownerAlertSetup()).connected,true);assert.ok((await alerts.ownerAlertSetup()).businessInbox.verifiedAt);
    // The production state at cutover contains only this prepared encrypted proof.
    assert.equal((await alerts.verifiedEmailConnection()).apiKey,emailKey);
    const invalidNewer=await vault.encryptIntegrationSecret(JSON.stringify({version:2,apiKey:emailKey,verifiedFingerprint:require('node:crypto').createHash('sha256').update(emailKey+'\n'+'gschurr03@gmail.com'+'\n'+'Schurr Automations <alerts@notify.schurrautomations.com>').digest('hex')}),'lead-alerts');
    sql.prepare("INSERT INTO owner_alert_connection(id,api_key_ciphertext,verified_at,updated_at) VALUES('owner',?,'2099-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z')").run(invalidNewer);assert.equal((await alerts.verifiedEmailConnection()).apiKey,emailKey);assert.notEqual((await alerts.ownerAlertSetup()).verifiedAt,'2099-01-01T00:00:00.000Z');
    sql.prepare("DELETE FROM owner_alert_connection WHERE id='business-inbox'").run();assert.equal((await alerts.ownerAlertSetup()).connected,false);const blockedCount=emailAttempts.length;assert.equal((await alertRoute.POST(admin({action:'test_business_inbox'}))).status,409);assert.equal(emailAttempts.length,blockedCount);
    runtime.RESEND_API_KEY=emailKey;runtime.RESEND_VERIFIED_AT=original.verified_at;runtime.RESEND_VERIFIED_FINGERPRINT=require('node:crypto').createHash('sha256').update(emailKey+'\n'+'gavin@schurrautomations.com'+'\n'+'Schurr Automations <alerts@notify.schurrautomations.com>').digest('hex');assert.equal((await alertRoute.POST(admin({action:'test_business_inbox'}))).status,200);assert.equal((await alerts.ownerAlertSetup()).connected,true);assert.equal([...acceptedEmails.keys()].filter(id=>id.startsWith('schurr-business-inbox/')).length,1);
    runtime.RESEND_VERIFIED_FINGERPRINT='invalid';assert.equal((await alerts.ownerAlertSetup()).connected,true);
    delete runtime.RESEND_API_KEY;delete runtime.RESEND_VERIFIED_AT;delete runtime.RESEND_VERIFIED_FINGERPRINT;
    sql.prepare("UPDATE owner_alert_connection SET api_key_ciphertext=?,verified_at=?,updated_at=? WHERE id='owner'").run(original.api_key_ciphertext,original.verified_at,original.updated_at);
    pass('prepared business proof keeps email active after cutover, invalid legacy/newer proofs cannot displace it, owner-only tests preserve queues and never expose keys');
  }
  console.log(checks+' Retell integration groups passed (real SQLite/crypto; simulated Retell API).');
})().catch(error=>{console.error(error);process.exit(1);});
