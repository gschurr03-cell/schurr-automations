import { getOwnerAccess } from '@/lib/owner';
import { checkOrigin,privateJson,readJson,RequestError } from '@/lib/inquiries';
import { snapshot,mutateOutreach,getProspect,getSender,eligibility,messageBody,approvedExport,approvalCurrent,type Draft,type Campaign } from '@/lib/outreach';
import {outreachError} from '@/lib/outreach-errors';
import { research } from '@/lib/outreach-research';
import { database } from '@/lib/inquiries';
import { validId } from '@/lib/crm';
import {importCuratedProspects} from '@/lib/outreach-curated';
import colorado from '@/data/colorado-outreach.json';
export const dynamic='force-dynamic';


async function authorize(){const a=await getOwnerAccess();if(!a)throw new RequestError(401,'Sign in to the CRM and try again.');if(!a.allowed||!a.configured)throw new RequestError(403,'This account cannot access the workspace.');}
export async function GET(request:Request){try{await authorize();const p=new URL(request.url).searchParams;if(p.get('export')==='approved')return new Response(await approvedExport(),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="schurr-reviewed-messages.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});return privateJson({ok:true,data:await snapshot({q:p.get('q')||'',status:p.get('status')||'',email:p.get('email')||'all',page:p.get('page')||'1',draftStatus:p.get('draftStatus')||'draft',fit:p.get('fit')||'recommended'})});}catch(e){return outreachError(e);}}
export async function POST(request:Request){try{checkOrigin(request);await authorize();const p=await readJson(request,450000);
 if(p.action==='curatedImport')return privateJson({ok:true,...await importCuratedProspects()});
 if(p.action==='coloradoPreview')return privateJson({ok:true,rows:colorado});
 if(p.action==='coloradoImport'){if(!Array.isArray(p.ids)||p.ids.length<1||p.ids.length>100||p.ids.some(i=>!Number.isInteger(i)||Number(i)<0||Number(i)>=colorado.length))throw new RequestError(400,'Select businesses from the saved list.');return privateJson({ok:true,...await mutateOutreach({action:'import',mutationId:p.mutationId,source:'Colorado receptionist workbook, reviewed September 28, 2026',rows:[...new Set(p.ids)].map(i=>colorado[Number(i)])})});}
 if(p.action==='search'||p.action==='research')return privateJson({ok:true,...await research(p)});
 if(p.action==='getDraft'){const row=await database().prepare('SELECT d.*,p.company,c.name AS campaign FROM outreach_drafts d JOIN outreach_prospects p ON p.id=d.prospect_id JOIN outreach_campaigns c ON c.id=d.campaign_id WHERE d.id=?').bind(validId(p.id)).first<Draft>();if(!row)throw new RequestError(404,'This draft no longer exists.');return privateJson({ok:true,draft:row});}
 if(p.action==='getProspect'){const row=await getProspect(validId(p.id));if(!row)throw new RequestError(404,'This prospect no longer exists.');return privateJson({ok:true,prospect:row});}
 if(p.action==='prepare'){const d=await database().prepare('SELECT * FROM outreach_drafts WHERE id=?').bind(validId(p.id)).first<Draft>();if(!d||d.status!=='approved'||d.revision!==Number(p.revision))throw new RequestError(409,'Review the current message before preparing it.');const prospect=await getProspect(d.prospect_id),campaign=await database().prepare('SELECT * FROM outreach_campaigns WHERE id=?').bind(d.campaign_id).first<Campaign>(),sender=await getSender();const blocked=prospect&&campaign?await eligibility(prospect,campaign,d.step):'This record no longer exists.';if(blocked||!sender.sender_email||!sender.postal_address||d.approved_revision!==d.revision||d.sender_revision!==sender.revision||d.recipient!==prospect?.email||!prospect||!campaign||!await approvalCurrent(d,prospect,campaign,sender))throw new RequestError(409,blocked||'Sender or contact details changed. Review this message again.');return privateJson({ok:true,recipient:d.recipient,subject:d.subject,body:messageBody(d,sender),sender:sender.sender_email});}
 return privateJson({ok:true,...await mutateOutreach(p)});
 }catch(e){return outreachError(e);}}
