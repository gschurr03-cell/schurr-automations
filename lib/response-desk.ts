import { env } from 'cloudflare:workers';
import { database, RequestError } from './inquiries';
import { validId,cursorEncode,cursorDecode } from './crm';
import {retellSetup} from './retell';
import {reconcileCustomerEmailReports} from './customer-email';
export const RESPONSE_STATUSES = {needs_review:'Needs a response', contacted:'Handled by Gavin', paused:'Contact paused'} as const;
export type ResponseJob = {id:string; leadId:string; name:string; business:string; email:string; phone:string; preferredContact:string; service:string; channel:string; status:keyof typeof RESPONSE_STATUSES; draft:string; consentScope:string; createdAt:string; revision:number; sourceKey:string;emailStatus:string|null;emailRecipient:string|null;emailPayload:string|null;emailError:string|null;emailRetryable:number|null;emailProviderId:string|null};
export async function listResponseJobs(status='needs_review',cursor?:string) {
  if(!Object.hasOwn(RESPONSE_STATUSES,status)) throw new RequestError(400,'Choose a valid status.');
  await reconcileCustomerEmailReports();
  const db=database(),boundary=cursorDecode(cursor);
  const [rows,counts]=await Promise.all([
    db.prepare(`SELECT j.id, COALESCE(j.inquiry_id,j.lead_id) AS leadId, COALESCE(w.name,c.name,i.name) AS name, COALESCE(w.business,c.business,i.business) AS business,
    COALESCE(w.email,c.email,i.email,'') AS email, COALESCE(w.phone,c.phone,i.phone,'') AS phone,
    COALESCE(w.preferred_contact,c.preferred_contact,i.preferred_contact) AS preferredContact,
    COALESCE(w.service,c.service,i.service) AS service, j.channel, j.status, j.draft, j.consent_scope AS consentScope, j.created_at AS createdAt, j.revision, j.source_key AS sourceKey, e.status AS emailStatus,e.recipient AS emailRecipient,e.payload AS emailPayload,e.last_error AS emailError,e.retryable AS emailRetryable,e.email_id AS emailProviderId
    FROM response_jobs j LEFT JOIN inquiries i ON i.id=j.inquiry_id LEFT JOIN crm_leads c ON c.id=j.lead_id
    LEFT JOIN crm_leads w ON w.inquiry_id=j.inquiry_id
    LEFT JOIN customer_first_emails e ON e.id=j.inquiry_id
    WHERE j.status=? ${boundary?'AND (j.created_at,j.id)>(?,?)':''} ORDER BY j.created_at,j.id LIMIT 101`).bind(status,...(boundary||[])).all<ResponseJob>(),
    db.prepare('SELECT status,count(*) AS count FROM response_jobs GROUP BY status').all<{status:string;count:number}>(),
  ]);
  const items=rows.results.slice(0,100),last=items.at(-1);return {items,hasMore:rows.results.length>100,nextCursor:rows.results.length>100&&last?cursorEncode(last.createdAt,last.id):null,counts:counts.results};
}
export async function updateResponseJob(input:Record<string,unknown>) {
  const id=validId(input.id);
  const revision=Number(input.revision), status=String(input.status);
  if(!Number.isSafeInteger(revision)||revision<1||!Object.hasOwn(RESPONSE_STATUSES,status)) throw new RequestError(400,'Refresh this response before updating it.');
  const db=database();
  const result=await db.batch([
    db.prepare("UPDATE response_jobs SET status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (status!='paused' OR ?='paused') RETURNING id").bind(status,new Date().toISOString(),id,revision,status),
    db.prepare("UPDATE customer_first_emails SET status='cancelled',retryable=0,last_error='Gavin handled or paused this request.' WHERE id=? AND status IN ('pending','sending','failed') AND EXISTS(SELECT 1 FROM response_jobs WHERE inquiry_id=customer_first_emails.id AND status!='needs_review')").bind(id),
    db.prepare("UPDATE response_followups SET status='cancelled',reason='Request handled or paused.',revision=revision+1,updated_at=? WHERE response_id=? AND status='open' AND EXISTS(SELECT 1 FROM response_jobs WHERE id=? AND status!='needs_review')").bind(new Date().toISOString(),id,id),
  ]);
  if(!result[0]?.results?.length) throw new RequestError(409,'This response changed. Refresh the page before trying again.');
}
export async function responseConnections() {
  const runtime=env as unknown as Record<string,string|undefined>;
  return {voiceIntakeConfigured:Boolean(runtime.VOICE_INGEST_SECRET&&runtime.VOICE_INGEST_SECRET.length>=32),retell:await retellSetup()};
}
