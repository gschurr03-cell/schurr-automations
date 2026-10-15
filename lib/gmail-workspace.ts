import {outreachTargetSql} from './outreach-targets';
import {env} from 'cloudflare:workers';
import {database,RequestError} from './inquiries';
import {validId} from './crm';
import {gmailSetup} from './gmail-connection';
import {getSender,messageBody,type Draft} from './outreach';
export async function gmailWorkspace(page=1,draftId?:string){
 if(draftId)validId(draftId);
 if(!Number.isInteger(page)||page<1||page>200)throw new RequestError(400,'Choose a valid mail history page.');
 const db=database(),sender=await getSender(),[setup,approved,outbox,replies]=await Promise.all([
  gmailSetup(),
  db.prepare(`SELECT d.*,p.company FROM outreach_drafts d JOIN outreach_prospects p ON p.id=d.prospect_id WHERE ${outreachTargetSql('p')} AND d.status='approved' AND d.approved_revision=d.revision AND d.sender_revision=? AND NOT EXISTS(SELECT 1 FROM gmail_outbox go WHERE go.draft_id=d.id AND (go.first_attempt_at>0 OR EXISTS(SELECT 1 FROM gmail_queue_items qi JOIN gmail_queues q ON q.id=qi.queue_id WHERE qi.outbox_id=go.id AND qi.status IN ('pending','dispatching','held') AND q.status IN ('active','paused')))) ${draftId?'AND d.id=?':''} ORDER BY d.updated_at DESC,d.id DESC LIMIT 50`).bind(sender.revision,...(draftId?[draftId]:[])).all<Draft&{company:string}>(),
  db.prepare(`SELECT id,draft_id,recipient,subject,status,first_attempt_at,draft_revision,last_error,created_at FROM gmail_outbox ${draftId?'WHERE draft_id=?':''} ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?`).bind(...(draftId?[draftId]:[]),(page-1)*50).all<{id:string;draft_id:string;recipient:string;subject:string;status:string;first_attempt_at:number;draft_revision:number;last_error:string;created_at:string}>(),
  db.prepare('SELECT id,thread_id,sender_email,subject,body,kind,received_at FROM gmail_replies ORDER BY received_at DESC,id DESC LIMIT 51 OFFSET ?').bind((page-1)*50).all<{id:string;thread_id:string;sender_email:string;subject:string;body:string;kind:string;received_at:string}>(),
 ]);
 return {setup,sender,approved:approved.results.map(d=>({id:d.id,revision:d.revision,recipient:d.recipient,subject:d.subject,body:messageBody(d,sender),company:d.company})),outbox:outbox.results.slice(0,50),replies:replies.results.slice(0,50),page,repliesHasMore:replies.results.length>50,hasMore:outbox.results.length>50||replies.results.length>50,runnerConfigured:Boolean((env as unknown as {GMAIL_SYNC_RUNNER_SECRET?:string}).GMAIL_SYNC_RUNNER_SECRET?.length&&((env as unknown as {GMAIL_SYNC_RUNNER_SECRET?:string}).GMAIL_SYNC_RUNNER_SECRET!.length>=32))};
}
export type GmailWorkspace=Awaited<ReturnType<typeof gmailWorkspace>>;
export type Snapshot=GmailWorkspace;
