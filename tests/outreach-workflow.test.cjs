const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/manage/outreach/workspace.tsx'),'utf8');
const compiled=ts.transpileModule(source+'\nexport {DraftEditor};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
let states=[],cursor=0;
const jsx=(type,props)=>({type,props:props||{}});
const moduleValue={exports:{}};
vm.runInNewContext(compiled,{module:moduleValue,exports:moduleValue.exports,require:name=>name==='react'?{useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=value;}];},useEffect(){},useRef:()=>({current:null})}:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name==='../mail/inline-review'?{InlineMailReview:'inline-review',GmailQuickStatus:'mail-status'}:name==='lucide-react'?new Proxy({},{get:(_,key)=>key}):{},console});
const draft={id:'draft-1',revision:7,status:'draft',recipient:'owner@example.test',subject:'A specific observation',body:'Saved content',campaign:'Receptionist',step:0};
const sender={sender_name:'Gavin',sender_email:'gavin@example.test',postal_address:'Test business address'};
let calls=[],closed=0,tree;
let command=async(action,payload)=>{calls.push({action,payload});return action==='prepare'?{ok:true,recipient:draft.recipient,sender:sender.sender_email,subject:draft.subject,body:'Server-approved content with footer'}:{ok:true};};
function render(){cursor=0;tree=moduleValue.exports.DraftEditor({value:draft,sender,command:(...args)=>command(...args),busy:false,close:()=>closed++});return tree;}
function nodes(node){if(node==null||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n));return [node,...nodes(node.props?.children)];}
function text(node){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join('');if(typeof node==='object')return text(node.props?.children);return String(node);}
function button(label){return nodes(tree).find(n=>n.type?.name==='Button'&&text(n.props.children)===label);}
(async()=>{
 render();await button('Approve and review send').props.onClick();render();
 assert.deepEqual(calls.map(x=>x.action),['approve','prepare']);assert.ok(calls.every(x=>x.payload.revision===7));assert.equal(closed,0);assert.ok(nodes(tree).some(n=>n.type==='inline-review'&&n.props.draftId===draft.id));assert.ok(!nodes(tree).some(n=>n.type==='a'&&String(n.props.href).startsWith('mailto:')));
 const inline=nodes(tree).find(n=>n.type==='inline-review');inline.props.onManualAllowed(true);render();await button('Switch to manual sending').props.onClick();render();assert.ok(!nodes(tree).some(n=>n.type==='inline-review'));assert.ok(text(tree).includes('Server-approved content with footer'));assert.ok(!calls.some(x=>x.action==='sent'));
 const mail=nodes(tree).find(n=>n.type==='a'&&text(n.props.children)==='Open in email app');assert.ok(mail.props.href.includes(encodeURIComponent('Server-approved content with footer')));assert.ok(!mail.props.onClick);
 const edit=nodes(tree).find(n=>n.type?.name==='Form'&&n.props.onChange);edit.props.onChange();render();assert.ok(!text(tree).includes('Server-approved content with footer'));assert.ok(button('Review send').props.disabled);
 states=[];calls=[];command=async action=>{calls.push({action});return null;};render();await button('Approve and review send').props.onClick();render();assert.deepEqual(calls.map(x=>x.action),['approve']);assert.ok(!text(tree).includes('Open in email app'));
 states=[];calls=[];command=async action=>{calls.push({action});return action==='approve'?{ok:true}:null;};render();await button('Approve and review send').props.onClick();render();assert.ok(button('Review send'));assert.ok(!text(tree).includes('Open in email app'));
 states=[];calls=[];command=async(action,payload)=>{calls.push({action,payload});return action==='draft'?{ok:true,data:{drafts:[{...draft,revision:8,subject:'Improved subject',body:'Improved message',status:'draft'}]}}:{ok:true};};render();
 const form=nodes(tree).find(n=>n.type?.name==='Form'&&n.props.onChange);form.props.onChange();render();await form.props.onSave({subject:'Improved subject',body:'Improved message'});render();assert.equal(closed,0);assert.equal(button('Approve and review send').props.disabled,false);await button('Approve and review send').props.onClick();assert.equal(calls.find(c=>c.action==='approve').payload.revision,8);
 states=[];calls=[];command=async(action,payload)=>{calls.push({action,payload});return action==='draft'?{ok:true,data:{drafts:[]}}:action==='getDraft'?{ok:true,draft:{...draft,revision:9,status:'draft'}}:{ok:true};};render();await nodes(tree).find(n=>n.type?.name==='Form'&&n.props.onChange).props.onSave({subject:'Updated',body:'Updated'});render();assert.equal(closed,0);await button('Approve and review send').props.onClick();assert.equal(calls.find(c=>c.action==='approve').payload.revision,9);
 console.log('PASS in-place save retains the dialog and uses the server-refreshed revision.');
 console.log('PASS combined review keeps the dialog open, uses the server-prepared payload, preserves revision, clears prepared content on edits, and fails closed. Opening mail never records a send.');
})().catch(e=>{console.error(e);process.exitCode=1;});
