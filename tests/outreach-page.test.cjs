const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),jsx=(type,props)=>({type,props:props||{}}),component=name=>props=>jsx(name,props);
let allowed=true,settings={},reads=0,failure=false,logged=0;const snapshot={prospects:[],drafts:[]};
const mods={
 'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
 '../crm-ui':{CRMShell:component('shell'),AccessDenied:component('denied'),Unavailable:component('unavailable'),crmContext:async()=>({access:{allowed},settings})},
 '@/lib/outreach':{snapshot:async()=>{reads++;if(failure)throw Error('Synthetic database failure');return snapshot;}},
 '@/lib/outreach-errors':{logOutreachFailure:()=>logged++},
 './workspace':{default:component('workspace')},'./batch-review':{QueuePanel:component('queue')},'./outreach.css':{},
};
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'app/manage/outreach/page.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:id=>{assert.ok(mods[id],id);return mods[id];}});
function nodes(n){if(n==null||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);if(typeof n.type==='function')return nodes(n.type(n.props));return[n,...nodes(n.props.children)];}
(async()=>{
 const Page=m.exports.default;allowed=false;let n=nodes(await Page());assert.equal(reads,0);assert.ok(n.some(x=>x.type==='denied'));assert.ok(!n.some(x=>x.type==='queue'));
 allowed=true;settings=null;n=nodes(await Page());assert.equal(reads,0);assert.ok(!n.some(x=>x.type==='queue'));
 settings={};failure=true;n=nodes(await Page());assert.equal(logged,1);assert.equal(n.filter(x=>x.type==='queue').length,1);assert.ok(n.some(x=>x.type==='unavailable'));assert.ok(!n.some(x=>x.type==='workspace'));
 failure=false;n=nodes(await Page());assert.equal(n.find(x=>x.type==='workspace').props.initial,snapshot);assert.ok(!n.some(x=>x.type==='queue'));
 console.log('PASS owner-only outreach fallback restores exactly one independent queue when contacts fail; normal workspace owns its queue.');
})().catch(e=>{console.error(e);process.exitCode=1;});
