const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{DatabaseSync}=require('node:sqlite'),{webcrypto,createHmac}=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=process.env.SCHURR_SOURCE_ROOT||root;
const ts=createRequire(process.env.SCHURR_PACKAGE_JSON||path.join(base,'package.json'))('typescript');
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync(path.join(base,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(base,'drizzle',file),'utf8'));
if(!sql.prepare("SELECT name FROM sqlite_master WHERE name='monitoring_calls'").get())sql.exec(fs.readFileSync(path.join(root,'tests/monitoring-calls-schema.sql'),'utf8'));
const runtime={INQUIRY_SIGNING_SECRET:'test-only-monitoring-signing-secret-'.repeat(3)};
let failBatchAt=-1,beforeBatch=null,networkCalls=0;
class Statement{
 constructor(query,values=[]){this.query=query;this.values=values;}
 bind(...values){return new Statement(this.query,values);}
 async first(){return sql.prepare(this.query).get(...this.values)||null;}
 async all(){return {results:sql.prepare(this.query).all(...this.values)};}
 async run(){return sql.prepare(this.query).run(...this.values);}
}
runtime.DB={prepare:q=>new Statement(q),async batch(statements){
 if(beforeBatch){const fn=beforeBatch;beforeBatch=null;fn();}
 sql.exec('BEGIN');try{const out=statements.map((s,i)=>{if(i===failBatchAt){failBatchAt=-1;throw Error('Injected statement failure');}return {results:sql.prepare(s.query).all(...s.values)};});sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}
}};
const modules=new Map();
function load(relative){
 if(modules.has(relative))return modules.get(relative);
 const selected=fs.existsSync(path.join(root,relative))?root:base,source=fs.readFileSync(path.join(selected,relative),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 const module={exports:{}};modules.set(relative,module.exports);
 const requireModule=name=>{
  if(name==='cloudflare:workers')return {env:runtime,waitUntil(){}};
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('.'))return load(path.posix.join(path.posix.dirname(relative),name+'.ts'));
  return require(name);
 };
 new vm.Script(compiled.outputText,{filename:relative}).runInNewContext({module,exports:module.exports,require:requireModule,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,URL,URLSearchParams,Date,Intl,btoa,atob,AbortSignal,setTimeout,console:{error(){}},fetch:()=>{networkCalls++;throw Error('No provider request is allowed in monitoring tests');}});
 return module.exports;
}
const calls=load('lib/monitoring-calls.ts'),route=load('app/api/retell/events/route.ts'),vault=load('lib/integration-secret.ts');
const key='fixture_retell_webhook_key_not_real_123456789',number='+13035550123',agent='agent_monitor_fixture';
const start=Date.parse('2026-10-01T18:00:00Z'),end=start+60000;
const payload=(id,event='call_ended',extra={})=>({event,call:{call_id:id,agent_id:agent,agent_version:0,call_type:'phone_call',direction:'inbound',to_number:number,from_number:'+13035550999',call_status:event==='call_started'?'ongoing':'ended',start_timestamp:start,...(event!=='call_started'?{end_timestamp:end,disconnection_reason:'user_hangup'}:{}),...extra}});
function signed(value,{time=String(Date.now()),secret=key,bodyOverride,headers={}}={}){
 const body=bodyOverride??JSON.stringify(value);
 return new Request('https://fixture.example/api/retell/events',{method:'POST',headers:{'content-type':'application/json','x-retell-signature':'v='+time+',d='+createHmac('sha256',secret).update(body+time).digest('hex'),...headers},body});
}
const send=value=>calls.receiveRetellEvent(signed(value));
const records=()=>sql.prepare('SELECT count(*) AS n FROM monitoring_calls').get().n;
const receipts=()=>sql.prepare('SELECT count(*) AS n FROM monitoring_call_events').get().n;
const monitoringDump=()=>JSON.stringify(['monitoring_calls','monitoring_call_events','monitoring_call_tools'].map(t=>sql.prepare('SELECT * FROM '+t).all()));
(async()=>{
 let groups=0;const pass=s=>{groups++;console.log('PASS '+s);};
 assert.equal((await route.POST(signed(payload('call_unconfigured')))).status,503);
 const cipher=await vault.encryptIntegrationSecret(key),now=new Date().toISOString();
 sql.prepare("INSERT INTO retell_connection(id,api_key_ciphertext,marker,agent_id,inbound_number,mode,updated_at) VALUES('retell',?,?,?,?,'test',?)").run(cipher,'fixture',agent,number,now);
 for(const req of [
  signed(payload('call_bad'),{secret:'wrong-key'}),signed(payload('call_old'),{time:String(Date.now()-300001)}),
  signed(payload('call_bad'),{headers:{'x-retell-signature':'not-a-signature'}}),
 ])assert.equal((await route.POST(req)).status,401);
 assert.equal(records(),0);assert.equal(receipts(),0);
 assert.equal((await route.POST(signed({}, {bodyOverride:'not JSON'}))).status,400);
 assert.equal((await route.POST(signed(payload('call_large'),{headers:{'content-length':String(512*1024+1)}}))).status,413);
 assert.equal((await route.POST(signed({x:'x'.repeat(512*1024)}))).status,413);
 assert.equal((await route.POST(signed(payload('call_type'),{headers:{'content-type':'text/plain'}}))).status,415);
 pass('saved encrypted key, exact raw signature, timestamp window, malformed JSON and bounded body');
 for(const extra of [{call_type:'web_call'},{direction:'outbound'},{agent_id:'agent_other'},{to_number:'+13035550124'},{to_number:undefined}]){
  const result=await send(payload('call_ignored','call_ended',extra));assert.equal(result.skipped,true);
 }
 assert.equal((await send({event:'transcript_updated',call:{transcript:'PRIVATE_TRANSCRIPT'}})).skipped,true);
 assert.equal(records(),0);assert.equal(receipts(),0);
 pass('browser, outbound, unrelated agent/number and unsupported events are acknowledged without storing anything');
 const sensitive=payload('call_safe','call_analyzed',{
  transcript:'PRIVATE_TRANSCRIPT',transcript_object:[{content:'PRIVATE_TRANSCRIPT_OBJECT'}],
  transcript_with_tool_calls:[{role:'tool_call_result',content:'PRIVATE_FAKE_TOOL_FAILURE',successful:false}],
  recording_url:'https://private.example/PRIVATE_RECORDING',metadata:{secret:'PRIVATE_METADATA'},
  call_analysis:{call_summary:'PRIVATE_SUMMARY says booked a meeting',call_successful:true,custom_analysis_data:{private:'PRIVATE_MODEL_DATA'}},
  disconnection_reason:'PRIVATE_ARBITRARY_REASON',latency:{e2e:{p50:815.2,p95:1400.7,values:['PRIVATE_LATENCY_ARRAY']}},
 });
 const accepted=await send(sensitive);assert.equal(accepted.callId,'call_safe');assert.equal(accepted.duplicate,false);
 const safe=await calls.getMonitoredCall('call_safe');assert.equal(safe.analysisReported,true);assert.equal(safe.providerReportedCallSuccessful,true);assert.equal(safe.agentVersion,0);assert.equal(safe.disconnectionReason,null);assert.equal(safe.latencyP50Ms,815);assert.equal(safe.latencyP95Ms,1401);assert.equal(safe.durationMs,60000);
 assert.equal(safe.actualCaptureCount,0);assert.equal(safe.actualVoiceBookingCount,0);assert.equal(safe.failedToolCount,null);assert.deepEqual(Array.from(safe.flagCodes),[]);
 for(const forbidden of ['PRIVATE_','+13035550999',number,'recording_url','call_summary','transcript'])assert.ok(!monitoringDump().includes(forbidden),forbidden);
 const duplicates=await Promise.all([send(sensitive),send(sensitive)]);assert.ok(duplicates.every(r=>r.duplicate));assert.equal(records(),1);assert.equal(receipts(),1);
 pass('strict scalar allowlist, zero transcript/contact/recording/model text persistence, no inferred booking/tool failures, and duplicate receipts');
 await send(payload('call_order','call_analyzed',{call_analysis:{call_successful:false},latency:{e2e:{p95:1300}}}));
 await send(payload('call_order','call_started',{call_status:'ongoing'}));
 await send(payload('call_order','call_ended',{latency:{e2e:{p50:800,p95:9999}}}));
 const ordered=await calls.getMonitoredCall('call_order');assert.equal(ordered.lifecycle,'analyzed');assert.equal(ordered.terminal,true);assert.equal(ordered.providerStatus,'ended');assert.equal(ordered.latencyP95Ms,1300);assert.equal(ordered.latencyP50Ms,800);assert.deepEqual(Array.from(ordered.flagCodes),['quality_review']);
 await send(payload('call_error','call_ended',{call_status:'error',disconnection_reason:'error_retell'}));
 await send(payload('call_error','call_analyzed',{call_status:'ongoing'}));await send(payload('call_error','call_started'));
 assert.equal((await calls.getMonitoredCall('call_error')).providerStatus,'error');assert.deepEqual(Array.from((await calls.getMonitoredCall('call_error')).flagCodes),['provider_error']);
 for(const reason of ['user_hangup','dial_busy','dial_no_answer','user_declined']){
  const id='call_normal_'+reason;await send(payload(id,'call_ended',{call_status:reason==='user_hangup'?'ended':'not_connected',disconnection_reason:reason}));assert.deepEqual(Array.from((await calls.getMonitoredCall(id)).flagCodes),[]);
 }
 pass('analyzed/ended/start reordering cannot reopen terminal calls; lower-rank data only fills gaps; ordinary hangup/no-answer/busy are not provider incidents');
 failBatchAt=1;await assert.rejects(()=>send(payload('call_rollback')),/Injected/);assert.equal(sql.prepare("SELECT count(*) n FROM monitoring_call_events WHERE call_id='call_rollback'").get().n,0);assert.equal(await calls.getMonitoredCall('call_rollback'),null);assert.equal((await send(payload('call_rollback'))).duplicate,false);
 beforeBatch=()=>sql.prepare("UPDATE retell_connection SET inbound_number='+13035550124' WHERE id='retell'").run();
 assert.equal((await send(payload('call_raced'))).skipped,true);assert.equal(await calls.getMonitoredCall('call_raced'),null);
 sql.prepare("UPDATE retell_connection SET inbound_number=? WHERE id='retell'").run(number);
 const pair=await Promise.all([send(payload('call_concurrent')),send(payload('call_concurrent'))]);assert.deepEqual(pair.map(r=>r.duplicate).sort(),[false,true]);
 pass('receipt/snapshot transaction rollback, admission-time account check and concurrent replay safety');
 const responseId=webcrypto.randomUUID(),voiceId=webcrypto.randomUUID(),ownerId=webcrypto.randomUUID();
 sql.prepare("INSERT INTO response_jobs(id,source_key,body_hash,channel,consent_scope,created_at,updated_at) VALUES(?,?,?,'phone','voice_callback_v1',?,?)").run(responseId,'call:retell:call_safe','fixture',now,now);
 const insertAppointment=sql.prepare("INSERT INTO appointments(id,request_key,body_hash,response_id,kind,name,start_ms,end_ms,busy_start_ms,busy_end_ms,timezone,notes,schedule_revision,created_at,updated_at) VALUES(?,?,?,?,'meeting','PRIVATE_APPOINTMENT_NAME',?,?,?,?,?,'PRIVATE_APPOINTMENT_NOTE',1,?,?)");
 insertAppointment.run(ownerId,webcrypto.randomUUID(),'fixture-owner',responseId,start,end,start,end,'America/Denver',now,now);
 let linked=await calls.getMonitoredCall('call_safe');assert.equal(linked.actualCaptureCount,1);assert.equal(linked.actualResponse.id,responseId);assert.equal(linked.actualVoiceAppointment,null);assert.equal(linked.otherLinkedAppointmentCount,1);
 insertAppointment.run(voiceId,'voice:retell:call_safe','fixture-voice',responseId,start+120000,end+120000,start+120000,end+120000,'America/Denver',now,now);
 linked=await calls.getMonitoredCall('call_safe');assert.equal(linked.actualVoiceAppointment.id,voiceId);assert.equal(linked.actualVoiceBookingCount,1);assert.equal(linked.otherLinkedAppointmentCount,1);assert.ok(!JSON.stringify(linked).includes('PRIVATE_APPOINTMENT'));
 sql.prepare("UPDATE appointments SET status='cancelled' WHERE id=?").run(voiceId);linked=await calls.getMonitoredCall('call_safe');assert.equal(linked.actualVoiceAppointment.status,'cancelled');assert.equal(linked.actualVoiceBookingCount,0);
 pass('fresh CRM joins use exact source key; owner-created appointments never count as voice bookings; cancellation and private appointment data stay accurate');
 await calls.recordMonitoredToolResult('call_tools','capture_lead',{ok:true,statusCode:200});
 await calls.recordMonitoredToolResult('call_tools','book_appointment',{ok:false,statusCode:409});
 await calls.recordMonitoredToolResult('call_tools','book_appointment',{ok:false});
 assert.equal(await calls.getMonitoredCall('call_tools'),null);
 await send(payload('call_tools'));
 let tools=await calls.getMonitoredCall('call_tools');assert.equal(tools.toolAttempts,3);assert.equal(tools.toolSuccesses,1);assert.equal(tools.rejectedToolCount,1);assert.equal(tools.unclassifiedToolCount,1);assert.equal(tools.failedToolCount,0);assert.deepEqual(Array.from(tools.flagCodes),[]);
 await calls.recordMonitoredToolResult('call_tools','book_appointment',{ok:false,statusCode:503});
 await calls.recordMonitoredToolResult('call_tools','book_appointment',{ok:true,statusCode:200});
 tools=await calls.getMonitoredCall('call_tools');assert.equal(tools.toolAttempts,5);assert.equal(tools.failedToolCount,1);assert.equal(tools.lifecycle,'ended');assert.ok(tools.lastToolAt);assert.deepEqual(Array.from(tools.flagCodes),['tool_error']);
 for(const [name,result] of [['unknown',{ok:true}],['capture_lead',{ok:true,args:'PRIVATE_ARGS'}],['capture_lead',{ok:'yes'}],['capture_lead',{ok:true,statusCode:503}]]){
  await assert.rejects(()=>calls.recordMonitoredToolResult('call_tools',name,result),/Invalid tool observation/);
 }
 assert.equal((await calls.getMonitoredCall('call_tools')).toolAttempts,5);
 pass('local tool observations only, retries counted as attempts, 4xx rejection vs 5xx outage, unknown outcomes explicit, terminal lifecycle untouched');
 await send(payload('call_revision','call_started'));
 let revisionCall=await calls.getMonitoredCall('call_revision');assert.equal(revisionCall.observationRevision,1);
 assert.equal((await calls.pendingMonitoredCalls()).some(c=>c.callId==='call_revision'&&c.revision===1),true);
 assert.equal(await calls.markMonitoredCallReconciled('call_revision',1),true);
 assert.equal(await calls.markMonitoredCallReconciled('call_revision',1),false);
 assert.equal((await calls.pendingMonitoredCalls()).some(c=>c.callId==='call_revision'),false);
 assert.equal((await send(payload('call_revision','call_started'))).duplicate,true);
 assert.equal((await calls.getMonitoredCall('call_revision')).observationRevision,1);
 assert.equal((await calls.pendingMonitoredCalls()).some(c=>c.callId==='call_revision'),false);
 await send(payload('call_revision','call_ended'));
 revisionCall=await calls.getMonitoredCall('call_revision');assert.equal(revisionCall.observationRevision,2);
 assert.equal(await calls.markMonitoredCallReconciled('call_revision',1),false);
 await calls.recordMonitoredToolResult('call_revision','capture_lead',{ok:false,statusCode:503});
 assert.equal((await calls.getMonitoredCall('call_revision')).observationRevision,3);
 assert.equal(await calls.markMonitoredCallReconciled('call_revision',revisionCall.observationRevision),false);
 assert.equal((await calls.pendingMonitoredCalls()).some(c=>c.callId==='call_revision'&&c.revision===3),true);
 assert.equal(await calls.markMonitoredCallReconciled('call_revision',3),true);
 assert.equal((await calls.pendingMonitoredCalls()).some(c=>c.callId==='call_revision'),false);
 assert.equal(await calls.markMonitoredCallReconciled('call_not_present',1),false);
 for(const invalid of [0,-1,1.5,101,NaN,'20'])await assert.rejects(()=>calls.pendingMonitoredCalls(invalid),/pending call limit/);
 for(const invalid of [0,-1,1.5,NaN,'3'])await assert.rejects(()=>calls.markMonitoredCallReconciled('call_revision',invalid),/observation revision/);
 for(const row of await calls.pendingMonitoredCalls())assert.deepEqual(Object.keys(row).sort(),['callId','revision']);
 pass('durable pending revisions, duplicate events stay reconciled, and concurrent observations defeat stale compare-and-set marks');
 const beforeFailedTool=await calls.getMonitoredCall('call_revision');
 failBatchAt=1;await assert.rejects(()=>calls.recordMonitoredToolResult('call_revision','capture_lead',{ok:false,statusCode:503}),/Injected/);
 const afterFailedTool=await calls.getMonitoredCall('call_revision');
 assert.equal(afterFailedTool.observationRevision,beforeFailedTool.observationRevision);assert.equal(afterFailedTool.toolAttempts,beforeFailedTool.toolAttempts);assert.equal(afterFailedTool.failedToolCount,beforeFailedTool.failedToolCount);
 assert.equal((await calls.pendingMonitoredCalls()).some(c=>c.callId==='call_revision'),false);
 await calls.recordMonitoredToolResult('call_before_event','capture_lead',{ok:false,statusCode:503});
 assert.equal((await calls.pendingMonitoredCalls()).some(c=>c.callId==='call_before_event'),false);
 await send(payload('call_before_event'));
 const beforeEvent=await calls.getMonitoredCall('call_before_event');assert.equal(beforeEvent.observationRevision,1);assert.equal(beforeEvent.failedToolCount,1);
 assert.equal((await calls.pendingMonitoredCalls()).some(c=>c.callId==='call_before_event'&&c.revision===1),true);
 pass('tool aggregate and revision increment roll back together; observations before the first event are recovered by its initial pending revision');
 sql.exec('DELETE FROM monitoring_call_events; DELETE FROM monitoring_calls; DELETE FROM monitoring_call_tools');
 const add=sql.prepare("INSERT INTO monitoring_calls(call_id,agent_id,lifecycle_rank,provider_status,first_received_at,last_received_at) VALUES(?,? ,1,'ongoing',?,?)");
 for(let i=0;i<55;i++)add.run('call_page'+String(i).padStart(3,'0'),agent,now,now);
 assert.equal((await calls.pendingMonitoredCalls()).length,20);assert.equal((await calls.pendingMonitoredCalls(1)).length,1);assert.equal((await calls.pendingMonitoredCalls(100)).length,55);
 const page1=await calls.listMonitoredCalls();assert.equal(page1.items.length,50);assert.equal(page1.hasMore,true);assert.ok(page1.nextCursor);
 sql.prepare("UPDATE monitoring_calls SET last_received_at=? WHERE call_id='call_page000'").run(new Date(Date.now()+1000).toISOString());
 add.run('call_new_head',agent,new Date(Date.now()+2000).toISOString(),now);
 const page2=await calls.listMonitoredCalls(page1.nextCursor);assert.equal(page2.items.length,5);assert.equal(page2.hasMore,false);assert.equal(page2.nextCursor,null);
 assert.equal(new Set([...page1.items,...page2.items].map(c=>c.callId)).size,55);
 for(const cursor of ['bad!', 'a'.repeat(513), btoa(JSON.stringify(['2026-02-31T00:00:00.000Z','call_page000'])).replace(/=+$/,'')])await assert.rejects(()=>calls.listMonitoredCalls(cursor),/cursor/);
 assert.equal(networkCalls,0);
 pass('bounded 50-row keyset pages remain stable across later lifecycle activity; malformed cursors fail without provider calls');
 console.log(groups+' monitoring call groups passed. No provider actions.');
})().catch(e=>{console.error(e);process.exit(1);});

