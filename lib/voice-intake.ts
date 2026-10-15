import {env} from 'cloudflare:workers';
import {database,readBoundedText,RequestError} from './inquiries';
import {responsePlan} from './response-policy';
import {ownerAlertPayload} from './owner-alert-content';
const encoder=new TextEncoder();
export async function readVoiceEvent(request:Request) {
  const secret=(env as unknown as {VOICE_INGEST_SECRET?:string}).VOICE_INGEST_SECRET;
  if(!secret||secret.length<32) throw new RequestError(503,'Voice intake is not connected.');
  const time=request.headers.get('x-schurr-timestamp')||'', signature=request.headers.get('x-schurr-signature')||'';
  if(!/^\d{10}$/.test(time)||Math.abs(Date.now()/1000-Number(time))>300||!/^[0-9a-f]{64}$/.test(signature)) throw new RequestError(401,'Invalid voice authentication.');
  const body=await readBoundedText(request,10000);
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g)!,x=>parseInt(x,16)),encoder.encode(`${time}.${body}`));
  if(!valid) throw new RequestError(401,'Invalid voice authentication.');
  let input:unknown;try{input=JSON.parse(body);}catch{throw new RequestError(400,'Invalid voice event.');}
  if(!input||typeof input!=='object'||Array.isArray(input))throw new RequestError(400,'Invalid voice event.');
  return input as Record<string,unknown>;
}
export function validateVoiceEvent(input:Record<string,unknown>) {
  function field(key:string,max:number,required=true){const value=input[key];if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u001f\u007f]/.test(value))throw new RequestError(400,`Invalid ${key}.`);return value.trim();}
  const callSid=field('callSid',128),name=field('name',100),business=field('business',160,false),email=field('email',254,false).toLowerCase(),phone=field('phone',16,false),service=field('service',10),summary=field('summary',2000),preferredContact=field('preferredContact',8),consentEvidence=field('consentEvidence',500);
  if(!/^(?:CA[0-9a-fA-F]{32}|retell:call_[A-Za-z0-9_-]{1,100})$/.test(callSid)||!['calls','leads','general'].includes(service)||!['email','phone','text'].includes(preferredContact)||input.callbackConsent!==true)throw new RequestError(400,'Caller permission and valid contact details are required.');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone&&!/^\+[1-9]\d{7,14}$/.test(phone)||preferredContact==='email'&&!email||preferredContact!=='email'&&!phone)throw new RequestError(400,'Confirm the callback email or international phone number with the caller.');
  return {callSid,name,business,email,phone,service,summary,preferredContact,consentEvidence,callbackConsent:true};
}
export async function captureVoiceLead(input:Record<string,unknown>) {
  const value=validateVoiceEvent(input),db=database(),now=new Date().toISOString();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value)))),x=>x.toString(16).padStart(2,'0')).join('');
  const sourceKey=`call:${value.callSid}`;
  const existing=()=>db.prepare('SELECT id,lead_id AS leadId,body_hash AS bodyHash FROM response_jobs WHERE source_key=?').bind(sourceKey).first<{id:string;leadId:string;bodyHash:string}>();
  const stopped=await db.prepare('SELECT call_sid FROM voice_call_controls WHERE call_sid=?').bind(value.callSid).first();
  if(stopped)throw new RequestError(409,'Permission was withdrawn for this call. Do not request follow-up.');
  const receipt=await existing();
  if(receipt){if(receipt.bodyHash!==hash)throw new RequestError(409,'This call was already captured. Ask Gavin to update its details.');return {leadId:receipt.leadId,duplicate:true};}
  const id=crypto.randomUUID(),plan=responsePlan({...value,consent:true});
  await db.batch([
    db.prepare(`INSERT INTO crm_leads (id,name,business,email,phone,service,preferred_contact,source,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,'other',?,? WHERE NOT EXISTS(SELECT 1 FROM response_jobs WHERE source_key=?) AND NOT EXISTS(SELECT 1 FROM voice_call_controls WHERE call_sid=?)
      AND (?=0 OR EXISTS(SELECT 1 FROM retell_connection WHERE id='retell' AND mode='live'))`).bind(id,value.name,value.business,value.email,value.phone,value.service,value.preferredContact,now,now,sourceKey,value.callSid,value.callSid.startsWith('retell:')?1:0),
    db.prepare(`INSERT INTO response_jobs (id,lead_id,source_key,body_hash,confirmed_phone,channel,status,draft,consent_scope,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'needs_review',?,'voice_callback_v1',?,? WHERE EXISTS(SELECT 1 FROM crm_leads WHERE id=?) ON CONFLICT(source_key) DO NOTHING`).bind(id,id,sourceKey,hash,value.phone,value.preferredContact,plan.draft,now,now,id),
    db.prepare(`INSERT INTO crm_events (id,lead_id,kind,body,created_at) SELECT ?,?,'note',?,? WHERE EXISTS(SELECT 1 FROM response_jobs WHERE id=?)`).bind(id,id,`AI receptionist intake. ${value.summary}\nCaller permission (${value.preferredContact}): ${value.consentEvidence}\nCall reference: ${value.callSid}`,now,id),
    db.prepare(`INSERT INTO owner_alerts (id,lead_id,payload,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM response_jobs WHERE id=?) ON CONFLICT(id) DO NOTHING`).bind(id,id,ownerAlertPayload(id,value),now,id),
  ]);
  const saved=await existing();if(!saved)throw new RequestError(409,'The callback was not saved. Permission may have been withdrawn.');
  if(saved.bodyHash!==hash)throw new RequestError(409,'This call was already captured with different details.');
  return {leadId:saved.leadId,duplicate:saved.id!==id};
}
export async function pauseVoiceCall(callSid:string){
  if(!/^(?:CA[0-9a-fA-F]{32}|retell:call_[A-Za-z0-9_-]{1,100})$/.test(callSid))throw new RequestError(400,'Invalid call reference.');
  const db=database(),now=new Date().toISOString();
  await db.batch([db.prepare('INSERT INTO voice_call_controls (call_sid,stopped_at) VALUES (?,?) ON CONFLICT(call_sid) DO NOTHING').bind(callSid,now),db.prepare("UPDATE response_jobs SET status='paused',revision=revision+1,updated_at=? WHERE source_key=? AND status!='paused'").bind(now,`call:${callSid}`),db.prepare("UPDATE response_followups SET status='cancelled',reason='Caller withdrew contact permission.',revision=revision+1,updated_at=? WHERE status='open' AND response_id IN(SELECT id FROM response_jobs WHERE source_key=?)").bind(now,`call:${callSid}`)]);
}
