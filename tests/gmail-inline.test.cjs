const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const jsx=(type,props)=>({type,props:props||{}});
let active,effects=[],requests=[],intervals=[],clock=Date.now(),mode='connected',visibility='visible',synced=0;
const data=()=>({setup:{expectedEmail:'owner@example.com',connection:mode==='connected'?{email:'owner@example.com',status:'connected',lastSyncAt:new Date(clock).toISOString()}:null},sender:{},approved:[{id:'draft-1'}],outbox:[],replies:[],page:1});
const react={useRef(initial){const h=active,i=h.index++;return h.hooks[i]||(h.hooks[i]={current:initial});},useState(initial){const h=active,i=h.index++;if(!(i in h.hooks))h.hooks[i]=initial;return[h.hooks[i],value=>h.hooks[i]=typeof value==='function'?value(h.hooks[i]):value];},useEffect(fn,deps){const h=active,i=h.index++,old=h.hooks[i];if(!old||deps.some((d,n)=>d!==old.deps[n])){old?.cleanup?.();const record={deps};h.hooks[i]=record;effects.push(()=>record.cleanup=fn());}}};
const moduleValue={exports:{}};
const source=fs.readFileSync(path.join(root,'app/manage/mail/inline-review.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(compiled,{module:moduleValue,exports:moduleValue.exports,require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:id==='./workspace'?{default:'MailWorkspace',readSnapshot:async(page,draft)=>{requests.push({action:'read',page,draft});if(mode==='error')throw Error('Read failed');return data();},post:async payload=>{requests.push(payload);assert.equal(payload.action,'sync');return {ok:true,data:data()};}}:require(id),Date:class extends Date{static now(){return clock;}},Intl,document:{get visibilityState(){return visibility;},addEventListener(){},removeEventListener(){}},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){}});
function mount(Component,props){const h={hooks:[],index:0,tree:null,props,render(){active=h;h.index=0;h.tree=Component(h.props);while(effects.length)effects.shift()();return h.tree;}};h.render();return h;}
function all(node){if(node==null)return[];if(Array.isArray(node))return node.flatMap(all);if(typeof node!=='object')return[node];return[node,...all(node.props.children)];}
const text=node=>all(node).filter(n=>typeof n==='string').join(' ');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function reset(){requests=[];intervals=[];effects=[];mode='connected';visibility='visible';clock+=300001;}
(async()=>{
 const {GmailQuickStatus,InlineMailReview}=moduleValue.exports;
 reset();let h=mount(GmailQuickStatus,{onSync:()=>synced++});await flush();h.render();assert.deepEqual(requests.map(r=>r.action),['read','sync']);assert.equal(synced,1);assert.match(text(h.tree),/every 5 minutes/);
 reset();mode='disconnected';h=mount(GmailQuickStatus,{onSync:()=>synced++});await flush();h.render();assert.deepEqual(requests.map(r=>r.action),['read']);mode='connected';const check=all(h.tree).find(n=>n?.type==='button');check.props.onClick();await flush();h.render();assert.deepEqual(requests.map(r=>r.action),['read','read','sync']);
 reset();visibility='hidden';h=mount(GmailQuickStatus,{onSync(){}});await flush();assert.equal(requests.length,0);visibility='visible';intervals[0]();await flush();assert.deepEqual(requests.map(r=>r.action),['read','sync']);
 reset();h=mount(GmailQuickStatus,{paused:true,onSync(){}});await flush();assert.equal(requests.length,0);assert.equal(intervals.length,0);
 reset();let allowed=[];h=mount(InlineMailReview,{draftId:'draft-1',onManualAllowed:value=>allowed.push(value)});assert.deepEqual(allowed,[false]);await flush();h.render();assert.deepEqual(requests,[{action:'read',page:1,draft:'draft-1'}]);assert.deepEqual(allowed,[false,true]);h.tree.props.onSendStarted();assert.deepEqual(allowed,[false,true,false]);assert.equal(requests.length,1);
 reset();mode='error';allowed=[];h=mount(InlineMailReview,{draftId:'draft-1',onManualAllowed:value=>allowed.push(value)});await flush();h.render();assert.deepEqual(allowed,[false]);assert.match(text(h.tree),/Read failed/);
 console.log('PASS 6 inline Gmail groups: scoped review, attempt locks manual sending, fresh connection checks, visible-page sync only, pause while editing, and failures stay closed. No send action is issued.');
})().catch(e=>{console.error(e);process.exitCode=1;});
