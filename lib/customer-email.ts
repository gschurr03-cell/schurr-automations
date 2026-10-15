import {env,waitUntil} from 'cloudflare:workers';
import {applyReviewEmailEvents} from './review-delivery';
import {database,RequestError,readBoundedText} from './inquiries';
import {verifiedEmailConnection} from './owner-alerts';
import {CUSTOMER_EMAIL_CONSENT,customerEmailPayload,INFORMATION_EMAIL_CONSENT,informationEmailPayload} from './customer-email-content';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WINDOW=23*60*60*1000;
const OPEN="status IN ('pending','sending','failed')";
// The original inquiry is the contact authority. CRM changes stop, never redirect, a saved email.
const ELIGIBLE=`EXISTS(SELECT 1 FROM inquiries i JOIN response_jobs j ON j.inquiry_id=i.id JOIN crm_leads c ON c.inquiry_id=i.id
 WHERE i.id=customer_first_emails.id AND i.email=customer_first_emails.recipient AND (i.preferred_contact='email' OR customer_first_emails.consent_scope='${INFORMATION_EMAIL_CONSENT}')
 AND c.email=i.email AND c.preferred_contact=i.preferred_contact AND j.status='needs_review')
 AND consent_scope IN ('${CUSTOMER_EMAIL_CONSENT}','${INFORMATION_EMAIL_CONSENT}')
 AND NOT EXISTS(SELECT 1 FROM outreach_suppressions s WHERE s.email=customer_first_emails.recipient)`;
export type CustomerEmail={consentScope:string;id:string;recipient:string;status:string;lastError:string;acceptedAt:string;emailId:string|null;attempts:number;retryable:number;payload:string;firstAttemptAt:number;connectionFingerprint:string};
const SELECT='consent_scope AS consentScope,id,recipient,status,last_error AS lastError,accepted_at AS acceptedAt,email_id AS emailId,attempts,retryable,payload,first_attempt_at AS firstAttemptAt,connection_fingerprint AS connectionFingerprint';
export function customerEmailEnabled(){return (env as unknown as {CUSTOMER_EMAIL_ENABLED?:string}).CUSTOMER_EMAIL_ENABLED==='true';}
export function deliveryWebhookConfigured(){return Boolean((env as unknown as {RESEND_WEBHOOK_SECRET?:string}).RESEND_WEBHOOK_SECRET?.startsWith('whsec_'));}
export async function customerEmailSetup(){return {enabled:customerEmailEnabled()&&Boolean(await verifiedEmailConnection()),webhookConfigured:deliveryWebhookConfigured()};}
const REPORT_PENDING='The delivery report is pending. Refresh this page to check again; no additional email will be sent.';
async function reconcileCustomerEmailReport(emailId:string){
 try{await applyCustomerEmailEvents(emailId);await database().prepare("UPDATE customer_first_emails SET last_error='' WHERE email_id=? AND last_error=?").bind(emailId,REPORT_PENDING).run();}
 catch{try{await database().prepare("UPDATE customer_first_emails SET last_error=? WHERE email_id=? AND status IN ('accepted','delayed','delivered')").bind(REPORT_PENDING,emailId).run();}catch{console.error('Customer email delivery report remains pending.');}}
}
export async function reconcileCustomerEmailReports(){
 const pending=await database().prepare(`SELECT c.email_id AS emailId FROM customer_first_emails c WHERE c.email_id IS NOT NULL AND (c.last_error=? OR EXISTS(SELECT 1 FROM customer_email_events e WHERE e.email_id=c.email_id AND
 (CASE e.type WHEN 'email.sent' THEN 1 WHEN 'email.delivery_delayed' THEN 2 WHEN 'email.delivered' THEN 3 WHEN 'email.failed' THEN 4 WHEN 'email.bounced' THEN 5 WHEN 'email.suppressed' THEN 6 WHEN 'email.complained' THEN 7 ELSE 0 END)>c.event_rank)) ORDER BY c.created_at,c.id LIMIT 50`).bind(REPORT_PENDING).all<{emailId:string}>();
 for(const {emailId} of pending.results)await reconcileCustomerEmailReport(emailId);
}
export async function customerEmailRecord(id:string){if(!UUID.test(id))throw new RequestError(400,'Choose a valid inquiry.');const read=()=>database().prepare(`SELECT ${SELECT} FROM customer_first_emails WHERE id=?`).bind(id).first<CustomerEmail>();const row=await read();if(!row?.emailId)return row;await reconcileCustomerEmailReport(row.emailId);return read();}

