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
    if(name.startsWith('@/')&&name.endsWith('.json'))return {default:JSON.parse(fs.readFileSync(path.join(root,name.slice(2)),'utf8'))};
    if (name === 'cloudflare:workers') return { env: runtime };
    if (name === '@/app/chatgpt-auth') return {
      getChatGPTUser: async () => currentUser && currentUser.userId && currentUser.email ? currentUser : null,
      requireChatGPTUser: async () => { if (!currentUser?.userId || !currentUser?.email) throw new Error('SIGN_IN_REDIRECT'); return currentUser; },
    };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), `${name}.ts`));
    return require(name);
  };
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, ReadableStream, Date, Intl, AbortSignal, fetch:async(...args)=>fetchMock(...args), console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}


let providerCalls=0;
let fetchMock=async()=>{providerCalls++;return Response.json({success:true,data:{markdown:'Example service business. contact@example-business.com',metadata:{sourceURL:'https://example-business.com',statusCode:200}}});};
const outreach=load('lib/outreach.ts'),shared=load('lib/outreach-shared.ts'),api=load('app/api/manage/outreach/route.ts');
const policy=load('lib/request-policy.ts');
const origin='https://example.chatgpt.site';
const cmd=(action,fields={})=>({action,mutationId:webcrypto.randomUUID(),...fields});
const req=p=>new Request(origin+'/api/manage/outreach',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(p)});
const post=p=>api.POST(req(p));
const mutate=(action,p={})=>outreach.mutateOutreach(cmd(action,p));
const count=t=>sql.prepare('SELECT count(*) n FROM '+t).get().n;
const prospect={company:'Example Business',website:'https://example-business.com/',email:'contact@example-business.com',phone:'9852328337',contact:'',industry:'HVAC',location:'Denver',service:'calls',evidence:'Your website lists HVAC installation in Denver.',source_url:'https://example-business.com/',observed_at:new Date().toISOString().slice(0,10)};
const status=n=>e=>e.status===n;
(async()=>{let checks=0;const pass=t=>{checks++;console.log('PASS '+t);};
 const base=runtime.DB;let queries=0;runtime.DB={prepare(...args){queries++;return base.prepare(...args)},batch(...args){queries++;return base.batch(...args)}};
 currentUser=null;assert.equal((await api.GET(new Request(origin+'/api/manage/outreach'))).status,401);assert.equal((await post(cmd('coloradoPreview'))).status,401);assert.equal((await post(cmd('curatedImport'))).status,401);
 currentUser={userId:'bad',email:'bad@example.com'};assert.equal((await post(cmd('create',prospect))).status,403);assert.equal((await post(cmd('curatedImport'))).status,403);assert.equal(queries,0);
 currentUser={userId:'owner',email:'owner@example.com'};assert.equal((await api.POST(new Request(origin+'/api/manage/outreach',{method:'POST',headers:{origin:'https://wrong.example','content-type':'application/json'},body:'{}'}))).status,403);assert.equal(queries,0);runtime.DB=base;
 assert.equal(policy.rejectUnsupportedRequest(new Request(origin+'/api/manage/outreach',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'email=private'})).status,415);pass('private data and mutations require owner identity, same origin, JSON, and safe POST fallback');
 const created=cmd('create',prospect);await outreach.mutateOutreach(created);await outreach.mutateOutreach(created);assert.equal(count('outreach_prospects'),1);assert.equal((await outreach.getProspect(created.mutationId)).status,'needs_review');await assert.rejects(()=>outreach.mutateOutreach({...created,company:'changed'}),status(409));
 await mutate('import',{source:'test.csv',rows:[{...prospect,website:'https://www.example-business.com/path'}]});assert.equal(count('outreach_prospects'),1);
 await assert.rejects(()=>mutate('import',{source:'bad.csv',rows:[{...prospect,website:'https://another-business.com',email:'invalid'}]}),/Row 1.*Example Business.*valid email/);assert.equal(count('outreach_prospects'),1);pass('prospects import once, duplicate business locations preserve records, bad rows report identity');
 const ready=()=>mutate('update',{...prospect,id:created.mutationId,revision:(sql.prepare('SELECT revision FROM outreach_prospects WHERE id=?').get(created.mutationId)).revision,status:'ready',reviewed:true});
 for(const [field,value,message] of [
  ['email','','Enter the recipient email'],['source_url','','Contact / observation source URL'],['evidence','','verified observation'],['observed_at','','Select the date'],['reviewed',false,'confirmation']
 ]){const response=await post(cmd('update',{...prospect,id:created.mutationId,revision:1,status:'ready',reviewed:true,[field]:value}));assert.equal(response.status,400);assert.ok((await response.json()).error.includes(message));assert.equal((await outreach.getProspect(created.mutationId)).status,'needs_review');assert.equal((await outreach.getProspect(created.mutationId)).revision,1);}
 pass('each missing Ready field identifies the correction and leaves the prospect unchanged');await ready();
 const camp=await mutate('starter',{index:0});await mutate('generate',{campaignId:camp.id,ids:[created.mutationId],step:0});await mutate('generate',{campaignId:camp.id,ids:[created.mutationId],step:0});assert.equal(count('outreach_drafts'),1);
 let d=sql.prepare('SELECT * FROM outreach_drafts').get();const oldDraftId=d.id;const secondCampaign=await mutate('starter',{index:0});const reused=await mutate('generate',{campaignId:secondCampaign.id,ids:[created.mutationId],step:0,reuseFirst:true});assert.equal(reused.id,oldDraftId);assert.equal(count('outreach_drafts'),1);const exactDraft=await post(cmd('getDraft',{id:oldDraftId}));assert.equal(exactDraft.status,200);assert.equal((await exactDraft.json()).draft.id,oldDraftId);sql.prepare('DELETE FROM outreach_campaigns WHERE id=?').run(secondCampaign.id);pass('recommended templates reuse existing service drafts and return an exact owner-only draft');assert.ok(d.body.includes(prospect.evidence));assert.ok(!d.body.includes('{{'));assert.equal(d.status,'draft');await assert.rejects(()=>mutate('approve',{id:d.id,revision:d.revision}),/sender address/);pass('reviewed sourced contacts generate repeat-safe personalized drafts; approval needs sender details');
 await mutate('sender',{revision:1,sender_name:'Gavin Schurr',sender_email:'gavin@schurr.test',postal_address:'123 Test Street, Denver, CO'});
 await assert.rejects(async()=>mutate('sender',{revision:(await outreach.getSender()).revision,sender_name:'Gavin Schurr',daily_limit:21,window_start:'08:00',window_end:'17:00'}),/1 to 20/);assert.equal((await outreach.getSender()).daily_limit,20);
 d=sql.prepare('SELECT * FROM outreach_drafts').get();await mutate('approve',{id:d.id,revision:d.revision});let prepared=await post(cmd('prepare',{id:d.id,revision:d.revision}));assert.equal(prepared.status,200);assert.ok((await prepared.json()).body.includes('Reply "unsubscribe"'));
 const scoped=await load('lib/gmail-workspace.ts').gmailWorkspace(1,d.id);assert.equal(scoped.approved.length,1);assert.equal(scoped.approved[0].id,d.id);assert.ok(scoped.approved[0].body.includes('123 Test Street'));assert.equal((await load('lib/gmail-workspace.ts').gmailWorkspace(1,webcrypto.randomUUID())).approved.length,0);await assert.rejects(()=>load('lib/gmail-workspace.ts').gmailWorkspace(1,'invalid'),status(400));pass('draft-scoped Gmail reads validate IDs and return the canonical approved body');
 const csv=await outreach.approvedExport();assert.ok(csv.includes('contact@example-business.com'));assert.ok(csv.includes('123 Test Street'));
 await mutate('draft',{id:d.id,revision:d.revision,subject:'A corrected subject',body:d.body+' Edited.'});d=sql.prepare('SELECT * FROM outreach_drafts').get();assert.equal(d.status,'draft');assert.equal((await post(cmd('prepare',{id:d.id,revision:d.revision}))).status,409);pass('approval binds the saved message and sender; edit clears approval and blocks preparation');
 await mutate('approve',{id:d.id,revision:d.revision});await assert.rejects(()=>mutate('sent',{id:d.id,revision:d.revision,confirmation:'no'}),status(400));await mutate('sent',{id:d.id,revision:d.revision,confirmation:'SENT'});d=sql.prepare('SELECT * FROM outreach_drafts').get();assert.equal(d.status,'sent');await mutate('generate',{campaignId:camp.id,ids:[created.mutationId],step:1});assert.equal(count('outreach_drafts'),1);
 sql.prepare("UPDATE outreach_drafts SET sent_at=? WHERE id=?").run(new Date(Date.now()-5*86400000).toISOString(),d.id);await mutate('generate',{campaignId:camp.id,ids:[created.mutationId],step:1});assert.equal(count('outreach_drafts'),2);
 let p=await outreach.getProspect(created.mutationId);await mutate('outcome',{id:p.id,revision:p.revision,kind:'reply',body:'They replied with interest.'});assert.equal(sql.prepare("SELECT count(*) n FROM outreach_drafts WHERE status='stopped'").get().n,1);await ready();assert.ok(await outreach.eligibility(await outreach.getProspect(p.id),sql.prepare('SELECT * FROM outreach_campaigns').get(),1));pass('recorded sends gate follow-up delays; replies stop pending work and block regeneration');
 const suppression=cmd('suppressBatch',{emails:'blocked@company.com\ncontact@example-business.com',reason:'Previous opt-outs'});await outreach.mutateOutreach(suppression);await outreach.mutateOutreach(suppression);assert.equal(count('outreach_suppressions'),2);assert.equal((await outreach.getProspect(p.id)).status,'paused');await assert.rejects(ready,/suppressed/);assert.ok(!(await outreach.approvedExport()).includes('contact@example-business.com'));pass('global bulk suppression is repeat-safe, stops follow-ups, and excludes approved exports');
 const converted=await mutate('convert',{id:p.id,revision:(await outreach.getProspect(p.id)).revision});assert.ok(converted.redirect.startsWith('/manage/leads/'));assert.equal(count('crm_leads'),1);assert.equal(count('inquiries'),0);assert.equal(sql.prepare('SELECT source FROM crm_leads').get().source,'outreach');pass('pipeline handoff persists a CRM lead without fabricating website consent');
 const preview=await post(cmd('coloradoPreview'));assert.equal(preview.status,200);const rows=(await preview.json()).rows;assert.equal(rows.length,100);assert.equal(rows.filter(r=>r.email).length,83);assert.ok(rows.every(r=>!r.contact));assert.ok(rows[3].research.includes('Cody'));const imp=await post(cmd('coloradoImport',{ids:rows.map((_,i)=>i)}));assert.equal(imp.status,200,JSON.stringify(await imp.clone().json()));assert.equal(count('outreach_prospects'),101);assert.ok(sql.prepare("SELECT source_notes FROM outreach_prospects WHERE company=?").get(rows[3].company).source_notes.includes('Cody'));assert.equal(sql.prepare("SELECT count(*) n FROM outreach_prospects WHERE import_source LIKE 'Colorado%' AND status='needs_review'").get().n,100);pass('all 100 saved prospects import with original cautions, no guessed greeting identities, and no approval');
 let s=await outreach.snapshot({page:'1'});assert.equal(s.prospects.length,50);assert.equal(s.total,100);assert.equal((await outreach.snapshot({page:'3'})).prospects.length,0);
 const withEmail=await outreach.snapshot({email:'available'}),withoutEmail=await outreach.snapshot({email:'missing'});const phoneOnly=await outreach.snapshot({email:'phone_only'});assert.equal(phoneOnly.total,17);assert.ok(phoneOnly.prospects.every(p=>p.phone&&!p.email));const phoneGet=await api.GET(new Request(origin+'/api/manage/outreach?email=phone_only'));assert.equal((await phoneGet.json()).data.total,17);assert.equal(withEmail.total,83);assert.equal(withoutEmail.total,17);assert.ok(withEmail.prospects.every(p=>p.email));assert.ok(withoutEmail.prospects.every(p=>!p.email));assert.equal((await outreach.snapshot({email:'available',status:'needs_review'})).total,83);await assert.rejects(()=>outreach.snapshot({email:'invalid'}),status(400));const filteredGet=await api.GET(new Request(origin+'/api/manage/outreach?email=missing'));assert.equal((await filteredGet.json()).data.total,17);pass('email filters preserve totals and status intersection, validate input, and reach the private API');
 assert.equal(shared.parseCsv('company,website,research\r\n"A, LLC",https://a-business.com,"line1\nline2"')[0].research,'line1\nline2');assert.throws(()=>shared.parseCsv('company,website\n"unfinished,https://a.com'));pass('pagination reaches the whole pool and CSV parser preserves quoted notes and rejects malformed files');
 assert.equal((await post(cmd('search',{query:'HVAC Denver'}))).status,503);assert.equal(providerCalls,0);runtime.FIRECRAWL_API_KEY='test-secret';fetchMock=async(url,options)=>{providerCalls++;assert.equal(new URL(url).hostname,'api.firecrawl.dev');assert.equal(options.redirect,'error');return Response.json({success:true,data:{web:[{title:'Good',url:'https://good-business.com',description:'Public info'},{title:'Bad',url:'http://127.0.0.1',description:'bad'}]}})};const found=await post(cmd('search',{query:'HVAC Denver'}));assert.equal(found.status,200);assert.equal((await found.json()).results.length,1);
 const colorado=sql.prepare("SELECT * FROM outreach_prospects WHERE import_source LIKE 'Colorado%' LIMIT 1").get();const sourceNotes=colorado.source_notes;fetchMock=async(url,options)=>{providerCalls++;const payload=JSON.parse(options.body);assert.equal(payload.skipTlsVerification,false);return Response.json({success:true,data:{markdown:'Contact research@example-business.com',metadata:{sourceURL:colorado.website,statusCode:200}}});};assert.equal((await post(cmd('research',{id:colorado.id,revision:colorado.revision}))).status,200);assert.equal((await outreach.getProspect(colorado.id)).source_notes,sourceNotes);assert.ok((await outreach.getProspect(colorado.id)).research.includes('research@example-business.com'));pass('no-key research never calls provider; configured adapter validates results and preserves original source notes');
 const targeting=load('lib/outreach-targets.ts'),rendering=load('lib/outreach-render.ts');const targetCases=[
  [{company:"McDonald's"},true],[{company:'McDonald’s'},true],[{company:'Burger King'},true],[{company:'Taco Bell'},true],
  [{company:'Unknown',industry:'Restaurants; Fast-food restaurant'},true],[{company:'Unknown',industry:'QSR'},true],
  [{company:'Local branch',website:'https://locations.mcdonalds.com/us/colorado'},true],[{company:'Local branch',domain:'www.wendys.com'},true],
  [{company:'McDonald Plumbing'},false],[{company:'Burger Roofing'},false],[{company:"William Oliver’s Public House",industry:'Restaurant'},false],
  [{company:'Equipment supplier',industry:'Fast food equipment repair'},false],[{company:'Local cafe',website:'https://notmcdonalds.com'},false],
  [{company:'Local cafe',website:'https://mcdonalds.com.other-business.com'},false],[{company:'Local cafe',website:'https://other-business.com/mcdonalds.com'},false]
 ];const predicate=targeting.outreachTargetSql('p'),targetQuery=sql.prepare(`SELECT CASE WHEN ${predicate} THEN 0 ELSE 1 END AS excluded FROM (SELECT ? AS company,? AS industry,? AS domain,? AS website) p`);for(const [candidate,expected] of targetCases){assert.equal(targeting.excludedOutreachBusiness(candidate),expected,JSON.stringify(candidate));assert.equal(Boolean(targetQuery.get(candidate.company||'',candidate.industry||'',candidate.domain||'',candidate.website||'').excluded),expected,JSON.stringify(candidate));}const beforeTargetImport=count('outreach_prospects'),targetImport=await mutate('import',{source:'Targeting test',rows:[{company:"McDonald's",website:'https://mcdonalds.com',email:'store@mcdonalds.com'},{company:'McDonald Plumbing',website:'https://mcdonald-plumbing.com',email:'owner@mcdonald-plumbing.com'}]});assert.equal(count('outreach_prospects'),beforeTargetImport+1);assert.match(targetImport.report[0].result,/fast-food/);assert.match(targetImport.report[1].result,/Imported/);pass('fast-food names, category tokens and official domains are excluded consistently in imports and SQL without excluding similar service-business names');
 const fresh={...prospect,status:'ready',contact:'Verified name'},template=shared.STARTERS[0].steps[0];assert.ok(rendering.renderOutreachEmail(template,fresh,'Gavin').body.includes(prospect.evidence));for(const source of [{...fresh,status:'needs_review'},{...fresh,observed_at:'2020-01-01'},{...fresh,observed_at:'2099-01-01'},{...fresh,source_url:''}]){const body=rendering.renderOutreachEmail(template,source,'Gavin').body;assert.ok(!body.includes(prospect.evidence));assert.ok(!body.includes('Verified name'));assert.match(body,/Hi there/);assert.ok(!body.includes('{{'));assert.ok(!body.includes('\n\n\n'));}pass('draft generation and improved-copy rendering omit stale or unverified observations and names without inventing dates or facts');
 console.log(`\n${checks} outreach integration/security groups passed. No live provider calls or sends.`);sql.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
