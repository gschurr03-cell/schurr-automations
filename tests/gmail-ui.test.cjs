const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
let active,requests=[],navigations=[],responder,workspaceReads=0,ownerContext;
const jsx=(type,props,key)=>({type,props:props||{},key});
const react={useState(initial){const h=active,i=h.index++;if(!(i in h.hooks))h.hooks[i]=typeof initial==='function'?initial():initial;return[h.hooks[i],value=>{h.hooks[i]=typeof value==='function'?value(h.hooks[i]):value;}];},useRef(initial){const h=active,i=h.index++;return h.hooks[i]||(h.hooks[i]={current:initial});}};
const base={setup:{configured:true,expectedEmail:'gavin@schurrautomations.com',redirectUri:'https://schurrautomations.com/api/manage/gmail/callback',missing:[],clientId:'fixture.apps.googleusercontent.com',configRevision:2,connection:{email:'gavin@schurrautomations.com',status:'connected',revision:3,connectedAt:'2026-10-02T12:00:00Z',updatedAt:'2026-10-02T12:00:00Z',lastSyncAt:'',lastError:''}},sender:{sender_name:'Gavin Schurr',sender_email:'gavin@schurrautomations.com',postal_address:'Approved business mailing address',revision:4},approved:[{id:'12345678-1234-4234-9234-123456789abc',revision:5,recipient:'business@example.com',subject:'An approved message',body:'Exact approved body\nApproved footer',company:'Example Company'}],outbox:[],replies:[],page:1,hasMore:true,runnerConfigured:false};
const copy=value=>JSON.parse(JSON.stringify(value));
const shell=props=>jsx('shell',props),denied=props=>jsx('denied',props),unavailable=props=>jsx('unavailable',props);
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file);
 const module={exports:{}};
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file+' parses');
 vm.runInNewContext(result.outputText,{module,exports:module.exports,require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:id==='../crm-ui'?{CRMShell:shell,crmContext:async()=>ownerContext,AccessDenied:denied,Unavailable:unavailable}:id==='@/lib/gmail-workspace'?{gmailWorkspace:async page=>{workspaceReads++;return {...copy(base),page};}}:id==='./workspace'?load('app/manage/mail/workspace.tsx'):require(id),URL,Date,Set,Intl,console,AbortSignal,FormData:class{constructor(form){this.fields={...form.fields};}get(key){return this.fields[key]??null;}},window:{location:{assign(value){navigations.push(value);}}},navigator:{clipboard:{writeText:async()=>{}}},fetch:async(url,options={})=>{const request={url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null};requests.push(request);return responder(request);}});
 cache.set(file,module.exports);return module.exports;
}
function mount(Component,props){const h={hooks:[],index:0,props,tree:null,render(){h.index=0;active=h;h.tree=Component(h.props);return h.tree;}};h.render();return h;}
function all(node){if(node==null||typeof node==='boolean')return[];if(Array.isArray(node))return node.flatMap(all);if(typeof node!=='object')return[node];return[node,...all(node.props.children)];}
const text=node=>all(node).filter(x=>typeof x==='string'||typeof x==='number').join(' ');
function find(h,predicate){const node=all(h.tree).find(n=>n&&typeof n==='object'&&predicate(n));assert.ok(node,'Missing control');return node;}
const button=(h,label)=>find(h,n=>n.type==='button'&&text(n)===label);
const checkbox=(h,label)=>find(h,n=>n.type==='label'&&text(n).includes(label)).props.children.find(n=>n&&n.type==='input');
const click=async(h,label)=>{await button(h,label).props.onClick();h.render();};
const ok=data=>Response.json({ok:true,data});
function reset(data=base){requests=[];navigations=[];responder=async()=>ok(copy(data));return mount(load('app/manage/mail/workspace.tsx').default,{initial:copy(data),timezone:'America/Denver'});}
function confirm(h){checkbox(h,'I reviewed this exact message').props.onChange({target:{checked:true}});h.render();}

