import {database,RequestError} from './inquiries';
export type SentEmail={id:string;draft_id:string;prospect_id:string;company:string;recipient:string;subject:string;body:string;status:string;sent_at:string;kind:string;thread_id:string;mailbox_email:string;last_error:string};
export async function sentEmails(page=1,search=''){
 if(!Number.isSafeInteger(page)||page<1||page>100000||search.length>120)throw new RequestError(400,'Use a valid page or shorter search.');
 const q=search.trim(),rows=await database().prepare(`SELECT * FROM (
 SELECT o.id,o.draft_id,o.prospect_id,coalesce(p.company,o.recipient) AS company,o.recipient,o.subject,o.body,o.status,strftime('%Y-%m-%dT%H:%M:%fZ',o.first_attempt_at/1000.0,'unixepoch') AS sent_at,'gmail' AS kind,o.thread_id,o.mailbox_email,o.last_error FROM gmail_outbox o LEFT JOIN outreach_prospects p ON p.id=o.prospect_id WHERE o.first_attempt_at>0
 UNION ALL
 SELECT d.id,d.id,d.prospect_id,coalesce(p.company,d.recipient),d.recipient,d.subject,d.body,'manual',d.sent_at,'manual','','','' FROM outreach_drafts d LEFT JOIN outreach_prospects p ON p.id=d.prospect_id WHERE d.status='sent' AND NOT EXISTS(SELECT 1 FROM gmail_outbox o WHERE o.draft_id=d.id AND o.first_attempt_at>0)
 ) WHERE ?='' OR instr(lower(company),lower(?))>0 OR instr(lower(recipient),lower(?))>0 OR instr(lower(subject),lower(?))>0 ORDER BY sent_at DESC,id DESC LIMIT 51 OFFSET ?`).bind(q,q,q,q,(page-1)*50).all<SentEmail>();
 return {items:rows.results.slice(0,50),hasMore:rows.results.length>50,page,q};
}
