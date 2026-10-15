import {env} from 'cloudflare:workers';
import {database,RequestError} from './inquiries';
import {validId} from './crm';
import {getSender,getProspect,eligibility,messageBody,mutateOutreach,type Draft,type Campaign,type Sender} from './outreach';
import {getGmailConnection} from './gmail-connection';
import {sendApprovedOutreach,dispatchQueuedOutreach,validateQueuedEnvelope,mountainClock,mountainDayStart} from './gmail-send';

type Input=Record<string,unknown>;
type Queue={id:string;request_hash:string;mailbox:string;status:string;interval_minutes:number;batch_size:number;next_due:number;last_batch_at:number;current_batch:number;lease_token:string;lease_until:number;reason:string;created_at:string};
type Item={id:string;queue_id:string;outbox_id:string;draft_id:string;ordinal:number;batch_number:number;status:string;reason:string};
const LEASE=300000;
function fail(message:string,status=409):never{throw new RequestError(status,message);}
async function hash(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),x=>x.toString(16).padStart(2,'0')).join('');}
function idsOf(value:unknown){if(!Array.isArray(value)||value.length<1||value.length>20)fail('Select between 1 and 20 emails.',400);const ids=value.map(v=>validId(v));if(new Set(ids).size!==ids.length)fail('Each email may appear only once.',400);return ids;}
export async function previewQueue(value:unknown){
 const ids=idsOf(value),db=database(),sender=await getSender(),connection=await getGmailConnection();
 if(!connection||connection.status!=='connected')fail('Connect your business Gmail before sending a batch.');
 if(sender.sender_email.toLowerCase()!==connection.email.toLowerCase()||!sender.postal_address)fail('Complete the matching sender email and mailing address in Setup.');
 const drafts=[];const recipients=new Set<string>(),prospects=new Set<string>();
 for(const id of ids){
  const d=await db.prepare('SELECT d.*,p.company FROM outreach_drafts d JOIN outreach_prospects p ON p.id=d.prospect_id WHERE d.id=?').bind(id).first<Draft&{company:string}>();
  if(!d||!['draft','approved'].includes(d.status))fail('One selected email is already sent or stopped. Refresh the list.');
  if(prospects.has(d.prospect_id))fail('Keep only one email per business in this batch.');prospects.add(d.prospect_id);
  if(recipients.has(d.recipient))fail('The batch contains the same recipient twice. Keep only one email per recipient.');recipients.add(d.recipient);
  const p=await getProspect(d.prospect_id),c=await db.prepare('SELECT * FROM outreach_campaigns WHERE id=?').bind(d.campaign_id).first<Campaign>();
  const blocked=p&&c?await eligibility(p,c,d.step):'Contact or campaign no longer exists.';if(blocked)fail(`${d.company}: ${blocked}`);
  if(p?.email!==d.recipient)fail(`${d.company}: recipient changed. Update this draft first.`);
  if(await db.prepare("SELECT o.id FROM gmail_outbox o WHERE o.draft_id=? AND (o.first_attempt_at>0 OR EXISTS(SELECT 1 FROM gmail_queue_items i JOIN gmail_queues q ON q.id=i.queue_id WHERE i.outbox_id=o.id AND i.status IN ('pending','dispatching','held') AND q.status IN ('active','paused')))").bind(id).first())fail(`${d.company}: this email is already sent or queued.`);
  drafts.push({id:d.id,revision:d.revision,company:d.company,recipient:d.recipient,subject:d.subject,body:d.body,fullBody:messageBody(d,sender)});
 }
 const preview={drafts,sender:{name:sender.sender_name,email:sender.sender_email,revision:sender.revision,windowStart:sender.window_start||'08:00',windowEnd:sender.window_end||'17:00',dailyLimit:sender.daily_limit||20},connectionRevision:connection.revision};
 return {...preview,previewHash:await hash(preview)};
}
export function nextSendingTime(now:number,sender:Sender,used:number){
 const today=mountainClock(now).day,at=mountainClock(now),start=sender.window_start||'08:00',end=sender.window_end||'17:00',full=used>=(sender.daily_limit||20);
 if(!full&&at.time>=start&&at.time<end)return now;
 for(let n=1;n<=3000;n++){const candidate=Math.floor(now/60000)*60000+n*60000,clock=mountainClock(candidate);if((!full||clock.day!==today)&&clock.time>=start&&clock.time<end)return candidate;}
 return now+86400000;
}
async function usedToday(mailbox:string){return (await database().prepare('SELECT ((SELECT count(*) FROM gmail_outbox WHERE mailbox_email=? AND first_attempt_at>=?)+(SELECT count(*) FROM outreach_drafts d WHERE status=\'sent\' AND sent_at>=? AND NOT EXISTS(SELECT 1 FROM gmail_outbox o WHERE o.draft_id=d.id AND o.first_attempt_at>0))) AS n').bind(mailbox,mountainDayStart(Date.now()),new Date(mountainDayStart(Date.now())).toISOString()).first<{n:number}>())?.n||0;}
export async function confirmQueue(input:Input,ownerEmail:string){
 if(input.confirmSend!==true)fail('Review the entire batch and confirm sending.',400);
 const id=validId(input.requestId),ids=idsOf(input.ids),interval=Number(input.intervalMinutes);
 if(![30,45,60].includes(interval))fail('Choose 30, 45 or 60 minutes between batches.',400);
 if(typeof input.previewHash!=='string'||!/^[a-f0-9]{64}$/.test(input.previewHash))fail('Reload the batch preview.',400);
 const requestHash=await hash({ids,interval,previewHash:input.previewHash}),db=database();
 const prior=await db.prepare('SELECT * FROM gmail_queues WHERE id=?').bind(id).first<Queue>();
 if(prior){if(prior.request_hash!==requestHash)fail('This confirmation was already used for a different batch.');return {id:prior.id};}
 const preview=await previewQueue(ids);if(preview.previewHash!==input.previewHash)fail('An email, sender or Gmail connection changed. Review the refreshed batch.');
 if(await db.prepare("SELECT id FROM gmail_queues WHERE active_key=?").bind(preview.sender.email.toLowerCase()).first())fail('Finish or cancel the existing queue before starting another.');
 const envelopes:{id:string;draftId:string;revision:number;rawHash:string}[]=[];
 for(const d of preview.drafts){
  await mutateOutreach({action:'approve',mutationId:crypto.randomUUID(),id:d.id,revision:d.revision});
  const receipt=await sendApprovedOutreach({id:d.id,revision:d.revision,senderRevision:preview.sender.revision,connectionRevision:preview.connectionRevision,confirmSend:true},true);
  const row=await db.prepare('SELECT id,raw_hash,first_attempt_at FROM gmail_outbox WHERE id=? AND draft_revision=? AND sender_revision=? AND connection_revision=?').bind(receipt.id,d.revision,preview.sender.revision,preview.connectionRevision).first<{id:string;raw_hash:string;first_attempt_at:number}>();
  if(!row||row.first_attempt_at)fail('A selected email changed or was already attempted. No new queue was started.');
  envelopes.push({id:row.id,draftId:d.id,revision:d.revision,rawHash:row.raw_hash});
 }
 const sender=await getSender(),now=Date.now(),stamp=new Date(now).toISOString(),mailbox=preview.sender.email.toLowerCase();
 const last=await db.prepare('SELECT max(last_batch_at+interval_minutes*60000) AS next FROM gmail_queues WHERE mailbox=?').bind(mailbox).first<{next:number|null}>();
 const due=Math.max(nextSendingTime(now,sender,await usedToday(mailbox)),last?.next||0);
 const checks=envelopes.map(()=>"EXISTS(SELECT 1 FROM gmail_outbox o WHERE o.id=? AND o.first_attempt_at=0 AND o.raw_hash=? AND o.draft_revision=? AND EXISTS(SELECT 1 FROM outreach_drafts d JOIN outreach_settings s ON s.id='main' WHERE d.id=o.draft_id AND d.revision=o.draft_revision AND d.status='approved' AND d.approved_revision=d.revision AND d.sender_revision=s.revision AND o.sender_revision=s.revision AND d.subject=o.subject) AND EXISTS(SELECT 1 FROM gmail_connections c WHERE lower(c.email)=o.mailbox_email AND c.revision=o.connection_revision AND c.status='connected') AND NOT EXISTS(SELECT 1 FROM gmail_queue_items i WHERE i.outbox_id=o.id AND i.status IN ('pending','dispatching','held')))").join(' AND ');
 const claim=db.prepare(`INSERT INTO gmail_queues(id,request_hash,mailbox,active_key,interval_minutes,next_due,confirmed_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM gmail_queues WHERE active_key=?) AND ${checks} ON CONFLICT(id) DO NOTHING`).bind(id,requestHash,mailbox,mailbox,interval,due,ownerEmail,stamp,stamp,mailbox,...envelopes.flatMap(e=>[e.id,e.rawHash,e.revision]));
 await db.batch([claim,...envelopes.map((e,n)=>db.prepare("INSERT INTO gmail_queue_items(id,queue_id,outbox_id,draft_id,ordinal,batch_number,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gmail_queues WHERE id=? AND request_hash=?) ON CONFLICT(id) DO NOTHING").bind(`${id}:${n}`,id,e.id,e.draftId,n,Math.floor(n/5),stamp,id,requestHash))]);
 const saved=await db.prepare('SELECT id,request_hash FROM gmail_queues WHERE id=?').bind(id).first<{id:string;request_hash:string}>();if(!saved||saved.request_hash!==requestHash)fail('The batch changed before it could be queued. Refresh and review it again.');
 return {id};
}
export async function queueSnapshot(){
 const order="CASE WHEN status IN ('active','paused') THEN 0 ELSE 1 END,created_at DESC,id DESC";
 const db=database(),queues=await db.prepare(`SELECT id,status,interval_minutes,batch_size,next_due,last_batch_at,reason,created_at,updated_at FROM gmail_queues ORDER BY ${order} LIMIT 10`).all();
 // Use the IDs from this read so a concurrent new queue cannot leave the
 // displayed queue without its messages between the two SELECTs.
 const ids=queues.results.map(q=>String(q.id));
 const items=ids.length?await db.prepare(`SELECT i.queue_id,i.ordinal,i.batch_number,i.status,i.reason,o.recipient,o.subject,o.status AS gmail_status,o.first_attempt_at,o.attempts,o.gmail_message_id,o.thread_id,o.last_error AS gmail_error FROM gmail_queue_items i JOIN gmail_outbox o ON o.id=i.outbox_id WHERE i.queue_id IN (${ids.map(()=>'?').join(',')}) ORDER BY i.queue_id,i.ordinal`).bind(...ids).all():{results:[]};
 return {queues:queues.results,items:items.results,runnerConfigured:Boolean((env as unknown as {GMAIL_QUEUE_RUNNER_SECRET?:string}).GMAIL_QUEUE_RUNNER_SECRET?.length&&((env as unknown as {GMAIL_QUEUE_RUNNER_SECRET?:string}).GMAIL_QUEUE_RUNNER_SECRET!.length>=32))};
}
export async function cancelQueue(value:unknown){
 const id=validId(value),db=database(),now=new Date().toISOString();
 await db.batch([db.prepare("UPDATE gmail_queues SET status='cancelled',active_key=NULL,reason='Cancelled by owner.',lease_token='',lease_until=0,updated_at=? WHERE id=? AND status IN ('active','paused')").bind(now,id),db.prepare("UPDATE gmail_queue_items SET status='cancelled',lease_token='',reason='Cancelled by owner.',updated_at=? WHERE queue_id=? AND status IN ('pending','dispatching','held') AND EXISTS(SELECT 1 FROM gmail_queues WHERE id=? AND status='cancelled')").bind(now,id,id)]);
 return {id};
}
// Resume keeps the exact already-confirmed envelopes. It cannot clear attempts
// or reset an ambiguous provider result, and it does not dispatch by itself.
export async function resumeQueue(input:Input){
 const id=validId(input.id);if(input.confirmResume!==true)fail('Confirm resuming this reviewed batch.',400);
 const db=database(),q=await db.prepare('SELECT * FROM gmail_queues WHERE id=?').bind(id).first<Queue&{updated_at:string}>();
 if(!q)fail('This queue is unavailable.',404);
 if(q.status==='active'||q.status==='completed')return {id};
 if(q.status!=='paused'||q.updated_at!==input.updatedAt)fail('The queue changed. Check its current state.');
 const now=Date.now();if(q.lease_until>now)fail('A queue check is still finishing. Try again shortly.');
 const rows=(await db.prepare("SELECT i.id AS item_id,i.status AS item_status,o.* FROM gmail_queue_items i JOIN gmail_outbox o ON o.id=i.outbox_id WHERE i.queue_id=? ORDER BY i.ordinal").bind(id).all<{item_id:string;item_status:string;id:string;status:string;first_attempt_at:number;attempts:number;gmail_message_id:string;thread_id:string;lock_until:number;updated_at:string}>()).results;
 if(!rows.length||rows.length>20)fail('This batch needs review before it can resume.');
 for(const r of rows){
  if(r.lock_until>now)fail('An email check is still finishing. Try again shortly.');
  if(r.first_attempt_at>0){if(r.status!=='accepted'||!r.gmail_message_id||!r.thread_id)fail('Check the uncertain Gmail result in Sent before resuming.');}
  else if(r.attempts!==0||!['prepared','cancelled'].includes(r.status)||r.gmail_message_id||r.thread_id)fail('An email has an unresolved sending state. Check Sent before resuming.');
  if(!['pending','dispatching','held','sent'].includes(r.item_status)||r.item_status==='sent'&&r.status!=='accepted')fail('The queue changed. Check its current state.');
  if(!r.first_attempt_at)await validateQueuedEnvelope(r.id);
 }
 const sender=await getSender(),due=Math.max(q.next_due,nextSendingTime(Date.now(),sender,await usedToday(q.mailbox))),token=crypto.randomUUID(),stamp=new Date().toISOString();
 const checks=JSON.stringify(rows.map(r=>({id:r.id,itemId:r.item_id,status:r.status,itemStatus:r.item_status,updatedAt:r.updated_at,attempt:r.first_attempt_at,attempts:r.attempts})));
 // Compare every inspected row again in the transaction; a cancel, provider
 // receipt or replacement runner wins without a partial repair.
 const condition=`(SELECT count(*) FROM json_each(?) j JOIN gmail_outbox o ON o.id=json_extract(j.value,'$.id') JOIN gmail_queue_items i ON i.id=json_extract(j.value,'$.itemId') WHERE i.queue_id=? AND i.status=json_extract(j.value,'$.itemStatus') AND o.status=json_extract(j.value,'$.status') AND o.updated_at=json_extract(j.value,'$.updatedAt') AND o.first_attempt_at=json_extract(j.value,'$.attempt') AND o.attempts=json_extract(j.value,'$.attempts') AND o.lock_until<=?)=?`;
 await db.batch([
  db.prepare(`UPDATE gmail_queues SET status='active',reason='',next_due=?,lease_token=?,lease_until=?,updated_at=? WHERE id=? AND status='paused' AND updated_at=? AND lease_until<=? AND ${condition}`).bind(due,token,now+LEASE,stamp,id,q.updated_at,now,checks,id,now,rows.length),
  db.prepare("UPDATE gmail_outbox SET status='prepared',last_error='',lock_token='',lock_until=0,updated_at=? WHERE first_attempt_at=0 AND attempts=0 AND status IN ('prepared','cancelled') AND id IN (SELECT i.outbox_id FROM gmail_queue_items i JOIN gmail_queues q ON q.id=i.queue_id WHERE q.id=? AND q.status='active' AND q.lease_token=?)").bind(stamp,id,token),
  db.prepare("UPDATE gmail_queue_items SET status=CASE WHEN EXISTS(SELECT 1 FROM gmail_outbox o WHERE o.id=gmail_queue_items.outbox_id AND o.status='accepted') THEN 'sent' ELSE 'pending' END,reason='',lease_token='',updated_at=? WHERE queue_id=? AND status IN ('pending','dispatching','held') AND EXISTS(SELECT 1 FROM gmail_queues WHERE id=? AND status='active' AND lease_token=?)").bind(stamp,id,id,token),
  db.prepare("UPDATE gmail_queues SET lease_token='',lease_until=0 WHERE id=? AND status='active' AND lease_token=?").bind(id,token)
 ]);
 const current=await db.prepare('SELECT status,updated_at FROM gmail_queues WHERE id=?').bind(id).first<{status:string;updated_at:string}>();
 if(current?.status!=='active'||current.updated_at!==stamp)fail('The queue changed before it could resume. Check its current state.');
 return {id};
}
export async function runQueue(){
 const db=database(),now=Date.now(),token=crypto.randomUUID(),stamp=new Date(now).toISOString();
 const q=await db.prepare("UPDATE gmail_queues SET lease_token=?,lease_until=?,updated_at=? WHERE id=(SELECT id FROM gmail_queues WHERE status='active' AND next_due<=? AND lease_until<=? ORDER BY next_due,id LIMIT 1) AND status='active' AND lease_until<=? RETURNING *").bind(token,now+LEASE,stamp,now,now,now).first<Queue>();
 if(!q)return {processed:0};
 let processed=0;
 async function release(due:number,reason=''){await db.prepare("UPDATE gmail_queues SET next_due=?,reason=?,lease_token='',lease_until=0,updated_at=? WHERE id=? AND lease_token=?").bind(due,reason,new Date().toISOString(),q!.id,token).run();}
 try{
  const sender=await getSender(),available=nextSendingTime(Date.now(),sender,await usedToday(q.mailbox));if(available>Date.now()){await release(available,'Waiting for sending hours or daily capacity.');return {processed};}
  if(await db.prepare("SELECT id FROM gmail_queue_items WHERE queue_id=? AND status='held' LIMIT 1").bind(q.id).first()){await db.prepare("UPDATE gmail_queues SET status='paused',reason='A message needs review.',lease_token='',lease_until=0,updated_at=? WHERE id=? AND lease_token=?").bind(stamp,q.id,token).run();return {processed};}
  const next=await db.prepare("SELECT min(batch_number) AS n FROM gmail_queue_items WHERE queue_id=? AND status IN ('pending','dispatching')").bind(q.id).first<{n:number|null}>();
  if(next?.n==null){await db.prepare("UPDATE gmail_queues SET status='completed',active_key=NULL,lease_token='',lease_until=0,updated_at=? WHERE id=? AND lease_token=?").bind(stamp,q.id,token).run();return {processed};}
  const batch=q.current_batch>=0?q.current_batch:next.n;
  await db.prepare("UPDATE gmail_queues SET current_batch=?,last_batch_at=?,updated_at=? WHERE id=? AND lease_token=? AND status='active'").bind(batch,now,stamp,q.id,token).run();
  const items=(await db.prepare("SELECT * FROM gmail_queue_items WHERE queue_id=? AND batch_number=? AND status IN ('pending','dispatching') ORDER BY ordinal LIMIT 5").bind(q.id,batch).all<Item>()).results;
  for(const item of items){
   const readyAt=nextSendingTime(Date.now(),await getSender(),await usedToday(q.mailbox));if(readyAt>Date.now()){await release(readyAt,'Waiting for sending hours or daily capacity.');return {processed};}
   const held=await db.prepare("UPDATE gmail_queues SET lease_until=? WHERE id=? AND lease_token=? AND status='active' AND lease_until>? RETURNING id").bind(Date.now()+LEASE,q.id,token,Date.now()).first();if(!held)return {processed};
   const claimed=await db.prepare("UPDATE gmail_queue_items SET status='dispatching',lease_token=?,updated_at=? WHERE id=? AND status IN ('pending','dispatching') AND EXISTS(SELECT 1 FROM gmail_queues q WHERE q.id=gmail_queue_items.queue_id AND q.status='active' AND q.lease_token=? AND q.lease_until>?) RETURNING id").bind(token,new Date().toISOString(),item.id,token,Date.now()).first();if(!claimed)return {processed};
   try{
    const receipt=await dispatchQueuedOutreach(item.outbox_id,q.id,token);processed++;
    if(receipt.status!=='accepted')throw new RequestError(409,'Gmail result needs review. This email will not be resent automatically.');
    await db.prepare("UPDATE gmail_queue_items SET status='sent',lease_token='',reason='',updated_at=? WHERE id=? AND lease_token=? AND EXISTS(SELECT 1 FROM gmail_queues q WHERE q.id=gmail_queue_items.queue_id AND q.status='active' AND q.lease_token=? AND q.lease_until>?)").bind(new Date().toISOString(),item.id,token,token,Date.now()).run();
   }catch(error){
    const saved=await db.prepare('SELECT first_attempt_at,status FROM gmail_outbox WHERE id=?').bind(item.outbox_id).first<{first_attempt_at:number;status:string}>();
    const reason=error instanceof RequestError?error.message:saved?.first_attempt_at===0?'An internal check stopped before this email was sent. Resume the batch to try the check again.':'The email could not be confirmed. Check its Gmail result in Sent before continuing.';
    await db.batch([db.prepare("UPDATE gmail_queue_items SET status='held',reason=?,lease_token='',updated_at=? WHERE id=? AND lease_token=? AND EXISTS(SELECT 1 FROM gmail_queues q WHERE q.id=gmail_queue_items.queue_id AND q.status='active' AND q.lease_token=? AND q.lease_until>?)").bind(reason,new Date().toISOString(),item.id,token,token,Date.now()),db.prepare("UPDATE gmail_queues SET status='paused',reason=?,lease_token='',lease_until=0,updated_at=? WHERE id=? AND lease_token=? AND status='active' AND lease_until>?").bind(reason,new Date().toISOString(),q.id,token,Date.now())]);return {processed};
   }
  }
  const pending=await db.prepare("SELECT count(*) AS n FROM gmail_queue_items WHERE queue_id=? AND status IN ('pending','dispatching','held')").bind(q.id).first<{n:number}>();
  const finished=Date.now();await db.prepare("UPDATE gmail_queues SET status=?,active_key=?,current_batch=-1,last_batch_at=?,next_due=?,lease_token='',lease_until=0,reason='',updated_at=? WHERE id=? AND lease_token=? AND status='active'").bind(pending?.n?'active':'completed',pending?.n?q.mailbox:null,finished,finished+q.interval_minutes*60000,new Date(finished).toISOString(),q.id,token).run();
  return {processed};
 }catch{await release(Date.now()+60000,'Queue check interrupted. Saved sending attempts will not be repeated.');return {processed};}
}
