const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {DatabaseSync}=require('node:sqlite');
const {webcrypto}=require('node:crypto');
const root=process.env.SCHURR_SOURCE_ROOT||path.resolve(__dirname,'..');
const candidate=process.env.SCHURR_AUDITION_CANDIDATE||'';
const dependencyRequire=createRequire(process.env.SCHURR_PACKAGE_JSON||path.join(root,'package.json'));
const ts=dependencyRequire('typescript');
const runtime={OWNER_EMAIL:'owner@example.com',INQUIRY_SIGNING_SECRET:'test-secret-'.repeat(8)};
let currentUser={userId:'owner-id',email:'owner@example.com'},clock=Date.parse('2026-10-05T12:00:00.000Z'),prepares=0,prefillUnavailable=false;
const navigation=[];
class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const filename of fs.readdirSync(path.join(root,'drizzle')).filter(name=>name.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',filename),'utf8'));
// Staging only: canonical migrations take precedence and are not filename-dependent.
if(candidate&&!sql.prepare("SELECT name FROM sqlite_master WHERE name='receptionist_audition_sessions'").get())sql.exec(fs.readFileSync(path.join(candidate,'proposal/audition.sql'),'utf8'));
class Statement{
 constructor(query,values=[]){this.query=query;this.values=values;}
 bind(...values){return new Statement(this.query,values);}
 async first(){if(prefillUnavailable&&this.query.includes('FROM retell_connection'))throw new Error('Optional prefill read unavailable.');return sql.prepare(this.query).get(...this.values)||null;}
 async all(){return {results:sql.prepare(this.query).all(...this.values)};}
 async run(){return sql.prepare(this.query).run(...this.values);}
}
runtime.DB={prepare(query){prepares++;return new Statement(query);},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(statement=>({results:sql.prepare(statement.query).all(...statement.values)}));sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const modules=new Map();
function sourcePath(relative){
 if(candidate&&relative==='lib/request-policy.ts')return path.join(candidate,'proposal/request-policy.ts');
 if(candidate&&fs.existsSync(path.join(candidate,relative)))return path.join(candidate,relative);
 return path.join(root,relative);
}
function load(relative){
 if(!fs.existsSync(sourcePath(relative))&&fs.existsSync(sourcePath(relative+'x')))relative+='x';
 if(modules.has(relative))return modules.get(relative);
 const compiled=ts.transpileModule(fs.readFileSync(sourcePath(relative),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}),module={exports:{}};
 const customRequire=name=>{
  if(name.endsWith('?raw'))return {default:fs.readFileSync(path.join(root,name.slice(2,-4)),'utf8')};
  if(name.endsWith('.css'))return {};
  if(name==='cloudflare:workers')return {env:runtime};
  if(name==='next/navigation')return {useRouter:()=>({refresh(){},push(href){navigation.push(href);}})};
  if(name==='@/app/chatgpt-auth')return {getChatGPTUser:async()=>currentUser?.userId&&currentUser?.email?currentUser:null,requireChatGPTUser:async()=>{if(!currentUser?.userId||!currentUser?.email)throw new Error('SIGN_IN_REDIRECT');return currentUser;},chatGPTSignOutPath:()=>'/signout-with-chatgpt'};
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('.'))return load(path.posix.join(path.posix.dirname(relative),name+'.ts'));
  return dependencyRequire(name);
 };
 const context=vm.createContext({exports:module.exports,module,require:customRequire,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,Request,Response,URL,URLSearchParams,Uint8Array,ReadableStream,Date:Clock,Intl,AbortSignal,fetch:async()=>{throw new Error('No provider request is allowed in audition logging.');},console:{error(){}}});
 new vm.Script(compiled.outputText,{filename:relative}).runInContext(context);modules.set(relative,module.exports);return module.exports;
}
const audition=load('lib/receptionist-auditions.ts'),policy=load('lib/receptionist-audition-policy.ts'),route=load('app/api/manage/receptionist-auditions/route.ts'),gate=load('lib/request-policy.ts');
const origin='https://schurrautomations.com',endpoint=origin+'/api/manage/receptionist-auditions';
const request=(data,headers={})=>new Request(endpoint,{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
const count=table=>sql.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const plain=value=>JSON.parse(JSON.stringify(value));
async function input(overrides={}){const catalogue=await policy.auditionCatalogue();return {requestKey:webcrypto.randomUUID(),confirmed:true,catalogueHash:catalogue.hash,environment:'phone',testedAt:new Clock().toISOString(),agentId:'agent_fictional_test',agentVersion:null,configEvidence:'Fictional test configuration: voice test, speed 1.0, draft.',notes:'',naturalness:4,interruptions:4,pacing:4,results:catalogue.checks.map(check=>({id:check.id,outcome:'not_tested',notes:''})),...overrides};}
async function someInput(overrides={}){const data=await input(overrides);data.results[0].outcome='pass';return data;}
async function allInput(overrides={}){const data=await input(overrides);data.results.forEach(result=>result.outcome='pass');return data;}
(async()=>{
 let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
 const payload=await someInput();
 const start=prepares;currentUser=null;assert.equal((await route.POST(request(payload))).status,401);currentUser={userId:'other',email:'other@example.com'};assert.equal((await route.POST(request(payload))).status,403);currentUser={userId:'owner-id',email:'owner@example.com'};
 assert.equal((await route.POST(request(payload,{origin:'https://evil.example'}))).status,403);assert.equal((await route.POST(request(payload,{'sec-fetch-site':'cross-site'}))).status,403);assert.equal((await route.POST(new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}))).status,403);assert.equal(prepares,start);
 assert.equal(gate.rejectUnsupportedRequest(request(payload)),null);
 for(const method of ['GET','HEAD','PUT','PATCH','DELETE'])assert.equal(gate.rejectUnsupportedRequest(new Request(endpoint,{method})).status,405);
 assert.equal(gate.rejectUnsupportedRequest(request(payload,{'next-action':'forged'})).status,403);
 assert.equal(gate.rejectUnsupportedRequest(new Request(endpoint+'%2f',{method:'POST',headers:{'Content-Type':'application/json'}})).status,400);
 assert.equal(gate.rejectUnsupportedRequest(request(payload,{'Content-Type':'text/plain'})).status,415);
 pass('owner and exact origin required before DB access; actual app method gate admits only POST');
 const catalogue=await policy.auditionCatalogue();assert.equal(catalogue.checks.length,12);assert.equal(new Set(catalogue.checks.map(check=>check.id)).size,12);assert.equal(catalogue.checks[0].id,'greeting_continuity');
 const savedResponse=await route.POST(request({...payload,recordedBy:'forged@example.com'}));assert.equal(savedResponse.status,200);assert.match(savedResponse.headers.get('cache-control'),/private, no-store/);const saved=await savedResponse.json();
 let history=await audition.listAuditions(),session=history.sessions.find(item=>item.id===saved.id);assert.equal(session.results.length,12);assert.equal(session.agentVersion,null);assert.equal(session.recordedBy,'owner@example.com');assert.equal(session.results[0].title,catalogue.checks[0].title);assert.equal(session.results.filter(result=>result.outcome==='not_tested').length,11);assert.equal(policy.auditionSummary(session,catalogue.hash).label,'Phone audition incomplete');
 pass('all twelve results and checklist wording are saved with honest manual evidence and server actor');
 assert.equal((await audition.saveAudition(payload,'owner@example.com')).duplicate,true);
 const snapshot=JSON.stringify(sql.prepare('SELECT * FROM receptionist_audition_sessions WHERE id=?').get(saved.id));
 await assert.rejects(()=>audition.saveAudition({...payload,notes:'Changed after the original save.'},'owner@example.com'),/different results/);assert.equal(count('receptionist_audition_sessions'),1);assert.equal(count('receptionist_audition_results'),12);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM receptionist_audition_sessions WHERE id=?').get(saved.id)),snapshot);
 const raced=await someInput();const receipts=await Promise.all([audition.saveAudition(raced,'owner@example.com'),audition.saveAudition(raced,'owner@example.com')]);assert.equal(receipts[0].id,receipts[1].id);assert.equal(receipts.filter(result=>result.duplicate).length,1);assert.equal(count('receptionist_audition_results'),24);
 const conflict=await someInput();const outcomes=await Promise.allSettled([audition.saveAudition(conflict,'owner@example.com'),audition.saveAudition({...conflict,notes:'Conflicting concurrent report.'},'owner@example.com')]);assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);assert.equal(outcomes.filter(result=>result.status==='rejected').length,1);assert.equal(count('receptionist_audition_results'),36);
 pass('exact retries and simultaneous saves create one session; conflicting retries never rewrite evidence');
 const before=count('receptionist_audition_sessions'),baseBatch=runtime.DB.batch;runtime.DB.batch=statements=>baseBatch([...statements,new Statement('INSERT INTO nonexistent_table VALUES(1)')]);const rollbackInput=await someInput();await assert.rejects(()=>audition.saveAudition(rollbackInput,'owner@example.com'));runtime.DB.batch=baseBatch;assert.equal(count('receptionist_audition_sessions'),before);assert.equal(count('receptionist_audition_results'),before*12);
 pass('transaction failure rolls back the session and every result');
 const invalid=await someInput();
 for(const changes of [{confirmed:false},{environment:'live'},{naturalness:0},{interruptions:6},{pacing:'5'},{agentVersion:-1},{agentVersion:'0'},{testedAt:'2026-10-06T00:00:00.000Z'},{agentId:'bad'},{configEvidence:'sk-'+ 'x'.repeat(30)},{notes:'x'.repeat(1001)},{catalogueHash:'0'.repeat(64)},{results:invalid.results.slice(1)},{results:[invalid.results[0],...invalid.results.slice(0,11)]}])await assert.rejects(()=>audition.saveAudition({...invalid,...changes},'owner@example.com'));
 const emptyInput=await input();await assert.rejects(()=>audition.saveAudition(emptyInput,'owner@example.com'),/at least one/);
 assert.equal((await route.POST(new Request(endpoint,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{"notes":"'+'x'.repeat(51000)+'"}'}))).status,413);
 pass('invalid scores, missing checks, stale checklist, secrets, future dates and oversized bodies are rejected');
 const profile=load('lib/retell-profile.ts'),originalScenario=profile.CALL_TESTS[0][1];profile.CALL_TESTS[0][1]='Changed wording for an isolated test.';
 const changed=await policy.auditionCatalogue();assert.notEqual(changed.hash,catalogue.hash);assert.equal((await audition.saveAudition(payload,'owner@example.com')).id,saved.id);
 await assert.rejects(()=>audition.saveAudition({...payload,requestKey:webcrypto.randomUUID()},'owner@example.com'),/checklist changed/);
 session=(await audition.listAuditions()).sessions.find(item=>item.id===saved.id);assert.equal(session.results[0].scenario,originalScenario);assert.equal(policy.auditionSummary(session,changed.hash).label,'Earlier phone checklist');profile.CALL_TESTS[0][1]=originalScenario;
 pass('checklist edits preserve old wording and receipts; stale new submissions cannot claim current checks');
 clock+=1000;const allPhone=await audition.saveAudition(await allInput({naturalness:1,interruptions:1,pacing:1}),'owner@example.com');
 clock+=1000;const allBrowser=await audition.saveAudition(await allInput({environment:'browser'}),'owner@example.com');history=await audition.listAuditions();assert.equal(history.latestPhone.id,allPhone.id);assert.equal(policy.auditionSummary(history.sessions.find(row=>row.id===allBrowser.id),catalogue.hash).label,'Browser rehearsal only');assert.equal(history.latestPhone.naturalness,1);assert.doesNotMatch(policy.auditionSummary(history.latestPhone,catalogue.hash).label,/ready|approved/i);
 clock+=1000;const failed=await allInput();failed.results[0].outcome='fail';const failedReceipt=await audition.saveAudition(failed,'owner@example.com');clock+=1000;await audition.saveAudition(await allInput({testedAt:'2026-10-04T12:00:00.000Z'}),'owner@example.com');history=await audition.listAuditions();assert.equal(history.latestPhone.id,failedReceipt.id);assert.equal(policy.auditionSummary(history.latestPhone,catalogue.hash).label,'Phone checks need attention');
 pass('browser passes and older backfilled reports cannot supersede latest phone evidence; low scores never say ready');
 for(let i=0;i<7;i++){clock+=1000;await audition.saveAudition(await someInput({environment:'browser'}),'owner@example.com');}
 const first=await audition.listAuditions(),second=await audition.listAuditions(first.next);assert.equal(first.sessions.length,10);assert.ok(second.sessions.length>0);assert.equal(first.latestPhone.id,second.latestPhone.id);assert.ok(!second.sessions.some(row=>first.sessions.some(previous=>previous.id===row.id)));assert.equal(new Set([...first.sessions,...second.sessions].map(row=>row.id)).size,count('receptionist_audition_sessions'));await assert.rejects(()=>audition.listAuditions(webcrypto.randomUUID()),/unavailable/);
 pass('keyset history retains old sessions and pagination does not change phone summary');
 const React=dependencyRequire('react'),{renderToStaticMarkup}=dependencyRequire('react-dom/server'),Page=load('app/manage/receptionist/auditions/page.tsx').default;
 sql.prepare("INSERT INTO retell_connection(id,api_key_ciphertext,marker,agent_id,updated_at) VALUES('retell','fictional-secret-not-rendered','test','agent_saved_connection',?)").run(new Clock().toISOString());
 let html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));assert.match(html,/Phone checks need attention/);assert.match(html,/Browser rehearsals do not count as phone passes/);assert.match(html,/Version not recorded/);assert.match(html,/value="agent_saved_connection"/);assert.match(html,/Sound scores \(1 poor, 5 excellent\)/);assert.doesNotMatch(html,/fictional-secret-not-rendered/);assert.equal((html.match(/value="not_tested" selected=""/g)||[]).length,12);
 currentUser={userId:'other',email:'other@example.com'};const beforeDenied=prepares;html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));assert.match(html,/does not have access/);assert.doesNotMatch(html,/agent_saved_connection|agent_fictional_test|Configuration evidence/);assert.equal(prepares,beforeDenied);currentUser={userId:'owner-id',email:'owner@example.com'};
 prefillUnavailable=true;html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));prefillUnavailable=false;assert.match(html,/Record a test session/);assert.match(html,/Phone checks need attention/);assert.doesNotMatch(html,/Workspace temporarily unavailable/);assert.match(html,/name="agentId"[^>]+value=""/);
 const historyLink=load('app/manage/history-controls.tsx').HistoryLink({href:'/manage/receptionist/auditions?before='+first.next+'#saved-auditions',children:'Older sessions'});let prevented=false;historyLink.props.onClick({button:0,preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(navigation.at(-1),historyLink.props.href);assert.match(fs.readFileSync(sourcePath('app/manage/receptionist/auditions/page.tsx'),'utf8'),/<HistoryLink href=\{.*encodeURIComponent\(history.next\)/);
 pass('owner page protects evidence, tolerates optional prefill failure and uses draft-preserving history navigation');

 // Run the real form with retained React state, checking both definitive and
 // ambiguous failure paths against the owner route and its durable receipts.
 function formHarness(send){
  const cells=[],effects=[];let cursor=0,queued=[],dirty=false,refreshes=0;
  const react={useRef(initial){const index=cursor++;return cells[index]||=( {current:initial} );},useState(initial){const index=cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return [cells[index],value=>{const next=typeof value==='function'?value(cells[index]):value;if(!Object.is(next,cells[index])){cells[index]=next;dirty=true;}}];},useEffect(effect,deps){const index=cursor++;if(!effects[index]){effects[index]=deps;queued.push(effect);}}};
  const jsx=(type,props,key)=>({type,props,key}),module={exports:{}};
  const compiled=ts.transpileModule(fs.readFileSync(sourcePath('app/manage/receptionist/auditions/form.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
  const context=vm.createContext({exports:module.exports,module,require:name=>{if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='next/navigation')return {useRouter:()=>({refresh(){refreshes++;}})};throw new Error('Unexpected form dependency: '+name);},crypto:webcrypto,Date,Intl,FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}},fetch:send});
  new vm.Script(compiled.outputText).runInContext(context);
  const values={environment:'phone',testedAt:'2026-10-05T11:00',agentId:'agent_fictional_form',agentVersion:'',configEvidence:'Fictional form test configuration.',notes:'Observations to preserve.',naturalness:'4',interruptions:'4',pacing:'4',confirmed:'on'};
  for(const check of catalogue.checks){values[check.id+'-outcome']='not_tested';values[check.id+'-notes']='';}
  const form={values,reset(){this.resets=(this.resets||0)+1;}};
  const nodes=node=>Array.isArray(node)?node.flatMap(nodes):!node||typeof node!=='object'?[]:[node,...nodes(node.props?.children)];
  function render(){let tree;for(let i=0;i<10;i++){cursor=0;queued=[];dirty=false;tree=module.exports.default({checks:catalogue.checks,catalogueHash:catalogue.hash,savedAgentId:'agent_saved_connection'});for(const effect of queued)effect();if(!dirty)return nodes(tree);}throw new Error('Form did not settle.');}
  return {form,render,async submit(){await render().find(node=>node.type==='form').props.onSubmit({preventDefault(){},currentTarget:form});},localTestTimestamp:module.exports.localTestTimestamp,get refreshes(){return refreshes;}};
 }
 const validation=formHarness(async(url,options)=>{assert.equal(url,'/api/manage/receptionist-auditions');return route.POST(request(JSON.parse(options.body)));});
 await validation.submit();assert.equal(validation.render().find(node=>node.type==='fieldset').props.disabled,false);assert.equal(validation.form.values.notes,'Observations to preserve.');assert.equal(validation.form.resets,undefined);validation.form.values['greeting_continuity-outcome']='pass';await validation.submit();assert.equal(validation.form.resets,1);assert.equal(validation.refreshes,1);
 const bodies=[];let loseResponse=true;const uncertain=formHarness(async(url,options)=>{bodies.push(options.body);const reply=await route.POST(request(JSON.parse(options.body)));if(loseResponse){loseResponse=false;throw new Error('Connection lost after commit');}return reply;});uncertain.form.values['greeting_continuity-outcome']='pass';const beforeUncertain=count('receptionist_audition_sessions');await uncertain.submit();assert.equal(uncertain.render().find(node=>node.type==='fieldset').props.disabled,true);uncertain.form.values.notes='Ignored while snapshot is locked.';await uncertain.submit();assert.equal(bodies[0],bodies[1]);assert.equal(count('receptionist_audition_sessions'),beforeUncertain+1);assert.equal(uncertain.form.resets,1);
 for(const authStatus of [401,403]){
  const retryBodies=[];let attempt=0;const authRetry=formHarness(async(url,options)=>{retryBodies.push(options.body);attempt++;if(attempt===2)return Response.json({ok:false,error:'Sign in again.'},{status:authStatus});const reply=await route.POST(request(JSON.parse(options.body)));if(attempt===1)throw new Error('Lost reply after committed save');return reply;});
  authRetry.form.values['greeting_continuity-outcome']='pass';const countBefore=count('receptionist_audition_sessions');await authRetry.submit();await authRetry.submit();assert.equal(authRetry.render().find(node=>node.type==='fieldset').props.disabled,true);authRetry.form.values.notes='Do not change an uncertain save identity.';await authRetry.submit();assert.equal(retryBodies.length,3);assert.equal(retryBodies[0],retryBodies[1]);assert.equal(retryBodies[0],retryBodies[2]);assert.equal(count('receptionist_audition_sessions'),countBefore+1);assert.equal(authRetry.form.resets,1);
 }
 const conflictBodies=[];const conflictForm=formHarness(async(url,options)=>{conflictBodies.push(options.body);return Response.json({ok:false,error:'The checklist changed.'},{status:409});});conflictForm.form.values['greeting_continuity-outcome']='pass';conflictForm.form.values['greeting_continuity-notes']='Keep my greeting observations.';await conflictForm.submit();assert.equal(conflictForm.render().filter(node=>node.type==='button'&&node.props.type==='submit').length,0);const preserved=conflictForm.render().find(node=>node.type==='textarea'&&node.props.readOnly);assert.ok(preserved);const conflictSnapshot=JSON.parse(preserved.props.value);assert.deepEqual(conflictSnapshot.submission,JSON.parse(conflictBodies[0]));assert.equal(conflictSnapshot.submission.notes,'Observations to preserve.');assert.equal(conflictSnapshot.submission.results[0].notes,'Keep my greeting observations.');assert.equal(conflictSnapshot.checklist[0].scenario,catalogue.checks[0].scenario);let selected=false;preserved.props.onFocus({currentTarget:{select(){selected=true;}}});assert.equal(selected,true);await conflictForm.submit();assert.equal(conflictBodies.length,1);
 const oldTimezone=process.env.TZ;process.env.TZ='America/Denver';assert.equal(validation.localTestTimestamp('2026-03-08T02:30'),null);assert.equal(validation.localTestTimestamp('2026-02-30T11:00'),null);assert.equal(validation.localTestTimestamp('2026-10-05T11:00'),'2026-10-05T17:00:00.000Z');if(oldTimezone===undefined)delete process.env.TZ;else process.env.TZ=oldTimezone;
 pass('form preserves editable validation failures, freezes uncertain exact retries and rejects nonexistent local times');
 console.log(`${checks} receptionist audition groups passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
