import {database,RequestError,readBoundedText} from './inquiries';
import {decryptIntegrationSecret} from './integration-secret';
import {verifyRetellSignature} from './retell';

const CALL_ID=/^call_[A-Za-z0-9_-]{1,100}$/;
const EVENTS={call_started:1,call_ended:2,call_analyzed:3} as const;
const TOOL_NAMES=['capture_lead','stop_contact','check_availability','book_appointment','request_handoff','current_appointment','change_appointment'] as const;
const REASONS=new Set([
 'user_hangup','agent_hangup','call_transfer','voicemail_reached','ivr_reached','inactivity','max_duration_reached',
 'concurrency_limit_reached','no_concurrency_fallback','no_valid_payment','scam_detected','dial_busy','dial_failed','dial_no_answer',
 'invalid_destination','telephony_provider_permission_denied','telephony_provider_unavailable','sip_routing_error','marked_as_spam',
 'network_blocked','user_declined','error_llm_websocket_open','error_llm_websocket_lost_connection','error_llm_websocket_runtime',
 'error_llm_websocket_corrupt_payload','error_no_audio_received','error_asr','error_retell','error_unknown','error_user_not_joined',
 'registered_call_timeout','transfer_bridged','transfer_cancelled','manual_stopped','call_take_over',
]);
const ERROR_REASONS=new Set([
 'concurrency_limit_reached','no_valid_payment','invalid_destination','telephony_provider_permission_denied',
 'telephony_provider_unavailable','sip_routing_error','error_llm_websocket_open','error_llm_websocket_lost_connection',
 'error_llm_websocket_runtime','error_llm_websocket_corrupt_payload','error_no_audio_received','error_asr','error_retell',
 'error_unknown','error_user_not_joined','registered_call_timeout',
]);
type EventType=keyof typeof EVENTS;
type Connection={apiKeyCiphertext:string;agentId:string;inboundNumber:string};
type Snapshot={
 callId:string;agentId:string;agentVersion:number|null;lifecycleRank:number;providerStatus:string;
 startedAtMs:number|null;endedAtMs:number|null;disconnectionReason:string|null;providerError:number;
 latencyP50Ms:number|null;latencyP95Ms:number|null;analysisReported:number;aiCallSuccessful:number|null;
 firstReceivedAt:string;lastReceivedAt:string;observationRevision:number;
};
type Joined=Snapshot&{
 responseId:string|null;responseStatus:string|null;voiceAppointmentId:string|null;voiceAppointmentStatus:string|null;
 otherLinkedAppointmentCount:number;toolAttempts:number|null;toolSuccesses:number|null;failedToolCount:number|null;
 rejectedToolCount:number|null;unclassifiedToolCount:number|null;lastToolAt:string|null;
};
export type MonitoringFlag='provider_error'|'tool_error'|'quality_review';
export type MonitoredCall=Omit<Snapshot,'lifecycleRank'|'providerError'|'analysisReported'|'aiCallSuccessful'>&{
 lifecycle:'started'|'ended'|'analyzed';terminal:boolean;providerError:boolean;analysisReported:boolean;
 providerReportedCallSuccessful:boolean|null;durationMs:number|null;
 actualResponse:{id:string;status:string}|null;actualCaptureCount:number;
 actualVoiceAppointment:{id:string;status:string}|null;actualVoiceBookingCount:number;otherLinkedAppointmentCount:number;
 toolAttempts:number|null;toolSuccesses:number|null;failedToolCount:number|null;rejectedToolCount:number|null;
 unclassifiedToolCount:number|null;lastToolAt:string|null;flagCodes:MonitoringFlag[];
};
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const boundedNumber=(value:unknown,max:number):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max?Math.round(value):null;
const timestamp=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=946684800000&&value<=4102444800000?value:null;
function validCallId(value:unknown):string{if(typeof value!=='string'||!CALL_ID.test(value))throw new RequestError(400,'Invalid call reference.');return value;}
function sanitize(call:Record<string,unknown>,event:EventType){
 const start=timestamp(call.start_timestamp),end=timestamp(call.end_timestamp);
 const reason=typeof call.disconnection_reason==='string'&&REASONS.has(call.disconnection_reason)?call.disconnection_reason:null;
 const statuses=['registered','ongoing','ended','error','not_connected'];
 const reportedStatus=typeof call.call_status==='string'&&statuses.includes(call.call_status)?call.call_status:'unknown';
 const status=EVENTS[event]>=2&&['registered','ongoing'].includes(reportedStatus)?'unknown':reportedStatus;
 const latency=object(object(call.latency)?.e2e),analysis=event==='call_analyzed'?object(call.call_analysis):null;
 return {
  callId:validCallId(call.call_id),agentId:String(call.agent_id),
  agentVersion:typeof call.agent_version==='number'&&Number.isSafeInteger(call.agent_version)&&call.agent_version>=0&&call.agent_version<=1000000000?call.agent_version:null,
  lifecycleRank:EVENTS[event],providerStatus:status,startedAtMs:start,endedAtMs:end!==null&&(start===null||end>=start)?end:null,
  disconnectionReason:reason,providerError:status==='error'||(reason!==null&&ERROR_REASONS.has(reason))?1:0,
  latencyP50Ms:boundedNumber(latency?.p50,600000),latencyP95Ms:boundedNumber(latency?.p95,600000),
  analysisReported:analysis?1:0,aiCallSuccessful:typeof analysis?.call_successful==='boolean'?Number(analysis.call_successful):null,
 };
}
const SAME_CONNECTION="EXISTS(SELECT 1 FROM retell_connection WHERE id='retell' AND api_key_ciphertext=? AND agent_id=? AND inbound_number=?)";
/** Receive signed provider facts only. Does not call providers, create leads or mutate appointments. */
export async function receiveRetellEvent(request:Request):Promise<{ok:true;callId?:string;duplicate?:boolean;skipped?:boolean}>{
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new RequestError(415,'Send a JSON call event.');
 const db=database(),connection=await db.prepare("SELECT api_key_ciphertext AS apiKeyCiphertext,agent_id AS agentId,inbound_number AS inboundNumber FROM retell_connection WHERE id='retell'").first<Connection>();
 if(!connection)throw new RequestError(503,'Connect Retell before receiving call events.');
 const raw=await readBoundedText(request,512*1024),key=await decryptIntegrationSecret(connection.apiKeyCiphertext);
 if(!await verifyRetellSignature(raw,request.headers.get('x-retell-signature')||'',key))throw new RequestError(401,'Invalid Retell signature.');
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new RequestError(400,'Invalid call event.');}
 const input=object(parsed);if(!input)throw new RequestError(400,'Invalid call event.');
 if(typeof input.event!=='string'||!Object.hasOwn(EVENTS,input.event))return {ok:true,skipped:true};
 const call=object(input.call);if(!call)throw new RequestError(400,'Invalid call event.');
 // Web calls, outbound calls and unrelated accounts are acknowledged without storage.
 // Only the saved number is authoritative; an environment fallback cannot enroll a call.
 if(call.call_type!=='phone_call'||call.direction!=='inbound'||!connection.agentId||!/^agent_[A-Za-z0-9_-]{1,120}$/.test(connection.agentId)||
  !/^\+[1-9]\d{7,14}$/.test(connection.inboundNumber)||call.agent_id!==connection.agentId||call.to_number!==connection.inboundNumber)return {ok:true,skipped:true};
 const event=input.event as EventType,s=sanitize(call,event),now=new Date().toISOString(),token=crypto.randomUUID();
 const scope=[connection.apiKeyCiphertext,connection.agentId,connection.inboundNumber];
 const results=await db.batch([
  db.prepare("INSERT INTO monitoring_call_events(call_id,event_type,receipt_token,received_at) SELECT ?,?,?,? WHERE "+SAME_CONNECTION+
   " AND NOT EXISTS(SELECT 1 FROM monitoring_calls WHERE call_id=? AND agent_id!=?) ON CONFLICT(call_id,event_type) DO NOTHING RETURNING call_id")
   .bind(s.callId,event,token,now,...scope,s.callId,s.agentId),
  db.prepare("INSERT INTO monitoring_calls(call_id,agent_id,agent_version,lifecycle_rank,provider_status,started_at_ms,ended_at_ms,disconnection_reason,provider_error,latency_p50_ms,latency_p95_ms,analysis_reported,ai_call_successful,first_received_at,last_received_at) "+
   "SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitoring_call_events WHERE call_id=? AND event_type=? AND receipt_token=?) "+
   "ON CONFLICT(call_id) DO UPDATE SET "+
   "observation_revision=monitoring_calls.observation_revision+1,"+
   "agent_version=COALESCE(monitoring_calls.agent_version,excluded.agent_version),"+
   "lifecycle_rank=MAX(monitoring_calls.lifecycle_rank,excluded.lifecycle_rank),"+
   "provider_status=CASE WHEN monitoring_calls.provider_status='error' THEN 'error' WHEN excluded.lifecycle_rank>=monitoring_calls.lifecycle_rank AND excluded.provider_status!='unknown' THEN excluded.provider_status ELSE monitoring_calls.provider_status END,"+
   "started_at_ms=COALESCE(monitoring_calls.started_at_ms,excluded.started_at_ms),"+
   "ended_at_ms=CASE WHEN monitoring_calls.ended_at_ms IS NULL THEN excluded.ended_at_ms WHEN excluded.ended_at_ms IS NULL THEN monitoring_calls.ended_at_ms ELSE MAX(monitoring_calls.ended_at_ms,excluded.ended_at_ms) END,"+
   "disconnection_reason=CASE WHEN excluded.lifecycle_rank>=monitoring_calls.lifecycle_rank THEN COALESCE(excluded.disconnection_reason,monitoring_calls.disconnection_reason) ELSE COALESCE(monitoring_calls.disconnection_reason,excluded.disconnection_reason) END,"+
   "provider_error=MAX(monitoring_calls.provider_error,excluded.provider_error),"+
   "latency_p50_ms=CASE WHEN excluded.lifecycle_rank>=monitoring_calls.lifecycle_rank THEN COALESCE(excluded.latency_p50_ms,monitoring_calls.latency_p50_ms) ELSE COALESCE(monitoring_calls.latency_p50_ms,excluded.latency_p50_ms) END,"+
   "latency_p95_ms=CASE WHEN excluded.lifecycle_rank>=monitoring_calls.lifecycle_rank THEN COALESCE(excluded.latency_p95_ms,monitoring_calls.latency_p95_ms) ELSE COALESCE(monitoring_calls.latency_p95_ms,excluded.latency_p95_ms) END,"+
   "analysis_reported=MAX(monitoring_calls.analysis_reported,excluded.analysis_reported),ai_call_successful=COALESCE(monitoring_calls.ai_call_successful,excluded.ai_call_successful),last_received_at=excluded.last_received_at")
   .bind(s.callId,s.agentId,s.agentVersion,s.lifecycleRank,s.providerStatus,s.startedAtMs,s.endedAtMs,s.disconnectionReason,s.providerError,s.latencyP50Ms,s.latencyP95Ms,s.analysisReported,s.aiCallSuccessful,now,now,s.callId,event,token),
  db.prepare("SELECT e.call_id FROM monitoring_call_events e JOIN monitoring_calls m ON m.call_id=e.call_id WHERE e.call_id=? AND e.event_type=? AND m.agent_id=? AND "+SAME_CONNECTION)
   .bind(s.callId,event,s.agentId,...scope),
 ]);
 if(!results[2]?.results?.length)return {ok:true,skipped:true};
 return {ok:true,callId:s.callId,duplicate:!results[0]?.results?.length};
}

