import {currentCallAppointment,changeAppointment} from './appointment-actions';
import {env,waitUntil} from 'cloudflare:workers';
import {database,RequestError,readBoundedText} from './inquiries';
import {encryptIntegrationSecret,decryptIntegrationSecret} from './integration-secret';
import {retellLLMConfig,retellAgentConfig} from './retell-profile';
import {captureVoiceLead,validateVoiceEvent,pauseVoiceCall} from './voice-intake';
import {localParts,appointmentTimeLabel} from './booking-policy';
import {availableSlots,bookingSetup,createAppointment} from './booking';
import {createFollowup} from './followups';
import {syncRoutedVoiceOperations} from './monitoring-retell';
import {scheduleOwnerAlert} from './owner-alerts';

type Connection={id:string;apiKeyCiphertext:string;marker:string;llmId:string;agentId:string;voiceId:string;phase:string;mode:string;inboundNumber:string;lockToken:string;lockUntil:number;lastVerifiedAt:string;lastCapturedAt:string;updatedAt:string};
export type RetellSetup={connected:boolean;agentId:string;llmId:string;phase:string;mode:string;inboundNumber:string;lastVerifiedAt:string;lastCapturedAt:string;busy:boolean};
export type RetellVoice={id:string;name:string;provider:string;accent:string};
const encoder=new TextEncoder();
const ID=/^[A-Za-z0-9_-]{1,120}$/;
const select=`SELECT id,api_key_ciphertext AS apiKeyCiphertext,marker,llm_id AS llmId,agent_id AS agentId,voice_id AS voiceId,phase,mode,inbound_number AS inboundNumber,lock_token AS lockToken,lock_until AS lockUntil,last_verified_at AS lastVerifiedAt,last_captured_at AS lastCapturedAt,updated_at AS updatedAt FROM retell_connection WHERE id='retell'`;
const readConnection=()=>database().prepare(select).first<Connection>();
async function connection(){const row=await readConnection();if(!row)throw new RequestError(503,'Connect Retell in receptionist setup first.');return row;}
function configuredRetellNumber(){const value=(env as unknown as {RETELL_INBOUND_NUMBER?:string}).RETELL_INBOUND_NUMBER?.trim()||'';return /^\+[1-9]\d{7,14}$/.test(value)?value:'';}
export async function retellSetup():Promise<RetellSetup>{const row=await readConnection();return {connected:Boolean(row),agentId:row?.agentId||'',llmId:row?.llmId||'',phase:row?.phase||'disconnected',mode:row?.mode||'test',inboundNumber:row?.inboundNumber||configuredRetellNumber(),lastVerifiedAt:row?.lastVerifiedAt||'',lastCapturedAt:row?.lastCapturedAt||'',busy:Boolean(row&&row.lockUntil>Date.now())};}

/** Called only after owner authentication, for keys supplied through Site secrets. */
export async function initializeRetellConnection(){
  if(await readConnection())return;
  const supplied=(env as unknown as {RETELL_API_KEY?:string}).RETELL_API_KEY;
  if(supplied)await connectRetell(supplied);
}