async function keyFingerprint(key:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),n=>n.toString(16).padStart(2,'0')).join('');}
class DeliveryError extends Error{constructor(message:string,public retryable=false,public delay=1000){super(message);}}
async function send(key:string,row:CustomerEmail){
  // No caller-supplied headers, content, destinations or redirect targets.
  const inquiry=await database().prepare('SELECT service FROM inquiries WHERE id=?').bind(row.id).first<{service:string}>();
  const expected=row.consentScope===INFORMATION_EMAIL_CONSENT?informationEmailPayload(row.recipient,row.id,inquiry?.service||'general'):customerEmailPayload(row.recipient,row.id);
  if(row.payload!==expected)throw new DeliveryError('Saved email configuration changed. Review before contacting this person.');
  let response:Response;
  try{response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(6500),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`schurr-first-email/${row.id}`},body:row.payload});}
  catch{throw new DeliveryError('Acceptance is unconfirmed. A safe retry keeps the same email reference.',true);}
  if(!response.ok){
    const status=response.status,header=response.headers.get('retry-after');let delay=header?Number(header)*1000:1000;
    if(header&&!Number.isFinite(delay))delay=Date.parse(header)-Date.now();if(!Number.isFinite(delay)||delay<1000)delay=1000;
    await response.body?.cancel();
    throw new DeliveryError(status===429?'Email quota or rate limit reached. Check Resend before retrying.':status===401||status===403?'The email connection needs attention. Check the key and verified domain.':status>=300&&status<400?'Unexpected email service redirect. No credentials were forwarded.':'Resend did not confirm acceptance. Check the email record before retrying.',[408,409,429,500,502,503,504].includes(status),delay);
  }
  let result:{id?:unknown};try{result=JSON.parse(await readBoundedText(response,8192));}catch{throw new DeliveryError('Acceptance is unconfirmed. Retry keeps the same reference.',true);}
  if(typeof result.id!=='string'||!UUID.test(result.id))throw new DeliveryError('Acceptance is unconfirmed. Retry keeps the same reference.',true);
  return result.id;
}
export async function deliverCustomerEmail(id:string){
  if(!UUID.test(id))throw new RequestError(400,'Choose a valid inquiry.');
  const db=database(),now=Date.now();
  const accepted=await db.prepare('SELECT email_id AS emailId FROM customer_first_emails WHERE id=? AND email_id IS NOT NULL').bind(id).first<{emailId:string}>();if(accepted){await reconcileCustomerEmailReport(accepted.emailId);return;}
  await db.prepare(`UPDATE customer_first_emails SET status='cancelled',retryable=0,last_error='Contact was handled, paused, corrected or suppressed.' WHERE id=? AND ${OPEN} AND NOT (${ELIGIBLE})`).bind(id).run();
  await db.prepare(`UPDATE customer_first_emails SET status=CASE WHEN first_attempt_at>0 THEN 'uncertain' ELSE 'cancelled' END,retryable=0,last_error='The safe sending window expired. Review this request personally.' WHERE id=? AND ${OPEN} AND lock_until<=? AND ((first_attempt_at>0 AND first_attempt_at<=?) OR (first_attempt_at=0 AND created_at<=?))`).bind(id,now,now-WINDOW,new Date(now-WINDOW).toISOString()).run();
  if(!customerEmailEnabled())return;
  const connection=await verifiedEmailConnection();if(!connection)return;
  const fingerprint=await keyFingerprint(connection.apiKey);
  await db.prepare(`UPDATE customer_first_emails SET status='uncertain',retryable=0,last_error='Email credentials changed after a send attempt. Check the original account before further contact.' WHERE id=? AND ${OPEN} AND first_attempt_at>0 AND connection_fingerprint!=? AND lock_until<=?`).bind(id,fingerprint,now).run();
  const token=crypto.randomUUID(),dayStart=new Date(new Date(now).toISOString().slice(0,10)+'T00:00:00.000Z').getTime();
  const row=await db.prepare(`UPDATE customer_first_emails SET status='sending',lock_token=?,lock_until=?,first_attempt_at=CASE WHEN first_attempt_at=0 THEN ? ELSE first_attempt_at END,connection_fingerprint=CASE WHEN first_attempt_at=0 THEN ? ELSE connection_fingerprint END
    WHERE id=? AND ${OPEN} AND retryable=1 AND lock_until<=? AND next_attempt_at<=? AND (first_attempt_at=0 OR connection_fingerprint=?) AND (${ELIGIBLE})
    AND (first_attempt_at>0 OR (NOT EXISTS(SELECT 1 FROM customer_first_emails other WHERE other.recipient=customer_first_emails.recipient AND other.id!=customer_first_emails.id AND other.first_attempt_at>=?)
    AND (SELECT count(*) FROM customer_first_emails WHERE first_attempt_at>=?)<100)) RETURNING ${SELECT}`).bind(token,now+120000,now,fingerprint,id,now,now,fingerprint,now-86400000,dayStart).first<CustomerEmail>();
  if(!row){
    await db.prepare(`UPDATE customer_first_emails SET status='cancelled',retryable=0,last_error='Automatic confirmation limit reached. Gavin can follow up personally.' WHERE id=? AND status='pending' AND first_attempt_at=0 AND lock_until<=? AND (EXISTS(SELECT 1 FROM customer_first_emails other WHERE other.recipient=customer_first_emails.recipient AND other.id!=customer_first_emails.id AND other.first_attempt_at>=?) OR (SELECT count(*) FROM customer_first_emails WHERE first_attempt_at>=?)>=100)`).bind(id,now,now-86400000,dayStart).run();return;
  }
  for(let attempt=0;attempt<2;attempt++){
    const active=await db.prepare(`UPDATE customer_first_emails SET attempts=attempts+1 WHERE id=? AND lock_token=? AND status='sending' AND connection_fingerprint=? AND (${ELIGIBLE}) RETURNING id`).bind(id,token,fingerprint).first();
    if(!active){await db.prepare("UPDATE customer_first_emails SET status='cancelled',retryable=0,lock_until=0,last_error='Contact was stopped before this send attempt.' WHERE id=? AND lock_token=? AND status='sending'").bind(id,token).run();return;}
    try{
      const emailId=await send(connection.apiKey,row);
      await db.prepare("UPDATE customer_first_emails SET status=CASE WHEN event_rank>0 THEN status ELSE 'accepted' END,email_id=?,accepted_at=?,retryable=0,last_error=CASE WHEN event_rank>0 THEN last_error ELSE '' END,lock_until=0 WHERE id=? AND lock_token=?").bind(emailId,new Date().toISOString(),id,token).run();
      await reconcileCustomerEmailReport(emailId);return;
    }catch(error){
      const issue=error instanceof DeliveryError?error:new DeliveryError('Delivery state could not be saved. Check Resend or retry using the same reference.',true);
      if(issue.retryable&&attempt===0&&issue.delay<=2000){await new Promise(resolve=>setTimeout(resolve,issue.delay));continue;}
      await db.prepare("UPDATE customer_first_emails SET status='failed',retryable=?,last_error=?,next_attempt_at=?,lock_until=0 WHERE id=? AND lock_token=? AND status='sending'").bind(issue.retryable?1:0,issue.message,Date.now()+Math.max(30000,issue.delay),id,token).run();return;
    }
  }
}
export function scheduleCustomerEmail(id:string){try{waitUntil(deliverCustomerEmail(id).catch(()=>console.error('Customer email remains saved for review.')));}catch{console.error('Customer email scheduling unavailable.');}}
const EVENT_STATES:Record<string,{status:string;rank:number;message:string}>={
 'email.sent':{status:'accepted',rank:1,message:''},'email.delivery_delayed':{status:'delayed',rank:2,message:'The receiving server delayed delivery. Resend handles delivery retries.'},
 'email.delivered':{status:'delivered',rank:3,message:''},'email.failed':{status:'failed',rank:4,message:'Resend reported a sending failure. Review it in Resend; no automatic resend.'},
 'email.bounced':{status:'bounced',rank:5,message:'The recipient mail server rejected this email.'},'email.suppressed':{status:'suppressed',rank:6,message:'Resend suppressed this recipient.'},
 'email.complained':{status:'complained',rank:7,message:'The recipient marked this email as spam.'},
};
export async function applyCustomerEmailEvents(emailId:string){
 const db=database();const events=await db.prepare('SELECT type,event_at AS eventAt FROM customer_email_events WHERE email_id=? ORDER BY event_at,id').bind(emailId).all<{type:string;eventAt:string}>();
 for(const event of events.results){const state=EVENT_STATES[event.type];if(!state)continue;
  const updates=[db.prepare('UPDATE customer_first_emails SET status=?,event_rank=?,event_at=?,retryable=0,last_error=?,lock_until=0 WHERE email_id=? AND (event_rank<? OR (event_rank=? AND event_at<=?))').bind(state.status,state.rank,event.eventAt,state.message,emailId,state.rank,state.rank,event.eventAt)];
  if(state.rank>=5){
   updates.push(db.prepare('INSERT INTO outreach_suppressions(email,reason,created_at) SELECT recipient,?,? FROM customer_first_emails WHERE email_id=? ON CONFLICT(email) DO NOTHING').bind(state.message,event.eventAt,emailId));
   updates.push(db.prepare(`UPDATE customer_first_emails SET status='cancelled',retryable=0,last_error='This recipient is suppressed.' WHERE ${OPEN} AND recipient IN(SELECT recipient FROM customer_first_emails WHERE email_id=?)`).bind(emailId));
  }
  await db.batch(updates);
 }
}
export async function receiveCustomerEmailEvent(request:Request){
 const secret=(env as unknown as {RESEND_WEBHOOK_SECRET?:string}).RESEND_WEBHOOK_SECRET;
 if(!secret?.startsWith('whsec_'))throw new RequestError(503,'Delivery events are not connected yet.');
 const id=request.headers.get('svix-id')||'',timestamp=request.headers.get('svix-timestamp')||'',signatures=request.headers.get('svix-signature')||'';
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(id)||!/^\d{10,12}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||signatures.length>4096)throw new RequestError(401,'Invalid webhook signature.');
 const raw=await readBoundedText(request,65536);let valid=false;
 try{
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signed=new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
  for(const part of signatures.split(' ')){if(!part.startsWith('v1,'))continue;try{if(await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(part.slice(3)),c=>c.charCodeAt(0)),signed))valid=true;}catch{}}
 }catch{}
 if(!valid)throw new RequestError(401,'Invalid webhook signature.');
 let event:{type?:unknown;created_at?:unknown;data?:{email_id?:unknown}};try{event=JSON.parse(raw);}catch{throw new RequestError(400,'Invalid event.');}
 if(!event||typeof event.type!=='string'||!Object.hasOwn(EVENT_STATES,event.type))return;
 const emailId=event.data?.email_id;
 if(typeof emailId!=='string'||!UUID.test(emailId)||typeof event.created_at!=='string'||!Number.isFinite(Date.parse(event.created_at)))throw new RequestError(400,'Invalid event.');
 await database().prepare('INSERT INTO customer_email_events(id,email_id,type,event_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,emailId,event.type,new Date(event.created_at).toISOString()).run();
 // Replays also reconcile: a prior attempt may have persisted the event before a DB outage.
 await applyCustomerEmailEvents(emailId);
 await applyReviewEmailEvents(emailId);
}
