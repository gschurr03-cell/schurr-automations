import {database,RequestError} from './inquiries';
import {getGmailConnection,gmailRequest,type GmailConnection} from './gmail-connection';

// Only conversations created by a recorded CRM send are inspected. This is not
// an inbox importer: unrelated Gmail messages, attachments and HTML are excluded.
const THREAD_LIMIT=10, MESSAGE_LIMIT=200, RECEIPT_LIMIT=200, LEASE_MS=120000;
const REQUEST_LIMIT=40;
const ID=/^[A-Za-z0-9_-]{1,200}$/;
const ADDRESS=/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
const HEADERS=['From','To','Delivered-To','Subject','In-Reply-To','References','Auto-Submitted','X-Autoreply','X-Autorespond','Content-Type'];
type Header={name?:unknown;value?:unknown};
type Part={mimeType?:unknown;filename?:unknown;headers?:Header[];body?:{data?:unknown;attachmentId?:unknown};parts?:Part[]};
type Message={id?:unknown;threadId?:unknown;labelIds?:unknown;internalDate?:unknown;payload?:Part};
type Receipt={id:string;mailbox_email:string;recipient:string;thread_id:string;rfc_message_id:string;gmail_message_id:string;prospect_id:string;campaign_id:string;first_attempt_at:number;created_at:string};
type Lease={connection:GmailConnection;token:string};
type Candidate={messageId:string;sender:string;subject:string;receivedAt:string;receipt:Receipt;automated:boolean;bounce:boolean};
type ReplyKind='reply'|'unsubscribe'|'automated'|'bounce';
const CONNECTION_GUARD="EXISTS(SELECT 1 FROM gmail_connections WHERE id='gmail' AND email=? AND revision=? AND status='connected' AND sync_lock_token=? AND sync_lock_until>?)";
const genericFailure='The Gmail reply check did not finish. Try syncing again before sending more outreach.';