(async()=>{
 let checks=0;const pass=()=>checks++;
 let h=reset();assert.equal(requests.length,0);assert.equal(button(h,'Send this email').props.disabled,true);await click(h,'Send this email');assert.equal(requests.length,0);pass();
 await click(h,'Refresh saved status');assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');assert.ok(requests[0].url.endsWith('?page=1'));assert.equal(button(h,'Send this email').props.disabled,true);pass();
 await click(h,'Check for replies now');assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.deepEqual(requests.find(r=>r.method==='POST').body,{action:'sync'});pass();
 h=reset();confirm(h);assert.equal(button(h,'Send this email').props.disabled,false);
 responder=async req=>{if(req.method==='POST')throw Error('Connection lost');return ok(copy(base));};
 await click(h,'Send this email');assert.equal(requests.length,1);assert.deepEqual(requests[0].body,{action:'send',id:base.approved[0].id,revision:5,senderRevision:4,connectionRevision:3,confirmSend:true});assert.match(text(h.tree),/Do not send this draft again/);assert.ok(!all(h.tree).some(n=>n?.type==='button'&&text(n)==='Send this email'));
 await click(h,'Refresh saved status');assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.match(text(h.tree),/unresolved sending request/);pass();
 const record={id:'aaaaaaaa-1234-4234-9234-123456789abc',draft_id:base.approved[0].id,draft_revision:5,recipient:'business@example.com',subject:'An approved message',status:'uncertain',first_attempt_at:Date.now(),last_error:'Result unknown',created_at:'2026-10-02T12:30:00Z'};
 h=reset({...copy(base),outbox:[record]});await click(h,'Check Gmail result');assert.deepEqual(requests[0].body,{action:'reconcile',id:record.id});assert.ok(requests.every(r=>r.body?.action!=='send'));pass();
 h=reset({...copy(base),outbox:[{...record,status:'cancelled',first_attempt_at:0}]});assert.equal(button(h,'Send this email').props.disabled,true);confirm(h);assert.equal(button(h,'Send this email').props.disabled,false);pass();
 h=reset();confirm(h);responder=async()=>ok({...copy(base),outbox:[{...record,status:'accepted'}]});await click(h,'Send this email');assert.match(text(h.tree),/Submitted to Gmail/);assert.match(text(h.tree),/does not confirm delivery/);assert.equal(requests.length,1);pass();
 h=reset();confirm(h);responder=async()=>ok({...copy(base),approved:[{...base.approved[0],revision:6,body:'New approved content'}]});await click(h,'Refresh saved status');assert.equal(button(h,'Send this email').props.disabled,true);assert.match(text(h.tree),/New approved content/);pass();
 h=reset({...copy(base),setup:{...base.setup,connection:{...base.setup.connection,email:'wrong@example.com'}}});confirm(h);await click(h,'Send this email');assert.equal(requests.length,0);assert.match(text(h.tree),/does not match/);pass();
 h=reset();const form=find(h,n=>n.type==='form'),secretInput={value:'fixture-secret-only'},fixtureForm={fields:{clientId:'next.apps.googleusercontent.com',clientSecret:'fixture-secret-only',configRevision:2},elements:{namedItem:()=>secretInput}};
 responder=async req=>{assert.equal(secretInput.value,'');return ok(copy(base));};await form.props.onSubmit({preventDefault(){},currentTarget:fixtureForm});h.render();assert.equal(requests[0].body.action,'configure');assert.equal(requests[0].body.configRevision,2);assert.equal(requests[0].body.clientSecret,'fixture-secret-only');assert.ok(!text(h.tree).includes('fixture-secret-only'));pass();
 h=reset();await click(h,'Confirm disconnect');assert.equal(requests.length,0);checkbox(h,'I want to stop').props.onChange({target:{checked:true}});h.render();await click(h,'Confirm disconnect');assert.deepEqual(requests[0].body,{action:'disconnect',confirmation:'DISCONNECT'});pass();
 h=reset();responder=async()=>Response.json({ok:true,url:'https://accounts.google.com.evil.example/o/oauth2/v2/auth'});await click(h,'Reconnect Gmail');assert.equal(navigations.length,0);assert.match(text(h.tree),/could not be verified/);
 responder=async()=>Response.json({ok:true,url:'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri='+encodeURIComponent(base.setup.redirectUri)});await click(h,'Reconnect Gmail');assert.equal(navigations.length,1);pass();
 h=reset({...copy(base),runnerConfigured:true});assert.match(text(h.tree),/does not confirm that a schedule is connected or running/);await click(h,'Next page');assert.equal(requests[0].method,'GET');assert.ok(requests[0].url.endsWith('?page=2'));pass();
 const Page=load('app/manage/mail/page.tsx').default;workspaceReads=0;ownerContext={access:{allowed:false},settings:null};let page=await Page();assert.equal(workspaceReads,0);assert.equal(page.props.children.type,denied);ownerContext={access:{allowed:true},settings:null};page=await Page();assert.equal(workspaceReads,0);assert.equal(page.props.children.type,unavailable);ownerContext={access:{allowed:true},settings:{timezone:'America/Denver'}};page=await Page({searchParams:Promise.resolve({page:'2',gmail:'connected'})});assert.equal(workspaceReads,1);assert.equal(page.props.children.props.initial.page,2);assert.equal(page.props.children.props.callbackResult,'connected');pass();
 const Workspace=load('app/manage/mail/workspace.tsx').default;
 h=mount(Workspace,{initial:copy(base),callbackResult:'connected'});assert.match(text(h.tree),/Business Gmail connection confirmed/);
 h=mount(Workspace,{initial:{...copy(base),setup:{...base.setup,connection:null}},callbackResult:'connected'});assert.match(text(h.tree),/saved connection is not confirmed/);assert.ok(!text(h.tree).includes('Business Gmail connection confirmed'));
 h=mount(Workspace,{initial:copy(base),callbackResult:'failed'});assert.match(text(h.tree),/Google authorization did not finish/);
 page=await Page({searchParams:Promise.resolve({gmail:'untrusted'})});assert.equal(page.props.children.props.callbackResult,undefined);pass();
 h=reset({...copy(base),replies:[{id:'reply-fixture',sender_email:'business@example.com',subject:'Out of office',body:'I am away.',kind:'automated',received_at:'2026-10-02T12:00:00Z'}]});assert.match(text(h.tree),/Automatic response/);assert.match(text(h.tree),/Internal OAuth audience/);pass();
 h=mount(Workspace,{initial:{...copy(base),approved:[...copy(base.approved),{...base.approved[0],id:'other',subject:'UNRELATED APPROVED EMAIL'}]},embedded:true,selectedDraft:base.approved[0].id,onSendStarted:()=>{navigations.push('attempt-locked');}});requests=[];navigations=[];assert.ok(!text(h.tree).includes('UNRELATED APPROVED EMAIL'));assert.ok(!text(h.tree).includes('Google OAuth setup'));confirm(h);responder=async req=>{if(req.method==='POST'){assert.deepEqual(navigations,['attempt-locked']);return ok(copy(base));}assert.ok(req.url.includes('&draft='+base.approved[0].id));return ok({...copy(base),approved:[],outbox:[{...record,status:'accepted'}]});};await click(h,'Send this email');assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.match(text(h.tree),/Submitted to Gmail/);assert.ok(!all(h.tree).some(n=>n?.type==='button'&&text(n)==='Send this email'));pass();
 const source=fs.readFileSync(path.join(root,'app/manage/mail/workspace.tsx'),'utf8');assert.ok(!source.includes('localStorage')&&!source.includes('sessionStorage')&&!source.includes('dangerouslySetInnerHTML'));pass();
 console.log(`PASS ${checks} Gmail UI groups: explicit reviewed send, exact revisions, uncertain-response hold, separate read/sync/reconcile, zero-attempt review, credential clearing, account/redirect guards, disconnect confirmation, pagination and owner-only reads.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
