import {database, RequestError} from './inquiries';
import {validId} from './crm';
import {getSender, getProspect, eligibility, messageBody, type Draft, type Campaign} from './outreach';
import {getGmailConnection, gmailRequest} from './gmail-connection';
import {syncGmailRepliesForRecipient} from './gmail-replies';

import {outreachTargetSql} from './outreach-targets';
import {firstContactSql} from './outreach-history';
type Input=Record<string,unknown>;
type Outbox={id:string;draft_id:string;mailbox_email:string;connection_revision:number;draft_revision:number;sender_revision:number;prospect_id:string;campaign_id:string;recipient:string;subject:string;body:string;raw_mime:string;raw_hash:string;rfc_message_id:string;status:string;first_attempt_at:number;attempts:number;gmail_message_id:string;thread_id:string;last_error:string;lock_token:string;lock_until:number;last_checked_at:string;created_at:string;updated_at:string};
const PUBLIC_COLUMNS='id,draft_id,mailbox_email,connection_revision,draft_revision,sender_revision,prospect_id,campaign_id,recipient,subject,rfc_message_id,status,first_attempt_at,attempts,gmail_message_id,thread_id,last_error,last_checked_at,created_at,updated_at';
const LEASE=120000;
const RECONCILE_STATES=['sending','uncertain'];
function reject(message:string,status=409):never{throw new RequestError(status,message);}
function positive(value:unknown,label:string){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)reject(`Refresh the ${label} before sending.`,400);return n;}
function normalizedBody(value:string){return value.replace(/\r\n?/g,'\n');}
function address(value:string){if(value!==value.trim()||/[\r\n\x00-\x20\x7f,;<>]/.test(value)||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value))reject('Use one valid mailbox address.',400);return value.toLowerCase();}
function oneLine(value:string,label:string){if(!value||/[\r\n\x00-\x1f\x7f]/.test(value))reject(`Use one line for the ${label}.`,400);return value;}
function base64(value:string){const bytes=new TextEncoder().encode(value);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);}
function base64url(value:string){return base64(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
async function sha(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');}
function encodedHeader(value:string){
 const chunks:string[]=[];let chunk='',bytes=0;
 // RFC 2047 encoded words may be at most 75 characters. Keep UTF-8 code
 // points together and fold adjacent encoded words using legal header FWS.
 for(const character of value){const length=new TextEncoder().encode(character).length;if(bytes+length>42){chunks.push(chunk);chunk='';bytes=0;}chunk+=character;bytes+=length;}
 if(chunk)chunks.push(chunk);return chunks.map(part=>`=?UTF-8?B?${base64(part)}?=`).join('\r\n ');
}
function makeMime(input:{sender:string;senderName:string;recipient:string;subject:string;body:string;messageId:string;date:string}){
 const from=address(input.sender),to=address(input.recipient),name=oneLine(input.senderName,'sender name'),subject=oneLine(input.subject,'subject');
 if(!/^<[a-z0-9-]+@[a-z0-9.-]+>$/.test(input.messageId))reject('Invalid message reference.',400);
 const payload=base64(normalizedBody(input.body)).match(/.{1,76}/g)?.join('\r\n')||'';
 return [`From: ${encodedHeader(name)} <${from}>`,`To: ${to}`,`Subject: ${encodedHeader(subject)}`,`Message-ID: ${input.messageId}`,`Date: ${new Date(input.date).toUTCString()}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',payload,''].join('\r\n');
}
function receipt(row:Outbox){return {id:row.id,draftId:row.draft_id,status:row.status,recipient:row.recipient,subject:row.subject,gmailMessageId:row.gmail_message_id||null,threadId:row.thread_id||null,messageId:row.rfc_message_id,firstAttemptAt:row.first_attempt_at,accepted:row.status==='accepted',issue:row.last_error};}
async function rowByDraft(id:string){return database().prepare('SELECT * FROM gmail_outbox WHERE draft_id=?').bind(id).first<Outbox>();}
async function rowById(id:string){return database().prepare('SELECT * FROM gmail_outbox WHERE id=?').bind(id).first<Outbox>();}
function sameApproval(row:Outbox,expected:{revision:number;senderRevision:number;connectionRevision:number}){return row.draft_revision===expected.revision&&row.sender_revision===expected.senderRevision&&row.connection_revision===expected.connectionRevision;}

// This predicate is evaluated inside the atomic dispatch UPDATE. Approval,
// suppression, targeting and sequence delay must be current at that boundary.
function balancedApprovalAnd(conditions:string[]):string {
 if(conditions.length===1)return conditions[0];
 const middle=Math.floor(conditions.length/2);
 return '('+balancedApprovalAnd(conditions.slice(0,middle))+' AND '+balancedApprovalAnd(conditions.slice(middle))+')';
}
function currentApproval(includeQueue=true){return `EXISTS(SELECT 1 FROM outreach_drafts d
 JOIN outreach_prospects p ON p.id=d.prospect_id
 JOIN outreach_campaigns c ON c.id=d.campaign_id
 JOIN outreach_settings s ON s.id='main'
 WHERE ${balancedApprovalAnd([
 `d.id=gmail_outbox.draft_id`,
 `d.revision=gmail_outbox.draft_revision`,
 `d.status='approved'`,
 `d.approved_revision=d.revision`,
 `d.sender_revision=s.revision`,
 `s.revision=gmail_outbox.sender_revision`,
 `lower(s.sender_email)=gmail_outbox.mailbox_email`,
 `length(trim(s.postal_address))>0`,
 `length(trim(s.sender_name))>0`,
 `p.id=gmail_outbox.prospect_id`,
 `c.id=gmail_outbox.campaign_id`,
 `p.status IN ('needs_review','ready')`,
 `${outreachTargetSql('p')}`,
 `c.status='active'`,
 `p.email=d.recipient`,
 `d.recipient=gmail_outbox.recipient`,
 `d.subject=gmail_outbox.subject`,
 `d.step>=0`,
 `d.step<json_array_length(c.steps)`,
 includeQueue?`(NOT EXISTS(SELECT 1 FROM gmail_queue_items qi WHERE qi.outbox_id=gmail_outbox.id AND qi.status IN ('pending','dispatching','held')) OR EXISTS(SELECT 1 FROM gmail_queue_items qi JOIN gmail_queues q ON q.id=qi.queue_id WHERE qi.outbox_id=gmail_outbox.id AND qi.status='dispatching' AND q.status='active' AND qi.lease_token=gmail_outbox.lock_token AND q.lease_token=qi.lease_token AND q.lease_until>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)))`:'1',
 `NOT EXISTS(SELECT 1 FROM outreach_suppressions x WHERE x.email=gmail_outbox.recipient)`,
 `NOT EXISTS(SELECT 1 FROM outreach_activity a WHERE a.recipient_email=gmail_outbox.recipient AND a.kind IN ('reply','meeting'))`,
 `NOT EXISTS(SELECT 1 FROM gmail_outbox unresolved WHERE unresolved.recipient=gmail_outbox.recipient AND unresolved.id<>gmail_outbox.id AND unresolved.first_attempt_at>0 AND (unresolved.status!='accepted' OR unresolved.thread_id='' OR unresolved.gmail_message_id=''))`,
 `(d.step>0 OR (${firstContactSql('p.id','d.recipient','gmail_outbox.id')}))`,
 `(d.step=0 OR EXISTS(SELECT 1 FROM outreach_drafts previous
 WHERE previous.campaign_id=d.campaign_id AND previous.prospect_id=d.prospect_id
 AND previous.step=d.step-1 AND previous.status='sent'
 AND julianday(previous.sent_at)+CAST(json_extract(c.steps,'$['||d.step||'].delay') AS INTEGER)<=julianday('now')))`
])})`;}
const CURRENT_APPROVAL=currentApproval();

export function mountainClock(now:number){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';return {day:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};}
export function mountainDayStart(now:number){const day=mountainClock(now).day;let low=now-27*60*60*1000,high=now;while(high-low>1){const middle=Math.floor((low+high)/2);if(mountainClock(middle).day===day)high=middle;else low=middle;}return high;}

async function acceptance(row:Outbox,providerId:string,threadId:string){
 if(!/^[a-zA-Z0-9_-]{1,200}$/.test(providerId)||!threadId||!/^[a-zA-Z0-9_-]{1,200}$/.test(threadId))reject('Gmail acceptance could not be verified.');
 const db=database(),now=new Date().toISOString();
 // The history row uses a deterministic ID. Reconciliation after a lost response
 // can run repeatedly without another activity or a second draft revision bump.
 await db.batch([
  db.prepare("UPDATE gmail_outbox SET status='accepted',gmail_message_id=?,thread_id=?,last_error='',lock_token='',lock_until=0,last_checked_at=?,updated_at=? WHERE id=? AND first_attempt_at>0 AND status IN ('sending','uncertain','accepted')").bind(providerId,threadId,now,now,row.id),
  db.prepare("UPDATE outreach_drafts SET status='sent',sent_at=COALESCE(sent_at,?),revision=revision+1,updated_at=? WHERE id=? AND status!='sent' AND EXISTS(SELECT 1 FROM gmail_outbox o WHERE o.id=? AND o.status='accepted' AND o.gmail_message_id=?)").bind(new Date(row.first_attempt_at).toISOString(),now,row.draft_id,row.id,providerId),
  db.prepare("INSERT INTO outreach_activity(id,prospect_id,campaign_id,kind,body,recipient_email,created_at) SELECT ?,p.id,c.id,'sent','Gmail accepted this explicitly approved message. Recipient delivery is not confirmed.',o.recipient,? FROM gmail_outbox o LEFT JOIN outreach_prospects p ON p.id=o.prospect_id LEFT JOIN outreach_campaigns c ON c.id=o.campaign_id WHERE o.id=? AND o.status='accepted' AND o.gmail_message_id=? ON CONFLICT(id) DO NOTHING").bind(row.id,now,row.id,providerId),
 ]);
 const updated=await rowById(row.id);if(!updated||updated.status!=='accepted'||updated.gmail_message_id!==providerId)throw Error('Acceptance record was not saved.');return updated;
}

async function markUncertain(id:string,issue:string){await database().prepare("UPDATE gmail_outbox SET status='uncertain',last_error=?,lock_token='',lock_until=0,updated_at=? WHERE id=? AND first_attempt_at>0 AND status!='accepted'").bind(issue,new Date().toISOString(),id).run();}

export async function sendApprovedOutreach(input:Input,prepareOnly=false){
 if(input.confirmSend!==true)reject('Confirm sending this exact reviewed message.',400);
 const draftId=validId(input.id??input.draftId),revision=positive(input.revision??input.draftRevision,'message'),senderRevision=positive(input.senderRevision,'sender'),connectionRevision=positive(input.connectionRevision,'mailbox');
 const expected={revision,senderRevision,connectionRevision};
 if(await database().prepare("SELECT i.id FROM gmail_queue_items i JOIN gmail_queues q ON q.id=i.queue_id WHERE i.draft_id=? AND i.status IN ('pending','dispatching','held') AND q.status IN ('active','paused')").bind(draftId).first())reject('This message belongs to a sending queue. Cancel its queue before changing the delivery method.');
 let existing=await rowByDraft(draftId);
 if(existing?.first_attempt_at){
  if(!sameApproval(existing,expected))reject('A send already exists for another version of this message. Check its Gmail result before further contact.');
  if(existing.status==='sending'&&existing.lock_until<=Date.now()){await markUncertain(existing.id,'The earlier attempt may have reached Gmail. Check its result; this message will not be sent again.');existing=await rowByDraft(draftId);}
  return receipt(existing!);
 }
 const connection=await getGmailConnection();if(!connection||connection.status!=='connected'||connection.revision!==connectionRevision)reject('Connect the current business mailbox and review this message again.');
 const db=database(),draft=await db.prepare('SELECT * FROM outreach_drafts WHERE id=?').bind(draftId).first<Draft>(),sender=await getSender();
 if(!draft||draft.revision!==revision||draft.status!=='approved'||draft.approved_revision!==revision||draft.sender_revision!==senderRevision||sender.revision!==senderRevision)reject('The approved message or sender changed. Refresh and review it again.');
 const prospect=await getProspect(draft.prospect_id),campaign=await db.prepare('SELECT * FROM outreach_campaigns WHERE id=?').bind(draft.campaign_id).first<Campaign>();
 if(!prospect||!campaign)reject('The prospect or campaign is no longer available.');
 const reason=await eligibility(prospect,campaign,draft.step);if(reason)reject(reason);
 if(draft.recipient!==prospect.email||!sender.postal_address||address(sender.sender_email)!==address(connection.email))reject('The approved sender must match the connected Gmail address and have a business mailing address.');
 if(await db.prepare("SELECT id FROM gmail_outbox WHERE recipient=? AND first_attempt_at>0 AND (status!='accepted' OR thread_id='' OR gmail_message_id='') LIMIT 1").bind(draft.recipient).first())reject('An earlier email to this recipient has an unresolved Gmail result. Check that result before sending another message.');
 const body=messageBody(draft,sender),now=Date.now(),created=new Date(now).toISOString(),id=existing?.id||crypto.randomUUID(),messageId=existing&&sameApproval(existing,expected)?existing.rfc_message_id:`<${crypto.randomUUID()}@${address(connection.email).split('@')[1]}>`;
 const mime=makeMime({sender:connection.email,senderName:sender.sender_name,recipient:draft.recipient,subject:draft.subject,body,messageId,date:existing&&sameApproval(existing,expected)?existing.created_at:created}),rawHash=await sha(mime);
 const token=crypto.randomUUID();
 // Captured source revisions plus the draft and sender revision make this claim
 // atomic with existing source edits. A never-attempted stale envelope can be
 // replaced only through another explicit send action after review.
 await db.prepare(`INSERT INTO gmail_outbox(id,draft_id,mailbox_email,connection_revision,draft_revision,sender_revision,prospect_id,campaign_id,recipient,subject,body,raw_mime,raw_hash,rfc_message_id,status,lock_token,lock_until,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'prepared',?,?,?,? WHERE
 EXISTS(SELECT 1 FROM outreach_drafts WHERE id=? AND revision=? AND status='approved' AND approved_revision=revision AND sender_revision=?)
 AND EXISTS(SELECT 1 FROM outreach_prospects WHERE id=? AND revision=? AND status IN ('needs_review','ready') AND ${outreachTargetSql()} AND email=?)
 AND EXISTS(SELECT 1 FROM outreach_campaigns WHERE id=? AND revision=? AND status='active')
 AND EXISTS(SELECT 1 FROM outreach_settings WHERE id='main' AND revision=?)
 ON CONFLICT(draft_id) DO UPDATE SET mailbox_email=excluded.mailbox_email,connection_revision=excluded.connection_revision,draft_revision=excluded.draft_revision,sender_revision=excluded.sender_revision,prospect_id=excluded.prospect_id,campaign_id=excluded.campaign_id,recipient=excluded.recipient,subject=excluded.subject,body=excluded.body,raw_mime=excluded.raw_mime,raw_hash=excluded.raw_hash,rfc_message_id=excluded.rfc_message_id,status='prepared',last_error='',lock_token=excluded.lock_token,lock_until=excluded.lock_until,created_at=excluded.created_at,updated_at=excluded.updated_at
 WHERE gmail_outbox.first_attempt_at=0 AND gmail_outbox.lock_until<=? AND gmail_outbox.status IN ('prepared','cancelled') AND NOT EXISTS(SELECT 1 FROM gmail_queue_items qi JOIN gmail_queues q ON q.id=qi.queue_id WHERE qi.outbox_id=gmail_outbox.id AND qi.status IN ('pending','dispatching','held') AND q.status IN ('active','paused'))`).bind(id,draft.id,address(connection.email),connectionRevision,revision,senderRevision,prospect.id,campaign.id,draft.recipient,draft.subject,body,mime,rawHash,messageId,token,now+LEASE,created,created,draft.id,revision,senderRevision,prospect.id,prospect.revision,prospect.email,campaign.id,campaign.revision,senderRevision,now).run();
 let row=await rowByDraft(draftId);if(!row)reject('This message changed before it could be prepared.');
 if(row.lock_token!==token){if(prepareOnly||!sameApproval(row,expected))reject('Another version of this message is already being processed.');return receipt(row);}
 if(prepareOnly){await db.prepare("UPDATE gmail_outbox SET lock_token='',lock_until=0 WHERE id=? AND lock_token=? AND first_attempt_at=0").bind(row.id,token).run();return receipt(row);}
 return dispatchEnvelope(row,token);
}

export async function validateQueuedEnvelope(id:string){
 const row=await rowById(validId(id));if(!row||row.first_attempt_at||row.attempts)reject('This email already has a sending attempt. Check its saved result.');
 const db=database(),connection=await getGmailConnection(),sender=await getSender();
 if(!connection||connection.status!=='connected'||connection.revision!==row.connection_revision||connection.email.toLowerCase()!==row.mailbox_email)reject('The Gmail connection changed. Cancel this queue and review the emails with the current mailbox.');
 const draft=await db.prepare('SELECT * FROM outreach_drafts WHERE id=?').bind(row.draft_id).first<Draft>();
 if(!draft||draft.status!=='approved'||draft.revision!==row.draft_revision||draft.approved_revision!==draft.revision||draft.sender_revision!==sender.revision||row.sender_revision!==sender.revision||draft.recipient!==row.recipient||draft.subject!==row.subject||sender.sender_email.toLowerCase()!==row.mailbox_email||!sender.postal_address||!sender.sender_name||messageBody(draft,sender)!==row.body||await sha(row.raw_mime)!==row.raw_hash)reject('An approved email or sender changed. Cancel this queue and review the emails again.');
 const allowed=await db.prepare(`SELECT id FROM gmail_outbox WHERE id=? AND (${currentApproval(false)})`).bind(row.id).first();
 if(!allowed)reject('A contact, campaign, approval or sending permission changed. Cancel this queue and review the affected email.');
 // Final atomic dispatch guards repeat all permission checks after resumption.
}

export async function dispatchQueuedOutreach(outboxId:string,queueId:string,token:string){
 validId(outboxId);validId(queueId);validId(token);
 const db=database(),now=Date.now();
 const row=await db.prepare(`UPDATE gmail_outbox SET status='prepared',lock_token=?,lock_until=? WHERE id=? AND first_attempt_at=0 AND status IN ('prepared','cancelled') AND lock_until<=? AND EXISTS(SELECT 1 FROM gmail_queue_items i JOIN gmail_queues q ON q.id=i.queue_id WHERE i.outbox_id=gmail_outbox.id AND q.id=? AND q.status='active' AND q.lease_token=? AND q.lease_until>? AND i.status='dispatching' AND i.lease_token=?) RETURNING *`).bind(token,now+LEASE,outboxId,now,queueId,token,now,token).first<Outbox>();
 if(!row){const old=await rowById(outboxId);if(old?.first_attempt_at)return receipt(old);reject('The queued message is no longer ready.');}
 return dispatchEnvelope(row,token,queueId);
}

async function dispatchEnvelope(initial:Outbox,token:string,queueId?:string){
 // Queue authorization remains explicit even after cancellation removes live membership.
 const queueFence=queueId?`EXISTS(SELECT 1 FROM gmail_queue_items i JOIN gmail_queues q ON q.id=i.queue_id WHERE i.outbox_id=gmail_outbox.id AND q.id='${validId(queueId)}' AND q.status='active' AND i.status='dispatching' AND q.lease_token=gmail_outbox.lock_token AND i.lease_token=q.lease_token AND q.lease_until>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`:'1';
 let row=initial;const db=database(),draftId=row.draft_id,draft=await db.prepare('SELECT * FROM outreach_drafts WHERE id=?').bind(draftId).first<Draft>();
 try{
  // Existing threads are refreshed before eligibility is checked for this send.
  // A failed/partial sync must throw so unresolved reply state cannot send.
  await syncGmailRepliesForRecipient(row.recipient);
  // A complete thread scan can outlast the preparation lease. Renew only if
  // this same owner still holds the never-attempted envelope; another request
  // may have taken over while the scan ran, in which case this request stops.
  const renewed=await db.prepare("UPDATE gmail_outbox SET lock_until=?,updated_at=? WHERE id=? AND lock_token=? AND first_attempt_at=0 AND status='prepared' RETURNING id").bind(Date.now()+LEASE,new Date().toISOString(),row.id,token).first();
  if(!renewed)reject('This sending request changed during the reply check. Refresh its saved status before continuing.');
  const current=await getGmailConnection();if(!current||current.status!=='connected'||current.email.toLowerCase()!==row.mailbox_email||current.revision!==row.connection_revision)reject('The Gmail connection changed. Review the message with the current mailbox.');
  const freshSender=await getSender();
  if(freshSender.revision!==row.sender_revision||!draft||messageBody(draft,freshSender)!==row.body||await sha(row.raw_mime)!==row.raw_hash)reject('The approved email changed. Review the message again.');
  const clock=mountainClock(Date.now()),start=freshSender.window_start||'08:00',end=freshSender.window_end||'17:00';
  if(clock.time<start||clock.time>=end)reject(`Send during your saved window, ${start}–${end} Mountain Time. This message has not been sent.`);
  const attemptAt=Date.now(),dayStart=mountainDayStart(attemptAt),limit=freshSender.daily_limit||20;
  const claimedRow=await db.prepare(`UPDATE gmail_outbox SET status='sending',first_attempt_at=?,attempts=attempts+1,lock_until=?,updated_at=? WHERE id=? AND lock_token=? AND first_attempt_at=0 AND status='prepared' AND lock_until>? AND (${CURRENT_APPROVAL}) AND (${queueFence}) AND ((SELECT count(*) FROM gmail_outbox used WHERE used.mailbox_email=gmail_outbox.mailbox_email AND used.first_attempt_at>=?)+(SELECT count(*) FROM outreach_drafts manual WHERE manual.status='sent' AND manual.sent_at>=? AND NOT EXISTS(SELECT 1 FROM gmail_outbox used WHERE used.draft_id=manual.id AND used.first_attempt_at>0)))<? RETURNING *`).bind(attemptAt,attemptAt+LEASE,new Date(attemptAt).toISOString(),row.id,token,attemptAt,dayStart,new Date(dayStart).toISOString(),limit).first<Outbox>();
  if(!claimedRow)reject('Sending stopped because approval, contact eligibility, or today’s sending capacity changed.');row=claimedRow;
 }catch(error){
  await db.prepare("UPDATE gmail_outbox SET status='cancelled',lock_token='',lock_until=0,last_error=?,updated_at=? WHERE draft_id=? AND lock_token=? AND first_attempt_at=0").bind(error instanceof RequestError?error.message:'Reply synchronization or Gmail verification did not finish. No message was sent.',new Date().toISOString(),draftId,token).run();
  throw error;
 }
 // There is exactly one provider POST per outbox row. Never retry this block.
 try{
  const result=await gmailRequest('/messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:base64url(row.raw_mime)})},{email:row.mailbox_email,revision:row.connection_revision},async()=>{
   // OAuth refresh may involve network I/O. The helper invokes this fence only
   // after refresh and immediately before the send POST, so a reply or stop
   // arriving during refresh cannot slip through the earlier admission check.
   const boundary=Date.now(),clock=mountainClock(boundary);
   const active=await db.prepare(`SELECT id FROM gmail_outbox WHERE id=? AND lock_token=? AND status='sending' AND first_attempt_at=? AND lock_until>? AND raw_hash=? AND raw_mime=? AND body=? AND rfc_message_id=? AND mailbox_email=? AND connection_revision=? AND draft_revision=? AND sender_revision=? AND (${CURRENT_APPROVAL}) AND (${queueFence}) AND EXISTS(SELECT 1 FROM outreach_settings s WHERE s.id='main' AND s.revision=gmail_outbox.sender_revision AND s.window_start<=? AND s.window_end>?)`).bind(row.id,token,row.first_attempt_at,boundary,row.raw_hash,row.raw_mime,row.body,row.rfc_message_id,row.mailbox_email,row.connection_revision,row.draft_revision,row.sender_revision,clock.time,clock.time).first();
   if(!active)reject('Approval, contact permission or the sending request changed while Gmail connected. No provider send was started.');
  });
  if(!result||typeof result.id!=='string'||typeof result.threadId!=='string')throw Error('Gmail returned no verifiable message reference.');
  return receipt(await acceptance(row,result.id,result.threadId));
 }catch(error){
  // Deliberately conservative for any error, including definite rejection. This
  // avoids a second POST after an unclassified provider/persistence failure.
  const detail=error&&typeof error==='object'&&'status' in error&&[401,403].includes(Number(error.status))?'Gmail authorization needs attention. Check Gmail before further contact.':'Gmail acceptance is unconfirmed. Check the saved result; this message will not be resent automatically.';
  await markUncertain(row.id,detail);
  const uncertain=await rowById(row.id);if(!uncertain)throw Error('The saved sending record is unavailable.');return receipt(uncertain);
 }
}

function decodeBase64(value:string){const safe=value.replace(/-/g,'+').replace(/_/g,'/');const binary=atob(safe+'='.repeat((4-safe.length%4)%4));return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
function decodeHeader(value:string){return value.replace(/(\?=)\s+(=\?)/g,'$1$2').replace(/=\?(utf-8|us-ascii)\?([bq])\?([^?]*)\?=/gi,(_,charset:string,encoding:string,body:string)=>{if(encoding.toLowerCase()==='b')return decodeBase64(body);const binary=body.replace(/_/g,' ').replace(/=([a-f0-9]{2})/gi,(_:string,hex:string)=>String.fromCharCode(parseInt(hex,16)));return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,(c:string)=>c.charCodeAt(0)));});}
function header(payload:any,name:string){const matches=Array.isArray(payload?.headers)?payload.headers.filter((h:any)=>typeof h?.name==='string'&&h.name.toLowerCase()===name.toLowerCase()):[];if(matches.length!==1||typeof matches[0].value!=='string')return '';return matches[0].value.trim();}
function headerAddress(value:string){const match=value.match(/^[^<>]*<([^<>]+)>$/);try{return address(match?match[1]:value);}catch{return '';}}
function textParts(payload:any,depth=0):string[]{if(!payload||depth>5)return [];if(payload.mimeType==='text/plain'&&typeof payload.body?.data==='string'&&payload.body.data.length<100000)return [decodeBase64(payload.body.data)];if(Array.isArray(payload.parts))return payload.parts.slice(0,20).flatMap((part:any)=>textParts(part,depth+1));return [];}
function matchesMessage(result:any,row:Outbox){
 try{
  if(!result||typeof result.id!=='string'||typeof result.threadId!=='string'||!Array.isArray(result.labelIds)||!result.labelIds.includes('SENT'))return false;
  const p=result.payload;if(header(p,'Message-ID')!==row.rfc_message_id||headerAddress(header(p,'From'))!==row.mailbox_email||headerAddress(header(p,'To'))!==row.recipient||decodeHeader(header(p,'Subject'))!==row.subject)return false;
  const bodies=textParts(p);return bodies.length===1&&normalizedBody(bodies[0])===normalizedBody(row.body);
 }catch{return false;}
}

export async function reconcileGmailSend(inputId:unknown){
 const id=validId(inputId),row=await rowById(id);if(!row)reject('That Gmail message record is unavailable.',404);
 if(row.status==='accepted')return receipt(row);
 if(!row.first_attempt_at||!RECONCILE_STATES.includes(row.status))reject('There is no attempted Gmail send to reconcile.');
 if(row.status==='sending'&&row.lock_until>Date.now())reject('Gmail is still processing this request. Check again shortly.');
 const connection=await getGmailConnection();if(!connection||connection.email.toLowerCase()!==row.mailbox_email)reject('Reconnect the original mailbox to check this message.');
 // A reconnect of the same mailbox may have a newer revision; it is safe to
 // search that same mailbox while send authorization remains the old revision.
 const expected={email:connection.email,revision:connection.revision};
 const query=new URLSearchParams({q:`rfc822msgid:${row.rfc_message_id}`,labelIds:'SENT',maxResults:'10'});
 const listed=await gmailRequest(`/messages?${query}`,undefined,expected);
 if(!listed||!Array.isArray(listed.messages??[])||listed.nextPageToken)reject('Gmail results are incomplete. Review the message in Gmail before further contact.');
 const candidates=(listed.messages||[]).slice(0,10),matched:any[]=[];
 for(const candidate of candidates){if(!candidate||typeof candidate.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(candidate.id))continue;const message=await gmailRequest(`/messages/${encodeURIComponent(candidate.id)}?format=full`,undefined,expected);if(matchesMessage(message,row))matched.push(message);}
 if(matched.length===1){try{return receipt(await acceptance(row,matched[0].id,matched[0].threadId));}catch{await markUncertain(id,'Gmail contains this message, but saving the result did not finish. Check again without resending.');}}
 else await markUncertain(id,matched.length>1?'More than one matching sent message was found. Review the Gmail thread; this message will not be resent.':'No exact sent copy was verified. Absence from search does not prove the email was rejected; this message will not be resent.');
 await database().prepare('UPDATE gmail_outbox SET last_checked_at=? WHERE id=?').bind(new Date().toISOString(),id).run();
 return receipt((await rowById(id))!);
}

export async function gmailOutboxList(limit=30){if(!Number.isSafeInteger(limit)||limit<1||limit>100)reject('Choose a message limit from 1 to 100.',400);await database().prepare("UPDATE gmail_outbox SET status='uncertain',lock_token='',lock_until=0,last_error='The earlier attempt may have reached Gmail. Check its result; no automatic resend.',updated_at=? WHERE status='sending' AND first_attempt_at>0 AND lock_until<=?").bind(new Date().toISOString(),Date.now()).run();return (await database().prepare(`SELECT ${PUBLIC_COLUMNS} FROM gmail_outbox ORDER BY created_at DESC,id DESC LIMIT ?`).bind(limit).all()).results;}