/** Call only after canonical provider identity verification inside handleRetellTool.
 * Counts actual handler observations (retries included), never transcript or model claims.
 * Root must isolate observer failures from the voice action and its result.
 */
export async function recordMonitoredToolResult(callId:unknown,toolName:unknown,result:{ok:boolean;statusCode?:number}):Promise<void>{
 const id=validCallId(callId);
 if(typeof toolName!=='string'||!(TOOL_NAMES as readonly string[]).includes(toolName)||!object(result)||typeof result.ok!=='boolean'||
  Object.keys(result).some(k=>!['ok','statusCode'].includes(k))||
  (result.statusCode!==undefined&&(!Number.isSafeInteger(result.statusCode)||result.statusCode<100||result.statusCode>599))||
  (result.ok&&result.statusCode!==undefined&&result.statusCode>=400))throw new RequestError(400,'Invalid tool observation.');
 const code=result.statusCode??null,technical=!result.ok&&code!==null&&code>=500?1:0,rejected=!result.ok&&code!==null&&code>=400&&code<500?1:0;
 const db=database();
 await db.batch([db.prepare("INSERT INTO monitoring_call_tools(call_id,tool_name,attempts,successes,technical_failures,rejected_actions,unclassified_failures,last_status_code,last_observed_at) "+
  "VALUES(?,?,1,?,?,?,?,?,?) ON CONFLICT(call_id,tool_name) DO UPDATE SET attempts=monitoring_call_tools.attempts+1,successes=monitoring_call_tools.successes+excluded.successes,"+
  "technical_failures=monitoring_call_tools.technical_failures+excluded.technical_failures,rejected_actions=monitoring_call_tools.rejected_actions+excluded.rejected_actions,"+
  "unclassified_failures=monitoring_call_tools.unclassified_failures+excluded.unclassified_failures,last_status_code=excluded.last_status_code,last_observed_at=excluded.last_observed_at")
  .bind(id,toolName,Number(result.ok),technical,rejected,!result.ok&&!technical&&!rejected?1:0,code,new Date().toISOString()),
  db.prepare("UPDATE monitoring_calls SET observation_revision=observation_revision+1 WHERE call_id=?").bind(id),
 ]);
}
const SELECT="SELECT m.call_id AS callId,m.agent_id AS agentId,m.agent_version AS agentVersion,m.lifecycle_rank AS lifecycleRank,m.provider_status AS providerStatus,"+
 "m.started_at_ms AS startedAtMs,m.ended_at_ms AS endedAtMs,m.disconnection_reason AS disconnectionReason,m.provider_error AS providerError,m.latency_p50_ms AS latencyP50Ms,m.latency_p95_ms AS latencyP95Ms,m.analysis_reported AS analysisReported,m.ai_call_successful AS aiCallSuccessful,m.first_received_at AS firstReceivedAt,m.last_received_at AS lastReceivedAt,m.observation_revision AS observationRevision,"+
 "r.id AS responseId,r.status AS responseStatus,a.id AS voiceAppointmentId,a.status AS voiceAppointmentStatus,"+
 "(SELECT count(*) FROM appointments other WHERE other.response_id=r.id AND other.request_key!='voice:retell:'||m.call_id) AS otherLinkedAppointmentCount,"+
 "(SELECT sum(attempts) FROM monitoring_call_tools t WHERE t.call_id=m.call_id) AS toolAttempts,"+
 "(SELECT sum(successes) FROM monitoring_call_tools t WHERE t.call_id=m.call_id) AS toolSuccesses,"+
 "(SELECT sum(technical_failures) FROM monitoring_call_tools t WHERE t.call_id=m.call_id) AS failedToolCount,"+
 "(SELECT sum(rejected_actions) FROM monitoring_call_tools t WHERE t.call_id=m.call_id) AS rejectedToolCount,"+
 "(SELECT sum(unclassified_failures) FROM monitoring_call_tools t WHERE t.call_id=m.call_id) AS unclassifiedToolCount,"+
 "(SELECT max(last_observed_at) FROM monitoring_call_tools t WHERE t.call_id=m.call_id) AS lastToolAt "+
 "FROM monitoring_calls m LEFT JOIN response_jobs r ON r.source_key='call:retell:'||m.call_id "+
 "LEFT JOIN appointments a ON a.response_id=r.id AND a.request_key='voice:retell:'||m.call_id ";