class RetellAPIError extends RequestError {constructor(public rejected:boolean,message:string){super(502,message);}}
async function api(key:string,path:string,method='GET',payload?:unknown):Promise<any>{
  let response:Response;
  // workerd supports manual/follow only. Manual keeps the bearer credential
  // on this exact host; rejecting 3xx below is equivalent to error mode.
  try{response=await fetch(`https://api.retellai.com${path}`,{method,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(path.startsWith('/v2/get-call/')?7000:20000),redirect:'manual'});}
  catch(error){throw new RetellAPIError(false,error instanceof Error&&error.name==='TimeoutError'?'Retell took too long to respond. Refresh setup before trying again.':'The server could not reach Retell. Refresh setup before trying again.');}
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw new RetellAPIError(false,'Retell returned an unexpected redirect. The request was stopped without forwarding your key.');}
  if(!response.ok){await response.body?.cancel();throw new RetellAPIError(response.status>=400&&response.status<500&&![408,429].includes(response.status),response.status===401||response.status===403?'Retell rejected this key or its permissions. Check it in your Retell account.':'Retell could not complete setup. Check your account and try again.');}
  try{return await response.json();}catch{throw new RetellAPIError(false,'Retell returned an unreadable response. Check setup before trying again.');}
}
function voicesFrom(value:unknown):RetellVoice[]{
  if(!Array.isArray(value))throw new RequestError(502,'Retell did not return its voice list.');
  return value.filter(v=>v&&typeof v.voice_id==='string'&&typeof v.voice_name==='string'&&['platform','elevenlabs'].includes(v.provider)).map(v=>({id:v.voice_id,name:v.voice_name,provider:v.provider,accent:typeof v.accent==='string'?v.accent:''})).sort((a,b)=>a.provider===b.provider?a.name.localeCompare(b.name):a.provider==='platform'?-1:1);
}
export async function retellVoices(){const row=await connection();return voicesFrom(await api(await decryptIntegrationSecret(row.apiKeyCiphertext),'/list-voices'));}
export async function connectRetell(value:unknown){
  if(typeof value!=='string'||value.length<20||value.length>512||/\s/.test(value))throw new RequestError(400,'Enter the Retell API key marked for webhooks.');
  const voices=voicesFrom(await api(value,'/list-voices')),row=await readConnection();
  if(row?.agentId){const agent=await api(value,`/get-agent/${encodeURIComponent(row.agentId)}`);if(agent.response_engine?.llm_id!==row.llmId)throw new RequestError(409,'This key does not match the existing Schurr receptionist.');}
  if(row?.llmId){const llm=await api(value,`/get-retell-llm/${encodeURIComponent(row.llmId)}`);if(llm.default_dynamic_variables?.schurr_config_id!==row.marker)throw new RequestError(409,'This key does not match the existing Schurr conversation setup.');}
  if(row?.phase==='llm_requested'&&!row.llmId&&value!==await decryptIntegrationSecret(row.apiKeyCiphertext))throw new RequestError(409,'Recover the interrupted setup using the original key before replacing it.');
  const ciphertext=await encryptIntegrationSecret(value),now=new Date().toISOString();
  const saved=await database().prepare(`INSERT INTO retell_connection(id,api_key_ciphertext,marker,updated_at) VALUES('retell',?,?,?)
    ON CONFLICT(id) DO UPDATE SET api_key_ciphertext=excluded.api_key_ciphertext,updated_at=excluded.updated_at
    WHERE retell_connection.lock_until<=? RETURNING id`).bind(ciphertext,crypto.randomUUID(),now,Date.now()).first();
  if(!saved)throw new RequestError(409,'Receptionist setup is already running. Refresh in a moment.');
  return {setup:await retellSetup(),voices};
}

