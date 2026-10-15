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
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, Date, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

const app = load('lib/inquiries.ts');
const owner = load('lib/owner.ts');
const inquiries = load('app/api/inquiries/route.ts');
const metrics = load('app/api/metrics/route.ts');
const deletion = load('app/api/manage/inquiries/route.ts');
const origin = 'https://example.chatgpt.site';
let requestSequence = 0;
function request(route, payload, extra = {}) {
  requestSequence += 1;
  return new Request(`${origin}${route}`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': `198.51.${Math.floor(requestSequence / 250)}.${requestSequence % 250 + 1}`, ...extra }, body: JSON.stringify(payload) });
}
async function submission(overrides = {}) {
  const token = await app.issueInquiryToken(origin);
  return { name: 'Ada Example', business: 'Example Co', email: 'ada@example.com', phone: '', service: 'audit', message: 'Please assess our existing chatbot.', preferredContact: 'email', consent: true, website: '', submissionKey: token.submissionKey, token: token.token, ...overrides };
}
function count(table) { return Number(sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n); }


const voice=load('app/api/voice/intake/route.ts');
const desk=load('app/api/manage/response/route.ts');
const demo=load('app/api/demo/route.ts');
const {createHmac}=require('node:crypto');
runtime.VOICE_INGEST_SECRET='voice-test-only-secret-'.repeat(3);
function signed(payload,time=String(Math.floor(Date.now()/1000)),secret=runtime.VOICE_INGEST_SECRET){const body=JSON.stringify(payload);return new Request(origin+'/api/voice/intake',{method:'POST',headers:{'content-type':'application/json','x-schurr-timestamp':time,'x-schurr-signature':createHmac('sha256',secret).update(time+'.'+body).digest('hex')},body});}
const caller={callSid:'CA'+'1'.repeat(32),name:'Voice Example',business:'Demo',email:'voice@example.com',phone:'',service:'calls',summary:'Needs help with missed calls.',preferredContact:'email',callbackConsent:true,consentEvidence:'Yes, Gavin can email me about this request.'};
(async()=>{
 let checks=0;function pass(msg){checks++;console.log('PASS '+msg);}
 const payload=await submission({service:'calls'});const first=await inquiries.POST(request('/api/inquiries',payload));assert.equal(first.status,201);const id=(await first.json()).receipt;
 assert.equal(count('response_jobs'),1);assert.equal(sql.prepare('SELECT inquiry_id,lead_id FROM response_jobs').get().inquiry_id,id);assert.equal(sql.prepare('SELECT lead_id FROM response_jobs').get().lead_id,null);
 const originalInquiry=sql.prepare('SELECT * FROM inquiries WHERE id=?').get(id),originalJob=sql.prepare('SELECT * FROM response_jobs WHERE id=?').get(id),originalAlert=sql.prepare('SELECT payload FROM owner_alerts WHERE id=?').get(id).payload;
 const overlay=sql.prepare('SELECT * FROM crm_leads WHERE id=?').get(id);assert.equal(overlay.inquiry_id,id);assert.equal(overlay.name,payload.name);assert.equal(overlay.source,'website');
 await inquiries.POST(request('/api/inquiries',payload));assert.equal(count('response_jobs'),1);assert.equal(count('crm_leads'),1);assert.equal(count('owner_alerts'),1);pass('real inquiry atomically creates one overlay, inquiry-linked response and owner alert on retry');
 sql.prepare("UPDATE crm_leads SET name='Corrected person',business='Corrected company',email='corrected@example.com',phone='+13035550199',service='leads',preferred_contact='phone',revision=2 WHERE id=?").run(id);
 const corrected=(await load('lib/response-desk.ts').listResponseJobs()).items.find(row=>row.id===id);
 assert.equal(corrected.name,'Corrected person');assert.equal(corrected.business,'Corrected company');assert.equal(corrected.email,'corrected@example.com');assert.equal(corrected.phone,'+13035550199');assert.equal(corrected.service,'leads');assert.equal(corrected.preferredContact,'phone');assert.equal(corrected.channel,'email');assert.equal(corrected.draft,originalJob.draft);assert.equal(corrected.consentScope,originalJob.consent_scope);
 await app.saveInquiry(app.validateInquiry(payload));assert.deepEqual(sql.prepare('SELECT * FROM inquiries WHERE id=?').get(id),originalInquiry);assert.deepEqual(sql.prepare('SELECT * FROM response_jobs WHERE id=?').get(id),originalJob);assert.equal(sql.prepare('SELECT name,revision FROM crm_leads WHERE id=?').get(id).name,'Corrected person');assert.equal(sql.prepare('SELECT revision FROM crm_leads WHERE id=?').get(id).revision,2);assert.equal(sql.prepare('SELECT payload FROM owner_alerts WHERE id=?').get(id).payload,originalAlert);
 pass('response desk uses corrected website contact details while retry preserves original draft, consent, alert and overlay edits');
 sql.exec("CREATE TRIGGER fail_job BEFORE INSERT ON response_jobs BEGIN SELECT RAISE(ABORT,'test'); END;");const next=await submission();assert.equal((await inquiries.POST(request('/api/inquiries',next))).status,503);assert.equal(count('inquiries'),1);assert.equal(count('crm_leads'),1);assert.equal(count('owner_alerts'),1);sql.exec('DROP TRIGGER fail_job');pass('failed response job rolls back the entire inquiry transaction');
 assert.equal((await voice.POST(signed(caller,'1000000000'))).status,401);assert.equal((await voice.POST(signed(caller,undefined,'wrong'))).status,401);assert.equal((await voice.POST(signed({...caller,callbackConsent:false}))).status,400);assert.equal(count('crm_leads'),1);pass('stale signatures, forged authentication and missing consent cannot capture leads');
 const pair=await Promise.all([voice.POST(signed(caller)),voice.POST(signed(caller))]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,201]);assert.equal(count('crm_leads'),2);assert.equal(count('crm_events'),1);assert.equal(count('response_jobs'),2);pass('concurrent voice retries create one lead, note and response');
 assert.equal((await voice.POST(signed({...caller,summary:'Different request'}))).status,409);pass('reused call identity cannot overwrite confirmed details');
 const stop={action:'stop',callSid:caller.callSid};assert.equal((await voice.POST(signed(stop))).status,200);assert.equal(sql.prepare("SELECT status FROM response_jobs WHERE source_key LIKE 'call:%'").get().status,'paused');assert.equal((await voice.POST(signed(caller))).status,409);pass('withdrawal pauses captured call and prevents replay from reopening it');
 const stoppedCaller={...caller,callSid:'CA'+'2'.repeat(32)};await voice.POST(signed({action:'stop',callSid:stoppedCaller.callSid}));assert.equal((await voice.POST(signed(stoppedCaller))).status,409);assert.equal(count('crm_leads'),2);pass('stop before capture persists and blocks future capture');
 const raceCaller={...caller,callSid:'CA'+'3'.repeat(32)};await Promise.all([voice.POST(signed(raceCaller)),voice.POST(signed({action:'stop',callSid:raceCaller.callSid}))]);const race=sql.prepare('SELECT status FROM response_jobs WHERE source_key=?').get('call:'+raceCaller.callSid);assert.ok(!race||race.status==='paused');pass('concurrent capture and stop cannot leave an actionable response');
 currentUser=null;assert.equal((await desk.POST(request('/api/manage/response',{id,revision:1,status:'contacted'}))).status,401);currentUser={userId:'other',email:'other@example.com'};assert.equal((await desk.POST(request('/api/manage/response',{id,revision:1,status:'contacted'}))).status,403);currentUser={userId:'owner-id',email:'owner@example.com'};pass('response changes reject anonymous and non-owner requests');
 assert.equal((await desk.POST(request('/api/manage/response',{id,revision:1,status:'contacted'}))).status,200);assert.equal((await desk.POST(request('/api/manage/response',{id,revision:1,status:'paused'}))).status,409);pass('response edits detect stale revisions');
 const paused=sql.prepare("SELECT id,revision FROM response_jobs WHERE source_key=?").get('call:'+caller.callSid);assert.equal((await desk.POST(request('/api/manage/response',{...paused,status:'needs_review'}))).status,409);pass('server prevents reopening a paused contact');
 for(const situation of ['no-consent','stop']){const result=await (await demo.GET(new Request(origin+'/api/demo?service=leads&situation='+situation))).json();assert.equal(result.plan.status,'paused');assert.equal(result.plan.draft,'');assert.equal(result.mode,'scripted_preview');}assert.equal((await demo.GET(new Request(origin+'/api/demo?service=bad'))).status,400);pass('demo labels sample data and never drafts follow-up without permission');
 sql.prepare('DELETE FROM inquiries WHERE id=?').run(id);assert.equal(sql.prepare('SELECT count(*) n FROM response_jobs WHERE inquiry_id=?').get(id).n,0);assert.equal(sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(id),undefined);assert.equal(sql.prepare('SELECT id FROM owner_alerts WHERE id=?').get(id),undefined);pass('deleting inquiry also removes its CRM overlay, response draft and owner alert');
 const deleteCaller={...caller,callSid:'CA'+'4'.repeat(32)};const captured=await (await voice.POST(signed(deleteCaller))).json();
 await load('lib/crm.ts').mutateCrm({action:'deleteLead',leadId:captured.leadId,revision:1,confirmation:'DELETE',mutationId:webcrypto.randomUUID()});
 assert.equal((await voice.POST(signed(deleteCaller))).status,409);assert.equal(sql.prepare('SELECT id FROM crm_leads WHERE id=?').get(captured.leadId),undefined);pass('deleted voice leads cannot be recreated by signed event replay');
 const responseList=load('lib/response-desk.ts');
 for(let n=0;n<105;n++){
  const data=await submission({email:'page-'+n+'@example.com'});const saved=await app.saveInquiry(app.validateInquiry(data));
  sql.prepare("UPDATE response_jobs SET created_at='2026-01-01T00:00:00.000Z',status='contacted' WHERE id=?").run(saved.receipt);
 }
 const p1=await responseList.listResponseJobs('contacted');assert.equal(p1.items.length,100);assert.ok(p1.nextCursor);
 const p2=await responseList.listResponseJobs('contacted',p1.nextCursor);assert.equal(p2.items.length,5);assert.equal(p2.nextCursor,null);
 assert.equal(new Set([...p1.items,...p2.items].map(job=>job.id)).size,105);
 assert.ok([...p1.items,...p2.items].every(job=>job.status==='contacted'));
 await assert.rejects(()=>responseList.listResponseJobs('contacted','malformed'),error=>error.status===400);
 pass('response history paginates tied timestamps without duplicates and rejects malformed cursors');
 console.log(checks+' response integration groups passed (real SQLite; mocked runtime identity).');
})().catch(error=>{console.error(error);process.exit(1);});