function present(row:Joined):MonitoredCall{
 const {lifecycleRank,providerError,analysisReported,aiCallSuccessful,responseId,responseStatus,voiceAppointmentId,voiceAppointmentStatus,...rest}=row;
 const flags:MonitoringFlag[]=[];
 if(providerError===1)flags.push('provider_error');
 if((row.failedToolCount??0)>0)flags.push('tool_error');
 if(aiCallSuccessful===0)flags.push('quality_review');
 return {...rest,lifecycle:lifecycleRank>=3?'analyzed':lifecycleRank>=2?'ended':'started',
  terminal:lifecycleRank>=2||['ended','error','not_connected'].includes(row.providerStatus),
  providerError:providerError===1,analysisReported:analysisReported===1,providerReportedCallSuccessful:aiCallSuccessful===null?null:aiCallSuccessful===1,
  durationMs:row.startedAtMs!==null&&row.endedAtMs!==null&&row.endedAtMs>=row.startedAtMs&&row.endedAtMs-row.startedAtMs<=86400000?row.endedAtMs-row.startedAtMs:null,
  actualResponse:responseId?{id:responseId,status:responseStatus!}:null,actualCaptureCount:responseId?1:0,
  actualVoiceAppointment:voiceAppointmentId?{id:voiceAppointmentId,status:voiceAppointmentStatus!}:null,
  actualVoiceBookingCount:voiceAppointmentId&&voiceAppointmentStatus==='booked'?1:0,flagCodes:flags};
}
export async function getMonitoredCall(callId:unknown):Promise<MonitoredCall|null>{
 const row=await database().prepare(SELECT+'WHERE m.call_id=?').bind(validCallId(callId)).first<Joined>();return row?present(row):null;
}
function decodeCursor(cursor:unknown):[string,string]|null{
 if(cursor===undefined||cursor===null||cursor==='')return null;
 if(typeof cursor!=='string'||cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor))throw new RequestError(400,'Invalid call history cursor.');
 try{const decoded=JSON.parse(atob(cursor.replace(/-/g,'+').replace(/_/g,'/')));if(!Array.isArray(decoded)||decoded.length!==2||typeof decoded[0]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(decoded[0])||!Number.isFinite(Date.parse(decoded[0]))||new Date(decoded[0]).toISOString()!==decoded[0])throw Error();return [decoded[0],validCallId(decoded[1])];}catch{throw new RequestError(400,'Invalid call history cursor.');}
}
/** Owner-authenticated consumers only. Stable first-receipt keyset, 50 rows per page. */
export async function listMonitoredCalls(cursor?:unknown):Promise<{items:MonitoredCall[];hasMore:boolean;nextCursor:string|null}>{
 const key=decodeCursor(cursor);
 const query=SELECT+(key?'WHERE (m.first_received_at<? OR (m.first_received_at=? AND m.call_id<?)) ':'')+'ORDER BY m.first_received_at DESC,m.call_id DESC LIMIT 51';
 const rows=(await database().prepare(query).bind(...(key?[key[0],key[0],key[1]]:[])).all<Joined>()).results;
 const hasMore=rows.length>50,items=rows.slice(0,50).map(present),last=items.at(-1);
 return {items,hasMore,nextCursor:hasMore&&last?btoa(JSON.stringify([last.firstReceivedAt,last.callId])).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null};
}

/** Durable recovery queue. Root reconciles only a bounded page per pass. */
export async function pendingMonitoredCalls(limit=20):Promise<{callId:string;revision:number}[]>{
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new RequestError(400,'Invalid pending call limit.');
 return (await database().prepare("SELECT call_id AS callId,observation_revision AS revision FROM monitoring_calls WHERE reconciled_revision<observation_revision ORDER BY first_received_at,call_id LIMIT ?").bind(limit).all<{callId:string;revision:number}>()).results;
}
/** Mark only the exact snapshot reconciled. A concurrent observation stays pending. */
export async function markMonitoredCallReconciled(callId:unknown,revision:number):Promise<boolean>{
 const id=validCallId(callId);
 if(!Number.isSafeInteger(revision)||revision<1)throw new RequestError(400,'Invalid call observation revision.');
 const marked=await database().prepare("UPDATE monitoring_calls SET reconciled_revision=? WHERE call_id=? AND observation_revision=? AND reconciled_revision<? RETURNING call_id").bind(revision,id,revision,revision).first<{call_id:string}>();
 return marked!==null;
}
