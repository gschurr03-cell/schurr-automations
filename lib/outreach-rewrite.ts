import {database,RequestError} from './inquiries';
import {validId} from './crm';
import {STARTERS,type Prospect,type Sender} from './outreach-shared';
import {renderOutreachEmail} from './outreach-render';
import {isLegacyGeneratedDraft} from './outreach-legacy';
import {outreachTargetSql} from './outreach-targets';
import {firstContactSql,unqueuedContactSql} from './outreach-history';

type Row=Prospect&{draft_id:string;draft_revision:number;draft_status:string;draft_step:number;draft_subject:string;draft_body:string;campaign_revision:number;writable:number};
// Use the same predicate for the initial read and the transaction's claim.
function writableSql(){return `d.status='draft' AND d.step=0 AND c.status='active' AND p.status IN ('needs_review','ready') AND p.email=d.recipient
 AND ${outreachTargetSql('p')} AND ${firstContactSql('p.id','p.email')} AND ${unqueuedContactSql('p.id','p.email')}
 AND NOT EXISTS(SELECT 1 FROM outreach_suppressions s WHERE s.email=d.recipient)
 AND NOT EXISTS(SELECT 1 FROM outreach_activity a WHERE a.recipient_email=d.recipient AND a.kind IN ('reply','meeting'))
 AND NOT EXISTS(SELECT 1 FROM gmail_outbox o WHERE o.draft_id=d.id AND (o.first_attempt_at>0 OR EXISTS(SELECT 1 FROM gmail_queue_items qi JOIN gmail_queues q ON q.id=qi.queue_id WHERE qi.outbox_id=o.id AND qi.status IN ('pending','dispatching','held') AND q.status IN ('active','paused'))))`;}

export async function prepareRewrite(items:unknown,sender:Sender,replaceEdits:boolean,knownOnly=false){
 if(!Array.isArray(items)||items.length<1||items.length>20)throw new RequestError(400,'Choose between 1 and 20 drafts to rewrite.');
 const selected=items.map(value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new RequestError(400,'Reload the batch before rewriting.');const id=validId(value.id),revision=Number(value.revision);if(!Number.isInteger(revision)||revision<1)throw new RequestError(400,'Reload the batch before rewriting.');return {id,revision};});
 if(new Set(selected.map(d=>d.id)).size!==selected.length)throw new RequestError(400,'Each draft may appear only once.');
 const rows=(await database().prepare(`SELECT p.*,d.id draft_id,d.revision draft_revision,d.status draft_status,d.step draft_step,d.subject draft_subject,d.body draft_body,c.revision campaign_revision,(${writableSql()}) writable FROM outreach_drafts d JOIN outreach_prospects p ON p.id=d.prospect_id JOIN outreach_campaigns c ON c.id=d.campaign_id WHERE d.id IN (SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(JSON.stringify(selected)).all<Row>()).results;
 const byId=new Map(rows.map(r=>[r.draft_id,r]));
 const report:{company:string;result:string}[]=[],candidates:Row[]=[];
 for(const item of selected){const row=byId.get(item.id);if(!row)throw new RequestError(409,'A draft was removed. Reload the batch.');if(row.draft_revision!==item.revision)throw new RequestError(409,'A draft changed. Reload the batch before rewriting.');
  if(!row.writable){report.push({company:row.company,result:'Preserved: approved, queued, contacted, or no longer eligible.'});continue;}
  const legacy=isLegacyGeneratedDraft(row.draft_subject,row.draft_body,row,sender.sender_name);
  if(knownOnly&&!legacy){report.push({company:row.company,result:'Preserved: current wording or saved edits.'});continue;}
  if(row.draft_revision>1&&!replaceEdits&&!legacy){report.push({company:row.company,result:'Preserved: saved edits. Choose Replace saved edits to include this draft.'});continue;}
  candidates.push(row);report.push({company:row.company,result:'Rewritten for business automation. Review before sending.'});
 }
 const template=STARTERS.find(c=>c.service==='coding')!.steps[0];
 const checks=candidates.map(r=>({id:r.draft_id,revision:r.draft_revision,prospectRevision:r.revision,campaignRevision:r.campaign_revision}));
 // A single bounded expression checks all rows, including approval races which
 // do not increment revision. Failure claims no receipt and updates no messages.
 const condition=`COALESCE((SELECT revision FROM outreach_settings WHERE id='main'),1)=? AND (SELECT count(*) FROM json_each(?) j JOIN outreach_drafts d ON d.id=json_extract(j.value,'$.id') JOIN outreach_prospects p ON p.id=d.prospect_id JOIN outreach_campaigns c ON c.id=d.campaign_id WHERE d.revision=json_extract(j.value,'$.revision') AND p.revision=json_extract(j.value,'$.prospectRevision') AND c.revision=json_extract(j.value,'$.campaignRevision') AND ${writableSql()})=?`;
 return {rows:candidates.map(row=>({id:row.draft_id,...renderOutreachEmail(template,row,sender.sender_name)})),report,condition,args:[sender.revision,JSON.stringify(checks),candidates.length]};
}
