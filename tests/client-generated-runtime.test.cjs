const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const dependencyRequire = createRequire(process.env.SCHURR_PACKAGE_JSON || path.join(process.cwd(), 'package.json'));
const ts = dependencyRequire('typescript');
if(!process.env.CLIENT_GENERATED_SOURCE)throw Error('Set CLIENT_GENERATED_SOURCE to a freshly prepared fictional client source folder.');
const root = path.resolve(process.env.CLIENT_GENERATED_SOURCE);
const runtime = { INQUIRY_SIGNING_SECRET: 'test-only-'.repeat(8), OWNER_EMAIL: 'owner@example.com' };
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
let activeKey='test-provider-key';let sends=[];let providerBehavior='ok';let connectionHook=null;
let beforeFirst=null;let providerEmailId='12345678-1234-4234-8234-123456789abc';
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
sql.exec(fs.readFileSync(path.join(root,'../private/settings-seed.sql'),'utf8'));
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
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, ReadableStream, Date, Intl, AbortSignal, fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sends.push({url,...options});if(providerBehavior==='timeout')throw new Error('timeout');if(typeof providerBehavior==='object')return Response.json({name:providerBehavior.name},{status:providerBehavior.status});if(providerBehavior==='limited')return new Response('Rate limited',{status:429,headers:{'Retry-After':'3600'}});return Response.json({id:providerEmailId});}, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}



const desk=load('lib/automation-desk.ts'),delivery=load('lib/review-delivery.ts'),assistant=load('app/api/assistant/route.ts');
(async()=>{
 let settings=await desk.getAutomationSettings();assert.equal(settings.chatEnabled,false);assert.equal(settings.revision,1);let publicData=await (await assistant.GET()).json();assert.equal(publicData.enabled,false);assert.equal(publicData.questions.length,0);
 settings=await desk.saveAutomationSettings({...settings,chatEnabled:true,googleEligibility:'visits_customers',profile:{...settings.profile,reviewLink:'https://g.page/r/fictional/review',reviewRules:'One invitation after completed work with explicit permission.'}});assert.equal(settings.revision,2);
 publicData=await (await assistant.GET()).json();assert.equal(publicData.enabled,true);assert.equal(publicData.questions[0].answer,'Approved inspections.');for(const marker of ['PRIVATE_KNOWLEDGE_TEST_ONLY','PRICE_TEST_ONLY','staff@client.example','replies@client.example'])assert.ok(!JSON.stringify(publicData).includes(marker));
 const event={kind:'review_request',eventKey:'job-compiled-client',revision:settings.revision,customer:'Fictional customer',email:'customer@example.com',consentEvidence:'Customer requested one review invitation.',completed:true,permission:true};const first=await desk.prepareOperation(event),before=sql.prepare('SELECT * FROM review_requests WHERE id=?').get(first.id);const payload=JSON.parse(before.payload);assert.equal(payload.reply_to,'replies@client.example');assert.ok(!payload.from.includes('Schurr'));assert.equal(sends.length,0);await delivery.deliverReviewRequest(first.id);assert.equal(sends.length,1);assert.equal(JSON.parse(sends[0].body).reply_to,'replies@client.example');const after=sql.prepare('SELECT * FROM review_requests WHERE id=?').get(first.id);assert.equal(after.connection_fingerprint,await desk.contentHash(activeKey+'\n'+payload.from+'\n'+'replies@client.example'));
 const corrupt=await desk.prepareOperation({...event,eventKey:'job-compiled-corrupt',email:'other@example.com'});sql.prepare("UPDATE review_requests SET payload=json_set(payload,'$.reply_to',?) WHERE id=?").run('staff@client.example',corrupt.id);await assert.rejects(()=>delivery.deliverReviewRequest(corrupt.id));assert.equal(sends.length,1);assert.equal(sql.prepare('SELECT status FROM review_requests WHERE id=?').get(corrupt.id).status,'cancelled');
 const owner=load('lib/owner-alert-content.ts');assert.equal(owner.OWNER_ALERT_EMAIL,'staff@client.example');const confirmation=JSON.parse(load('lib/customer-email-content.ts').customerEmailPayload('customer@example.com',webcrypto.randomUUID()));assert.equal(confirmation.reply_to,'replies@client.example');
 console.log('PASS generated client settings, disabled/enabled public assistant, public/private separation, distinct staff/reply inboxes, review payload fingerprint and corrupted-reply rejection. Providers simulated; no real messages.');
})().catch(e=>{console.error(e);process.exit(1);});