async function lock(){const token=crypto.randomUUID();const row=await database().prepare("UPDATE retell_connection SET lock_token=?,lock_until=? WHERE id='retell' AND lock_until<=? RETURNING id").bind(token,Date.now()+120000,Date.now()).first();if(!row)throw new RequestError(409,'Setup is already running. Refresh in two minutes if it was interrupted.');return token;}
async function release(token:string){await database().prepare("UPDATE retell_connection SET lock_token='',lock_until=0 WHERE id='retell' AND lock_token=?").bind(token).run();}
async function phase(value:string,token:string){const saved=await database().prepare("UPDATE retell_connection SET phase=?,updated_at=? WHERE id='retell' AND lock_token=? RETURNING id").bind(value,new Date().toISOString(),token).first();if(!saved)throw new RequestError(409,'Setup changed. Refresh before continuing.');}
async function recover(key:string,kind:'llm'|'agent',row:Connection){
  const query=kind==='llm'?'/v2/list-retell-llms?limit=1000':'/v2/list-agents?limit=1000';
  const result=await api(key,query,kind==='llm'?'GET':'POST',kind==='llm'?undefined:{filter_criteria:{channel:{type:'string',op:'eq',value:'voice'},query:row.marker}});
  if(!Array.isArray(result.items))throw new RequestError(502,'Retell recovery is unavailable. Check the created agent in Retell.');
  const matches=result.items.filter((item:any)=>kind==='llm'?item.default_dynamic_variables?.schurr_config_id===row.marker:item.agent_name===`Schurr receptionist ${row.marker}`);
  if(matches.length!==1)throw new RequestError(409,'Setup was interrupted and Retell has not confirmed a unique result. Check the Retell dashboard before retrying; no duplicate will be created.');
  const id=kind==='llm'?matches[0].llm_id:matches[0].agent_id;
  if(typeof id!=='string'||!ID.test(id))throw new RequestError(502,'Retell returned an invalid setup reference.');
  if(kind==='agent'){const found=await api(key,`/get-agent/${encodeURIComponent(id)}`);if(found.response_engine?.llm_id!==row.llmId)throw new RequestError(409,'The recovered agent has a different configuration. Review it in Retell.');}
  return id;
}
export async function provisionRetell(origin:string,voiceId:unknown){
  if(!/^https:\/\//.test(origin))throw new RequestError(400,'Open receptionist setup on the published HTTPS website.');
  const token=await lock();
  try{
    let row=await connection();if(row.agentId)return await retellSetup();
    const key=await decryptIntegrationSecret(row.apiKeyCiphertext);
    const voices=voicesFrom(await api(key,'/list-voices'));
    if(typeof voiceId!=='string'||!voices.some(v=>v.id===voiceId))throw new RequestError(400,'Choose a voice from your Retell account.');
    if(!row.llmId){
      let llmId:string;
      if(row.phase==='llm_requested')llmId=await recover(key,'llm',row);
      else{
        await phase('llm_requested',token);
        try{const made=await api(key,'/create-retell-llm','POST',retellLLMConfig(origin,row.marker));llmId=made.llm_id;if(typeof llmId!=='string'||!ID.test(llmId))throw new RetellAPIError(false,'Retell did not confirm the conversation configuration.');}
        catch(error){if(error instanceof RetellAPIError&&error.rejected)await phase('connected',token);throw error;}
      }
      await database().prepare("UPDATE retell_connection SET llm_id=?,phase='llm_ready' WHERE id='retell' AND lock_token=?").bind(llmId,token).run();
      row=await connection();
    }
    let agentId:string;
    if(row.phase==='agent_requested')agentId=await recover(key,'agent',row);
    else{
      await phase('agent_requested',token);
      try{const made=await api(key,'/create-agent','POST',retellAgentConfig(row.llmId,voiceId,row.marker));agentId=made.agent_id;if(typeof agentId!=='string'||!ID.test(agentId))throw new RetellAPIError(false,'Retell did not confirm the receptionist.');}
      catch(error){if(error instanceof RetellAPIError&&error.rejected)await phase('llm_ready',token);throw error;}
    }
    await database().prepare("UPDATE retell_connection SET agent_id=?,voice_id=?,phase='ready',updated_at=? WHERE id='retell' AND lock_token=?").bind(agentId,voiceId,new Date().toISOString(),token).run();
  }finally{await release(token);}
  return retellSetup();
}
export async function setRetellMode(mode:unknown,number:unknown){
  if(mode!=='test'&&mode!=='live')throw new RequestError(400,'Choose test or live intake.');
  const token=await lock();
  try{
    const row=await connection();
    if(mode==='live'){
      if(!row.agentId||!row.lastVerifiedAt)throw new RequestError(409,'Complete a successful test capture in Retell before enabling phone intake.');
      if(typeof number!=='string'||!/^\+[1-9]\d{7,14}$/.test(number))throw new RequestError(400,'Enter the dedicated Retell phone number with + and country code.');
      const phone=await api(await decryptIntegrationSecret(row.apiKeyCiphertext),`/get-phone-number/${encodeURIComponent(number)}`);
      if(phone.phone_number!==number||!Array.isArray(phone.inbound_agents)||!phone.inbound_agents.some((agent:any)=>agent.agent_id===row.agentId&&agent.weight>0))throw new RequestError(409,'Assign this receptionist to that inbound number in Retell first.');
    }
    await database().prepare("UPDATE retell_connection SET mode=?,inbound_number=?,updated_at=? WHERE id='retell' AND lock_token=?").bind(mode,mode==='live'?String(number):row.inboundNumber,new Date().toISOString(),token).run();
  }finally{await release(token);}
  return retellSetup();
}

export async function verifyRetellSignature(raw:string,signature:string,key:string){
  const match=/^v=(\d{13}),d=([0-9a-f]{64})$/.exec(signature);
  if(!match||Math.abs(Date.now()-Number(match[1]))>300000)return false;
  const signingKey=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',signingKey,Uint8Array.from(match[2].match(/../g)!,x=>parseInt(x,16)),encoder.encode(raw+match[1]));
}
function object(value:unknown):Record<string,any>{if(!value||typeof value!=='object'||Array.isArray(value))throw new RequestError(400,'Invalid receptionist request.');return value as Record<string,any>;}

export async function handleRetellInbound(request:Request){
  const startedAt=Date.now();
  const row=await connection(),key=await decryptIntegrationSecret(row.apiKeyCiphertext);
  const raw=await readBoundedText(request,32*1024);
  if(!await verifyRetellSignature(raw,request.headers.get('x-retell-signature')||'',key))throw new RequestError(401,'Invalid Retell signature.');
  let value:unknown;try{value=JSON.parse(raw);}catch{throw new RequestError(400,'Invalid receptionist request.');}
  const input=object(value),call=object(input.call_inbound);
  const number=row.inboundNumber||configuredRetellNumber();
  if(input.event!=='call_inbound'||typeof call.call_id!=='string'||!/^call_[A-Za-z0-9_-]{1,100}$/.test(call.call_id))throw new RequestError(400,'Invalid inbound call.');
  if(!number||!row.agentId||call.to_number!==number||(call.agent_id!==undefined&&call.agent_id!==row.agentId))throw new RequestError(403,'This inbound destination is not configured.');
  // Retell has not answered yet and no Get Call object exists. Its documented
  // inbound webhook keeps the carrier ringing until this response arrives.
  // Target just after the first ring with a 2s delay; carrier cadence can vary.
  // A persistent first deadline handles concurrent deliveries and HTTP retries.
  let readyAt:number;
  try{
    const db=database();
    const results=await db.batch([
      db.prepare('DELETE FROM retell_inbound_delays WHERE ready_at<?').bind(startedAt-86400000),
      db.prepare('INSERT OR IGNORE INTO retell_inbound_delays (call_id,ready_at) VALUES (?,?)').bind(call.call_id,startedAt+2000),
      db.prepare('SELECT ready_at AS readyAt FROM retell_inbound_delays WHERE call_id=?').bind(call.call_id),
    ]);
    readyAt=Number((results[2]?.results?.[0] as {readyAt:number}|undefined)?.readyAt);
  }catch{
    // The cosmetic delay must not block an authenticated, correctly routed call
    // when its timing store fails. Keep the number's default inbound agent.
    console.error('Retell inbound timing unavailable; continuing without added delay.');
    return {call_inbound:{}};
  }
  const delay=Math.max(0,Math.min(readyAt,startedAt+2000)-Date.now());
  if(Number.isFinite(delay)&&delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
  return {call_inbound:{}};
}

// Call only after Get Call has confirmed the canonical inbound identity. Dynamic
// imports keep monitoring-calls -> verifyRetellSignature from forming a static
// dependency cycle. Monitoring can neither delay nor change the voice result.
function scheduleVerifiedToolObservation(callId:string,toolName:string,result:{ok:boolean;statusCode:number}){
  try{
    const observation=(async()=>{
      const {recordMonitoredToolResult}=await import('./monitoring-calls');
      await recordMonitoredToolResult(callId,toolName,result);
      const {reconcileMonitoringCall}=await import('./monitoring');
      await reconcileMonitoringCall(callId);
    })().catch(()=>{});
    try{waitUntil(observation);}catch{/* The already-handled promise may finish locally; voice work stays authoritative. */}
  }catch{/* Observation scheduling must never change a successful write or its original error. */}
}

export async function handleRetellTool(request:Request){
  const row=await connection(),key=await decryptIntegrationSecret(row.apiKeyCiphertext);
  // Retell includes the live transcript in its signed envelope. Verify the raw
  // bounded body, use only explicit confirmed fields, and never persist/log it.
  const raw=await readBoundedText(request,256*1024);
  if(!await verifyRetellSignature(raw,request.headers.get('x-retell-signature')||'',key))throw new RequestError(401,'Invalid Retell signature.');
  let value:unknown;try{value=JSON.parse(raw);}catch{throw new RequestError(400,'Invalid receptionist request.');}
  const input=object(value),call=object(input.call),args=object(input.args);
  const realReference=typeof call.call_id==='string'&&/^call_[A-Za-z0-9_-]{1,100}$/.test(call.call_id);
  if(!row.agentId||call.agent_id!==row.agentId||(!realReference&&!(row.mode==='test'&&call.call_id==='playground')))throw new RequestError(403,'This call is not authorized for Schurr intake.');
  if(!['capture_lead','stop_contact','check_availability','book_appointment','request_handoff','current_appointment','change_appointment'].includes(input.name))throw new RequestError(400,'Unknown receptionist function.');
  const callSid=`retell:${realReference?call.call_id:'call_test_playground'}`;
  const confirmed=input.name==='capture_lead'?validateVoiceEvent({...args,callSid}):null;
  const existingStop=(input.name==='stop_contact'||input.name==='current_appointment'||(input.name==='change_appointment'&&args.action==='cancel'))&&await database().prepare('SELECT id FROM response_jobs WHERE source_key=?').bind(`call:${callSid}`).first();
  if((row.mode!=='live'||call.call_type==='web_call')&&!(existingStop&&call.call_type!=='web_call')){
    if(confirmed)await database().prepare("UPDATE retell_connection SET last_verified_at=? WHERE id='retell'").bind(new Date().toISOString()).run();
    return {ok:true,status:'dry_run',message:'Test successful. No lead, callback, message or booking was created.'};
  }
  // Provider lookup prevents a simulation envelope or model-supplied metadata
  // from being treated as a real inbound call. Never infer permission from CID.
  const actual=await api(key,`/v2/get-call/${encodeURIComponent(call.call_id)}`);
  // A provider error after capture must not prevent withdrawal of that saved
  // request. It still cannot authorize a new capture or bypass call identity.
  const allowedStatus=['ongoing','ended'].includes(actual.call_status)||((input.name==='stop_contact'||input.name==='current_appointment'||(input.name==='change_appointment'&&args.action==='cancel'))&&Boolean(existingStop)&&actual.call_status==='error');
  if(actual.call_id!==call.call_id||actual.agent_id!==row.agentId||actual.call_type!=='phone_call'||actual.direction!=='inbound'||actual.to_number!==row.inboundNumber||!allowedStatus||typeof actual.start_timestamp!=='number')throw new RequestError(403,'Only verified inbound calls to the configured number can save requests.');
  const executeVerifiedAction=async()=>{
  if(input.name==='stop_contact'){await pauseVoiceCall(callSid);return {ok:true,status:'paused',message:'Follow-up from this call is paused. Other requests were not changed.'};}
  if(input.name==='current_appointment'){const a=await currentCallAppointment(callSid);return {ok:true,appointment:a?{status:a.status,start:a.start,end:a.end,timezone:a.timezone,label:appointmentTimeLabel(a.start,a.timezone),revision:a.revision}:null,message:a?'Only this call’s appointment is shown.':'No appointment was created in this call. Earlier bookings need owner review.'};}
  if(input.name==='change_appointment'){const result=await changeAppointment({action:args.action,appointmentRevision:args.appointmentRevision,start:args.start,scheduleRevision:args.scheduleRevision,confirmed:args.confirmed},callSid),a=result.appointment;return {ok:true,status:a.status,start:a.start,end:a.end,timezone:a.timezone,label:appointmentTimeLabel(a.start,a.timezone),revision:a.revision,duplicate:result.duplicate,superseded:result.superseded,message:result.superseded?'An earlier change was already processed. Report only the current status and time in this result.':a.status==='cancelled'?'The appointment from this call is cancelled. Follow-up remains stopped.':'The appointment from this call is rescheduled to the returned time.'};}
  if(input.name==='check_availability'){if(!args.date){const s=await bookingSetup();return {ok:true,enabled:s.config.enabled,timezone:s.config.timezone,today:localParts(Date.now(),s.config.timezone).date,duration:s.config.duration,message:s.config.enabled?'Confirm the desired date in this timezone, then check availability.':'Booking is paused. Offer a callback request.'};}const own=await currentCallAppointment(callSid);const slots=await availableSlots(args.date,false,own?.status==='booked'?own.id:undefined);return {ok:true,...slots,message:slots.enabled?'Available times in the Schurr native calendar. Google calendar is not synced. Confirm the exact time and timezone before booking.':'Appointment booking is paused. Offer a callback request; do not promise a time.'};}
  if(input.name==='book_appointment'||input.name==='request_handoff'){
    const receipt=await database().prepare("SELECT id,channel,status FROM response_jobs WHERE source_key=?").bind(`call:${callSid}`).first<{id:string;channel:string;status:string}>();
    if(!receipt||receipt.status==='paused'||receipt.channel!=='phone')throw new RequestError(409,'First save a phone callback request with the caller’s confirmed number and permission.');
    if(input.name==='book_appointment'){const booking=await createAppointment({kind:'meeting',responseId:receipt.id,start:args.start,revision:args.revision,confirmed:args.confirmed},`voice:${callSid}`);return {ok:true,status:booking.status,reference:booking.id,start:booking.start,end:booking.end,timezone:booking.timezone,label:appointmentTimeLabel(booking.start,booking.timezone),duplicate:booking.duplicate,message:booking.status==='booked'?'The phone appointment is confirmed in Schurr’s native calendar. Gavin will call the confirmed number. No email confirmation or external calendar event was sent.':'This booking was cancelled. Do not promise another appointment; ask Gavin to review.'};}
    const schedule=await bookingSetup();if(!schedule.config.handoffEnabled)return {ok:true,status:'unavailable',message:'Priority callbacks are paused. The original callback request remains saved. No live transfer is available.'};
    const result=await createFollowup({responseId:receipt.id,note:'Priority callback requested during the receptionist call.',permissionEvidence:'Caller confirmed a phone callback through capture_lead and requested Gavin.',confirmPermission:args.confirmed===true},`handoff:${callSid}`);return {ok:true,status:result.status==='open'?'saved':'stopped',duplicate:result.duplicate,message:result.status==='open'?'Priority callback request saved for Gavin. No live transfer occurred and no response time is guaranteed.':'This callback reminder was already completed or stopped. No new callback was queued.'};
  }
  const result=await captureVoiceLead(confirmed!);
  scheduleOwnerAlert(result.leadId);
  // The durable receipt above is the source of truth. A secondary status
  // timestamp failure must not tell the caller their saved request was lost.
  try{
    const capturedAt=new Date().toISOString();
    await database().prepare("UPDATE retell_connection SET last_verified_at=?,last_captured_at=? WHERE id='retell'").bind(capturedAt,capturedAt).run();
  }catch{console.error('Retell request saved; connection status update unavailable.');}
  return {ok:true,status:'saved',duplicate:result.duplicate,message:'The request is saved in Gavin’s response desk. No message has been sent to the caller and no appointment has been booked.'};
  };
  try{
    const result=await executeVerifiedAction();
    scheduleVerifiedToolObservation(call.call_id,input.name,{ok:true,statusCode:200});
    return result;
  }catch(error){
    const statusCode=error instanceof RequestError&&Number.isSafeInteger(error.status)&&error.status>=400&&error.status<=599?error.status:500;
    scheduleVerifiedToolObservation(call.call_id,input.name,{ok:false,statusCode});
    throw error;
  }
}

/** Update the exact routed conversation, preserving the live voice and model. */
export async function syncVoiceOperations(origin:string){
 const token=await lock();try{return await syncRoutedVoiceOperations(origin,token);}finally{await release(token);}
}
