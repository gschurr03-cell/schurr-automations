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


const {mutateClientSetup,getClientSetup,clientLaunchKit,previewClientSetup}=load('lib/client-setups.ts');
const templates=load('lib/client-templates.ts');
const route=load('app/api/manage/client-setups/route.ts');
const origin='https://test.chatgpt.site';
const profile={...templates.emptyProfile(),businessName:'Example Services',contactName:'Pat Owner',industry:'Home services',website:'https://example.com',publicPhone:'+13035550123',alertEmail:'owner@example.com',replyEmail:'team@example.com',timezone:'America/Denver',businessHours:'Monday-Friday, 9am-5pm',serviceArea:'Boulder',services:'Inspections; no emergency service.',qualificationQuestions:'What needs inspecting?',handoffInstructions:'Ask the owner to review the request.',bookingRules:'Staff confirms availability.',faqs:'What do you offer? | Approved inspections. | Service policy v1',internalKnowledge:'What is our margin? | Internal margin is private. | Staff policy v1',reviewLink:'https://example.com/review',reviewRules:'After a completed inspection, once per job, with review-contact permission.',priceBook:'INSPECT | Inspection | 12.35',fieldMap:'name | customer_name\nemail | contact_email',connections:'Client-owned accounts to be connected.'};
const data=(overrides={})=>({action:'create',id:webcrypto.randomUUID(),offers:['calls','website','reviews','coding'],profile,...overrides});
const request=(body,headers={})=>new Request(origin+'/api/manage/client-setups',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
const get=(id)=>new Request(origin+'/api/manage/client-setups?id='+id);
(async()=>{
 const installations=load('lib/client-installations.ts'),installRoute=load('app/api/manage/client-installations/route.ts'),policy=load('lib/client-installation-policy.ts'),launch=load('lib/client-launch.ts');
 const methodPolicy=load('lib/request-policy.ts');
 const postInstall=body=>new Request(origin+'/api/manage/client-installations',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal(methodPolicy.rejectUnsupportedRequest(postInstall({})),null);
 const client=data({offers:['website'],profile:{...profile,businessName:'Client Example Services',website:'https://client.example/',alertEmail:'staff@client.example',replyEmail:'reply@client.example'}});await mutateClientSetup(client);
 assert.equal((await installations.getClientInstallation(client.id)).revision,0);assert.equal(sql.prepare('SELECT count(*) n FROM client_installations').get().n,0);
 let reads=0;const db=runtime.DB;runtime.DB={prepare(...a){reads++;return db.prepare(...a);},batch(...a){reads++;return db.batch(...a);}};
 currentUser=null;assert.equal((await installRoute.GET(new Request(origin+'/api/manage/client-installations?id='+client.id))).status,401);assert.equal((await installRoute.POST(postInstall({}))).status,401);
 currentUser={userId:'wrong',email:'wrong@example.com'};assert.equal((await installRoute.POST(postInstall({}))).status,403);currentUser={userId:'owner',email:'owner@example.com'};assert.equal(reads,0);runtime.DB=db;
 const target={...policy.emptyInstallationTarget(),origin:'https://client.example',deploymentRef:'client-project-reference',databaseRef:'client-database-reference',ownerAccount:'operator@client.example',senderEmail:'alerts@notify.client.example'};
 const save={clientId:client.id,briefRevision:1,installationRevision:0,target};
 const results=await Promise.all([installRoute.POST(postInstall(save)),installRoute.POST(postInstall(save))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const record=await installations.getClientInstallation(client.id);assert.equal(record.revision,1);assert.equal(record.target.origin,target.origin);
 for(const bad of [{...target,origin:'https://schurrautomations.com'},{...target,inboundNumber:'+19857710552'},{...target,destinationRef:'Bearer do-not-store-credentials'},{...target,scope:{...target.scope,voice:'prepare'}}])await assert.rejects(()=>installations.saveClientInstallation({...save,installationRevision:1,target:bad}));
 const other=data({offers:['website'],profile:{...client.profile,businessName:'Other client'}});await mutateClientSetup(other);await assert.rejects(()=>installations.saveClientInstallation({...save,clientId:other.id}),/already uses/);assert.equal((await installations.getClientInstallation(other.id)).revision,0);
 await launch.saveLaunchCheck({clientId:client.id,revision:1,installationRevision:1,checkId:'facts',outcome:'passed',environment:'test',evidence:'Approved factual brief reviewed for this isolated test.'},'owner@example.com');
 await installations.saveClientInstallation({...save,installationRevision:1,target:{...target,databaseRef:'client-new-database'}});assert.equal((await launch.clientLaunchStatus(client.id)).currentPassed,0);
 await assert.rejects(()=>launch.saveLaunchCheck({clientId:client.id,revision:1,installationRevision:1,checkId:'facts',outcome:'passed',environment:'test',evidence:'Stale browser test must not write this evidence.'},'owner@example.com'),/installation changed/);
 const download=await installRoute.GET(new Request(origin+'/api/manage/client-installations?id='+client.id+'&format=package&revision=1&installationRevision=2'));assert.equal(download.status,200);assert.match(download.headers.get('cache-control'),/no-store/);const pack=await download.json();assert.equal(pack.liveActionsEnabled,false);assert.match(pack.sourceVersion,/^[a-f0-9]{64}$/);
 assert.ok(policy.preparationNeeds(target,{...client.profile,services:'',contactName:''}).includes('Approved services'));assert.ok(policy.preparationNeeds(target,{...client.profile,services:'',contactName:''}).includes('Client approval owner'));
 const recipes=templates.recipesFor(['website']);assert.deepEqual(Array.from(recipes,r=>r.id),['inquiry','website','chat']);const rehearsal=load('lib/client-rehearsal.ts');assert.equal(rehearsal.runRehearsal(client.profile,['website'],client.id).length,11);assert.equal(rehearsal.runRehearsal(client.profile,['calls','website'],client.id).length,14);
 const demo=load('lib/client-demo.ts');const story=demo.buildClientPresentation(client.profile,1,['website']);assert.equal(story.modules.length,3);assert.ok(story.modules.every(m=>m.offer==='website'));assert.ok(story.stories.every(s=>s.channel==='website'));
 const kit=await clientLaunchKit(client.id);assert.equal(kit.workflows.find(r=>r.id==='inquiry').offer,'website');assert.ok(!templates.runTemplate('inquiry',client.profile,templates.sampleEvent('inquiry',client.profile),client.id).requirements.some(s=>/phone|calendar/i.test(s)));
 await mutateClientSetup({...client,action:'update',revision:1,profile:{...client.profile,services:'Updated approved service'}});assert.equal((await installations.getClientInstallation(client.id)).stale,true);await assert.rejects(()=>launch.saveLaunchCheck({clientId:client.id,revision:2,installationRevision:2,checkId:'facts',outcome:'passed',environment:'test',evidence:'Do not accept evidence for a stale installation.'},'owner@example.com'),/save the installation/);assert.equal((await launch.clientLaunchStatus(client.id)).installationCurrent,false);await assert.rejects(()=>installations.clientPreparationPackage(client.id,2,2),/current business brief/);
 assert.equal(sql.prepare('SELECT count(*) n FROM retell_connection').get().n,0);assert.equal(sql.prepare('SELECT count(*) n FROM owner_alert_connection').get().n,0);
 if(process.env.CLIENT_TEST_PACKAGE)fs.writeFileSync(process.env.CLIENT_TEST_PACKAGE,JSON.stringify(pack,null,2));
 console.log('PASS private installation registry, method gate, revision races, resource isolation, stale launch evidence, export fingerprints and website shared inquiry. No provider calls.');
})().catch(error=>{console.error(error);process.exit(1);});
