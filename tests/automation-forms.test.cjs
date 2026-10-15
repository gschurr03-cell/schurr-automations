const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const dependencyRequire = createRequire(process.env.SCHURR_PACKAGE_JSON || path.join(process.cwd(), 'package.json'));
const ts = dependencyRequire('typescript');
const root = path.resolve(process.env.SCHURR_SOURCE_ROOT || path.join(__dirname, '..'));
const overlay = process.env.SCHURR_FORMS_PATCH_ROOT;
const sourcePath = relative => overlay && fs.existsSync(path.join(overlay, relative)) ? path.join(overlay, relative) : path.join(root, relative);
const runtime = { INQUIRY_SIGNING_SECRET: 'test-only-'.repeat(8), OWNER_EMAIL: 'owner@example.com' };
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
let activeKey='test-provider-key';let sends=[];let providerBehavior='ok';let connectionHook=null;
let beforeFirst=null;let providerEmailId='12345678-1234-4234-8234-123456789abc';
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
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
  const source = fs.readFileSync(sourcePath(relative), 'utf8');
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
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, ReadableStream, Date, Intl, AbortSignal, fetch:async()=>{sends.push('blocked provider request');throw new Error('Unexpected provider call');}, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

const desk=load('lib/automation-desk.ts'),routes=load('app/api/manage/automations/route.ts');
const request=data=>new Request('https://schurrautomations.com/api/manage/automations',{method:'POST',headers:{Origin:'https://schurrautomations.com','Content-Type':'application/json'},body:JSON.stringify(data)});
function elements(node){if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object')return [];return [node,...elements(node.props?.children)];}
const named=(tree,name)=>elements(tree).find(n=>n.props?.name===name);
const button=(tree,label)=>elements(tree).find(n=>n.type==='button'&&n.props.children===label);
const form=tree=>elements(tree).find(n=>n.type==='form');
const fieldset=tree=>elements(tree).find(n=>n.type==='fieldset');
function fakeForm(values={}){return {values:{...values},resets:0,reset(){this.resets++;this.values={};}};}
const event=currentTarget=>({preventDefault(){},currentTarget});

// Handler/state verification with persistent hook cells, real API/SQLite, and
// explicit fake native forms. This does not replace browser reconciliation QA.
function harness(component,initialProps){
 const cells=[],effects=[],requests=[];let cursor=0,changed=false,props=initialProps,queued=[],gate=null,refreshes=0;
 const react={
  useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],value=>{const next=typeof value==='function'?value(cells[i]):value;if(!Object.is(next,cells[i])){cells[i]=next;changed=true;}}];},
  useRef(initial){const i=cursor++;return cells[i]||={current:initial};},
  useEffect(effect,deps){const i=cursor++,prior=effects[i];if(!prior||deps.some((value,j)=>!Object.is(value,prior[j]))){effects[i]=deps;queued.push(effect);}},
 };
 const jsx=(type,props,key)=>({type,props,key}),module={exports:{}};
 const compiled=ts.transpileModule(fs.readFileSync(sourcePath('app/manage/automations/workspace.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 const context=vm.createContext({module,exports:module.exports,require:name=>{
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='next/navigation')return {useRouter:()=>({refresh(){refreshes++;}})};
  if(name==='@/lib/client-templates')return load('lib/client-templates.ts');
  throw new Error('Unexpected component dependency: '+name);
 },FormData:class{constructor(element){this.values={...element.values};}get(name){return this.values[name]??null;}},File,crypto:webcrypto,Intl,
 // Any accidental full reload is a test failure, not a harmless mock.
 window:{location:{reload(){throw new Error('Full reload would discard sibling drafts');}}},
 fetch:async(url,options)=>{assert.equal(url,'/api/manage/automations');assert.equal(options.method,'POST');const body=JSON.parse(options.body),entry={body};requests.push(entry);if(gate)await gate;const response=await routes.POST(request(body));entry.status=response.status;return response;}});
 new vm.Script(compiled.outputText,{filename:'app/manage/automations/workspace.tsx'}).runInContext(context);
 return {requests,get refreshes(){return refreshes;},hold(promise){gate=promise;},render(next=props){props=next;let tree;for(let i=0;i<10;i++){cursor=0;queued=[];changed=false;tree=module.exports[component](props);for(const effect of queued)effect();if(!changed)return tree;}throw new Error('Component effects did not settle');}};
}
function change(ui,tree,name,value){named(tree,name).props.onChange({target:{value,checked:value}});form(tree).props.onChange?.();return ui.render();}
function selectService(ui,tree,code){elements(tree).find(n=>n.props?.['aria-label']==='Service 1').props.onChange({target:{value:code}});form(tree).props.onChange?.();return ui.render();}