function headerValues(part:Part|undefined,name:string){
  if(!Array.isArray(part?.headers)||part.headers.length>100)return [];
  return part.headers.filter(h=>h&&typeof h.name==='string'&&h.name.toLowerCase()===name.toLowerCase()).map(h=>typeof h.value==='string'?h.value:'');
}
function oneHeader(part:Part|undefined,name:string){const values=headerValues(part,name);return values.length===1?values[0]:'';}
function cleanHeader(value:string,max=300){return value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function address(value:string){
  value=value.trim().replace(/\r?\n[ \t]+/g,' ');
  if(value.length>1000||/[\r\n]/.test(value))return null;
  const match=value.match(/^[^<>]*<([^<>]+)>$/);
  const email=(match?match[1]:value).trim().toLowerCase();
  // Do not accept two addresses disguised as a display name.
  if(match&&value.slice(0,value.indexOf('<')).includes('@'))return null;
  return email.length<=254&&ADDRESS.test(email)?email:null;
}
function addressList(value:string){
  if(value.length>4000)return [];
  const parts:string[]=[];let part='',quoted=false,escaped=false,angle=0;
  for(const c of value){
    if(escaped){part+=c;escaped=false;continue;}
    if(c==='\\'&&quoted){part+=c;escaped=true;continue;}
    if(c==='"')quoted=!quoted;
    if(!quoted&&c==='<')angle++;if(!quoted&&c==='>')angle--;
    if(angle<0||angle>1)return [];
    if(c===','&&!quoted&&!angle){parts.push(part);part='';}else part+=c;
  }
  parts.push(part);if(quoted||angle||parts.length>20)return [];
  const parsed=parts.map(address);return parsed.every(Boolean)?parsed as string[]:[];
}
function validEnvelope(message:Message,threadId:string,mailbox:string){
  if(!message||typeof message.id!=='string'||!ID.test(message.id)||message.threadId!==threadId)return null;
  if(!Array.isArray(message.labelIds)||!message.labelIds.every(x=>typeof x==='string'))return null;
  if(message.labelIds.includes('SENT')||message.labelIds.includes('DRAFT'))return null;
  const sender=address(oneHeader(message.payload,'From'));
  if(!sender||sender===mailbox)return null;
  const destinations=[...headerValues(message.payload,'To'),...headerValues(message.payload,'Delivered-To')].flatMap(addressList);
  if(!destinations.includes(mailbox))return null;
  if(typeof message.internalDate!=='string'||!/^\d{1,16}$/.test(message.internalDate))return null;
  const at=Number(message.internalDate);if(!Number.isSafeInteger(at)||at<0||at>Date.now()+600000)return null;
  return {sender,at};
}
function candidate(message:Message,threadId:string,mailbox:string,receipts:Receipt[]):Candidate|null{
  const envelope=validEnvelope(message,threadId,mailbox);if(!envelope)return null;
  const references:string[]=[oneHeader(message.payload,'In-Reply-To'),oneHeader(message.payload,'References')].join(' ').match(/<[^<>\s]{1,500}>/g)||[];
  const eligible=receipts.filter(r=>r.mailbox_email===mailbox&&r.thread_id===threadId&&envelope.at>=r.first_attempt_at&&r.first_attempt_at>0&&r.gmail_message_id!==message.id);
  const matching=eligible.filter(r=>r.recipient.toLowerCase()===envelope.sender);
  // A provider DSN comes from a mailer, not the prospect. It needs both a known
  // RFC message reference and a delivery-status report for the exact recipient.
  const reportType=oneHeader(message.payload,'Content-Type')||String(message.payload?.mimeType||'');
  const bounce=/^(mailer-daemon|postmaster)(?:[+.-][^@]*)?@/i.test(envelope.sender)&&/multipart\/report/i.test(reportType);
  const bounceMatches=bounce?eligible.filter(r=>references.includes(r.rfc_message_id)):[];
  const options=matching.length?matching:bounceMatches;
  if(!options.length)return null;
  const receipt=[...options].sort((a,b)=>Number(references.includes(b.rfc_message_id))-Number(references.includes(a.rfc_message_id))||b.first_attempt_at-a.first_attempt_at||a.id.localeCompare(b.id))[0];
  const auto=oneHeader(message.payload,'Auto-Submitted').trim().toLowerCase();
  return {messageId:String(message.id),sender:envelope.sender,subject:cleanHeader(oneHeader(message.payload,'Subject')),receivedAt:new Date(envelope.at).toISOString(),receipt,
    automated:Boolean((auto&&auto!=='no')||oneHeader(message.payload,'X-Autoreply')||oneHeader(message.payload,'X-Autorespond')),bounce:!matching.length&&bounce};
}

function inlineBodies(payload:Part|undefined,wanted:string){
  const found:string[]=[];let visited=0,budget=65536;
  function visit(part:Part|undefined,depth:number){
    if(!part||++visited>100||depth>10||budget<=0)return;
    const disposition=oneHeader(part,'Content-Disposition');
    if((typeof part.filename==='string'&&part.filename)||/attachment/i.test(disposition)||part.body?.attachmentId)return;
    const mime=String(part.mimeType||'').toLowerCase();
    // Never descend into attached/forwarded RFC 822 messages.
    if(mime==='message/rfc822')return;
    if(mime===wanted&&typeof part.body?.data==='string'){
      const encoded=part.body.data;if(encoded.length>90000||!/^[A-Za-z0-9_-]*={0,2}$/.test(encoded))return;
      try{const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));if(binary.length>budget)return;
        const charset=oneHeader(part,'Content-Type').match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1]||'utf-8';
        const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
        found.push(new TextDecoder(charset,{fatal:true}).decode(bytes));budget-=bytes.length;
      }catch{/* Unreadable plain text still records a reply and stops outreach. */}
    }
    if(mime.startsWith('multipart/')&&Array.isArray(part.parts))for(const child of part.parts)visit(child,depth+1);
  }
  visit(payload,0);return found.join('\n');
}
export function authoredGmailReply(raw:string){
  const lines=raw.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').split('\n'),kept:string[]=[];
  for(const line of lines){
    if(/^\s*>/.test(line)||/^\s*On\s.+wrote:\s*$/i.test(line)||/^\s*-{2,}\s*(Original|Forwarded) message\s*-*/i.test(line)||/^\s*Begin forwarded message:/i.test(line)||/^\s*From:\s/i.test(line)||/^--\s*$/.test(line))break;
    kept.push(line);if(kept.join('\n').length>3000)break;
  }
  return kept.join('\n').trim().slice(0,3000);
}
export function isExplicitGmailUnsubscribe(body:string){
  // Whole authored lines only. A quoted footer or a sentence discussing an
  // unsubscribe option must not become an inferred opt-out.
  return body.split('\n').some(line=>/^(?:unsubscribe(?: me)?|please unsubscribe(?: me)?|(?:please )?remove me from (?:your |this |the )?(?:(?:mailing|email|contact) )?list|(?:please )?stop (?:emailing|contacting) me|(?:please )?do not (?:email|contact) me(?: again| anymore)?)[.!]*$/i.test(line.trim()));
}
function confirmedBounce(payload:Part|undefined,recipient:string){
  const report=inlineBodies(payload,'message/delivery-status');
  return report.split(/\n\s*\n/).some(block=>{
    const target=block.match(/(?:^|\n)Final-Recipient:\s*rfc822\s*;\s*([^\r\n]+)/i)?.[1];
    return target?.trim().toLowerCase()===recipient&&/(?:^|\n)Action:\s*failed\s*(?:\n|$)/i.test(block);
  });
}
function guardArgs(lease:Lease){return [lease.connection.email,lease.connection.revision,lease.token,Date.now()] as (string|number)[];}
async function renew(lease:Lease){
  const row=await database().prepare(`UPDATE gmail_connections SET sync_lock_until=? WHERE ${CONNECTION_GUARD} RETURNING id`).bind(Date.now()+LEASE_MS,...guardArgs(lease)).first();
  if(!row)throw new RequestError(409,'Gmail changed or another reply check took over. Sync again before sending.');
}
async function acquire(){
  const connection=await getGmailConnection();if(!connection||connection.status!=='connected')throw new RequestError(409,'Connect the business Gmail account before syncing replies.');
  const token=crypto.randomUUID(),now=Date.now();
  const changed=await database().prepare("UPDATE gmail_connections SET sync_lock_token=?,sync_lock_until=? WHERE id='gmail' AND email=? AND revision=? AND status='connected' AND sync_lock_until<=? RETURNING id").bind(token,now+LEASE_MS,connection.email,connection.revision,now).first();
  if(!changed)throw new RequestError(409,'A Gmail reply check is already running or the connection changed. Try again shortly.');
  return {connection,token};
}
async function importReply(lease:Lease,match:Candidate,message:Message){
  const db=database(),id=crypto.randomUUID(),token=crypto.randomUUID(),now=new Date().toISOString();
  const raw=inlineBodies(message.payload,'text/plain'),authored=authoredGmailReply(raw);
  if(match.bounce&&!confirmedBounce(message.payload,match.receipt.recipient))return 0;
  const kind:ReplyKind=match.bounce?'bounce':match.automated?'automated':isExplicitGmailUnsubscribe(authored)?'unsubscribe':'reply';
  const body=authored||'This reply has no readable, unquoted plain text. Open the conversation in Gmail to review it.';
  const recipient=match.receipt.recipient.toLowerCase(),reason=kind==='unsubscribe'?'The recipient opted out in a Gmail reply.':kind==='automated'?'An automatic Gmail response needs owner review.':kind==='bounce'?'Gmail received a delivery failure for this recipient.':'A Gmail reply was received.';
  const guard='EXISTS(SELECT 1 FROM gmail_replies WHERE id=? AND import_token=?)',args=[id,token];
  const write=(query:string,values:(string|number|null)[])=>db.prepare(query.replace(/\$REPLY/g,guard)).bind(...values,...args);
  const statements=[
    db.prepare(`INSERT INTO gmail_replies(id,mailbox_email,message_id,thread_id,outbox_id,sender_email,subject,body,received_at,kind,import_token,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${CONNECTION_GUARD} AND EXISTS(SELECT 1 FROM gmail_outbox WHERE id=? AND status='accepted' AND mailbox_email=? AND thread_id=? AND recipient=?)
      ON CONFLICT(mailbox_email,message_id) DO NOTHING RETURNING id`).bind(id,lease.connection.email,match.messageId,match.receipt.thread_id,match.receipt.id,match.sender,match.subject,body,match.receivedAt,kind,token,now,...guardArgs(lease),match.receipt.id,lease.connection.email,match.receipt.thread_id,match.receipt.recipient),
    write('INSERT INTO outreach_activity(id,prospect_id,campaign_id,kind,body,recipient_email,created_at) SELECT ?,(SELECT id FROM outreach_prospects WHERE id=?),(SELECT id FROM outreach_campaigns WHERE id=?),?,?,?,? WHERE $REPLY',[id,match.receipt.prospect_id,match.receipt.campaign_id,kind==='automated'?'note':kind,reason+'\n\n'+body,recipient,match.receivedAt]),
    write("UPDATE outreach_prospects SET status=?,revision=revision+1,updated_at=? WHERE email=? AND status IN ('ready','needs_review') AND $REPLY",[kind==='reply'?'responded':'paused',now,recipient]),
    write("UPDATE outreach_drafts SET status='stopped',approved_at=NULL,approved_revision=NULL,sender_revision=NULL,revision=revision+1,updated_at=? WHERE recipient=? AND status IN ('draft','approved') AND $REPLY",[now,recipient]),
    write("UPDATE gmail_outbox SET status='cancelled',last_error=?,updated_at=? WHERE recipient=? AND status='prepared' AND $REPLY",[reason,now,recipient]),
  ];
  if(kind==='unsubscribe')statements.push(
    write('INSERT INTO outreach_suppressions(email,reason,created_at) SELECT ?,?,? WHERE $REPLY ON CONFLICT(email) DO NOTHING',[recipient,reason,now]),
    write("UPDATE customer_first_emails SET status='cancelled',retryable=0,last_error=? WHERE recipient=? AND status IN ('pending','sending','failed') AND $REPLY",[reason,recipient]),
    write("UPDATE response_followups SET status='cancelled',reason=?,revision=revision+1,updated_at=? WHERE channel='email' AND recipient=? AND status='open' AND $REPLY",[reason,now,recipient]),
  );
  const result=await db.batch(statements);if(result[0]?.results?.length)return 1;
  const prior=await db.prepare('SELECT id FROM gmail_replies WHERE mailbox_email=? AND message_id=?').bind(lease.connection.email,match.messageId).first();
  if(prior)return 0;
  throw new RequestError(409,'Gmail or its sent-message record changed while importing a reply. Sync again before sending.');
}
async function scanThread(lease:Lease,threadId:string,budget:{remaining:number}){
  if(!ID.test(threadId))throw new RequestError(409,'A saved Gmail conversation reference needs review.');
  await renew(lease);
  const db=database(),receipts=(await db.prepare("SELECT id,mailbox_email,recipient,thread_id,rfc_message_id,gmail_message_id,prospect_id,campaign_id,first_attempt_at,created_at FROM gmail_outbox WHERE mailbox_email=? AND thread_id=? AND status='accepted' ORDER BY first_attempt_at,id LIMIT ?").bind(lease.connection.email,threadId,RECEIPT_LIMIT+1).all<Receipt>()).results;
  if(!receipts.length||receipts.length>RECEIPT_LIMIT)throw new RequestError(409,'This Gmail conversation has too many or no remaining CRM send receipts. Review it before further outreach.');
  const params=new URLSearchParams({format:'metadata'});for(const name of HEADERS)params.append('metadataHeaders',name);
  if(budget.remaining--<=0)throw new RequestError(409,'More Gmail conversations remain to be checked. Sync again before sending; imported replies remain saved.');
  const thread=await gmailRequest(`/threads/${encodeURIComponent(threadId)}?${params}`,undefined,lease.connection);
  if(!thread||thread.id!==threadId||!Array.isArray(thread.messages)||!thread.messages.length||thread.messages.length>MESSAGE_LIMIT)throw new RequestError(409,'A Gmail conversation could not be checked completely. Review it before sending more outreach.');
  const seen=new Set<string>();let imported=0;
  for(const message of thread.messages as Message[]){
    if(!message||typeof message.id!=='string'||!ID.test(message.id)||message.threadId!==threadId||seen.has(message.id))throw new RequestError(409,'Gmail returned an incomplete conversation. Sync again before sending.');
    seen.add(message.id);
    const match=candidate(message,threadId,lease.connection.email,receipts);if(!match)continue;
    const prior=await db.prepare('SELECT id FROM gmail_replies WHERE mailbox_email=? AND message_id=?').bind(lease.connection.email,match.messageId).first();if(prior)continue;
    await renew(lease);
    if(budget.remaining--<=0)throw new RequestError(409,'More Gmail replies remain to be checked. Sync again before sending; imported replies remain saved.');
    const full=await gmailRequest(`/messages/${encodeURIComponent(match.messageId)}?format=full`,undefined,lease.connection) as Message;
    const checked=candidate(full,threadId,lease.connection.email,receipts);
    if(!checked||checked.messageId!==match.messageId||checked.sender!==match.sender||checked.receipt.id!==match.receipt.id||checked.receivedAt!==match.receivedAt)throw new RequestError(409,'A Gmail reply changed during the check. Sync again before sending.');
    imported+=await importReply(lease,checked,full);
  }
  await renew(lease);
  const marked=await db.prepare(`UPDATE gmail_outbox SET last_checked_at=? WHERE id IN (SELECT value FROM json_each(?)) AND status='accepted' AND ${CONNECTION_GUARD} RETURNING id`).bind(new Date().toISOString(),JSON.stringify(receipts.map(r=>r.id)),...guardArgs(lease)).all();
  if(!marked.results.length)throw new RequestError(409,'The Gmail check was interrupted. Sync again before sending.');
  return imported;
}
async function finish(lease:Lease,error=false){
  const db=database();
  // This watermark is the oldest successful check across all tracked threads,
  // never the time of a partial scan pretending the whole mailbox is current.
  await db.prepare(`UPDATE gmail_connections SET last_sync_at=CASE WHEN ?=1 THEN last_sync_at ELSE COALESCE((SELECT MIN(COALESCE(last_checked_at,'')) FROM gmail_outbox WHERE mailbox_email=? AND status='accepted' AND thread_id<>''),?) END,last_error=?,sync_lock_token='',sync_lock_until=0 WHERE id='gmail' AND email=? AND revision=? AND sync_lock_token=?`).bind(error?1:0,lease.connection.email,new Date().toISOString(),error?genericFailure:'',lease.connection.email,lease.connection.revision,lease.token).run();
}
async function sync(recipient?:string){
  const lease=await acquire(),startedAt=new Date().toISOString(),budget={remaining:REQUEST_LIMIT};let imported=0,checked=0;
  try{
    const db=database(),filter=recipient===undefined?'':' AND recipient=?',bindings=recipient===undefined?[lease.connection.email]:[lease.connection.email,recipient];
    const incomplete=await db.prepare(`SELECT id FROM gmail_outbox WHERE mailbox_email=? AND status='accepted' AND (thread_id='' OR gmail_message_id='' OR first_attempt_at<=0)${filter} LIMIT 1`).bind(...bindings).first();
    if(incomplete)throw new RequestError(409,'A Gmail send is missing its conversation receipt. Reconcile that send before checking replies or sending more outreach.');
    const count=await db.prepare(`SELECT count(DISTINCT thread_id) AS n FROM gmail_outbox WHERE mailbox_email=? AND status='accepted' AND thread_id<>''${filter}`).bind(...bindings).first<{n:number}>();
    if(recipient!==undefined&&(count?.n||0)>THREAD_LIMIT)throw new RequestError(409,`This contact has more than ${THREAD_LIMIT} tracked Gmail conversations. Review the reply backlog before sending; no message was sent.`);
    const rows=(await db.prepare(`SELECT thread_id AS threadId FROM gmail_outbox WHERE mailbox_email=? AND status='accepted' AND thread_id<>''${filter} GROUP BY thread_id ORDER BY MIN(COALESCE(last_checked_at,'')),thread_id LIMIT ?`).bind(...bindings,THREAD_LIMIT).all<{threadId:string}>()).results;
    for(const row of rows){imported+=await scanThread(lease,row.threadId,budget);checked++;}
    if(recipient!==undefined){
      const unchecked=await db.prepare("SELECT id FROM gmail_outbox WHERE mailbox_email=? AND recipient=? AND status='accepted' AND COALESCE(last_checked_at,'')<? LIMIT 1").bind(lease.connection.email,recipient,startedAt).first();
      if(unchecked)throw new RequestError(409,'A new Gmail conversation appeared during the reply check. Sync this contact again before sending.');
    }
    await renew(lease);await finish(lease);return {checked,imported,remaining:Math.max(0,(count?.n||0)-checked)};
  }catch(error){
    try{await finish(lease,true);}catch{/* Do not hide the original incomplete check. */}
    if(error instanceof RequestError)throw error;
    // Provider wrappers already sanitize, but never assume an arbitrary thrown
    // message is safe to persist or return from this private CRM endpoint.
    throw new RequestError(503,genericFailure);
  }
}
export async function syncGmailReplies():Promise<{checked:number;imported:number;remaining:number}>{return sync();}
export async function syncGmailRepliesForRecipient(recipient:string):Promise<void>{
  const normalized=recipient.trim().toLowerCase();if(!ADDRESS.test(normalized)||normalized.length>254)throw new RequestError(400,'Choose a valid outreach recipient.');
  await sync(normalized);
}
