const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{webcrypto,createHmac}=require('node:crypto');
const root=process.env.SCHURR_SOURCE_ROOT||path.resolve(__dirname,'..'),candidate=process.env.SCHURR_TOOL_OBSERVER_CANDIDATE||'';
const ts=createRequire(path.join(root,'package.json'))('typescript');
const key='fictional-webhook-signing-key-123456789',agentId='agent_verified',number='+19855550123',callId='call_verified';
class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
let mode='live',actual,receipt,observations,order,counts,tasks,failures,observerFailure,waitUntilFailure,providerFailure,observerGate;
function reset(){mode='live';actual={call_id:callId,agent_id:agentId,call_type:'phone_call',direction:'inbound',to_number:number,call_status:'ongoing',start_timestamp:Date.now()};receipt={id:'response_fictional',channel:'phone',status:'needs_review'};observations=[];order=[];counts={};tasks=[];failures={};observerFailure='';waitUntilFailure=false;providerFailure=false;observerGate=null;}
const appointment={id:'appointment_fictional',status:'booked',start:Date.now()+3600000,end:Date.now()+5400000,timezone:'America/Denver',revision:1,duplicate:false};
async function action(name,result){counts[name]=(counts[name]||0)+1;order.push(name);if(failures[name])throw failures[name];return result;}
const db={prepare(query){return {bind(){return this;},async first(){if(query.includes("FROM retell_connection WHERE id='retell'"))return {id:'retell',apiKeyCiphertext:'fictional-encrypted-key',marker:'fictional',agentId,llmId:'llm_verified',voiceId:'voice_current',phase:'ready',mode,inboundNumber:number,lockUntil:0};if(query.includes('FROM response_jobs WHERE source_key='))return receipt;throw Error('Unexpected SQL: '+query);},async run(){if(!query.startsWith('UPDATE retell_connection SET last_'))throw Error('Unexpected write');counts.statusWrite=(counts.statusWrite||0)+1;}};}};
const stubs={
 'lib/inquiries.ts':{database:()=>db,RequestError,readBoundedText:request=>request.text()},
 'lib/integration-secret.ts':{decryptIntegrationSecret:async()=>key,encryptIntegrationSecret:async()=>{throw Error('No connection mutation allowed');}},
 'lib/retell-profile.ts':{},
 'lib/voice-intake.ts':{validateVoiceEvent:data=>{if(data.invalid)throw new RequestError(400,'Invalid fictional contact');return data;},captureVoiceLead:()=>action('captureVoiceLead',{leadId:'lead_fictional',duplicate:false}),pauseVoiceCall:()=>action('pauseVoiceCall')},
 'lib/appointment-actions.ts':{currentCallAppointment:()=>action('currentCallAppointment',appointment),changeAppointment:()=>action('changeAppointment',{appointment,duplicate:false,superseded:false})},
 'lib/booking-policy.ts':{localParts:()=>({date:'2026-10-02'})},
 'lib/booking.ts':{bookingSetup:()=>action('bookingSetup',{config:{enabled:true,handoffEnabled:true,timezone:'America/Denver',duration:30}}),availableSlots:()=>action('availableSlots',{enabled:true,timezone:'America/Denver',slots:[]}),createAppointment:()=>action('createAppointment',appointment)},
 'lib/followups.ts':{createFollowup:()=>action('createFollowup',{status:'open',duplicate:false})},
 'lib/voice-operations.ts':{},
 'lib/owner-alerts.ts':{scheduleOwnerAlert(){counts.ownerAlert=(counts.ownerAlert||0)+1;}},
};
function customRequire(name){
 if(name==='cloudflare:workers')return {env:{},waitUntil(promise){counts.waitUntil=(counts.waitUntil||0)+1;if(waitUntilFailure)throw Error('No execution context');tasks.push(promise);}};
 if(!name.startsWith('.'))throw Error('Unexpected import: '+name);
 const relative=path.posix.join('lib',name+'.ts');
 if(relative==='lib/monitoring-calls.ts'){
  counts.observerImport=(counts.observerImport||0)+1;if(observerFailure==='import')throw Error('Monitoring import unavailable');
  return {async recordMonitoredToolResult(id,tool,result){order.push('record');observations.push({id,tool,result:JSON.parse(JSON.stringify(result))});if(observerGate)await observerGate;if(observerFailure==='record')throw Error('Monitoring write unavailable');}};
 }
 if(relative==='lib/monitoring.ts')return {async reconcileMonitoringCall(id){order.push('reconcile');assert.equal(id,callId);counts.reconciles=(counts.reconciles||0)+1;if(observerFailure==='reconcile')throw Error('Incident service unavailable');}};
 if(stubs[relative])return stubs[relative];throw Error('Unexpected module: '+relative);
}
const filename=path.join(candidate||root,'lib/retell.ts'),compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}),moduleObject={exports:{}};
const context=vm.createContext({exports:moduleObject.exports,module:moduleObject,require:customRequire,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,Request,Response,URL,AbortSignal,Date,setTimeout,fetch:async(url,options)=>{counts.providerLookups=(counts.providerLookups||0)+1;order.push('provider');assert.equal(url,'https://api.retellai.com/v2/get-call/'+callId);assert.equal(options.method,'GET');if(providerFailure)throw Error('Provider unavailable');return Response.json(actual);},console:{error(){}}});
new vm.Script(compiled.outputText,{filename:'lib/retell.ts'}).runInContext(context);
const handler=moduleObject.exports.handleRetellTool;
function request(name='capture_lead',args={},callChanges={},validSignature=true){const body=JSON.stringify({name,args,call:{call_id:callId,agent_id:agentId,call_type:'phone_call',direction:'inbound',to_number:number,...callChanges},transcript:'PRIVATE_TRANSCRIPT_DO_NOT_OBSERVE'}),time=String(Date.now()),signature=createHmac('sha256',key).update(body+time).digest('hex');return new Request('https://schurrautomations.com/api/retell/tools',{method:'POST',headers:{'Content-Type':'application/json','x-retell-signature':validSignature?`v=${time},d=${signature}`:'invalid'},body});}
async function flush(){await new Promise(resolve=>setImmediate(resolve));await Promise.all(tasks);}
const tools=[['capture_lead','captureVoiceLead',{}],['stop_contact','pauseVoiceCall',{}],['check_availability','bookingSetup',{}],['book_appointment','createAppointment',{confirmed:true}],['request_handoff','createFollowup',{confirmed:true}],['current_appointment','currentCallAppointment',{}],['change_appointment','changeAppointment',{action:'cancel',confirmed:true}]];
(async()=>{
 let groups=0;const pass=name=>{groups++;console.log('PASS '+name);};
 for(const [tool,operation,args] of tools){reset();const result=await handler(request(tool,args));await flush();assert.equal(result.ok,true);assert.equal(counts[operation],1);assert.equal(counts.providerLookups,1);assert.deepEqual(observations,[{id:callId,tool,result:{ok:true,statusCode:200}}]);assert.equal(counts.reconciles,1);assert.ok(order.indexOf('provider')<order.indexOf(operation));assert.ok(order.indexOf(operation)<order.indexOf('record'));assert.ok(order.indexOf('record')<order.indexOf('reconcile'));assert.ok(!JSON.stringify(observations).includes('PRIVATE_TRANSCRIPT'));}
 pass('all seven verified actions execute once, then record only call/name/status before incident reconciliation');
 for(const [tool,operation,args] of tools){reset();const failure=new RequestError(409,'Original business rejection');failures[operation]=failure;await assert.rejects(()=>handler(request(tool,args)),error=>error===failure);await flush();assert.equal(counts[operation],1);assert.deepEqual(observations,[{id:callId,tool,result:{ok:false,statusCode:409}}]);assert.equal(counts.reconciles,1);}
 reset();const technical=new RequestError(503,'Original technical failure');failures.captureVoiceLead=technical;await assert.rejects(()=>handler(request()),error=>error===technical);await flush();assert.equal(observations[0].result.statusCode,503);assert.equal(counts.captureVoiceLead,1);
 reset();const unexpected=Error('Private underlying database detail');failures.captureVoiceLead=unexpected;await assert.rejects(()=>handler(request()),error=>error===unexpected);await flush();assert.deepEqual(observations[0].result,{ok:false,statusCode:500});assert.equal(counts.captureVoiceLead,1);
 pass('4xx business rejections and 5xx/unexpected failures retain the exact original error without retrying the action');
 for(const failure of ['import','record','reconcile']){reset();observerFailure=failure;const result=await handler(request());await flush();assert.equal(result.status,'saved');assert.equal(result.duplicate,false);assert.equal(counts.captureVoiceLead,1);assert.equal(counts.ownerAlert,1);assert.equal(counts.statusWrite,1);assert.equal(counts.observerImport,1);if(failure==='record')assert.equal(counts.reconciles,undefined);}
 reset();waitUntilFailure=true;assert.equal((await handler(request())).status,'saved');await flush();assert.equal(counts.captureVoiceLead,1);assert.equal(observations.length,1);assert.equal(counts.reconciles,1);
 reset();observerFailure='record';const error=new RequestError(502,'Business failure wins');failures.captureVoiceLead=error;await assert.rejects(()=>handler(request()),caught=>caught===error);await flush();assert.equal(counts.captureVoiceLead,1);
 pass('observer import/write/reconciliation and waitUntil failures cannot change success or replace a business error');
 reset();let release;observerGate=new Promise(resolve=>{release=resolve;});const saved=await Promise.race([handler(request()),new Promise((_,reject)=>setTimeout(()=>reject(Error('Monitoring delayed the voice result')),500))]);assert.equal(saved.status,'saved');assert.equal(counts.captureVoiceLead,1);assert.equal(counts.reconciles,undefined);release();await flush();assert.equal(counts.reconciles,1);
 pass('a slow observer stays in background and never holds the voice response open');
 for(const [tool,,args] of tools){reset();mode='test';receipt=null;assert.equal((await handler(request(tool,args))).status,'dry_run');await flush();assert.equal(counts.providerLookups,undefined);assert.equal(counts.observerImport,undefined);assert.equal(observations.length,0);reset();assert.equal((await handler(request(tool,args,{call_type:'web_call'}))).status,'dry_run');await flush();assert.equal(counts.observerImport,undefined);}
 reset();mode='test';receipt=null;assert.equal((await handler(request('capture_lead',{}, {call_id:'playground'}))).status,'dry_run');await flush();assert.equal(observations.length,0);
 pass('test-mode, playground and browser dry runs never import or write monitoring observations');
 for(const invalid of [()=>request('capture_lead',{}, {},false),()=>request('capture_lead',{}, {agent_id:'agent_other'}),()=>request('unknown_tool'),()=>request('capture_lead',{invalid:true})]){reset();await assert.rejects(()=>handler(invalid()));await flush();assert.equal(observations.length,0);assert.equal(counts.observerImport,undefined);assert.equal(counts.captureVoiceLead,undefined);}
 for(const mismatch of [{call_id:'call_other'},{agent_id:'agent_other'},{call_type:'web_call'},{direction:'outbound'},{to_number:'+19855550999'},{call_status:'registered'},{start_timestamp:undefined}]){reset();Object.assign(actual,mismatch);await assert.rejects(()=>handler(request()));await flush();assert.equal(counts.providerLookups,1);assert.equal(observations.length,0);assert.equal(counts.observerImport,undefined);assert.equal(counts.captureVoiceLead,undefined);}
 reset();providerFailure=true;await assert.rejects(()=>handler(request()));await flush();assert.equal(observations.length,0);assert.equal(counts.captureVoiceLead,undefined);
 pass('invalid signatures, arguments, tools, provider lookup failures and identity mismatches create no tool evidence');
 reset();mode='test';actual.call_status='error';assert.equal((await handler(request('stop_contact'))).status,'paused');await flush();assert.equal(counts.pauseVoiceCall,1);assert.equal(counts.providerLookups,1);assert.equal(observations[0].tool,'stop_contact');assert.equal(observations[0].result.ok,true);
 reset();receipt=null;await assert.rejects(()=>handler(request('book_appointment',{confirmed:true})),error=>error.status===409);await flush();assert.equal(counts.createAppointment,undefined);assert.deepEqual(observations[0].result,{ok:false,statusCode:409});
 pass('verified withdrawal exceptions remain observed; post-identity precondition rejections do not execute a write');
 console.log(groups+' Retell tool-observer groups passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
