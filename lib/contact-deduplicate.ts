import { database, RequestError } from './inquiries';
import { contactRecordKey } from './outreach-contact';
import manifest from '@/data/colorado-dedup-manifest.json';
type RecordRow={id:string;company:string;phone:string;email:string;website:string;domain:string;address:string;postal_code:string;location:string;source_notes:string;import_identity:string|null;revision:number;status:string;lead_id:string|null};
type Pair={survivor_id:string;duplicate_id:string;survivor_source_id:string;duplicate_source_id:string;reason:string};
export async function deduplicateApprovedContacts(raw:string) {
  const body=JSON.parse(raw) as {batch:number;pairs:Pair[]};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  if(!Number.isInteger(body.batch)||!manifest.batches[body.batch]||manifest.batches[body.batch].sha256!==hash)throw new RequestError(400,'This duplicate cleanup is not approved.');
  const db=database(),results=[];
  for(const pair of body.pairs){
    const key=`contact-merge:${pair.duplicate_id}`;
    const receipt=()=>db.prepare('SELECT request_hash,redirect FROM crm_mutations WHERE id=?').bind(key).first<{request_hash:string;redirect:string}>();
    const previous=await receipt();if(previous){if(previous.request_hash!==hash)throw new RequestError(409,'Duplicate cleanup receipt changed.');results.push(JSON.parse(previous.redirect));continue;}
    const [keep,drop]=await Promise.all([db.prepare('SELECT * FROM outreach_prospects WHERE id=?').bind(pair.survivor_id).first<RecordRow>(),db.prepare('SELECT * FROM outreach_prospects WHERE id=?').bind(pair.duplicate_id).first<RecordRow>()]);
    // These manifest-reviewed duplicates have no distinct email route. Never delete edited/history-bearing records.
    if(!keep||!drop||drop.import_identity!==`colorado-service-businesses-20260930:${pair.duplicate_source_id}`||drop.revision!==1||drop.status!=='needs_review'||drop.email||drop.lead_id)throw new RequestError(409,'A duplicate record changed. Review it before merging.');
    const now=new Date().toISOString(),attempt=crypto.randomUUID();
    const website=keep.website||drop.website,domain=keep.domain||drop.domain,address=keep.address||drop.address,postalCode=keep.postal_code||drop.postal_code;
    const recordKey=contactRecordKey({...keep,website,domain,address} as RecordRow);
    const notes=keep.source_notes+`\n\nMerged duplicate ${pair.duplicate_source_id}. ${pair.reason}\n`+drop.source_notes;
    const result={duplicate:drop.id,survivor:keep.id,merged:true};
    const guard='EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)';
    const args=[key,hash,attempt];
    const statements=[db.prepare(`INSERT INTO crm_mutations(id,request_hash,attempt_id,redirect,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM outreach_prospects WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM outreach_prospects WHERE id=? AND revision=1 AND status='needs_review' AND email='' AND lead_id IS NULL) AND NOT EXISTS(SELECT 1 FROM outreach_drafts WHERE prospect_id=?) AND NOT EXISTS(SELECT 1 FROM outreach_activity WHERE prospect_id=?) ON CONFLICT(id) DO NOTHING`).bind(key,hash,attempt,JSON.stringify(result),now,keep.id,keep.revision,drop.id,drop.id,drop.id),
      db.prepare(`UPDATE outreach_prospects SET source_notes=?,website=?,domain=?,address=?,postal_code=?,record_key=?,revision=revision+1,updated_at=? WHERE id=? AND ${guard}`).bind(notes,website,domain,address,postalCode,recordKey,now,keep.id,...args),
      db.prepare(`UPDATE outreach_drafts SET status='draft',approved_at=NULL,approved_revision=NULL,sender_revision=NULL,revision=revision+1,updated_at=? WHERE prospect_id=? AND status IN ('draft','approved') AND ${guard}`).bind(now,keep.id,...args),
      db.prepare(`DELETE FROM outreach_prospects WHERE id=? AND ${guard}`).bind(drop.id,...args)];
    await db.batch(statements);
    const saved=await receipt();if(!saved||saved.request_hash!==hash)throw new RequestError(409,'A record changed during cleanup. Review it before merging.');
    results.push(JSON.parse(saved.redirect));
  }
  return {batch:body.batch,merged:results.length,results};
}
