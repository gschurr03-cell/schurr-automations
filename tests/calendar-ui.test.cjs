const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const compiled=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const dates={exports:{}};vm.runInNewContext(compiled('lib/calendar-view.ts'),{module:dates,exports:dates.exports,Intl,Date});
let cells=[],cursor=0,month='2026-10',routes=[];
const react={useState(value){const i=cursor++;if(!(i in cells))cells[i]=typeof value==='function'?value():value;return [cells[i],v=>cells[i]=typeof v==='function'?v(cells[i]):v];},useRef(v){const i=cursor++;return cells[i]||=( {current:v});},useEffect(){},useMemo:f=>f(),useTransition:()=>[false,f=>f()]};
const jsx=(type,props,key)=>({type,props:props||{},key}),component={exports:{}};
vm.runInNewContext(compiled('app/manage/schedule/calendar.tsx'),{module:component,exports:component.exports,Intl,Date,URLSearchParams,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name==='next/navigation'?{useRouter:()=>({push(url){routes.push(url);month=new URL(url,'https://test.local').searchParams.get('month');}}),useSearchParams:()=>new URLSearchParams('month='+month+'&request=fixture-request')}:name==='lucide-react'?new Proxy({},{get:(_,key)=>key}):name==='@/lib/calendar-view'?dates.exports:name==='./workspace'?{AppointmentForm:'appointment-form',BlockTimeForm:'block-form',AppointmentActions:'appointment-actions',RescheduleForm:'reschedule-form'}:{}});
const appointment={id:'a',name:'Example call',kind:'meeting',status:'booked',start:Date.parse('2026-10-06T15:00Z'),end:Date.parse('2026-10-06T15:30Z'),timezone:'UTC',currentPhone:'+13035550123'};
const props={today:'2026-10-03',appointments:[appointment,{...appointment,id:'b',name:'Cancelled call',status:'cancelled'}],truncated:false,setup:{config:{timezone:'America/Denver',duration:30}},requests:[]};
let tree;function render(){cursor=0;return tree=component.exports.default({...props,month});}
function nodes(n){if(Array.isArray(n))return n.flatMap(nodes);if(!n||typeof n!=='object')return [];return [n,...nodes(n.props?.children)];}
function text(n){if(Array.isArray(n))return n.map(text).join('');if(n&&typeof n==='object')return text(n.props?.children);return n==null?'':String(n);}
function button(label){return nodes(tree).find(n=>n.type==='button'&&(n.props['aria-label']===label||text(n).trim()===label));}
function day(day){return nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']?.startsWith(day));}
render();assert.equal(nodes(tree).filter(n=>n.type==='button'&&n.props.className?.includes('schedule-day')).length,35);
day('Tuesday, October 6, 2026').props.onClick();render();assert.ok(text(tree).includes('9:00 AM MDT'));assert.ok(day('Tuesday, October 6, 2026').props['aria-label'].includes('1 appointment'));
button('Add appointment').props.onClick();render();const formA=nodes(tree).find(n=>n.type==='appointment-form');assert.equal(formA.props.today,'2026-10-06');
button('Close').props.onClick();render();day('Wednesday, October 7, 2026').props.onClick();render();button('Block time on this date').props.onClick();render();const formB=nodes(tree).find(n=>n.type==='block-form');assert.equal(formB.props.initialDate,'2026-10-07');assert.equal(nodes(tree).find(n=>n.type==='appointment-form').key,formA.key);
button('Next month').props.onClick();render();assert.ok(routes[0].includes('request=fixture-request'));assert.equal(month,'2026-11');assert.equal(nodes(tree).find(n=>n.type==='appointment-form').key,formA.key);assert.equal(nodes(tree).find(n=>n.type==='block-form').key,formB.key);
formB.props.onSaved();render();button('Add appointment').props.onClick();render();assert.equal(nodes(tree).find(n=>n.type==='appointment-form').key,formA.key);assert.equal(nodes(tree).find(n=>n.type==='appointment-form').props.today,'2026-10-06');
button('Today').props.onClick();render();assert.equal(month,'2026-10');assert.equal(day('Saturday, October 3, 2026').props['aria-pressed'],true);
assert.ok(!nodes(tree).some(n=>n.props?.onDragEnd));console.log('PASS calendar selection, saved timezone, cancelled visibility, independent persistent drafts, month navigation, request link and Today; no real writes.');
