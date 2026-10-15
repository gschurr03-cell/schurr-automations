const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { webcrypto } = require('node:crypto');

// Exercise the real route handlers, platform owner guard, body/origin helpers,
// request policy, and server page. Only provider/database boundaries are mocked.
const root = process.env.SCHURR_ROOT || path.resolve(__dirname, '..');
const uiRoot = process.env.SCHURR_GMAIL_UI_ROOT || root;
const dependencyRequire = createRequire(path.join(root, 'package.json'));
const ts = dependencyRequire('typescript');
const { renderToStaticMarkup } = dependencyRequire('react-dom/server');
const runtime = { OWNER_EMAIL: 'owner@example.com' };
const origin = 'https://schurrautomations.com';
let requestHeaders = new Headers();
let settingsUnavailable = false;
let callbackFailure = false;
let workspaceFailure = false;
let snapshotPage;
const calls = [];
const logs = [];
const snapshot = {
  setup: {configured:true, expectedEmail:'gavin@schurrautomations.com', redirectUri:origin+'/api/manage/gmail/callback', missing:[], clientId:'public-client.apps.googleusercontent.com', configRevision:1,
    connection:{email:'gavin@schurrautomations.com',status:'connected',revision:7,connectedAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z',lastSyncAt:'',lastError:''}},
  sender:{sender_name:'Owner',sender_email:'gavin@schurrautomations.com',postal_address:'1 Test Street',revision:3},
  approved:[{id:'11111111-1111-4111-8111-111111111111',revision:2,recipient:'private@example.net',subject:'<script>alert(1)</script>',body:'<img src=x onerror=alert(2)>\nContact footer',company:'</script><script>alert(3)</script>'}],
  outbox:[{id:'receipt-1',draft_id:'other-draft',recipient:'private@example.net',subject:'<script>alert(4)</script>',status:'accepted',last_error:'',created_at:'2026-10-01T12:00:00Z'}],
  replies:[{id:'reply-1',sender_email:'private@example.net',subject:'<script>alert(5)</script>',body:'<img src=x onerror=alert(6)>',kind:'reply',received_at:'2026-10-01T13:00:00Z'}],
  page:1,hasMore:false,runnerConfigured:false,
};
const modules = new Map();
function load(relative) {
  if (!fs.existsSync(path.join(root,relative)) && fs.existsSync(path.join(root,relative+'x'))) relative += 'x';
  if (relative.startsWith('app/manage/mail/') && !fs.existsSync(path.join(uiRoot,relative)) && fs.existsSync(path.join(uiRoot,relative+'x'))) relative += 'x';
  if (modules.has(relative)) return modules.get(relative);
  const base = relative.startsWith('app/manage/mail/') ? uiRoot : root;
  const source = fs.readFileSync(path.join(base,relative),'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
  const module = {exports:{}};
  function requireModule(name) {
    if(name.endsWith('.css'))return {};
    if(name==='cloudflare:workers')return {env:runtime};
    if(name==='next/headers')return {headers:async()=>requestHeaders};
    if(name==='next/navigation')return {redirect:location=>{throw Error(`SIGN_IN_REDIRECT:${location}`);},useRouter:()=>({refresh(){}})};
    if(name==='@/lib/crm')return {getSettings:async()=>{if(settingsUnavailable)throw Error('private database detail');return {businessName:'Schurr Automations',ownerName:'Owner',timezone:'America/Denver'};},STAGES:{},SOURCES:{},SERVICE_NAMES:{}};
    if(name==='@/lib/gmail-workspace')return {gmailWorkspace:async page=>{calls.push('snapshot');snapshotPage=page;if(workspaceFailure)throw Error('private snapshot detail');return snapshot;}};
    if(name==='@/lib/gmail-connection')return {
      configureGmail:async input=>{calls.push(['configure',input]);return {configured:true};},
      startGmailConnect:async (_request,email)=>{calls.push(['connect',email]);return {url:'https://accounts.google.com/o/oauth2/v2/auth?state=random',cookie:'__Host-schurr-gmail=browser-secret; Path=/; HttpOnly; Secure; SameSite=Lax'};},
      disconnectGmail:async()=>{calls.push('disconnect');},
      completeGmailConnect:async (_request,email)=>{calls.push(['callback',email]);if(callbackFailure)throw Error('TOKEN_SUPER_SECRET provider description');},
      clearGmailCookie:()=> '__Host-schurr-gmail=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    };
    if(name==='@/lib/gmail-send')return {
      sendApprovedOutreach:async input=>{calls.push(['send',input]);return {status:'accepted'};},
      reconcileGmailSend:async id=>{calls.push(['reconcile',id]);return {status:'uncertain'};},
    };
    if(name==='@/lib/gmail-queue')return {previewQueue:async ids=>{calls.push(['preview',ids]);return {drafts:[]};},confirmQueue:async(p,email)=>{calls.push(['confirm',p,email]);return {id:p.requestId};},cancelQueue:async id=>{calls.push(['cancel',id]);return {id};},queueSnapshot:async()=>{calls.push('queueSnapshot');return {queues:[],items:[]};},runQueue:async()=>{calls.push('runQueue');return {processed:5,privateMessage:'never expose'};}};
    if(name==='@/lib/gmail-replies')return {syncGmailReplies:async()=>{calls.push('sync');return {checked:10,imported:2,remaining:3,privateMessage:'must-not-escape'};}};
    if(name.startsWith('@/'))return load(`${name.slice(2)}.ts`);
    if(name.startsWith('.'))return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative),`${name}.ts`)));
    return dependencyRequire(name);
  }
  const context = vm.createContext({module,exports:module.exports,require:requireModule,Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortSignal,FormData,btoa,atob,crypto:webcrypto,Date,Intl,Map,Set,console:{error:(...args)=>logs.push(args.join(' ')),log(){},warn(){}}});
  new vm.Script(compiled.outputText,{filename:relative}).runInContext(context);
  modules.set(relative,module.exports);
  return module.exports;
}
function identity(email='owner@example.com',userId='owner-id') {
  requestHeaders=new Headers({'oai-authenticated-user-id':userId,'oai-authenticated-user-email':email});
}
function request(route,method='GET',body,headers={}) {
  const options={method,headers:{...(method==='POST'?{'content-type':'application/json',origin}:{}),...headers}};
  if(body!==undefined)options.body=typeof body==='string'?body:JSON.stringify(body);
  return new Request(origin+route,options);
}
function reset(){calls.length=0;logs.length=0;}
function noWork(){assert.deepEqual(calls,[]);}
async function status(response,expected){assert.equal(response.status,expected);assert.match(response.headers.get('Cache-Control'),/no-store/);return response.json();}

