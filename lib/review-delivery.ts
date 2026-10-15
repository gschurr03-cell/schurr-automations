import {database,RequestError,readBoundedText} from './inquiries';
import {verifiedEmailConnection} from './owner-alerts';
import {getAutomationSettings,operationId,contentHash} from './automation-desk';
import {OWNER_ALERT_FROM} from './owner-alert-content';
import {cursorDecode,cursorEncode} from './crm';
const WINDOW=23*60*60*1000;
function retryDelay(response:Response){const value=response.headers.get('retry-after');if(!value)return 60000;const seconds=Number(value),delay=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-Date.now();return Number.isFinite(delay)?Math.max(60000,Math.min(24*60*60*1000,delay)):60000;}
export type ReviewRequest={id:string;jobId:string;recipient:string;payload:string;profileRevision:number;status:string;approvedAt:string;firstAttemptAt:number;connectionFingerprint:string;attempts:number;emailId:string|null;lastError:string;retryable:number;createdAt:string};
const SELECT='id,job_id AS jobId,recipient,payload,profile_revision AS profileRevision,status,approved_at AS approvedAt,first_attempt_at AS firstAttemptAt,connection_fingerprint AS connectionFingerprint,attempts,email_id AS emailId,last_error AS lastError,retryable,created_at AS createdAt';
const ELIGIBLE="profile_revision=COALESCE((SELECT revision FROM automation_settings WHERE id='business'),0) AND EXISTS(SELECT 1 FROM automation_runs r WHERE r.id=review_requests.id AND r.status='draft') AND NOT EXISTS(SELECT 1 FROM outreach_suppressions s WHERE s.email=review_requests.recipient)";
const REPORT_PENDING='The delivery report is pending. Refresh this page to check again; no additional email will be sent.';
async function reconcileReport(emailId:string){
 try{await applyReviewEmailEvents(emailId);}catch{
  await database().prepare("UPDATE review_requests SET last_error=? WHERE email_id=? AND status IN ('accepted','delayed')").bind(REPORT_PENDING,emailId).run();
 }
}
export async function reconcileReviewReports(){
 const db=database();
 // Recover persisted callbacks after transient database failures. This path never sends email.
 const pending=await db.prepare(`SELECT DISTINCT r.email_id AS emailId FROM review_requests r JOIN customer_email_events e ON e.email_id=r.email_id WHERE
 (CASE e.type WHEN 'email.sent' THEN 1 WHEN 'email.delivery_delayed' THEN 2 WHEN 'email.delivered' THEN 3 WHEN 'email.failed' THEN 4 WHEN 'email.bounced' THEN 5 WHEN 'email.suppressed' THEN 6 WHEN 'email.complained' THEN 7 ELSE 0 END)>r.event_rank
 OR (r.last_error=? AND r.email_id IS NOT NULL) ORDER BY r.created_at DESC LIMIT 50`).bind(REPORT_PENDING).all<{emailId:string}>();
 for(const {emailId} of pending.results)await reconcileReport(emailId);
}
export async function listReviewRequestsPage(options:{status?:string;cursor?:string}={}){
 const status=options.status||'all';if(!['all','draft','sending','accepted','delayed','delivered','failed','uncertain','stopped','cancelled','bounced','suppressed','complained'].includes(status))throw new RequestError(400,'Choose a review invitation status.');
 const boundary=cursorDecode(options.cursor),where:string[]=[],args:string[]=[];
 if(status!=='all'){where.push('status=?');args.push(status);}if(boundary){where.push('(created_at,id)<(?,?)');args.push(...boundary);}
 await reconcileReviewReports();
 const rows=(await database().prepare(`SELECT ${SELECT} FROM review_requests ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT 51`).bind(...args).all<ReviewRequest>()).results;
 const items=rows.slice(0,50),last=items.at(-1);return {items,nextCursor:rows.length>50&&last?cursorEncode(last.createdAt,last.id):null};
}
export async function listReviewRequests(){return (await listReviewRequestsPage()).items;}
// The visible operation page can contain older invitations than the latest 50.
// Reconciliation is global and must run before choosing a status-filtered page.
export async function reviewRequestsForRuns(ids:string[]){
 if(ids.length>50)throw new RequestError(400,'Choose one saved-work page.');
 if(!ids.length)return [];
 return (await database().prepare(`SELECT ${SELECT} FROM review_requests WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids.map(operationId)).all<ReviewRequest>()).results;
}
export async function deliverReviewRequest(value:unknown){
 const id=operationId(value),settings=await getAutomationSettings(),db=database(),now=Date.now();
 const connection=await verifiedEmailConnection();if(!connection)throw new RequestError(400,'Connect and verify the email sender first.');
 const fingerprint=await contentHash(connection.apiKey+'\n'+OWNER_ALERT_FROM+'\n'+settings.profile.replyEmail),token=crypto.randomUUID();
 await db.prepare(`UPDATE review_requests SET status=CASE WHEN first_attempt_at>0 THEN 'uncertain' ELSE 'cancelled' END,retryable=0,last_error='Business setup, permission or the safe retry window changed. Review personally.' WHERE id=? AND status IN ('draft','sending','failed') AND lock_until<=? AND (profile_revision!=? OR NOT (${ELIGIBLE}) OR (first_attempt_at>0 AND (first_attempt_at<=? OR connection_fingerprint!=?)))`).bind(id,now,settings.revision,now-WINDOW,fingerprint).run();
 const row=await db.prepare(`UPDATE review_requests SET status='sending',approved_at=CASE WHEN approved_at='' THEN ? ELSE approved_at END,lock_token=?,lock_until=?,first_attempt_at=CASE WHEN first_attempt_at=0 THEN ? ELSE first_attempt_at END,connection_fingerprint=CASE WHEN first_attempt_at=0 THEN ? ELSE connection_fingerprint END,attempts=attempts+1
 WHERE id=? AND status IN ('draft','failed','sending') AND retryable=1 AND lock_until<=? AND attempts<5 AND profile_revision=? AND (${ELIGIBLE})
 AND (first_attempt_at>0 OR (NOT EXISTS(SELECT 1 FROM review_requests other WHERE other.recipient=review_requests.recipient AND other.id!=review_requests.id AND other.first_attempt_at>=?) AND (SELECT count(*) FROM review_requests WHERE first_attempt_at>=?)<100)) RETURNING ${SELECT}`).bind(new Date(now).toISOString(),token,now+120000,now,fingerprint,id,now,settings.revision,now-30*86400000,now-86400000).first<ReviewRequest>();
 if(!row)throw new RequestError(409,'No send started. This invitation was sent, stopped, changed, recently requested, or needs review. Refresh its status.');
 try{
  const payload=JSON.parse(row.payload) as {to?:string[];from?:string;reply_to?:string};
  if(payload.from!==OWNER_ALERT_FROM||payload.reply_to!==settings.profile.replyEmail||payload.to?.length!==1||payload.to[0]!==row.recipient)throw Error('Saved sender details changed.');
  // Check cancellation/suppression again immediately before the provider call.
  const active=await db.prepare(`SELECT id FROM review_requests WHERE id=? AND lock_token=? AND status='sending' AND (${ELIGIBLE})`).bind(id,token).first();if(!active)throw Error('Eligibility changed.');
 }catch{
  const reason=row.attempts>1?'This retry was stopped before sending. An earlier attempt may have been accepted; review personally.':'No email was sent. Saved details or permission could not be verified; prepare a new invitation after reviewing them.';
  await db.prepare("UPDATE review_requests SET status=?,retryable=0,lock_until=0,lock_token='',first_attempt_at=CASE WHEN attempts=1 THEN 0 ELSE first_attempt_at END,connection_fingerprint=CASE WHEN attempts=1 THEN '' ELSE connection_fingerprint END,last_error=? WHERE id=? AND lock_token=? AND status='sending'").bind(row.attempts>1?'uncertain':'cancelled',reason,id,token).run();
  throw new RequestError(409,reason);
 }
 let acceptedId:string|null=null;
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(6500),headers:{Authorization:`Bearer ${connection.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`schurr-review/${id}`},body:row.payload});
  if(!response.ok){
   const retry=[408,409,429,500,502,503,504].includes(response.status),delay=retryDelay(response);
   let errorName='';try{errorName=String(JSON.parse(await readBoundedText(response,8192)).name||'');}catch{/* Unknown responses retain the possible-send reservation. */}
   const definitelyRejected=row.attempts===1&&((response.status===400&&errorName==='validation_error')||(response.status===422&&['invalid_attachment','invalid_parameter','missing_required_field','missing_required_parameter'].includes(errorName)));
   const canRetry=retry&&row.attempts<5;
   const reason=definitelyRejected?'No email was accepted. Correct the request and prepare a new invitation.':retry?(canRetry?'Provider acceptance unconfirmed. Retry later with this same reference.':'Acceptance is unconfirmed and the retry limit was reached. Review personally before any further contact.'):'Email service rejected the request. Check sender settings before further contact.';
   await db.prepare("UPDATE review_requests SET status='failed',retryable=?,lock_until=?,lock_token='',first_attempt_at=CASE WHEN ?=1 THEN 0 ELSE first_attempt_at END,connection_fingerprint=CASE WHEN ?=1 THEN '' ELSE connection_fingerprint END,last_error=? WHERE id=? AND lock_token=? AND status='sending'").bind(canRetry?1:0,canRetry?Date.now()+delay:0,definitelyRejected?1:0,definitelyRejected?1:0,reason,id,token).run();return;
  }
  const result=JSON.parse(await readBoundedText(response,8192));if(typeof result.id!=='string'||!/^[0-9a-f-]{36}$/i.test(result.id))throw Error('Unconfirmed');
  await db.prepare("UPDATE review_requests SET email_id=?,status=CASE WHEN event_rank>0 THEN status ELSE 'accepted' END,retryable=0,lock_until=0,last_error=CASE WHEN event_rank>0 THEN last_error ELSE '' END WHERE id=? AND lock_token=?").bind(result.id,id,token).run();acceptedId=result.id;
 }catch{
  const canRetry=row.attempts<5;
  await db.prepare("UPDATE review_requests SET status='failed',retryable=?,lock_until=?,last_error=? WHERE id=? AND lock_token=? AND status='sending'").bind(canRetry?1:0,canRetry?Date.now()+60000:0,canRetry?'Acceptance is unconfirmed. A retry uses the same saved message and reference.':'Acceptance is unconfirmed and the retry limit was reached. Review personally before any further contact.',id,token).run();
 }
 if(acceptedId)await reconcileReport(acceptedId);
}
const STATES:Record<string,{status:string;rank:number}>={'email.sent':{status:'accepted',rank:1},'email.delivery_delayed':{status:'delayed',rank:2},'email.delivered':{status:'delivered',rank:3},'email.failed':{status:'failed',rank:4},'email.bounced':{status:'bounced',rank:5},'email.suppressed':{status:'suppressed',rank:6},'email.complained':{status:'complained',rank:7}};
export async function applyReviewEmailEvents(emailId:string){
 const db=database(),events=await db.prepare('SELECT type,event_at AS eventAt FROM customer_email_events WHERE email_id=? ORDER BY event_at,id').bind(emailId).all<{type:string;eventAt:string}>();
 for(const event of events.results){const state=STATES[event.type];if(!state)continue;const ops=[db.prepare("UPDATE review_requests SET status=?,event_rank=?,event_at=?,retryable=0,lock_until=0,last_error=? WHERE email_id=? AND (event_rank<? OR (event_rank=? AND event_at<=?))").bind(state.status,state.rank,event.eventAt,state.rank>=4?'Email provider reported '+state.status+'. Review in Resend; no automatic resend.':'',emailId,state.rank,state.rank,event.eventAt)];
  if(state.rank>=5){ops.push(db.prepare('INSERT INTO outreach_suppressions(email,reason,created_at) SELECT recipient,?,? FROM review_requests WHERE email_id=? ON CONFLICT(email) DO NOTHING').bind('Review invitation '+state.status,event.eventAt,emailId));ops.push(db.prepare("UPDATE review_requests SET status='cancelled',retryable=0,last_error='Recipient is suppressed.' WHERE status IN ('draft','failed','sending') AND recipient IN(SELECT email FROM outreach_suppressions)").bind());}
  await db.batch(ops);
 }
}
