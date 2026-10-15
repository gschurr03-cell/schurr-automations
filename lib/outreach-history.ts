import {outreachTargetSql} from './outreach-targets';

// These expressions are composed only from trusted, internal column names.
export function firstContactSql(prospect:string,email:string,exceptOutbox="''") {
 return `NOT EXISTS(SELECT 1 FROM outreach_drafts past WHERE past.status='sent' AND (past.prospect_id=${prospect} OR (${email}<>'' AND lower(past.recipient)=lower(${email}))))
 AND NOT EXISTS(SELECT 1 FROM gmail_outbox past WHERE past.id<>${exceptOutbox} AND past.first_attempt_at>0 AND (past.prospect_id=${prospect} OR (${email}<>'' AND lower(past.recipient)=lower(${email}))))
 AND NOT EXISTS(SELECT 1 FROM outreach_activity past WHERE past.kind IN ('sent','reply','meeting','bounce','unsubscribe') AND (past.prospect_id=${prospect} OR (${email}<>'' AND lower(past.recipient_email)=lower(${email}))))`;
}
export function unqueuedContactSql(prospect:string,email:string){return `NOT EXISTS(SELECT 1 FROM gmail_queue_items qi JOIN gmail_queues q ON q.id=qi.queue_id JOIN gmail_outbox o ON o.id=qi.outbox_id WHERE qi.status IN ('pending','dispatching','held') AND q.status IN ('active','paused') AND (o.prospect_id=${prospect} OR (${email}<>'' AND lower(o.recipient)=lower(${email}))))`;}
export function freshContactSql(alias='outreach_prospects'){return `${outreachTargetSql(alias)} AND ${alias}.status IN ('needs_review','ready') AND ${firstContactSql(alias+'.id',alias+'.email')} AND ${unqueuedContactSql(alias+'.id',alias+'.email')}`;}

// List reads evaluate the same contact exclusions once, rather than scanning
// sending history separately for every business in a large imported pool.
// Keep single-record send authorization on the live predicates above.
export function freshContactListSql(alias='outreach_prospects'){
 const cte=`WITH unavailable_contacts AS MATERIALIZED (
  SELECT prospect_id,lower(recipient) AS email FROM outreach_drafts WHERE status='sent'
  UNION ALL SELECT prospect_id,lower(recipient) FROM gmail_outbox WHERE first_attempt_at>0
  UNION ALL SELECT prospect_id,lower(recipient_email) FROM outreach_activity WHERE kind IN ('sent','reply','meeting','bounce','unsubscribe')
  UNION ALL SELECT o.prospect_id,lower(o.recipient) FROM gmail_queue_items i JOIN gmail_queues q ON q.id=i.queue_id JOIN gmail_outbox o ON o.id=i.outbox_id WHERE i.status IN ('pending','dispatching','held') AND q.status IN ('active','paused')
 )`;
 const condition=`${outreachTargetSql(alias)} AND ${alias}.status IN ('needs_review','ready')
 AND ${alias}.id NOT IN (SELECT prospect_id FROM unavailable_contacts WHERE prospect_id IS NOT NULL)
 AND (${alias}.email='' OR lower(${alias}.email) NOT IN (SELECT email FROM unavailable_contacts WHERE email IS NOT NULL AND email<>''))`;
 return {cte,condition};
}
