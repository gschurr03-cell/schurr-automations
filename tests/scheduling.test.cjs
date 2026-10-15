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
let activeKey='test-provider-key';let sends=[];let providerBehavior='ok';let connectionHook=null;
let clock=Date.parse('2026-10-05T12:00:00Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
let beforeBatch=null;let beforeFirst=null;let providerEmailId='12345678-1234-4234-8234-123456789abc';
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
    if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook();}sql.exec('BEGIN');
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
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
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
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, ReadableStream, Date:Clock, Intl, AbortSignal, fetch:async(url,options)=>{sends.push({url,...options});if(providerBehavior==='timeout')throw new Error('timeout');if(providerBehavior==='limited')return new Response('Rate limited',{status:429,headers:{'Retry-After':'3600'}});return Response.json({id:providerEmailId});}, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

const booking=load('lib/booking.ts'),policy=load('lib/booking-policy.ts'),follow=load('lib/followups.ts'),voice=load('lib/voice-intake.ts'),route=load('app/api/manage/scheduling/route.ts');
const uuid=()=>webcrypto.randomUUID(),phone='+13035550123',origin='https://schurrautomations.com';
const post=data=>new Request(origin+'/api/manage/scheduling',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
let callSequence=0;
async function requestLead(){const callSid='retell:call_test'+(++callSequence);const lead=await voice.captureVoiceLead({callSid,name:'Example Caller',business:'Example',email:'',phone,service:'calls',summary:'A fictional test request.',preferredContact:'phone',callbackConsent:true,consentEvidence:'Yes, call me about this request.'});return {id:lead.leadId,callSid};}
const bookData=(lead,start,revision)=>({kind:'meeting',requestKey:uuid(),responseId:lead.id,confirmedPhone:phone,confirmed:true,start,revision});
const remind=lead=>({requestKey:uuid(),responseId:lead.id,channel:'phone',recipient:phone,localDue:'2026-10-06T09:00',timezone:'America/Denver',note:'Discuss the request.',permissionEvidence:'Caller requested a personal follow-up.',confirmPermission:true});
const count=table=>sql.prepare(`SELECT count(*) n FROM ${table}`).get().n;

// Exercise the real client component across prop refreshes without a browser or
// network. State/effect cells survive renders; submissions use the owner API above.
function scheduleSettingsHarness(initialSetup) {
 const cells=[],effects=[],requests=[];let cursor=0,dirty=false,changed=false,setup=initialSetup,queued=[];
 const react={
  createContext:()=>({}),useContext:()=>({dirty,setDirty(value){dirty=value;changed=true;}}),
  useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],value=>{const next=typeof value==='function'?value(cells[i]):value;if(!Object.is(next,cells[i])){cells[i]=next;changed=true;}}];},
  useRef(initial){const i=cursor++;return cells[i]||={current:initial};},
  useEffect(effect,deps){const i=cursor++,prior=effects[i];if(!prior||deps.some((value,j)=>!Object.is(value,prior[j]))){effects[i]=deps;queued.push(effect);}},
 };
 const jsx=(type,props,key)=>({type,props,key}),module={exports:{}};
 const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'app/manage/schedule/workspace.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 const context=vm.createContext({module,exports:module.exports,require:name=>{
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
  throw new Error('Unexpected schedule component dependency: '+name);
 },FormData:class{get(name){return name==='confirmed'?'on':null;}},fetch:async(url,options)=>{
  assert.equal(url,'/api/manage/scheduling');assert.equal(options.method,'POST');
  const body=JSON.parse(options.body),response=await route.POST(post(body));requests.push({body,status:response.status});return response;
 }});
 new vm.Script(compiled.outputText,{filename:'app/manage/schedule/workspace.tsx'}).runInContext(context);
 return {requests,render(next=setup){setup=next;let tree;for(let i=0;i<10;i++){cursor=0;queued=[];changed=false;tree=module.exports.ScheduleSettings({setup});for(const effect of queued)effect();if(!changed)return tree;}throw new Error('Schedule settings did not settle.');}};
}
function elements(node){if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object')return [];return [node,...elements(node.props?.children)];}

(async()=>{
 let checks=0;const pass=s=>{checks++;console.log('PASS '+s);};
 currentUser=null;assert.equal((await route.GET(new Request(origin+'/api/manage/scheduling?date=2026-10-06'))).status,401);assert.equal((await route.POST(post({action:'settings'}))).status,401);currentUser={userId:'other',email:'other@example.com'};assert.equal((await route.POST(post({action:'settings'}))).status,403);currentUser={userId:'owner',email:'owner@example.com'};assert.equal((await route.POST(new Request(origin+'/api/manage/scheduling',{method:'POST',headers:{origin:'https://evil.test','Content-Type':'application/json'},body:'{}'}))).status,403);
 assert.equal(load('lib/request-policy.ts').rejectUnsupportedRequest(new Request(origin+'/api/manage/scheduling',{method:'DELETE'})).status,405);pass('scheduling and calendar downloads require the owner; writes require the correct origin');
 let setup=await booking.bookingSetup();assert.equal(setup.revision,0);assert.equal(setup.config.enabled,false);assert.equal((await booking.availableSlots('2026-10-06')).slots.length,0);
 await assert.rejects(()=>booking.saveBookingSetup({config:{...setup.config,enabled:true},revision:0}),/Confirm/);
 setup=await booking.saveBookingSetup({config:{...setup.config,enabled:true,handoffEnabled:true},revision:0,confirmRules:true});await assert.rejects(()=>booking.saveBookingSetup({config:setup.config,revision:0,confirmRules:true}),/changed/);
 assert.throws(()=>policy.civilTime('2026-03-08T02:30','America/Denver'),/does not exist/);assert.throws(()=>policy.civilTime('2026-11-01T01:30','America/Denver'),/twice/);assert.equal(new Date(policy.civilTime('2026-10-06T09:00','America/Denver')).toISOString(),'2026-10-06T15:00:00.000Z');assert.throws(()=>policy.dateOnly('2026-02-30'),/valid date/);pass('draft defaults, explicit rule approval, optimistic settings and daylight-saving validation');
 sql.prepare("INSERT INTO retell_connection(id,api_key_ciphertext,marker,mode,updated_at) VALUES('retell','fictional','test','live',?)").run(new Date(clock).toISOString());
 const slots=await booking.availableSlots('2026-10-06');assert.ok(slots.slots.length>0);assert.equal(slots.slots[0].start,Date.parse('2026-10-06T15:00:00Z'));
 const a=await requestLead(),b=await requestLead(),payload=bookData(a,slots.slots[0].start,setup.revision),other=bookData(b,slots.slots[0].start,setup.revision);
 const race=await Promise.allSettled([booking.createAppointment(payload),booking.createAppointment(other)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);const saved=race.find(r=>r.status==='fulfilled').value;const original=saved.responseId===a.id?payload:other;assert.equal((await booking.createAppointment(original)).id,saved.id);assert.equal(count('appointments'),1);await assert.rejects(()=>booking.createAppointment({...original,start:original.start+3600000}),/different details/);
 assert.ok(!(await booking.availableSlots('2026-10-06')).slots.some(s=>s.start===original.start+30*60000));assert.ok((await booking.appointmentCalendar(saved.id)).includes('BEGIN:VEVENT'));pass('concurrent reservations have one winner, duplicate requests reuse the booking, and buffers exclude conflicts');
 await booking.cancelAppointment({id:saved.id,revision:1});assert.equal((await booking.createAppointment(original)).status,'cancelled');assert.ok((await booking.appointmentCalendar(saved.id)).includes('STATUS:CANCELLED'));await assert.rejects(()=>booking.cancelAppointment({id:saved.id,revision:1}),/changed/);
 const block=await booking.createAppointment({kind:'block',requestKey:uuid(),revision:setup.revision,name:'Outside commitment',localStart:'2026-10-06T09:00',localEnd:'2026-10-06T11:00'});assert.ok((await booking.availableSlots('2026-10-06')).slots.every(s=>s.start>Date.parse('2026-10-06T17:00:00Z')));await booking.cancelAppointment({id:block.id,revision:1});pass('cancellation releases availability without reopening old receipts; outside commitments block offered times');
 const c=await requestLead();sql.prepare('UPDATE crm_leads SET phone=? WHERE id=?').run('+13035550999',c.id);await assert.rejects(()=>booking.createAppointment(bookData(c,original.start,setup.revision),'voice:'+c.callSid),/confirmed phone changed/);await assert.rejects(()=>follow.createFollowup(remind(c),c.callSid),/renewed contact permission/);
 const d=await requestLead();beforeBatch=()=>sql.prepare('UPDATE crm_leads SET phone=? WHERE id=?').run('+13035550999',d.id);await assert.rejects(()=>booking.createAppointment(bookData(d,original.start,setup.revision)),/taken/);
 const e=await requestLead();beforeBatch=()=>sql.prepare("UPDATE retell_connection SET mode='test'").run();await assert.rejects(()=>booking.createAppointment(bookData(e,original.start,setup.revision),'voice:'+e.callSid),/taken/);sql.prepare("UPDATE retell_connection SET mode='live'").run();pass('phone edits and live-mode changes during reservation cannot substitute contacts or admit a stale action');
 const f=await requestLead();const reminder=await follow.createFollowup(remind(f));await follow.recordReply({responseId:f.id,revision:1,note:'Customer answered and asked us to stop reminders.'});assert.equal(sql.prepare('SELECT status FROM response_followups WHERE id=?').get(reminder.id).status,'cancelled');const snapshot=JSON.stringify(sql.prepare('SELECT * FROM response_jobs WHERE id=?').get(f.id));await assert.rejects(()=>follow.recordReply({responseId:f.id,revision:2,note:'A duplicate reply attempt.'}),/outcome/);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM response_jobs WHERE id=?').get(f.id)),snapshot);pass('recording a reply stops reminders atomically and a duplicate outcome cannot partly change the request');
 const g=await requestLead(),gd=remind(g),gr=await follow.createFollowup(gd);clock=Date.parse('2026-10-07T12:00:00Z');assert.equal((await follow.createFollowup(gd)).id,gr.id);clock=Date.parse('2026-10-05T12:00:00Z');await voice.pauseVoiceCall(g.callSid);assert.equal((await follow.createFollowup(gd)).status,'cancelled');await assert.rejects(()=>follow.finishFollowup({id:gr.id,revision:1,status:'completed'}),/changed/);
 const h=await requestLead(),hr=await follow.createFollowup(remind(h),h.callSid);await follow.finishFollowup({id:hr.id,revision:1,status:'completed'});assert.equal((await follow.createFollowup(remind(h),h.callSid)).status,'completed');pass('past-due retries return their receipt; withdrawal and completed callbacks never reopen');
 const i=await requestLead();beforeFirst=statement=>{if(statement.query.startsWith('INSERT INTO response_followups')){beforeFirst=null;sql.prepare("UPDATE booking_settings SET config=json_set(config,'$.handoffEnabled',0),revision=revision+1").run();}};await assert.rejects(()=>follow.createFollowup(remind(i),i.callSid),/renewed contact permission/);setup=await booking.bookingSetup();setup=await booking.saveBookingSetup({config:{...setup.config,handoffEnabled:true},revision:setup.revision,confirmRules:true});await assert.rejects(()=>follow.createFollowup({...remind(i),timezone:'America/New_York'}),/timezone changed/);pass('callback disable races and stale displayed timezones fail closed');
 const j=await requestLead(),jr=await follow.createFollowup(remind(j));const jb=await booking.createAppointment(bookData(j,original.start,setup.revision));assert.equal(sql.prepare('SELECT status FROM response_followups WHERE id=?').get(jr.id).status,'cancelled');sql.prepare('DELETE FROM crm_leads WHERE id=?').run(j.id);assert.equal(sql.prepare('SELECT id FROM appointments WHERE id=?').get(jb.id),undefined);assert.equal(sql.prepare('SELECT id FROM response_followups WHERE id=?').get(jr.id),undefined);pass('booking stops open follow-ups and deleting the lead removes linked private appointment data');
 const k=await requestLead(),before=count('appointments'),baseBatch=runtime.DB.batch;runtime.DB.batch=statements=>baseBatch([...statements,new Statement('INSERT INTO missing_table VALUES(1)')]);await assert.rejects(()=>booking.createAppointment(bookData(k,original.start,setup.revision)));runtime.DB.batch=baseBatch;assert.equal(count('appointments'),before);assert.equal(sql.prepare('SELECT * FROM response_outcomes WHERE response_id=?').get(k.id),undefined);pass('a failed transaction leaves no appointment or outcome receipt');
 const actions=load('lib/appointment-actions.ts');const moving=await requestLead(),moveBook=await booking.createAppointment(bookData(moving,original.start,setup.revision),'voice:'+moving.callSid);const move={action:'reschedule',id:moveBook.id,requestKey:uuid(),appointmentRevision:1,scheduleRevision:setup.revision,start:original.start+3600000,confirmed:true,confirmedPhone:phone};
 const moves=await Promise.all([actions.changeAppointment(move),actions.changeAppointment(move)]);assert.equal(moves.filter(r=>r.duplicate).length,1);assert.ok(moves.every(r=>r.appointment.revision===2));assert.equal(moves[0].appointment.id,moveBook.id);assert.equal((await booking.createAppointment(bookData(moving,original.start,setup.revision),'voice:'+moving.callSid)).start,move.start);
 const occupied=await requestLead(),occupiedBook=await booking.createAppointment(bookData(occupied,original.start+7200000,setup.revision));const unchanged=JSON.stringify(sql.prepare('SELECT * FROM appointments WHERE id=?').get(moveBook.id));await assert.rejects(()=>actions.changeAppointment({...move,requestKey:uuid(),appointmentRevision:2,start:occupiedBook.start}),/change was not applied/);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM appointments WHERE id=?').get(moveBook.id)),unchanged);
 const movedAgain=await actions.changeAppointment({...move,requestKey:uuid(),appointmentRevision:2,start:original.start+3*3600000});assert.equal(movedAgain.appointment.revision,3);const oldReplay=await actions.changeAppointment(move);assert.equal(oldReplay.superseded,true);assert.equal(oldReplay.appointment.start,original.start+3*3600000);
 await assert.rejects(()=>actions.changeAppointment({...move,appointmentRevision:3},'retell:call_unrelated'),/No appointment/);
 await voice.pauseVoiceCall(moving.callSid);await assert.rejects(()=>actions.changeAppointment({...move,appointmentRevision:3,start:original.start+4*3600000},moving.callSid),/change was not applied/);const cancelled=await actions.changeAppointment({action:'cancel',appointmentRevision:3,confirmed:true},moving.callSid);assert.equal(cancelled.appointment.status,'cancelled');assert.equal((await actions.changeAppointment(move)).appointment.status,'cancelled');await assert.rejects(()=>actions.changeAppointment({...move,requestKey:uuid(),appointmentRevision:4}),/cancelled/);assert.equal(sql.prepare('SELECT outcome FROM response_outcomes WHERE response_id=?').get(moving.id).outcome,'booking_cancelled');
 pass('rescheduling is atomic, preserves identity and old slots on conflict, has exact replay receipts, and same-call cancellation survives withdrawal');
 const replayLead=await requestLead(),replayBook=await booking.createAppointment(bookData(replayLead,original.start,setup.revision));const rd={...move,id:replayBook.id,requestKey:uuid(),start:original.start+3600000};await actions.changeAppointment(rd);beforeFirst=statement=>{if(statement.query.startsWith('SELECT request_hash AS hash')){beforeFirst=null;sql.prepare("UPDATE appointments SET status='cancelled',revision=revision+1 WHERE id=?").run(replayBook.id);}};const racedReplay=await actions.changeAppointment(rd);assert.equal(racedReplay.appointment.status,'cancelled');assert.equal(racedReplay.superseded,true);
 const rollbackLead=await requestLead(),rollbackBook=await booking.createAppointment(bookData(rollbackLead,original.start,setup.revision));const opCount=count('appointment_operations');runtime.DB.batch=statements=>baseBatch([...statements,new Statement('INSERT INTO missing_table VALUES(1)')]);await assert.rejects(()=>actions.changeAppointment({...move,id:rollbackBook.id,requestKey:uuid(),start:original.start+3600000}));runtime.DB.batch=baseBatch;assert.equal(count('appointment_operations'),opCount);assert.equal(sql.prepare('SELECT revision FROM appointments WHERE id=?').get(rollbackBook.id).revision,1);
 pass('replay reads current state after intervening cancellation and failed mutation batches roll back the operation receipt');

 const handledLead=await requestLead(),handledReminder=await follow.createFollowup(remind(handledLead));
 const handledBooking=await booking.createAppointment(bookData(handledLead,(await booking.availableSlots('2026-10-07')).slots[0].start,setup.revision));
 const responseDesk=load('lib/response-desk.ts');
 await responseDesk.updateResponseJob({id:handledLead.id,revision:1,status:'contacted'});
 const handledPhone='+13035550991';sql.prepare('UPDATE crm_leads SET phone=? WHERE id=?').run(handledPhone,handledLead.id);
 for(let n=0;n<101;n++)await requestLead();
 const overflowLead=await requestLead();sql.prepare('UPDATE response_jobs SET created_at=? WHERE id=?').run('2026-10-05T13:00:00.000Z',overflowLead.id);
 const overflowBooking=await booking.createAppointment(bookData(overflowLead,(await booking.availableSlots('2026-10-07')).slots[0].start,setup.revision));
 const overflowPhone='+13035550992';sql.prepare('UPDATE crm_leads SET phone=? WHERE id=?').run(overflowPhone,overflowLead.id);
 const visibleRequests=await responseDesk.listResponseJobs();assert.equal(visibleRequests.hasMore,true);
 assert.ok(!visibleRequests.items.some(r=>r.id===handledLead.id||r.id===overflowLead.id));
 const listedAppointments=await booking.listAppointments();
 assert.equal(listedAppointments.find(a=>a.id===handledBooking.id).currentPhone,handledPhone);
 assert.equal(listedAppointments.find(a=>a.id===overflowBooking.id).currentPhone,overflowPhone);
 assert.ok(listedAppointments.find(a=>a.id===handledBooking.id).notes.includes(phone),'current contact must not be inferred from the original booking notes');
 assert.equal(listedAppointments.find(a=>a.id===block.id).currentPhone,'');
 const selectedHandled=await booking.getAppointmentRequestChoice(handledLead.id),selectedOverflow=await booking.getAppointmentRequestChoice(overflowLead.id);
 assert.equal(selectedHandled.id,handledLead.id);assert.equal(selectedHandled.name,'Example Caller');assert.equal(selectedHandled.phone,handledPhone);
 assert.equal(selectedOverflow.id,overflowLead.id);assert.equal(selectedOverflow.phone,overflowPhone);
 await responseDesk.updateResponseJob({id:overflowLead.id,revision:1,status:'paused'});
 assert.equal(await booking.getAppointmentRequestChoice(overflowLead.id),null);
 assert.equal(await booking.getAppointmentRequestChoice(uuid()),null);
 pass('appointment contact lookup stays current for handled requests and requests outside the visible response queue');

 // This is the exact legacy payload sent by the owner Cancel button: no new key.
 const ownerCancel={action:'cancel_booking',id:handledBooking.id,revision:1};
 const ownerCancelResponses=await Promise.all([route.POST(post(ownerCancel)),route.POST(post(ownerCancel))]);
 assert.ok(ownerCancelResponses.every(r=>r.status===200));
 const ownerCancelResults=await Promise.all(ownerCancelResponses.map(r=>r.json()));
 assert.equal(ownerCancelResults.filter(r=>r.result.duplicate).length,1);
 assert.ok(ownerCancelResults.every(r=>r.result.appointment.status==='cancelled'&&r.result.appointment.revision===2));
 assert.equal(sql.prepare('SELECT outcome FROM response_outcomes WHERE response_id=?').get(handledLead.id).outcome,'booking_cancelled');
 assert.equal(sql.prepare('SELECT status FROM response_followups WHERE id=?').get(handledReminder.id).status,'cancelled');
 assert.equal(sql.prepare('SELECT count(*) AS n FROM appointment_operations WHERE appointment_id=?').get(handledBooking.id).n,1);
 const cancelledState=()=>JSON.stringify({appointment:sql.prepare('SELECT * FROM appointments WHERE id=?').get(handledBooking.id),outcome:sql.prepare('SELECT * FROM response_outcomes WHERE response_id=?').get(handledLead.id),operations:sql.prepare('SELECT * FROM appointment_operations WHERE appointment_id=?').all(handledBooking.id)});
 const ownerCancelSnapshot=cancelledState(),ownerCancelReplay=await route.POST(post(ownerCancel));assert.equal(ownerCancelReplay.status,200);
 assert.equal((await ownerCancelReplay.json()).result.duplicate,true);assert.equal(cancelledState(),ownerCancelSnapshot);
 assert.equal((await route.POST(post({...ownerCancel,revision:2}))).status,409);assert.equal(cancelledState(),ownerCancelSnapshot);
 pass('owner cancellation API records its outcome once, keeps reminders stopped, and safely replays concurrent or retried requests');

 for(const receiptVersion of ['legacy','current']){
  const replayContact=await requestLead(),reminderInput=remind(replayContact),savedReminder=await follow.createFollowup(reminderInput);
  if(receiptVersion==='legacy'){
   // Persist the pre-fix receipt format to exercise backward compatibility with
   // reminders already saved in production, rather than only new records.
   const legacyHash=await load('lib/automation-desk.ts').contentHash(JSON.stringify({responseId:replayContact.id,dueMs:policy.civilTime(reminderInput.localDue,reminderInput.timezone),note:reminderInput.note,permission:reminderInput.permissionEvidence}));
   sql.prepare('UPDATE response_followups SET body_hash=? WHERE id=?').run(legacyHash,savedReminder.id);
  }
  const exactReplay=await follow.createFollowup(reminderInput);assert.equal(exactReplay.id,savedReminder.id);assert.equal(exactReplay.duplicate,true);assert.equal(exactReplay.status,'open');
  const reminderBeforeConflict=JSON.stringify(sql.prepare('SELECT * FROM response_followups WHERE id=?').get(savedReminder.id));
  await assert.rejects(()=>follow.createFollowup({...reminderInput,recipient:'+13035550993'}),/different information/);
  await assert.rejects(()=>follow.createFollowup({...reminderInput,channel:'text'}),/different information/);
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM response_followups WHERE id=?').get(savedReminder.id)),reminderBeforeConflict);
  sql.prepare('UPDATE crm_leads SET phone=? WHERE id=?').run('+13035550993',replayContact.id);
  // No list/cleanup call intervenes: replay itself must recheck the contact.
  const changedContactReplay=await follow.createFollowup(reminderInput);assert.equal(changedContactReplay.duplicate,true);assert.equal(changedContactReplay.status,'cancelled');
  const stoppedReminder=sql.prepare('SELECT status,recipient,revision FROM response_followups WHERE id=?').get(savedReminder.id);
  assert.equal(stoppedReminder.status,'cancelled');assert.equal(stoppedReminder.recipient,phone);assert.equal(stoppedReminder.revision,2);
  await assert.rejects(()=>follow.createFollowup({...reminderInput,recipient:'+13035550993'}),/different information/);
 }
 const priorityContact=await requestLead(),priorityInput=remind(priorityContact),priorityReminder=await follow.createFollowup(priorityInput,priorityContact.callSid);
 sql.prepare('UPDATE crm_leads SET phone=? WHERE id=?').run('+13035550994',priorityContact.id);
 const priorityReplay=await follow.createFollowup(priorityInput,priorityContact.callSid);assert.equal(priorityReplay.id,priorityReminder.id);assert.equal(priorityReplay.duplicate,true);assert.equal(priorityReplay.status,'cancelled');
 pass('legacy and current reminder receipts reject changed recipients, allow exact retries, and stop immediately when the contact changes');

 const savedSettings=sql.prepare('SELECT * FROM booking_settings').get();runtime.BOOKING_INITIAL_CONFIG=JSON.stringify({...setup.config,hours:setup.config.hours.map(d=>({...d,start:'08:00',end:'20:00'}))});assert.equal((await booking.bookingSetup()).config.hours[1].start,'09:00');sql.prepare("DELETE FROM booking_settings WHERE id='main'").run();const initialised=await booking.bookingSetup();assert.equal(initialised.config.hours[1].start,'08:00');assert.equal(initialised.config.hours[1].end,'20:00');assert.equal(initialised.revision,1);assert.equal((await booking.bookingSetup()).revision,1);delete runtime.BOOKING_INITIAL_CONFIG;
 pass('approved first-run schedule seeds once and never overwrites existing owner settings');

 const settingsUI=scheduleSettingsHarness(initialised);let settingsTree=settingsUI.render();
 const titleInput=elements(settingsTree).find(n=>n.type==='input'&&n.props.value===initialised.config.title);
 titleInput.props.onChange({target:{value:'Unsaved discovery appointment'}});settingsTree.props.onChange();settingsTree=settingsUI.render();
 const remoteSetup=await booking.saveBookingSetup({revision:initialised.revision,confirmRules:true,config:{...initialised.config,hours:initialised.config.hours.map(d=>({...d,start:'10:00'}))}});
 settingsTree=settingsUI.render(remoteSetup);
 assert.ok(elements(settingsTree).some(n=>n.type==='input'&&n.props.value==='Unsaved discovery appointment'));
 assert.equal(elements(settingsTree).find(n=>n.props?.['aria-label']==='Monday opens').props.value,'08:00');
 assert.ok(elements(settingsTree).some(n=>n.props?.role==='alert'&&String(n.props.children).includes('another tab')));
 assert.equal(elements(settingsTree).find(n=>n.type==='button').props.disabled,true);
 // Even if submit is dispatched directly, the original revision must reach the
 // API so a refreshed prop cannot authorize overwriting the newer saved rules.
 await settingsTree.props.onSubmit({preventDefault(){},currentTarget:{}});
 assert.equal(settingsUI.requests.length,1);assert.equal(settingsUI.requests[0].body.revision,initialised.revision);
 assert.equal(settingsUI.requests[0].body.config.title,'Unsaved discovery appointment');assert.equal(settingsUI.requests[0].status,409);
 assert.equal((await booking.bookingSetup()).config.hours[1].start,'10:00');assert.equal((await booking.bookingSetup()).config.title,initialised.config.title);
 const cleanSettingsUI=scheduleSettingsHarness(initialised);cleanSettingsUI.render();const refreshedCleanTree=cleanSettingsUI.render(remoteSetup);
 assert.equal(elements(refreshedCleanTree).find(n=>n.props?.['aria-label']==='Monday opens').props.value,'10:00');
 assert.equal(elements(refreshedCleanTree).find(n=>n.type==='button').props.disabled,false);
 pass('dirty schedule drafts retain their original revision across prop refreshes while pristine forms adopt current hours');

 sql.exec('SAVEPOINT calendar_checks');
 const insertCalendar=sql.prepare("INSERT INTO appointments(id,request_key,body_hash,kind,name,start_ms,end_ms,busy_start_ms,busy_end_ms,timezone,schedule_revision,created_at,updated_at) VALUES(?,?,?,'block','Calendar test',?,?,?,?,'UTC',1,?,?)");
 const addCalendar=(start,end)=>{const id=uuid();insertCalendar.run(id,id,'test',start,end,start,end,'2025-01-01','2025-01-01');return id;};
 const historical=addCalendar(Date.parse('2025-01-15T18:00Z'),Date.parse('2025-01-15T19:00Z'));
 assert.ok((await booking.listCalendarAppointments('2025-01','America/Denver')).items.some(a=>a.id===historical));
 const boundary=addCalendar(Date.parse('2025-01-27T07:00Z'),Date.parse('2025-02-01T07:00Z'));
 const calendar=load('lib/calendar-view.ts'),january=await booking.listCalendarAppointments('2025-01','America/Denver');
 assert.ok(calendar.calendarDayItems(january.items,'2025-01-31','America/Denver').some(a=>a.id===boundary));
 assert.ok(!calendar.calendarDayItems(january.items,'2025-02-01','America/Denver').some(a=>a.id===boundary));
 assert.deepEqual(Array.from(calendar.calendarDays('2024-02')).filter(d=>d.startsWith('2024-02')).length,29);
 for(let i=0;i<210;i++)addCalendar(Date.parse('2025-01-16T18:00Z')+i*1000,Date.parse('2025-01-16T19:00Z')+i*1000);
 assert.equal((await booking.listCalendarAppointments('2025-01','America/Denver')).items.length,212);
 for(let i=0;i<290;i++)addCalendar(Date.parse('2025-01-17T18:00Z')+i*1000,Date.parse('2025-01-17T19:00Z')+i*1000);
 const overflow=await booking.listCalendarAppointments('2025-01','America/Denver');assert.equal(overflow.items.length,500);assert.equal(overflow.truncated,true);
 await assert.rejects(()=>booking.listCalendarAppointments('2026-13','America/Denver'),/valid calendar month/);
 sql.exec('ROLLBACK TO calendar_checks');sql.exec('RELEASE calendar_checks');
 pass('month reads include history, spanning blocks and more than 200 records; midnight ends are exclusive and overflow is explicit');
 for(const [instant,zone,date] of [['2026-03-08T08:59Z','America/Denver','2026-03-08'],['2026-11-01T07:15Z','America/Denver','2026-11-01'],['2026-11-01T08:15Z','America/Denver','2026-11-01'],['2026-01-31T12:00Z','Pacific/Kiritimati','2026-02-01'],['2026-01-31T20:00Z','Asia/Kathmandu','2026-02-01']])assert.equal(calendar.calendarDate(Date.parse(instant),zone),date);
 assert.notEqual(calendar.calendarTime(Date.parse('2026-11-01T07:15Z'),'America/Denver',true),calendar.calendarTime(Date.parse('2026-11-01T08:15Z'),'America/Denver',true));
 pass('calendar dates follow saved timezone at DST, month boundaries and fractional offsets; repeated times have distinct zones');
 assert.equal(sends.length,0);console.log(checks+' scheduling groups passed; all contacts fictional and zero external sends.');
})().catch(error=>{console.error(error);process.exit(1);});
