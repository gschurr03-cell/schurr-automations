import {env,waitUntil} from 'cloudflare:workers';
import {database,RequestError,readBoundedText} from './inquiries';
import {encryptIntegrationSecret,decryptIntegrationSecret} from './integration-secret';
import {OWNER_ALERT_EMAIL,OWNER_ALERT_FROM,OWNER_ALERT_ORIGIN,BUSINESS_INBOX_EMAIL} from './owner-alert-content';

type Connection={apiKey:string;verifiedAt:string};
type Alert={id:string;leadId:string;payload:string;status:string;attempts:number;firstAttemptAt:number;lockToken:string};
export type OwnerAlertSetup={recipient:string;businessInbox:{recipient:string;verifiedAt:string};connected:boolean;verifiedAt:string;offset:number;hasMore:boolean;recent:{id:string;status:string;lastError:string;acceptedAt:string;createdAt:string}[]};
const SAFE_RETRY_WINDOW=23*60*60*1000; // Resend remembers keys for 24h; leave margin.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fingerprint=async(key:string,recipient=OWNER_ALERT_EMAIL)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${key}\n${recipient}\n${OWNER_ALERT_FROM}`))),v=>v.toString(16).padStart(2,'0')).join('');
export async function verifiedEmailConnection():Promise<Connection|null>{
  const rows=await database().prepare("SELECT api_key_ciphertext AS apiKeyCiphertext,verified_at AS verifiedAt FROM owner_alert_connection WHERE id IN ('owner','business-inbox') ORDER BY verified_at DESC,id DESC").all<{apiKeyCiphertext:string;verifiedAt:string}>();
  let saved:Connection|null=null;
  for(const row of rows.results){
    if(!Number.isFinite(Date.parse(row.verifiedAt)))continue;
    try{
      const proof=JSON.parse(await decryptIntegrationSecret(row.apiKeyCiphertext,'lead-alerts')) as {version?:unknown;apiKey?:unknown;verifiedFingerprint?:unknown};
      if(proof.version===2&&typeof proof.apiKey==='string'&&/^re_[A-Za-z0-9_-]{16,250}$/.test(proof.apiKey)&&proof.verifiedFingerprint===await fingerprint(proof.apiKey)&&(!saved||Date.parse(row.verifiedAt)>Date.parse(saved.verifiedAt)))saved={apiKey:proof.apiKey,verifiedAt:row.verifiedAt};
    }catch{/* Legacy or invalid credentials cannot displace a verified connection. */}
  }
  // Native Site owner configuration can supply a key already tested against
  // this exact recipient and sender. No browser identity or public setup endpoint is used.
  const runtime=env as unknown as {RESEND_API_KEY?:string;RESEND_VERIFIED_FINGERPRINT?:string;RESEND_VERIFIED_AT?:string};
  const verifiedRuntime=runtime.RESEND_API_KEY&&runtime.RESEND_VERIFIED_AT&&Number.isFinite(Date.parse(runtime.RESEND_VERIFIED_AT))&&runtime.RESEND_VERIFIED_FINGERPRINT===await fingerprint(runtime.RESEND_API_KEY);
  // A newly verified native secret must supersede an older dashboard key.
  // A later successful dashboard connection can replace it in turn.
  if(verifiedRuntime&&(!saved||Date.parse(runtime.RESEND_VERIFIED_AT!)>=Date.parse(saved.verifiedAt)))return {apiKey:runtime.RESEND_API_KEY!,verifiedAt:runtime.RESEND_VERIFIED_AT!};
  return saved;
}
export async function ownerAlertSetup(offset=0):Promise<OwnerAlertSetup>{
  if(!Number.isInteger(offset)||offset<0||offset>10000)throw new RequestError(400,'Choose a valid alert page.');
  const row=await verifiedEmailConnection();
  const recent=await database().prepare('SELECT id,status,last_error AS lastError,accepted_at AS acceptedAt,created_at AS createdAt FROM owner_alerts ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET ?').bind(offset).all<OwnerAlertSetup['recent'][number]>();
  let businessVerifiedAt='';
  if(row){
    const prepared=await database().prepare("SELECT api_key_ciphertext AS proof,verified_at AS verifiedAt FROM owner_alert_connection WHERE id='business-inbox'").first<{proof:string;verifiedAt:string}>();
    if(prepared&&Number.isFinite(Date.parse(prepared.verifiedAt))){try{const proof=JSON.parse(await decryptIntegrationSecret(prepared.proof,'lead-alerts'));if(proof.version===2&&proof.apiKey===row.apiKey&&proof.verifiedFingerprint===await fingerprint(row.apiKey,BUSINESS_INBOX_EMAIL))businessVerifiedAt=prepared.verifiedAt;}catch{}}
  }
  return {recipient:OWNER_ALERT_EMAIL,businessInbox:{recipient:BUSINESS_INBOX_EMAIL,verifiedAt:businessVerifiedAt},connected:Boolean(row),verifiedAt:row?.verifiedAt||'',offset,hasMore:recent.results.length>25,recent:recent.results.slice(0,25)};
}
class SendError extends Error{constructor(message:string,public retryable=false,public delayMs=1000){super(message);}}
async function send(key:string,payload:string,idempotencyKey:string,recipient=OWNER_ALERT_EMAIL):Promise<string>{
  const message=JSON.parse(payload) as {to?:unknown;from?:unknown};
  if(!Array.isArray(message.to)||message.to.length!==1||message.to[0]!==recipient||message.from!==OWNER_ALERT_FROM)throw new SendError('Alert sender or recipient changed. Review this saved alert before sending.');
  let response:Response;
  try{response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(6500),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:payload});}
  catch{throw new SendError('Email service did not confirm acceptance. Retry uses the same message reference.',true);}
  if(!response.ok){
    const status=response.status;
    const retryAfter=response.headers.get('retry-after');
    let delay=retryAfter?Number(retryAfter)*1000:1000;
    if(retryAfter&&!Number.isFinite(delay))delay=Date.parse(retryAfter)-Date.now();
    if(!Number.isFinite(delay)||delay<1000)delay=1000;
    await response.body?.cancel();
    const message=status===401?'Resend rejected the key. Reconnect a Sending access key.':status===403?'Resend rejected the sender or key permissions. Confirm notify.schurrautomations.com is verified in the same account and this key can send from it.':status===429?'Resend is limiting requests or the account has reached its email quota. Check Resend before retrying.':status===409?'Resend has not confirmed this message reference. Retry the unchanged message.':status>=300&&status<400?'Unexpected email-service redirect. Your key was not forwarded.':'Resend did not accept this alert. Check the email account before retrying.';
    throw new SendError(message,[408,409,429,500,502,503,504].includes(status),delay);
  }
  let result:unknown;try{result=JSON.parse(await readBoundedText(response,8192));}catch{throw new SendError('Email acceptance could not be confirmed. Retry uses the same message reference.',true);}
  const id=(result as {id?:unknown})?.id;
  if(typeof id!=='string'||!UUID.test(id))throw new SendError('Email acceptance could not be confirmed. Retry uses the same message reference.',true);
  return id;
}
export async function connectOwnerAlerts(value:unknown){
  if(typeof value!=='string'||!/^re_[A-Za-z0-9_-]{16,250}$/.test(value))throw new RequestError(400,'Enter a Resend Sending access API key.');
  const hash=await fingerprint(value);
  const payload=JSON.stringify({from:OWNER_ALERT_FROM,to:[OWNER_ALERT_EMAIL],subject:'Schurr receptionist alerts: connection test',text:`This is a connection test for Schurr Automations. New confirmed receptionist requests will be emailed to ${OWNER_ALERT_EMAIL}. No customer message or appointment was created.\n\nResponse desk: ${OWNER_ALERT_ORIGIN}/manage/response`});
  try{await send(value,payload,`schurr-owner-connection/${hash}`);}catch(error){throw new RequestError(502,error instanceof SendError?error.message:'Email connection could not be verified.');}
  const now=new Date().toISOString(),encrypted=await encryptIntegrationSecret(JSON.stringify({version:2,apiKey:value,verifiedFingerprint:hash}),'lead-alerts');
  await database().prepare("INSERT INTO owner_alert_connection(id,api_key_ciphertext,verified_at,updated_at) VALUES('owner',?,?,?) ON CONFLICT(id) DO UPDATE SET api_key_ciphertext=excluded.api_key_ciphertext,verified_at=excluded.verified_at,updated_at=excluded.updated_at").bind(encrypted,now,now).run();
  return ownerAlertSetup();
}
// Owner-only preparation: test the fixed business destination without switching live
// routing, exposing the existing key, or replaying any queued customer message.
export async function testBusinessInbox(){
  const connected=await verifiedEmailConnection();
  if(!connected)throw new RequestError(409,'Connect and verify the current email sender first.');
  const hash=await fingerprint(connected.apiKey,BUSINESS_INBOX_EMAIL);
  const payload=JSON.stringify({from:OWNER_ALERT_FROM,to:[BUSINESS_INBOX_EMAIL],subject:'Schurr business inbox: connection test',text:`This confirms the existing Schurr Automations sender can reach ${BUSINESS_INBOX_EMAIL}.\n\nPlease confirm this email arrived before switching business alerts and customer replies. Current routing has not changed.\n\nNo customer was contacted and no appointment was created.`});
  try{await send(connected.apiKey,payload,`schurr-business-inbox/${hash}`,BUSINESS_INBOX_EMAIL);}catch(error){throw new RequestError(502,error instanceof SendError?error.message:'The business inbox test could not be confirmed.');}
  const now=new Date().toISOString(),encrypted=await encryptIntegrationSecret(JSON.stringify({version:2,apiKey:connected.apiKey,verifiedFingerprint:hash}),'lead-alerts');
  await database().prepare("INSERT INTO owner_alert_connection(id,api_key_ciphertext,verified_at,updated_at) VALUES('business-inbox',?,?,?) ON CONFLICT(id) DO UPDATE SET api_key_ciphertext=excluded.api_key_ciphertext,verified_at=excluded.verified_at,updated_at=excluded.updated_at").bind(encrypted,now,now).run();
  return ownerAlertSetup();
}
export async function deliverOwnerAlert(id:string){
  if(!UUID.test(id))throw new RequestError(400,'Choose a valid alert.');
  const connected=await verifiedEmailConnection();if(!connected)return;
  const db=database(),now=Date.now();
  // Stop permission or deletion before delivery. An email already accepted by
  // the provider cannot be recalled; its text always requires a status check.
  await db.prepare("UPDATE owner_alerts SET status='cancelled',last_error='Request follow-up is paused.' WHERE id=? AND status NOT IN ('accepted','cancelled') AND COALESCE(json_extract(payload,'$.tags[0].value'),'')!='appointment_update' AND EXISTS(SELECT 1 FROM response_jobs WHERE (lead_id=owner_alerts.lead_id OR inquiry_id=owner_alerts.lead_id) AND status='paused')").bind(id).run();
  await db.prepare("UPDATE owner_alerts SET status='uncertain',last_error='Automatic retry window expired. Check Resend and the response desk; this alert will not be resent automatically.' WHERE id=? AND status IN ('pending','sending','failed') AND first_attempt_at>0 AND first_attempt_at<=? AND lock_until<=?").bind(id,now-SAFE_RETRY_WINDOW,now).run();
  const candidate=await db.prepare('SELECT payload,first_attempt_at AS firstAttemptAt,attempts FROM owner_alerts WHERE id=?').bind(id).first<{payload:string;firstAttemptAt:number;attempts:number}>();
  if(candidate){
    const payload=JSON.parse(candidate.payload) as {to:unknown;from:unknown};
    if(!Array.isArray(payload.to)||payload.to.length!==1||payload.to[0]!==OWNER_ALERT_EMAIL||payload.from!==OWNER_ALERT_FROM){
      if(candidate.firstAttemptAt||candidate.attempts){
        await db.prepare("UPDATE owner_alerts SET status='uncertain',last_error='Alert sender or recipient changed after a send attempt. Check delivery in Resend before taking further action.' WHERE id=? AND status IN ('pending','failed','sending') AND lock_until<=?").bind(id,now).run();return;
      }
      // Only untouched messages may adopt an approved sender or owner address.
      // A concurrent claim freezes the old snapshot and prevents this update.
      payload.to=[OWNER_ALERT_EMAIL];payload.from=OWNER_ALERT_FROM;
      await db.prepare("UPDATE owner_alerts SET payload=? WHERE id=? AND payload=? AND first_attempt_at=0 AND attempts=0 AND lock_until<=? AND status IN ('pending','failed')").bind(JSON.stringify(payload),id,candidate.payload,now).run();
    }
  }
  const token=crypto.randomUUID();
  const row=await db.prepare(`UPDATE owner_alerts SET status='sending',lock_token=?,lock_until=?,first_attempt_at=CASE WHEN first_attempt_at=0 THEN ? ELSE first_attempt_at END
    WHERE id=? AND status IN ('pending','sending','failed') AND lock_until<=? AND next_attempt_at<=?
    RETURNING id,lead_id AS leadId,payload,status,attempts,first_attempt_at AS firstAttemptAt,lock_token AS lockToken`).bind(token,now+120000,now,id,now,now).first<Alert>();
  if(!row)return;
  const key=connected.apiKey;
  for(let attempt=0;attempt<2;attempt++){
    const active=await db.prepare("UPDATE owner_alerts SET attempts=attempts+1 WHERE id=? AND lock_token=? AND status='sending' AND (json_extract(payload,'$.tags[0].value')='appointment_update' OR NOT EXISTS(SELECT 1 FROM response_jobs WHERE (lead_id=owner_alerts.lead_id OR inquiry_id=owner_alerts.lead_id) AND status='paused')) RETURNING id").bind(id,token).first();
    if(!active){await db.prepare("UPDATE owner_alerts SET status='cancelled',last_error='Request follow-up is paused.',lock_until=0 WHERE id=? AND lock_token=? AND status='sending'").bind(id,token).run();return;}
    try{
      const emailId=await send(key,row.payload,`schurr-owner-lead/${id}`);
      await db.prepare("UPDATE owner_alerts SET status='accepted',email_id=?,accepted_at=?,last_error='',lock_until=0 WHERE id=? AND lock_token=?").bind(emailId,new Date().toISOString(),id,token).run();
      return;
    }catch(error){
      const issue=error instanceof SendError?error:new SendError('Email delivery status is unavailable. Retry uses the same message reference.',true);
      if(issue.retryable&&issue.delayMs<=2000&&attempt===0){await new Promise(resolve=>setTimeout(resolve,issue.delayMs));continue;}
      await db.prepare("UPDATE owner_alerts SET status='failed',last_error=?,next_attempt_at=?,lock_until=0 WHERE id=? AND lock_token=? AND status='sending'").bind(issue.message,Date.now()+Math.max(issue.delayMs,30000),id,token).run();
      return;
    }
  }
}
// The outbox row commits with the lead. Runtime-backed background work keeps
// email latency and failure independent of the caller's successful CRM save.
export function scheduleOwnerAlert(id:string){
  try{waitUntil(deliverOwnerAlert(id).catch(()=>{console.error('Owner alert delivery unavailable; request remains saved.');}));}
  catch{console.error('Owner alert scheduling unavailable; request remains saved.');}
}