(async()=>{
  let checks=0;
  const pass=description=>{checks++;process.stdout.write(`PASS ${description}\n`);};
  const mailbox=load('app/api/manage/gmail/route.ts');
  const callback=load('app/api/manage/gmail/callback/route.ts');
  const runner=load('app/api/gmail/sync/route.ts');
  const policy=load('lib/request-policy.ts');
  const page=load('app/manage/mail/page.tsx');

  for(const [headers,expected] of [
    [{},401],
    [{'oai-authenticated-user-id':'owner-id'},401],
    [{'oai-authenticated-user-email':'owner@example.com'},401],
    [{'oai-authenticated-user-id':'stranger-id','oai-authenticated-user-email':'stranger@example.com'},403],
  ]){
    requestHeaders=new Headers(headers);reset();
    await status(await mailbox.GET(request('/api/manage/gmail')),expected);
    for(const action of ['configure','connect','disconnect','send','reconcile','sync'])await status(await mailbox.POST(request('/api/manage/gmail','POST',{action,confirmation:'DISCONNECT'})),expected);
    noWork();
  }
  identity();runtime.OWNER_EMAIL='';reset();
  await status(await mailbox.GET(request('/api/manage/gmail')),403);
  await status(await mailbox.POST(request('/api/manage/gmail','POST',{action:'connect'})),403);
  noWork();runtime.OWNER_EMAIL='owner@example.com';
  pass('anonymous, partial identity, non-owner and unconfigured owner requests never reach private reads or provider actions');

  identity();
  for(const headers of [{origin:'https://evil.example'},{origin:''},{origin,'sec-fetch-site':'cross-site'}]){
    reset();await status(await mailbox.POST(request('/api/manage/gmail','POST',{action:'send',confirmSend:true},headers)),403);noWork();
  }
  for(const [body,headers,expected] of [
    ['x'.repeat(16385),{},413],['[]',{},400],['null',{},400],['{',{},400],['{}',{'content-type':'text/plain'},415],
    [{action:'disconnect'}, {},400],[{action:'invalid'}, {},400],
  ]){reset();await status(await mailbox.POST(request('/api/manage/gmail','POST',body,headers)),expected);noWork();}
  pass('cross-origin, malformed, oversized and unconfirmed mutations fail before action delegation');

  reset();const read=await status(await mailbox.GET(request('/api/manage/gmail?page=2')),200);
  assert.equal(read.data.approved[0].recipient,'private@example.net');assert.equal(snapshotPage,2);assert.deepEqual(calls,['snapshot']);
  reset();const startResponse=await mailbox.POST(request('/api/manage/gmail','POST',{action:'connect'}));
  const start=await status(startResponse,200);assert.match(start.url,/^https:\/\/accounts\.google\.com\//);assert.match(startResponse.headers.get('Set-Cookie'),/__Host-schurr-gmail=.*HttpOnly; Secure; SameSite=Lax/);
  assert.deepEqual(calls,[['connect','owner@example.com']]);
  const send={action:'send',id:'draft-1',revision:4,senderRevision:3,connectionRevision:7,confirmSend:true};
  reset();await status(await mailbox.POST(request('/api/manage/gmail','POST',send)),200);
  assert.equal(JSON.stringify(calls[0]),JSON.stringify(['send',send]));assert.deepEqual(calls.slice(1),['snapshot']);
  reset();await status(await mailbox.POST(request('/api/manage/gmail','POST',{action:'disconnect',confirmation:'DISCONNECT'})),200);assert.deepEqual(calls,['disconnect','snapshot']);
  reset();await status(await mailbox.POST(request('/api/manage/gmail','POST',{action:'sync'})),200);assert.deepEqual(calls,['sync','snapshot']);
  pass('authorized reads do not send, explicit actions delegate once, and Google start binds the authenticated owner');

  const callbackUrl='/api/manage/gmail/callback?code=CODE_SUPER_SECRET&state=STATE_SUPER_SECRET&error_description=TOKEN_SUPER_SECRET';
  for(const [auth,configured,fail,expected,callsExpected] of [
    [false,true,false,'failed',0],['stranger@example.com',true,false,'failed',0],['owner@example.com',false,false,'failed',0],
    ['owner@example.com',true,true,'failed',1],['owner@example.com',true,false,'connected',1],
  ]){
    requestHeaders=new Headers();if(auth)identity(auth);runtime.OWNER_EMAIL=configured?'owner@example.com':'';callbackFailure=fail;reset();
    const response=await callback.GET(request(callbackUrl));
    assert.equal(response.status,303);assert.equal(response.headers.get('Location'),`/manage/mail?gmail=${expected}`);
    assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
    assert.equal(response.headers.get('Set-Cookie'),'__Host-schurr-gmail=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    assert.equal(await response.text(),'');assert.equal(calls.length,callsExpected);
    assert.ok(!JSON.stringify([...response.headers]).includes('SUPER_SECRET'));assert.deepEqual(logs,[]);
  }
  runtime.OWNER_EMAIL='owner@example.com';callbackFailure=false;
  pass('OAuth callback requires owner access, always clears browser state, and never reflects or logs provider secrets');

  for(const [route,method,expected] of [
    ['/api/manage/gmail','GET',null],['/api/manage/gmail','HEAD',null],['/api/manage/gmail','POST',null],['/api/manage/gmail','DELETE',405],
    ['/api/manage/gmail/callback','GET',null],['/api/manage/gmail/callback','HEAD',405],['/api/manage/gmail/callback','POST',405],['/api/manage/gmail/callback','PUT',405],
    ['/api/gmail/sync','POST',null],['/api/gmail/sync','GET',405],['/api/gmail/sync','HEAD',405],['/manage/mail','POST',405],
  ])assert.equal(policy.rejectUnsupportedRequest(request(route,method))?.status||null,expected,`${method} ${route}`);
  for(const route of ['/api/manage/gmail','/api/gmail/sync']){
    assert.equal(policy.rejectUnsupportedRequest(request(route,'POST','{}',{'content-type':'text/plain'})).status,415);
    assert.equal(policy.rejectUnsupportedRequest(request(route,'POST','{}',{'next-action':'forged'})).status,403);
  }
  for(const route of ['/api/manage/gmail','/api/manage/gmail/callback','/manage/mail']){
    const secured=policy.secureResponse(request(route),new Response('private',{headers:{'Cache-Control':'public, max-age=3600'}}));
    assert.match(secured.headers.get('Cache-Control'),/no-store/);assert.equal(secured.headers.get('Referrer-Policy'),'no-referrer');assert.equal(secured.headers.get('X-Frame-Options'),'DENY');
    assert.equal(secured.headers.get('X-Robots-Tag'),'noindex, nofollow');
  }
  pass('Worker policy limits the callback to GET and keeps owner mailbox responses private and unframeable');

  const runnerSecret='runner-secret-with-more-than-32-characters';
  for(const secret of [undefined,'short']){runtime.GMAIL_SYNC_RUNNER_SECRET=secret;reset();await status(await runner.POST(request('/api/gmail/sync','POST',{})),503);noWork();}
  runtime.GMAIL_SYNC_RUNNER_SECRET=runnerSecret;
  for(const authorization of ['',`Basic ${runnerSecret}`,'Bearer wrong',`Bearer ${'x'.repeat(1001)}`]){reset();await status(await runner.POST(request('/api/gmail/sync','POST',{}, {authorization})),401);noWork();}
  const bearer={authorization:`Bearer ${runnerSecret}`};
  for(const [body,expected] of [[{action:'send'},400],['[]',400],['null',400],['{',400],[' '.repeat(257),413]]){reset();await status(await runner.POST(request('/api/gmail/sync','POST',body,bearer)),expected);noWork();}
  reset();const result=await status(await runner.POST(request('/api/gmail/sync','POST',{},bearer)),200);
  assert.deepEqual(result,{ok:true,checked:10,imported:2,remaining:3});assert.deepEqual(calls,['sync']);
  pass('background runner requires a strong configured credential and bounded empty body, invokes no sending, and returns counts only');

  requestHeaders=new Headers();reset();await assert.rejects(()=>page.default(),/SIGN_IN_REDIRECT:/);noWork();
  identity('stranger@example.com');let html=renderToStaticMarkup(await page.default());noWork();assert.ok(!html.includes('private@example.net'));
  identity();runtime.OWNER_EMAIL='';html=renderToStaticMarkup(await page.default());noWork();assert.ok(!html.includes('private@example.net'));runtime.OWNER_EMAIL='owner@example.com';
  settingsUnavailable=true;html=renderToStaticMarkup(await page.default());noWork();assert.ok(html.includes('temporarily unavailable'));settingsUnavailable=false;
  pass('mailbox server page denies anonymous and non-owner reads and stops safely when CRM settings are unavailable');

  reset();html=renderToStaticMarkup(await page.default({searchParams:Promise.resolve({page:'2'})}));
  assert.deepEqual(calls,['snapshot']);assert.equal(snapshotPage,2);assert.ok(html.includes('private@example.net'));assert.ok(!html.includes('Submitted to Gmail'));assert.ok(!html.includes('Google OAuth setup'));assert.ok(!html.includes('Approved messages'));
  for(const literal of ['<script>alert(1)</script>','<img src=x onerror=alert(2)>','<script>alert(3)</script>','<script>alert(4)</script>','<script>alert(5)</script>','<img src=x onerror=alert(6)>'])assert.ok(!html.includes(literal),literal);
  assert.ok(html.includes('&lt;script&gt;alert(5)&lt;/script&gt;'));assert.ok(html.includes('&lt;img src=x onerror=alert(6)&gt;'));
  workspaceFailure=true;reset();html=renderToStaticMarkup(await page.default());assert.ok(html.includes('could not load'));assert.ok(!html.includes('private snapshot detail'));workspaceFailure=false;
  pass('mailbox render escapes imported message text, does no provider work, and hides internal read failures');

  const queueRoute=load('app/api/manage/gmail/queue/route.ts'),queueRunner=load('app/api/gmail/queue/route.ts');
  requestHeaders=new Headers();reset();await status(await queueRoute.GET(),401);await status(await queueRoute.POST(request('/api/manage/gmail/queue','POST',{action:'run'})),401);noWork();
  identity('stranger@example.com');await status(await queueRoute.GET(),403);noWork();identity();reset();await status(await queueRoute.POST(request('/api/manage/gmail/queue','POST',{action:'run'},{origin:'https://attacker.example'})),403);noWork();
  assert.equal(policy.rejectUnsupportedRequest(request('/api/manage/gmail/queue','POST',{action:'run'})),null);assert.equal(policy.rejectUnsupportedRequest(request('/api/gmail/queue','POST',{})),null);assert.equal(policy.rejectUnsupportedRequest(request('/api/gmail/queue','GET')).status,405);
  reset();await status(await queueRoute.GET(),200);assert.deepEqual(calls,['queueSnapshot']);reset();await status(await queueRoute.POST(request('/api/manage/gmail/queue','POST',{action:'run'})),200);assert.deepEqual(calls,['runQueue']);
  reset();await status(await queueRunner.POST(request('/api/gmail/queue','POST',{})),503);noWork();runtime.GMAIL_QUEUE_RUNNER_SECRET=runnerSecret;await status(await queueRunner.POST(request('/api/gmail/queue','POST',{})),401);noWork();await status(await queueRunner.POST(request('/api/gmail/queue','POST',{recipient:'arbitrary@example.com'},bearer)),400);noWork();const queueResult=await status(await queueRunner.POST(request('/api/gmail/queue','POST',{},bearer)),200);assert.deepEqual(queueResult,{ok:true,processed:5});assert.deepEqual(calls,['runQueue']);pass('queue routes require owner/origin or scoped runner credentials, bounded bodies and registered request methods');
  process.stdout.write(`\n${checks} Gmail route, policy and rendering regression groups passed. Provider OAuth/send semantics are tested separately.\n`);
})().catch(error=>{console.error(error);process.exitCode=1;});
