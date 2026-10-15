import {excludedOutreachBusiness} from './outreach-targets';
import { env } from 'cloudflare:workers';
import { database, RequestError, readBoundedText } from './inquiries';
import { contactRecordKey, contactWebsite } from './outreach-contact';
import manifest from '@/data/colorado-contact-manifest.json';
import { deduplicateApprovedContacts } from './contact-deduplicate';

type Row = {id:string; import_identity:string; existing_id:string; existing_company:string; existing_phone:string; existing_email:string; company:string; website:string; email:string; phone:string; industry:string; location:string; address:string; postal_code:string; source_url:string; source_notes:string};
const prefix = `contact-import:${manifest.dataset}:`;
const source = 'Colorado service businesses, collected September 30, 2026';
const encoder = new TextEncoder();
async function digest(value:string) { return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))); }
async function hex(value:string) { return Array.from(await digest(value),b=>b.toString(16).padStart(2,'0')).join(''); }

export async function authorizeContactImport(request:Request) {
  const config = env as unknown as {OUTREACH_CONTACT_IMPORT_SECRET?:string; OUTREACH_CONTACT_IMPORT_EXPIRES?:string};
  const expires = Date.parse(config.OUTREACH_CONTACT_IMPORT_EXPIRES || '');
  if (!config.OUTREACH_CONTACT_IMPORT_SECRET || config.OUTREACH_CONTACT_IMPORT_SECRET.length<64 || !Number.isFinite(expires) || expires<=Date.now()) throw new RequestError(404,'Import connection is closed.');
  const supplied = request.headers.get('authorization') || '';
  if(supplied.length>200) throw new RequestError(401,'Import authorization required.');
  const [a,b] = await Promise.all([digest(supplied),digest(`Bearer ${config.OUTREACH_CONTACT_IMPORT_SECRET}`)]);
  let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  if(difference)throw new RequestError(401,'Import authorization required.');
}

export async function contactImport(request:Request) {
  await authorizeContactImport(request);
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new RequestError(415,'Use JSON.');
  const raw = await readBoundedText(request,160000);
  let body: {action?:string; dataset?:string; batch?:number; rows?:Row[]};
  try {body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object')throw Error();}catch{throw new RequestError(400,'Invalid import request.');}
  if(body.action==='deduplicate')return deduplicateApprovedContacts(raw);
  const db=database();
  if(body.action==='status'&&Object.keys(body).length===1) {
    const counts=await db.prepare("SELECT count(*) AS total,sum(CASE WHEN phone<>'' THEN 1 ELSE 0 END) AS phones,sum(CASE WHEN email<>'' THEN 1 ELSE 0 END) AS emails,sum(CASE WHEN import_identity>=? AND import_identity<? THEN 1 ELSE 0 END) AS imported FROM outreach_prospects").bind(manifest.dataset+':',manifest.dataset+':\uffff').first();
    const receipts=await db.prepare("SELECT count(*) AS batches,coalesce(sum(json_extract(redirect,'$.selected')),0) AS selected,coalesce(sum(json_extract(redirect,'$.inserted')),0) AS inserted,coalesce(sum(json_extract(redirect,'$.existing')),0) AS existing,coalesce(sum(json_extract(redirect,'$.excluded')),0) AS excluded FROM crm_mutations WHERE id>=? AND id<?").bind(prefix,prefix+'\uffff').first();
    return {counts,receipts,expected:manifest.total};
  }
  const index=body.batch;
  if(!Number.isInteger(index)||index===undefined||index<0||index>=manifest.batches.length||body.dataset!==manifest.dataset||await hex(raw)!==manifest.batches[index].sha256)throw new RequestError(400,'This batch is not in the approved import.');
  const rows=body.rows!;
  if(!Array.isArray(rows)||rows.length!==manifest.batches[index].count)throw new RequestError(400,'Invalid batch.');
  const included=rows.filter(row=>!excludedOutreachBusiness(row)),excluded=rows.length-included.length;
  const key=prefix+index,hash=manifest.batches[index].sha256,attempt=crypto.randomUUID(),now=new Date().toISOString();
  const read=()=>db.prepare('SELECT request_hash,redirect FROM crm_mutations WHERE id=?').bind(key).first<{request_hash:string;redirect:string}>();
  const previous=await read();if(previous){if(previous.request_hash!==hash)throw new RequestError(409,'Import receipt differs.');return JSON.parse(previous.redirect);}
  const guard='EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)';
  const statements=[db.prepare('INSERT INTO crm_mutations(id,request_hash,attempt_id,redirect,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(key,hash,attempt,'{}',now)];
  for(const row of included){
    const website=contactWebsite(row.website),domain=website?new URL(website).hostname.toLowerCase().replace(/^www\./,''):'';
    const recordKey=contactRecordKey({...row,domain});
    statements.push(db.prepare(`INSERT INTO outreach_prospects(id,import_identity,record_key,company,website,domain,email,phone,industry,location,address,postal_code,source_url,source_notes,import_source,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM outreach_suppressions WHERE email=? AND email<>'') THEN 'paused' ELSE 'needs_review' END,?,? WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM outreach_prospects WHERE id=? AND company=? AND phone=? AND email=?) ON CONFLICT DO NOTHING`).bind(row.id,row.import_identity,recordKey,row.company,website,domain,row.email,row.phone,row.industry,row.location,row.address,row.postal_code,row.source_url,row.source_notes,source,row.email,now,now,key,hash,attempt,row.existing_id,row.existing_company,row.existing_phone,row.existing_email));
  }
  const slots=included.map(()=>'?').join(',')||'NULL';
  // Receipts and row writes commit together. Counts are measured in the same transaction.
  statements.push(db.prepare(`UPDATE crm_mutations SET redirect=json_object('batch',?,'selected',?,'excluded',?,'inserted',(SELECT count(*) FROM outreach_prospects WHERE id IN (${slots})),'existing',?-(SELECT count(*) FROM outreach_prospects WHERE id IN (${slots}))) WHERE id=? AND request_hash=? AND attempt_id=?`).bind(index,rows.length,excluded,...included.map(r=>r.id),included.length,...included.map(r=>r.id),key,hash,attempt));
  await db.batch(statements);
  const saved=await read();if(!saved||saved.request_hash!==hash)throw new RequestError(409,'Retry this import batch.');
  return JSON.parse(saved.redirect);
}
