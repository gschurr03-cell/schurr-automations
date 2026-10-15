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
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, ReadableStream, Date, Intl, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

const {renderToStaticMarkup}=dependencyRequire('react-dom/server');
const crm=load('lib/crm.ts');
const screens=[['app/manage/automations/page.tsx',{}],['app/manage/clients/demo/page.tsx',{}],['app/manage/clients/[id]/demo/page.tsx',{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000001'})}],['app/manage/clients/page.tsx',{}],['app/manage/clients/[id]/page.tsx',{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000001'})}],['app/manage/page.tsx',{}],['app/manage/leads/page.tsx',{searchParams:Promise.resolve({})}],['app/manage/leads/new/page.tsx',{}],['app/manage/pipeline/page.tsx',{}],['app/manage/tasks/page.tsx',{searchParams:Promise.resolve({})}],['app/manage/settings/page.tsx',{searchParams:Promise.resolve({})}],['app/manage/response/page.tsx',{searchParams:Promise.resolve({})}],['app/manage/metrics/page.tsx',{}],['app/manage/outreach/page.tsx',{}]];
async function render(module,props){let element=await load(module).default(props);while(typeof element.type==='function' && element.type.constructor.name==='AsyncFunction') element=await element.type(element.props);return renderToStaticMarkup(element);}
(async()=>{
 let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
 const baseDB=runtime.DB;let reads=0;runtime.DB={prepare(...args){reads++;return baseDB.prepare(...args);},batch(...args){reads++;return baseDB.batch(...args);}};
 currentUser=null;for(const [module,props] of screens) await assert.rejects(()=>render(module,props),/SIGN_IN_REDIRECT/);
 const login=await render('app/login/page.tsx',{});assert.ok(login.includes('Sign in with ChatGPT'));assert.ok(!login.includes('owner@example.com'));
 await assert.rejects(()=>render('app/crm/page.tsx',{}),/REDIRECT:\/login/);
 currentUser={userId:'wrong',email:'wrong@example.com'};
 for(const [module,props] of screens){const html=await render(module,props);assert.ok(html.includes('This account does not have access'));}
 assert.equal(reads,0);runtime.DB=baseDB;pass('all CRM screens reject wrong/anonymous accounts before private reads; login exposes no owner email');
 currentUser={userId:'owner',email:'owner@example.com'};
 for(const [module,props] of screens){const html=await render(module,props);assert.ok(!html.includes('Workspace temporarily unavailable'),module);if(!module.endsWith('/demo/page.tsx'))assert.ok(html.includes('Private workspace'),module);else assert.ok(html.includes('Scripted demonstration')||html.includes('Client setup not found'),module);}
 await assert.rejects(()=>render('app/crm/page.tsx',{}),/REDIRECT:\/manage/);
 pass('all empty owner screens render a working state and owner CRM entry opens the dashboard');
 const newLeadHtml=await render('app/manage/leads/new/page.tsx',{});
 const sourceOptions=newLeadHtml.match(/<select name="source"[^>]*>([\s\S]*?)<\/select>/)[1];
 for(const source of Object.keys(crm.MANUAL_SOURCES))assert.ok(sourceOptions.includes(`value="${source}"`));
 for(const source of ['website','dealer','dealer-card','dealer-hanger','repair','repair-card','repair-hanger'])assert.ok(!sourceOptions.includes(`value="${source}"`));
 const listHtml=await render('app/manage/leads/page.tsx',{searchParams:Promise.resolve({})});
 assert.ok(listHtml.includes('Dealer business card'));assert.ok(listHtml.includes('Repair door hanger'));
 pass('manual lead creation retains its original source choices while list filters expose fixed campaign attribution');
 const deskHtml=await render('app/manage/automations/page.tsx',{});
 assert.ok(deskHtml.includes('Automation Desk sections'));
 assert.ok(deskHtml.includes('Tools &amp; setup'));
 assert.ok(deskHtml.includes('Incoming requests'));
 assert.ok(deskHtml.includes('Approved-answer')||deskHtml.includes('approved public answers'));
 const sidebar=deskHtml.match(/<aside[\s\S]*?<\/aside>/)[0];
 assert.ok(sidebar.includes('/manage/automations'));
 assert.ok(!sidebar.includes('/manage/response'));
 assert.ok(!sidebar.includes('/manage/clients'));
 if(process.env.SCHURR_AUTOMATION_QA_FILE)fs.writeFileSync(process.env.SCHURR_AUTOMATION_QA_FILE,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__automation_qa.css"></head><body style="margin:0">'+deskHtml+'</body></html>');
 pass('Automation Desk consolidates tools, requests and client setups under one sidebar entry');
 const assertDeskTools=html=>{
  for(const text of ['Google reviews','SEO checks','Quote builder','Business setup','Saved work'])assert.ok(html.includes(text),text+' remains available');
  assert.ok(!html.includes('Workspace temporarily unavailable'));
 };
 const inboundNumber='+12025550146',previousNumber=runtime.RETELL_INBOUND_NUMBER;
 try{
  runtime.RETELL_INBOUND_NUMBER=inboundNumber;
  const disconnected=await render('app/manage/automations/page.tsx',{});
  assert.ok(disconnected.includes('Retell account not connected.'));
  assert.ok(!disconnected.includes('Lead capture enabled:'));
  sql.prepare("INSERT INTO retell_connection(id,api_key_ciphertext,marker,updated_at) VALUES('retell','PRIVATE_RETELL_RENDER_FIXTURE','render-fixture',?)").run('2026-10-01T12:00:00.000Z');
  const phoneCases=[
   {phase:'connected',agent:'',mode:'test',verified:'',label:'Account connected; receptionist not created.'},
   {phase:'llm_requested',agent:'',mode:'test',verified:'',label:'Receptionist setup incomplete.'},
   {phase:'ready',agent:'agent-render-fixture',mode:'test',verified:'2026-10-01T12:00:00.000Z',label:'Test mode: new leads are not saved.'},
   {phase:'ready',agent:'agent-render-fixture',mode:'live',verified:'2026-10-01T12:00:00.000Z',label:'Lead capture enabled: '+inboundNumber+'.'},
   {phase:'ready',agent:'agent-render-fixture',mode:'live',verified:'',label:'Phone configuration needs review.'},
  ];
  for(const state of phoneCases){
   sql.prepare("UPDATE retell_connection SET phase=?,agent_id=?,mode=?,inbound_number=?,last_verified_at=? WHERE id='retell'").run(state.phase,state.agent,state.mode,inboundNumber,state.verified);
   const html=await render('app/manage/automations/page.tsx',{});
   assertDeskTools(html);assert.ok(html.includes(state.label),state.label);
   assert.equal(html.includes('Lead capture enabled:'),state.label.startsWith('Lead capture enabled:'));
   assert.ok(html.includes('Phone details reflect saved setup; they are not a live audio check.'));
   assert.ok(!html.includes('PRIVATE_RETELL_RENDER_FIXTURE'));
  }
 }finally{
  sql.prepare("DELETE FROM retell_connection WHERE id='retell'").run();
  if(previousNumber===undefined)delete runtime.RETELL_INBOUND_NUMBER;else runtime.RETELL_INBOUND_NUMBER=previousNumber;
 }
 pass('Automation Desk distinguishes disconnected, incomplete, test and verified live intake; a configured number alone is not live');
 const optionalLookups=[
  [load('lib/retell.ts'),'retellSetup','Phone status unavailable.'],
  [load('lib/owner-alerts.ts'),'verifiedEmailConnection','Email sender status unavailable.'],
  [load('lib/customer-email.ts'),'customerEmailSetup','First inquiry email status unavailable.'],
 ];
 for(const [dependency,key,label] of optionalLookups){
  const original=dependency[key];
  try{
   dependency[key]=async()=>{throw new Error('Optional connection lookup unavailable');};
   const html=await render('app/manage/automations/page.tsx',{});assertDeskTools(html);assert.ok(html.includes(label),key);
  }finally{dependency[key]=original;}
 }
 const automationDesk=load('lib/automation-desk.ts'),originalBusinessSettings=automationDesk.getAutomationSettings;
 try{
  automationDesk.getAutomationSettings=async()=>{throw new Error('Core settings unavailable');};
  const html=await render('app/manage/automations/page.tsx',{});assert.ok(html.includes('Workspace temporarily unavailable'));assert.ok(!html.includes('Quote builder'));
 }finally{automationDesk.getAutomationSettings=originalBusinessSettings;}
 pass('optional connection failures keep Automation Desk tools usable; unavailable core settings do not render defaults as current');
 const responseProps={searchParams:Promise.resolve({})};
 const beforeAlerts=await render('app/manage/response/page.tsx',responseProps);assert.ok(beforeAlerts.includes('Owner alerts need a connected sender'));
 const testKey='re_private_render_fixture_123456789',sender='Schurr Automations <alerts@notify.schurrautomations.com>';
 const proof={version:2,apiKey:testKey,verifiedFingerprint:require('node:crypto').createHash('sha256').update(testKey+'\n'+'gavin@schurrautomations.com'+'\n'+sender).digest('hex')};
 const testCipher=await load('lib/integration-secret.ts').encryptIntegrationSecret(JSON.stringify(proof),'lead-alerts');
 sql.prepare("INSERT INTO owner_alert_connection(id,api_key_ciphertext,verified_at,updated_at) VALUES('owner',?,?,?)").run(testCipher,'2026-10-01T12:00:00.000Z','2026-10-01T12:00:00.000Z');
 const previousEmailEnabled=runtime.CUSTOMER_EMAIL_ENABLED,previousWebhook=runtime.RESEND_WEBHOOK_SECRET;
 try{
  runtime.CUSTOMER_EMAIL_ENABLED='false';delete runtime.RESEND_WEBHOOK_SECRET;
  const pausedEmail=await render('app/manage/automations/page.tsx',{});
  assert.ok(pausedEmail.includes('Verified email sender connected.'));assert.ok(pausedEmail.includes('First inquiry email paused.'));assert.ok(pausedEmail.includes('Delivery reports need setup.'));
  runtime.CUSTOMER_EMAIL_ENABLED='true';
  const enabledEmail=await render('app/manage/automations/page.tsx',{});
  assert.ok(enabledEmail.includes('First inquiry email enabled.'));assert.ok(enabledEmail.includes('Delivery reports need setup.'));assert.ok(!enabledEmail.includes('Delivery reports configured.'));
  runtime.RESEND_WEBHOOK_SECRET='whsec_private_render_fixture';
  const reporting=await render('app/manage/automations/page.tsx',{});
  assert.ok(reporting.includes('Delivery reports configured.'));assert.ok(!reporting.includes(testKey));assert.ok(!reporting.includes(testCipher));assert.ok(!reporting.includes(runtime.RESEND_WEBHOOK_SECRET));
 }finally{
  if(previousEmailEnabled===undefined)delete runtime.CUSTOMER_EMAIL_ENABLED;else runtime.CUSTOMER_EMAIL_ENABLED=previousEmailEnabled;
  if(previousWebhook===undefined)delete runtime.RESEND_WEBHOOK_SECRET;else runtime.RESEND_WEBHOOK_SECRET=previousWebhook;
 }
 pass('Automation Desk separates verified sender, enabled inquiry emails and delivery-report configuration without exposing secrets');
 const connected=await render('app/manage/response/page.tsx',responseProps);assert.ok(connected.includes('Connected · gavin@schurrautomations.com'));assert.ok(connected.includes('Manual · response drafts ready'));assert.ok(connected.includes('Native calendar paused'));assert.ok(!connected.includes(testCipher));assert.ok(!connected.includes(testKey));
 runtime.DB={...baseDB,prepare(query){if(query.includes('owner_alert_connection'))throw new Error('Unavailable');return baseDB.prepare(query);}};
 const unavailable=await render('app/manage/response/page.tsx',responseProps);assert.ok(unavailable.includes('Status unavailable'));assert.ok(!unavailable.includes('Connected · gavin@schurrautomations.com'));runtime.DB=baseDB;
 sql.prepare("DELETE FROM owner_alert_connection WHERE id='owner'").run();
 pass('connection evidence distinguishes owner alerts from customer delivery, protects secrets and tolerates a status outage');
 const emailComponent=load('app/manage/response/customer-email.tsx').default;
 for(const [status,label] of [['pending','Queued'],['accepted','Accepted by email provider'],['delivered','Accepted by recipient mail server'],['cancelled','Further sending stopped']]){
   const rendered=renderToStaticMarkup(dependencyRequire('react').createElement(emailComponent,{id:webcrypto.randomUUID(),status,recipient:'original@example.com',payload:JSON.stringify({subject:'Confirmation',text:'Saved request',reply_to:'gavin@schurrautomations.com'}),error:'',retryable:status==='pending'?1:0,providerId:null}));
   assert.ok(rendered.includes(label));assert.ok(rendered.includes('original@example.com'));assert.ok(!rendered.includes('Not sent'));assert.ok(rendered.includes('Personal follow-up still needs your review'));
 }
 pass('automatic email states render separately from personal follow-up and never mislabel attempted cancellations');



 const clientId=webcrypto.randomUUID(),clientApi=load('lib/client-setups.ts'),clientTemplates=load('lib/client-templates.ts');
 await clientApi.mutateClientSetup({action:'create',id:clientId,offers:['calls','reviews','coding'],profile:{...clientTemplates.emptyProfile(),businessName:'Client <script>alert(1)</script>',contactName:'Owner',alertEmail:'owner@example.com',replyEmail:'reply@example.com'}});
 const clientHtml=await render('app/manage/clients/[id]/page.tsx',{params:Promise.resolve({id:clientId})});assert.ok(clientHtml.includes('Client &lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!clientHtml.includes('<script>alert(1)</script>'));assert.ok(clientHtml.includes('Download setup kit'));assert.ok(clientHtml.includes('No live')||clientHtml.includes('no live client connections'));assert.ok(clientHtml.includes('Public questions and answers'));assert.ok(clientHtml.includes('Staff-only questions and answers'));assert.ok(clientHtml.includes('Needs business information'));assert.ok(clientHtml.includes('Not checked')&&clientHtml.includes('owner-recorded checks'));
 const presentHtml=await render('app/manage/clients/[id]/demo/page.tsx',{params:Promise.resolve({id:clientId})});assert.ok(presentHtml.includes('Scripted demonstration'));assert.ok(!presentHtml.includes('owner@example.com'));assert.ok(!presentHtml.includes('Staff-only questions and answers'));assert.ok(presentHtml.includes('Client &lt;script&gt;alert(1)&lt;/script&gt;'));
 if(process.env.SCHURR_DEMO_QA_FILE){const sampleHtml=await render('app/manage/clients/demo/page.tsx',{});fs.writeFileSync(process.env.SCHURR_DEMO_QA_FILE,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__client_demo_qa.css"></head><body style="margin:0">'+sampleHtml+'</body></html>');}
 const reviewOnlyId=webcrypto.randomUUID();await clientApi.mutateClientSetup({action:'create',id:reviewOnlyId,offers:['reviews'],profile:load('lib/client-demo.ts').homeServiceDemoProfile()});
 const reviewDemo=await render('app/manage/clients/[id]/demo/page.tsx',{params:Promise.resolve({id:reviewOnlyId})});assert.ok(reviewDemo.includes('Review requests'));assert.ok(reviewDemo.includes('SEO &amp; reviews'));assert.ok(!reviewDemo.includes('Receptionist &amp; leads'));
 await clientApi.rehearseClientSetup({id:reviewOnlyId,revision:1});
 const testedClient=await render('app/manage/clients/[id]/page.tsx',{params:Promise.resolve({id:reviewOnlyId})});assert.ok(testedClient.includes('12 checks'));assert.ok(testedClient.includes('See test-pack results'));assert.ok(!testedClient.includes('Workspace temporarily unavailable'));
 pass('populated client setup preserves escaped input, public/staff separation, export and truthful connection states');
 const id=webcrypto.randomUUID();const name='<img src=x onerror=alert(1)>';
 await crm.mutateCrm({action:'createLead',mutationId:id,name,business:'Hostile <script>company</script>',email:'test@example.com',phone:'',service:'general',source:'manual',stage:'new',preferredContact:'email',monthlyValue:'100',setupValue:'0',note:'<script>alert(2)</script>'});
 await crm.mutateCrm({action:'createTask',mutationId:webcrypto.randomUUID(),leadId:id,title:'<img src=x onerror=alert(3)>',dueDate:'2026-10-01'});
 screens.push(['app/manage/leads/[id]/page.tsx',{params:Promise.resolve({id}),searchParams:Promise.resolve({})}]);
 for(const [module,props] of screens){const html=await render(module,props);assert.ok(!html.includes('Workspace temporarily unavailable'),module);assert.ok(!html.includes(name),module);assert.ok(!html.includes('<script>alert(2)</script>'),module);assert.ok(!html.includes('<img src=x onerror=alert(3)>'),module);}
 const detail=await render('app/manage/leads/[id]/page.tsx',{params:Promise.resolve({id}),searchParams:Promise.resolve({})});
 assert.ok(detail.includes('&lt;script&gt;alert(2)&lt;/script&gt;'));assert.ok(detail.includes('Permanently delete lead'));assert.ok(detail.includes('Schedule a follow-up'));assert.ok(detail.includes('method="post"'));assert.ok(detail.includes('action="/api/manage/crm"'));
 pass('populated pages render escaped contacts, notes and tasks with the correct edit/deletion forms');
 const invalid=await render('app/manage/leads/[id]/page.tsx',{params:Promise.resolve({id:'invalid'}),searchParams:Promise.resolve({})});assert.ok(invalid.includes('Choose a valid record.'));
 const stale=await render('app/manage/tasks/page.tsx',{searchParams:Promise.resolve({leadId:webcrypto.randomUUID()})});assert.ok(stale.includes('Clear the contact filter'));assert.ok(!stale.includes('name="title"'));
 pass('invalid and deleted records show recoverable states without creating an unrelated task');
 console.log(`\n${checks} CRM server-rendering/access groups passed. Browser session and hydration testing remain external checks.`);sql.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
