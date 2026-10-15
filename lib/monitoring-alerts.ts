import {database,RequestError,readBoundedText} from './inquiries';
import {verifiedEmailConnection} from './owner-alerts';
import {OWNER_ALERT_EMAIL,OWNER_ALERT_FROM} from './owner-alert-content';
import {cursorDecode,cursorEncode} from './crm';
import {monitoringId,monitoringHash,MONITORING_UUID} from './monitoring-incident-policy';

const WINDOW=23*60*60*1000,LEASE=120000,DISPATCH_MARGIN=10000;
const ENABLED="COALESCE((SELECT alerts_enabled FROM monitoring_settings WHERE id='monitoring'),0)=1";
export type MonitoringAlert={id:string;incidentId:string;kind:'opened'|'resolved';status:string;attempts:number;firstAttemptAt:number;nextAttemptAt:number;retryable:number;emailId:string|null;acceptedAt:string;lastError:string;createdAt:string};
type ClaimedAlert=MonitoringAlert&{payload:string;payloadHash:string;connectionFingerprint:string};
const SELECT='id,incident_id AS incidentId,kind,status,attempts,first_attempt_at AS firstAttemptAt,next_attempt_at AS nextAttemptAt,retryable,email_id AS emailId,accepted_at AS acceptedAt,last_error AS lastError,created_at AS createdAt';
export async function monitoringAlertsEnabled(){const row=await database().prepare("SELECT alerts_enabled AS enabled FROM monitoring_settings WHERE id='monitoring'").first<{enabled:number}>();return row?.enabled===1;}
async function fingerprint(key:string){return monitoringHash(key+'\n'+OWNER_ALERT_FROM+'\n'+OWNER_ALERT_EMAIL);}
async function retireUnsafeAlerts(){const now=Date.now();await database().prepare("UPDATE monitoring_alerts SET status='uncertain',retryable=0,lock_token='',lock_until=0,last_error='Automatic retries stopped at the attempt limit or safe retry deadline. Review provider delivery personally.' WHERE status IN ('pending','failed','sending') AND lock_until<=? AND (attempts>=5 OR (first_attempt_at>0 AND first_attempt_at<=?))").bind(now,now-WINDOW+DISPATCH_MARGIN).run();}
function retryDelay(response:Response){const raw=response.headers.get('retry-after'),seconds=raw?Number(raw):NaN,value=Number.isFinite(seconds)?seconds*1000:raw?Date.parse(raw)-Date.now():60000;return Number.isFinite(value)?Math.max(60000,Math.min(24*60*60*1000,value)):60000;}
async function validPayload(row:ClaimedAlert){
 try{const payload=JSON.parse(row.payload) as Record<string,unknown>;return await monitoringHash(row.payload)===row.payloadHash&&payload.from===OWNER_ALERT_FROM&&Array.isArray(payload.to)&&payload.to.length===1&&payload.to[0]===OWNER_ALERT_EMAIL&&typeof payload.subject==='string'&&typeof payload.text==='string'&&row.payload.length<=5000&&Object.keys(payload).sort().join(',')==='from,subject,text,to';}catch{return false;}
}
// Accepted means the provider returned an email ID. This outbox does not claim
// inbox delivery and does not send caller/customer details or contact anyone else.
export async function deliverMonitoringAlert(value:string):Promise<MonitoringAlert|null>{
 const id=monitoringId(value),db=database();await retireUnsafeAlerts();
 const result=()=>db.prepare(`SELECT ${SELECT} FROM monitoring_alerts WHERE id=?`).bind(id).first<MonitoringAlert>();
 if(!await monitoringAlertsEnabled()){
  await db.prepare("UPDATE monitoring_alerts SET status=CASE WHEN attempts=0 THEN 'cancelled' ELSE 'uncertain' END,retryable=0,last_error='Monitoring alerts are disabled; no new send started.' WHERE id=? AND status IN ('pending','failed','sending') AND lock_until<=?").bind(id,Date.now()).run();return result();
 }
 const connection=await verifiedEmailConnection();if(!connection)return result();
 const expectedFingerprint=await fingerprint(connection.apiKey),now=Date.now(),token=crypto.randomUUID();
 await db.prepare("UPDATE monitoring_alerts SET status='uncertain',retryable=0,last_error='The verified sender connection changed after an attempt. Review provider delivery personally.' WHERE id=? AND status IN ('pending','failed','sending') AND lock_until<=? AND first_attempt_at>0 AND connection_fingerprint!=?").bind(id,now,expectedFingerprint).run();
 const row=await db.prepare(`UPDATE monitoring_alerts SET status='sending',lock_token=?,lock_until=?,first_attempt_at=CASE WHEN first_attempt_at=0 THEN ? ELSE first_attempt_at END,connection_fingerprint=CASE WHEN first_attempt_at=0 THEN ? ELSE connection_fingerprint END,attempts=attempts+1
 WHERE id=? AND status IN ('pending','failed','sending') AND retryable=1 AND attempts<5 AND lock_until<=? AND next_attempt_at<=? AND ${ENABLED}
 AND (first_attempt_at=0 OR (first_attempt_at>? AND connection_fingerprint=?)) RETURNING ${SELECT},payload,payload_hash AS payloadHash,connection_fingerprint AS connectionFingerprint`).bind(token,now+LEASE,now,expectedFingerprint,id,now,now,now-WINDOW+DISPATCH_MARGIN,expectedFingerprint).first<ClaimedAlert>();
 if(!row)return result();
 const stop=async(reason:string)=>{await db.prepare("UPDATE monitoring_alerts SET status=?,retryable=0,last_error=?,lock_token='',lock_until=0 WHERE id=? AND lock_token=? AND status='sending'").bind(row.attempts>1?'uncertain':'cancelled',reason,id,token).run();};
 if(!await validPayload(row)){await stop('The frozen alert payload could not be verified. No new send started.');return result();}
 // Recheck permission and verified credentials after claiming, immediately before
 // dispatch. A disable during an already in-flight HTTP request cannot recall it.
 const current=await verifiedEmailConnection();
 if(!current||await fingerprint(current.apiKey)!==row.connectionFingerprint){await stop('The verified sender changed before dispatch. No new send started.');return result();}
 const active=await db.prepare(`SELECT id FROM monitoring_alerts WHERE id=? AND lock_token=? AND status='sending' AND ${ENABLED} AND first_attempt_at>? AND lock_until>?`).bind(id,token,Date.now()-WINDOW+DISPATCH_MARGIN,Date.now()).first();
 if(!active){await stop('Monitoring permission, lease or retry deadline changed before dispatch. No new send started.');return result();}
 let response:Response;
 try{response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(6500),headers:{Authorization:`Bearer ${current.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`schurr-monitoring/${id}`},body:row.payload});}
 catch{await failure('Email acceptance was not confirmed. Any eligible retry keeps the exact message reference.',true,60000);return result();}
 if(!response.ok){const code=response.status,delay=retryDelay(response);await response.body?.cancel();await failure(code>=300&&code<400?'Unexpected email-service redirect; credentials were not forwarded.':'The email service did not confirm this monitoring notification.',[408,409,429,500,502,503,504].includes(code),delay);return result();}
 let emailId:unknown;try{emailId=(JSON.parse(await readBoundedText(response,8192)) as {id?:unknown})?.id;}catch{/* Ambiguous response is retried only with the same identity. */}
 if(typeof emailId!=='string'||!MONITORING_UUID.test(emailId)){await failure('Email acceptance could not be verified. Any eligible retry keeps the exact message reference.',true,60000);return result();}
 // Do not catch a failed acceptance write and convert it into a definitive failure.
 // The lease remains recoverable with the same payload/key inside the safe window.
 await db.prepare("UPDATE monitoring_alerts SET status='accepted',email_id=?,accepted_at=?,retryable=0,last_error='',lock_token='',lock_until=0 WHERE id=? AND lock_token=? AND status='sending'").bind(emailId,new Date().toISOString(),id,token).run();
 return result();
 async function failure(message:string,retryable:boolean,delay:number){
  const allowed=retryable&&row!.attempts<5&&row!.firstAttemptAt>Date.now()-WINDOW+DISPATCH_MARGIN;
  await db.prepare("UPDATE monitoring_alerts SET status=?,retryable=?,last_error=?,next_attempt_at=?,lock_token='',lock_until=0 WHERE id=? AND lock_token=? AND status='sending'").bind(retryable&&!allowed?'uncertain':'failed',allowed?1:0,retryable&&!allowed?'Automatic retry limit reached. Review provider delivery personally.':message,Date.now()+delay,id,token).run();
 }
}
export async function drainMonitoringAlerts(limit=10){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw new RequestError(400,'Choose a bounded monitoring alert batch.');
 await retireUnsafeAlerts();if(!await monitoringAlertsEnabled())return {considered:0,items:[] as (MonitoringAlert|null)[]};
 const now=Date.now(),rows=await database().prepare("SELECT id FROM monitoring_alerts WHERE status IN ('pending','failed','sending') AND retryable=1 AND attempts<5 AND lock_until<=? AND next_attempt_at<=? ORDER BY created_at,id LIMIT ?").bind(now,now,limit).all<{id:string}>();
 const items: (MonitoringAlert|null)[]=[];for(const row of rows.results)items.push(await deliverMonitoringAlert(row.id));return {considered:rows.results.length,items};
}
export async function listMonitoringAlerts(options:{limit?:number;cursor?:string}={}){
 const limit=options.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)throw new RequestError(400,'Choose a valid monitoring alert page.');
 const cursor=cursorDecode(options.cursor),db=database();
 const rows=(await db.prepare(`SELECT ${SELECT} FROM monitoring_alerts ${cursor?'WHERE (created_at,id)<(?,?)':''} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...(cursor||[]),limit+1).all<MonitoringAlert>()).results;
 const counts=await db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(status='pending' OR (status='failed' AND retryable=1)),0) AS pending,COALESCE(SUM(status='sending'),0) AS sending,COALESCE(SUM(status='accepted'),0) AS accepted,COALESCE(SUM(status='uncertain' OR (status='failed' AND retryable=0)),0) AS needsReview,COALESCE(SUM(status='cancelled'),0) AS cancelled FROM monitoring_alerts").first<{total:number;pending:number;sending:number;accepted:number;needsReview:number;cancelled:number}>();
 const items=rows.slice(0,limit),last=items.at(-1);return {items,nextCursor:rows.length>limit&&last?cursorEncode(last.createdAt,last.id):null,counts:counts!,enabled:await monitoringAlertsEnabled()};
}
