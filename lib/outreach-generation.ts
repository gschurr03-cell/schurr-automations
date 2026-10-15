import {database} from './inquiries';
import {STARTERS,type Campaign,type Prospect,type Sender,type Step} from './outreach-shared';
import {excludedOutreachBusiness,outreachTargetSql} from './outreach-targets';
import {firstContactSql,unqueuedContactSql} from './outreach-history';
import {renderOutreachEmail} from './outreach-render';

type Prepared={company:string;result:string;draftId?:string;insert?:{prospect:Prospect;subject:string;body:string}};
type Checked=Prospect&{responded:number;suppressed:number;fresh:number;previous_sent:string|null;first_draft:string|null;current_draft:string|null};
// One bounded read for the entire selection. Correlated checks share one database
// snapshot and avoid six network/database round trips for each business.
export async function prepareGeneration(ids:string[],campaign:Campaign,sender:Sender,step:number,reuseFirst:boolean):Promise<Prepared[]>{
 const sequence=JSON.parse(campaign.steps) as Step[];
 const template=reuseFirst?(STARTERS.find(c=>c.service===campaign.service)?.steps[step]||sequence[step]):sequence[step];
 const rows=(await database().prepare(`SELECT p.*,
 EXISTS(SELECT 1 FROM outreach_activity a WHERE a.recipient_email=p.email AND a.kind IN ('reply','meeting')) AS responded,
 EXISTS(SELECT 1 FROM outreach_suppressions s WHERE s.email=p.email) AS suppressed,
 (${firstContactSql('p.id','p.email')} AND ${unqueuedContactSql('p.id','p.email')}) AS fresh,
 (SELECT sent_at FROM outreach_drafts WHERE campaign_id=? AND prospect_id=p.id AND step=? AND status='sent') AS previous_sent,
 (SELECT json_object('id',d.id,'status',d.status) FROM outreach_drafts d JOIN outreach_campaigns c ON c.id=d.campaign_id WHERE (d.prospect_id=p.id OR d.recipient=p.email) AND d.step=0 ORDER BY d.created_at DESC,d.id DESC LIMIT 1) AS first_draft,
 (SELECT id FROM outreach_drafts WHERE campaign_id=? AND (prospect_id=p.id OR recipient=p.email) AND step=? LIMIT 1) AS current_draft
 FROM outreach_prospects p WHERE p.id IN (${ids.map(()=>'?').join(',')})`).bind(campaign.id,step-1,campaign.id,step,...ids).all<Checked>()).results;
 const byId=new Map(rows.map(row=>[row.id,row])),seen=new Set<string>();
 return ids.map(id=>{
  const p=byId.get(id);if(!p)return {company:'Removed prospect',result:'Skipped: no longer available'};
  let held=excludedOutreachBusiness(p)?'Fast-food businesses are excluded from outreach.':!['needs_review','ready'].includes(p.status)?'Prospect is stopped or already in the sales pipeline.':!p.email?'Missing recipient email.':!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(p.email)?'Enter a valid recipient email.':p.responded?'A response has already been recorded for this email.':p.suppressed?'Email is suppressed.':step===0&&!p.fresh?'This business or email is already contacted or queued. Find it in Sent or your sending queue.':null;
  if(!held&&step>0){if(!p.previous_sent)held='Previous sequence step has not been recorded as sent.';else if(Date.parse(p.previous_sent)+sequence[step].delay*86400000>Date.now())held=`Wait ${sequence[step].delay} days after the previous step.`;}
  if(held)return {company:p.company,result:held};
  if(seen.has(p.email))return {company:p.company,result:'Existing draft or duplicate recipient preserved'};
  if(step===0&&reuseFirst&&p.first_draft){const previous=JSON.parse(p.first_draft) as {id:string;status:string};seen.add(p.email);return {company:p.company,...(['draft','approved'].includes(previous.status)?{draftId:previous.id,result:'Existing draft kept. Choose Rewrite batch in the review to update the wording.'}:{result:'A first email already exists. Continue its conversation or campaign.'})};}
  if(p.current_draft)return {company:p.company,result:'Existing draft or duplicate recipient preserved'};
  seen.add(p.email);return {company:p.company,result:'Draft prepared for review',draftId:crypto.randomUUID(),insert:{prospect:p,...renderOutreachEmail(template,p,sender.sender_name)}};
 });
}

// Recheck changing eligibility inside the same transaction as each insert.
export function generationInsertCondition(step:number,reuseFirst:boolean){return `EXISTS(SELECT 1 FROM outreach_prospects p WHERE p.id=? AND p.revision=? AND p.status IN ('needs_review','ready') AND ${outreachTargetSql('p')}
 AND NOT EXISTS(SELECT 1 FROM outreach_suppressions s WHERE s.email=p.email)
 AND NOT EXISTS(SELECT 1 FROM outreach_activity a WHERE a.recipient_email=p.email AND a.kind IN ('reply','meeting'))
 AND NOT EXISTS(SELECT 1 FROM outreach_drafts d WHERE d.campaign_id=? AND d.step=? AND (d.prospect_id=p.id OR d.recipient=p.email))
 ${step===0?`AND ${firstContactSql('p.id','p.email')} AND ${unqueuedContactSql('p.id','p.email')}`:''}
 ${step===0&&reuseFirst?"AND NOT EXISTS(SELECT 1 FROM outreach_drafts d WHERE d.step=0 AND (d.prospect_id=p.id OR d.recipient=p.email))":''}
 ${step>0?"AND EXISTS(SELECT 1 FROM outreach_drafts previous WHERE previous.campaign_id=? AND previous.prospect_id=p.id AND previous.step=? AND previous.status='sent' AND julianday(previous.sent_at)+?<=julianday('now'))":''})`;}

// Persist only IDs that actually exist after the conditional inserts. This is
// part of the write transaction, so a retry returns the exact committed receipt.
export function generationReceipt(rows:Prepared[],message:string){
 const entries=rows.map(({company,result,draftId})=>({company,result,draftId}));
 const exists="EXISTS(SELECT 1 FROM outreach_drafts d WHERE d.id=json_extract(j.value,'$.draftId') AND d.status IN ('draft','approved'))";
 return {sql:`SELECT CASE WHEN ?=1 AND json_array_length(payload,'$.ids')=1 THEN json_set(payload,'$.id',json_extract(payload,'$.ids[0]')) ELSE payload END FROM (SELECT json_object('message',?,'ids',json((SELECT json_group_array(json_extract(j.value,'$.draftId')) FROM json_each(?) j WHERE ${exists})),'report',json((SELECT json_group_array(json_object('company',json_extract(j.value,'$.company'),'result',CASE WHEN json_extract(j.value,'$.draftId') IS NOT NULL AND NOT ${exists} THEN 'Skipped: contact or draft changed. Select the business again to retry.' ELSE json_extract(j.value,'$.result') END)) FROM json_each(?) j))) AS payload)`,args:[rows.length,message,JSON.stringify(entries),JSON.stringify(entries)]};
}
