const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const base=process.env.SCHURR_SOURCE_ROOT||root;
const dependencyRequire=createRequire(process.env.SCHURR_PACKAGE_JSON||path.join(base,'package.json'));
const ts=dependencyRequire('typescript');
const cache=new Map();
let owner={allowed:true,email:'owner@example.com'},reads=0,kit,evidence;
class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
const setupStub={clientLaunchKit:async()=>{reads++;return kit;},mutateClientSetup:async()=>{},previewClientSetup:async()=>{},rehearseClientSetup:async()=>{}};
const stubs={
 'lib/owner.ts':{getOwnerAccess:async()=>owner},
 'lib/inquiries.ts':{
  RequestError,
  privateJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}}),
  routeError:e=>Response.json({error:e.message},{status:e.status||503}),
  checkOrigin:()=>{},readJson:async()=>{},
 },
 'lib/client-setups.ts':setupStub,
 'lib/client-launch.ts':{clientLaunchStatus:async()=>{reads++;return evidence;},saveLaunchCheck:async()=>{}},
};
function load(relative){
 if(stubs[relative])return stubs[relative];
 if(cache.has(relative))return cache.get(relative);
 const selected=fs.existsSync(path.join(root,relative))?root:base;
 const source=fs.readFileSync(path.join(selected,relative),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
 assert.equal(compiled.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,relative);
 const module={exports:{}};
 const customRequire=name=>{
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('.'))return load(path.posix.join(path.posix.dirname(relative),name+'.ts'));
  return dependencyRequire(name);
 };
 new vm.Script(compiled.outputText,{filename:relative}).runInNewContext({module,exports:module.exports,require:customRequire,URL,Response,Request,console});
 cache.set(relative,module.exports);return module.exports;
}
const templates=load('lib/client-templates.ts');
const handoff=load('lib/client-handoff.ts');
const preflight=load('lib/client-preflight.ts');
const route=load('app/api/manage/client-setups/route.ts');
const profile={...templates.emptyProfile(),businessName:'PRIVATE_NAME_MARKER',contactName:'PRIVATE_OWNER_MARKER',alertEmail:'PRIVATE_ALERT_MARKER',replyEmail:'PRIVATE_REPLY_MARKER',connections:'PRIVATE_CONNECTION_MARKER',internalKnowledge:'PRIVATE_KNOWLEDGE_MARKER',priceBook:'PRIVATE_PRICE_MARKER',fieldMap:'PRIVATE_MAP_MARKER',faqs:'PRIVATE_FAQ_MARKER',services:'PRIVATE_SERVICE_MARKER',handoffInstructions:'PRIVATE_HANDOFF_MARKER',reviewLink:'PRIVATE_REVIEW_MARKER',reviewRules:'PRIVATE_RULE_MARKER',website:'PRIVATE_WEBSITE_MARKER'};
const clientId='12345678-1234-4123-8123-123456789abc';
const digest=brief=>createHash('sha256').update(JSON.stringify(brief)).digest('hex');
function setKit(offers=['calls','website','reviews','coding']){
 const brief={clientId,revision:7,offers,profile};
 kit={...brief,offers:offers.map(id=>({id})),configurationHash:digest(brief),rehearsal:{state:'completed'},tests:[{output:'PRIVATE_SAMPLE_MARKER'}]};
 evidence={revision:7,checks:[
  {id:'facts',label:'Business facts and scope approved',record:{setupRevision:7,outcome:'passed',evidence:'PRIVATE_EVIDENCE_MARKER'}},
  {id:'phone',label:'Inbound number and caller intake tested',record:{setupRevision:6,outcome:'passed'}},
  {id:'google_profile',label:'Google profile ownership and business details verified'},
  {id:'email',label:'Business sender and reply handling tested',record:{setupRevision:7,outcome:'deferred'}},
  {id:'workflow',label:'Application connections, prices and field mappings tested'},
  {id:'signoff',label:'Client launch approval recorded'},
 ]};
}
const get=(extra='')=>new Request('https://owner.example/api/manage/client-setups?id='+clientId+'&format=readme'+extra);
(async()=>{
 setKit();
 const all=handoff.clientImplementationReadme(kit,evidence);
 if(process.env.SCHURR_HANDOFF_SAMPLE)fs.writeFileSync(process.env.SCHURR_HANDOFF_SAMPLE,all);
 assert.match(all,/Brief revision: 7/);assert.match(all,/Out of date/);assert.match(all,/Deferred — include/);
 for(const marker of Object.values(profile).filter(v=>v.startsWith('PRIVATE_')))assert.ok(!all.includes(marker),marker);
 assert.ok(!all.includes('PRIVATE_SAMPLE_MARKER'));assert.ok(!all.includes('PRIVATE_EVIDENCE_MARKER'));
 assert.match(all,/generated client identity/);assert.match(all,/client-preparation.json/);assert.match(all,/scripts\/prepare-client.cjs/);assert.match(all,/Installation revision:/);assert.ok(!all.includes('Run: node preflight.mjs'));assert.ok(!all.includes('Fill client-install.json'));assert.match(all,/lib\/search-reports.ts/);assert.match(all,/not an API connection/);
 assert.match(all,/Missing required facts:.*Public business phone/);
 for(const offer of Object.values(templates.OFFERS))assert.match(all,new RegExp(offer.name.replace(/[.*+?^$()|[\]\\]/g,'\\$&')));
 setKit(['reviews']);
 const reviews=handoff.clientImplementationReadme(kit,evidence);
 assert.ok(reviews.includes('### Local SEO & Google reviews'));assert.ok(!reviews.includes('### AI receptionist & lead response'));
 assert.ok(!reviews.includes('### Websites & chatbots'));assert.ok(!reviews.includes('### Custom software & workflow automation'));
 assert.ok(!reviews.includes('Receptionist brief:'));assert.ok(!reviews.includes('Inbound number and caller intake tested'));
 assert.throws(()=>handoff.clientImplementationReadme(kit,{...evidence,revision:8}),/brief changed/);
 console.log('PASS selected services, manifest-derived missing facts, stale/deferred statuses and complete private-field omission');
 reads=0;owner=null;assert.equal((await route.GET(get())).status,401);
 owner={allowed:false,email:'wrong@example.com'};assert.equal((await route.GET(get())).status,403);assert.equal(reads,0);
 owner={allowed:true,email:'owner@example.com'};
 const response=await route.GET(get('&revision=7'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition'),/client-implementation-.*-r7\.md/);assert.match(await response.text(),/Brief revision: 7/);
 assert.equal((await route.GET(get('&revision=6'))).status,409);evidence.revision=8;assert.equal((await route.GET(get())).status,409);evidence.revision=7;
 assert.equal((await route.GET(new Request('https://owner.example/api/manage/client-setups?id='+clientId+'&format=install'))).status,410);
 const setup=await route.GET(new Request('https://owner.example/api/manage/client-setups?id='+clientId));
 assert.match(setup.headers.get('content-disposition'),/client-setup-.*\.json/);
 const setupJson=await setup.json();assert.equal(setupJson.profile.internalKnowledge,'PRIVATE_KNOWLEDGE_MARKER');assert.equal(setupJson.revision,7);
 console.log('PASS owner authorization before reads, private download headers, requested revision and export race rejection; existing private JSON unchanged');
 setKit(['calls']);
 const install=await preflight.clientInstallFile(clientId);
 install.brief.profile={...templates.emptyProfile(),businessName:'Example Client',website:'https://client.example.com',publicPhone:'+13035550123'};
 install.configurationHash=digest(install.brief);
 Object.assign(install.target,{origin:'https://client.example.com',deploymentRef:'client-site-001',databaseRef:'client-db-001',ownerAccount:'owner@client.example.com',identityReviewed:true});
 const scratch=fs.mkdtempSync('/tmp/schurr-clientkit-');
 try{
  const runner=path.join(scratch,'preflight.mjs'),file=path.join(scratch,'client-install.json');
  fs.writeFileSync(runner,preflight.clientPreflightRunner());
  const execute=v=>{fs.writeFileSync(file,JSON.stringify(v));return spawnSync(process.execPath,[runner,file],{encoding:'utf8'});};
  assert.equal(execute(install).status,0);
  for(const mutate of [
   v=>{v.target.scope.liveTransfer='prepare';v.target.transferNumber='+13035550234';},
   v=>{v.brief.profile.businessName='  SCHURR AUTOMATIONS  ';},
   v=>{v.brief.profile.publicPhone='(985) 771-0552';},
   v=>{v.brief.profile.publicPhone='+1 985 232 8337';},
   v=>{v.brief.profile.website='https://notify.schurrautomations.com';},
   v=>{v.target.scope.voice='prepare';v.target.voiceAgentId='agent_client';v.target.inboundNumber='+13035550234';v.target.scope.liveTransfer='prepare';v.target.transferNumber='+19852328337';},
  ]){
   const v=JSON.parse(JSON.stringify(install));mutate(v);v.configurationHash=digest(v.brief);const result=execute(v);assert.equal(result.status,1,result.stdout);
  }
  for(const capability of ['nativeBooking','externalCalendar','sms']){
   const v=JSON.parse(JSON.stringify(install));v.target.scope[capability]='prepare';if(capability==='externalCalendar')v.target.calendarRef='client-calendar';assert.equal(execute(v).status,0,capability);
  }
  const validVoice=JSON.parse(JSON.stringify(install));Object.assign(validVoice.target,{voiceAgentId:'agent_client',inboundNumber:'+13035550234',transferNumber:'+13035550345'});validVoice.target.scope.voice='prepare';validVoice.target.scope.liveTransfer='prepare';assert.equal(execute(validVoice).status,0);
 }finally{fs.rmSync(scratch,{recursive:true,force:true});}
 console.log('PASS actual standalone checker: call-transfer dependency, copied public identities, and independent booking/calendar/SMS scopes');
 console.log('3 client handoff groups passed. No network calls or provider actions.');
})().catch(e=>{console.error(e);process.exit(1);});