(async()=>{
 let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
 let settings=await desk.getAutomationSettings();settings.profile.priceBook='BASE | Base service | 125.25';settings.profile.internalKnowledge='Private question | Private answer | Staff manual';
 settings=await desk.saveAutomationSettings({...settings,profile:{...settings.profile,contactName:'  Original owner  '}});
 assert.equal(settings.revision,1);assert.equal(settings.profile.contactName,'Original owner');

 const business=harness('AutomationBusinessForm',{settings});let tree=business.render();tree=change(business,tree,'contactName','Unsaved owner');
 const remote=await desk.saveAutomationSettings({...settings,profile:{...settings.profile,businessHours:'Remote hours'}});
 tree=business.render({settings:remote});assert.equal(named(tree,'contactName').props.value,'Unsaved owner');assert.equal(named(tree,'businessHours').props.value,settings.profile.businessHours);assert.equal(button(tree,'Save business setup').props.disabled,true);
 await form(tree).props.onSubmit(event(fakeForm()));assert.equal(business.requests.length,0);assert.equal((await desk.getAutomationSettings()).profile.businessHours,'Remote hours');
 button(tree,'Discard this draft and load saved setup').props.onClick();tree=business.render();assert.equal(named(tree,'businessHours').props.value,'Remote hours');assert.equal(named(tree,'contactName').props.value,'Original owner');
 pass('refreshed settings cannot silently rebase a dirty business draft; explicit discard loads current values');

 // Another tab can save before any refreshed props arrive. The original revision
 // still goes to the real owner API and its conflict leaves the draft intact.
 tree=change(business,tree,'contactName','Keep after conflict');const newer=await desk.saveAutomationSettings({...remote,profile:{...remote.profile,businessHours:'Newer hours'}});
 await form(tree).props.onSubmit(event(fakeForm()));tree=business.render();assert.equal(business.requests.at(-1).body.revision,remote.revision);assert.equal(business.requests.at(-1).status,409);assert.equal(named(tree,'contactName').props.value,'Keep after conflict');assert.equal(business.refreshes,1);
 pass('an unseen concurrent save rejects the old revision and refreshes saved props without losing profile entries');

 const saving=harness('AutomationBusinessForm',{settings:newer});tree=saving.render();tree=change(saving,tree,'contactName','  Saved owner  ');
 let release;const gate=new Promise(resolve=>{release=resolve;});saving.hold(gate);const pending=form(tree).props.onSubmit(event(fakeForm()));tree=saving.render();assert.equal(fieldset(tree).props.disabled,true);await form(tree).props.onSubmit(event(fakeForm()));assert.equal(saving.requests.length,1);release();await pending;saving.hold(null);tree=saving.render();
 assert.equal(saving.refreshes,1);assert.equal(named(tree,'contactName').props.value,'Saved owner');
 // Props deliberately remain old until the router refresh completes.
 tree=change(saving,tree,'contactName','Next edit');await form(tree).props.onSubmit(event(fakeForm()));assert.equal(saving.requests.at(-1).body.revision,newer.revision+1);assert.equal(saving.requests.at(-1).status,200);
 settings=await desk.getAutomationSettings();assert.equal(settings.profile.contactName,'Next edit');
 pass('pending settings disable edits/repeated submit; normalized saved revision is usable before refreshed props arrive');

 const sibling=harness('AutomationBusinessForm',{settings});let siblingTree=sibling.render();siblingTree=change(sibling,siblingTree,'contactName','Sibling still editing');
 const quote=harness('OperationForm',{settings,kind:'quote'}),quoteForm=fakeForm({customer:'Fictional customer'});let quoteTree=selectService(quote,quote.render(),'BASE');
 let finish;quote.hold(new Promise(resolve=>{finish=resolve;}));const preparing=form(quoteTree).props.onSubmit(event(quoteForm));quoteTree=quote.render();assert.equal(fieldset(quoteTree).props.disabled,true);await form(quoteTree).props.onSubmit(event(quoteForm));assert.equal(quote.requests.length,1);finish();await preparing;quote.hold(null);quoteTree=quote.render();
 assert.equal(quoteForm.resets,1);assert.equal(quoteForm.values.customer,undefined);assert.equal(elements(quoteTree).find(n=>n.props?.['aria-label']==='Service 1').props.value,'');assert.equal(quote.refreshes,1);
 siblingTree=sibling.render({settings:await desk.getAutomationSettings()});assert.equal(named(siblingTree,'contactName').props.value,'Sibling still editing');
 quoteForm.values={customer:'Second fictional customer'};quoteTree=selectService(quote,quoteTree,'BASE');await form(quoteTree).props.onSubmit(event(quoteForm));assert.notEqual(quote.requests[0].body.eventKey,quote.requests[1].body.eventKey);
 pass('preparing resets only its own form and quote rows, preserves sibling draft, and starts the next draft with a new request key');

 const priced=harness('OperationForm',{settings,kind:'quote'}),pricedForm=fakeForm({customer:'Preserved quote customer'});let pricedTree=selectService(priced,priced.render(),'BASE');
 const updated=await desk.saveAutomationSettings({...settings,profile:{...settings.profile,priceBook:'BASE | Base service | 250.00'}});pricedTree=priced.render({settings:updated,kind:'quote'});
 assert.ok(elements(pricedTree).some(n=>n.type==='strong'&&String(n.props.children).includes('$125.25')));assert.equal(button(pricedTree,'Prepare and save draft').props.disabled,true);await form(pricedTree).props.onSubmit(event(pricedForm));assert.equal(priced.requests.length,0);
 button(pricedTree,'Use current setup and review these entries').props.onClick();pricedTree=priced.render();assert.ok(elements(pricedTree).some(n=>n.type==='strong'&&String(n.props.children).includes('$250.00')));assert.equal(pricedForm.values.customer,'Preserved quote customer');
 await form(pricedTree).props.onSubmit(event(pricedForm));assert.equal(priced.requests[0].body.revision,updated.revision);assert.equal(priced.requests[0].status,200);settings=updated;
 pass('dirty quotes retain original approved prices until explicit review of changed business setup');

 const reply=harness('OperationForm',{settings,kind:'review_reply'}),replyForm=fakeForm({reviewText:''});let replyTree=reply.render();form(replyTree).props.onChange();replyTree=reply.render();await form(replyTree).props.onSubmit(event(replyForm));replyTree=reply.render();assert.equal(reply.requests.at(-1).status,400);assert.equal(replyForm.resets,0);
 replyForm.values.reviewText='Fictional review';await form(replyTree).props.onSubmit(event(replyForm));assert.equal(reply.requests.at(-1).status,200);assert.equal(replyForm.resets,1);assert.equal(reply.requests[0].body.eventKey,reply.requests[1].body.eventKey);
 pass('failed preparation retains inputs and retry identity; successful retry resets only that form');

 const importing=harness('SearchImportForm',{}),csv=new File(['Date,Clicks,Impressions,CTR,Position\n2026-09-01,1,10,10%,3\n'],'Dates.csv',{type:'text/csv'}),importForm=fakeForm({property:'sc-domain:schurrautomations.com',searchType:'web',startDate:'2026-09-01',endDate:'2026-09-01',unfiltered:'on',csv});
 let importTree=importing.render();await form(importTree).props.onSubmit(event(importForm));assert.equal(importing.requests.at(-1).status,200);assert.equal(importForm.resets,1);assert.equal(importing.refreshes,1);
 importForm.values={csv:new File(['bad csv'],'bad.csv'),property:'sc-domain:schurrautomations.com',searchType:'web',startDate:'2026-09-01',endDate:'2026-09-01',unfiltered:'on'};importTree=importing.render();await form(importTree).props.onSubmit(event(importForm));assert.equal(importing.requests.at(-1).status,400);assert.equal(importForm.resets,1);assert.equal(importForm.values.csv.name,'bad.csv');
 siblingTree=sibling.render({settings});assert.equal(named(siblingTree,'contactName').props.value,'Sibling still editing');
 pass('CSV success clears only the imported form; invalid files and sibling drafts survive');

 const seo=harness('SeoAuditButton',{});await button(seo.render(),'Run and save SEO check').props.onClick();assert.equal(seo.requests[0].status,200);assert.equal(seo.refreshes,1);
 const run=(await desk.listOperationRuns()).find(r=>r.kind==='quote'&&r.profileRevision===settings.revision),actions=harness('OperationActions',{run});await button(actions.render(),'Mark reviewed').props.onClick();assert.equal(actions.requests[0].status,200);assert.equal(actions.refreshes,1);
 siblingTree=sibling.render({settings});assert.equal(named(siblingTree,'contactName').props.value,'Sibling still editing');
 pass('SEO and saved-record actions refresh without a page reload or clearing sibling drafts');
 assert.equal(sends.length,0);console.log(checks+' automation form groups passed; fictional inputs and zero external calls.');
})().catch(error=>{console.error(error);process.exit(1);});


