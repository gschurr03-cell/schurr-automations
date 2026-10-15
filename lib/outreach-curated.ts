import rows from '@/data/qualified-prospects-20261003.json';
import {database} from './inquiries';
import {mutateOutreach} from './outreach';
// This exact list was requested and researched for the owner. Import only through
// the existing same-origin, owner-authenticated POST route; never through GET.
const mutationId="19f0e0d8-8a81-4bdf-a5b4-3e0f5640c106";
export async function importCuratedProspects(){
 const db=database(),saved=await db.prepare('SELECT redirect FROM crm_mutations WHERE id=?').bind(mutationId).first<{redirect:string}>();if(saved)return {...JSON.parse(saved.redirect),alreadyImported:true};
 const domains=rows.map(r=>new URL(r.website).hostname.toLowerCase().replace(/^www\./,'')),emails=rows.map(r=>r.email.toLowerCase());
 const existing=(await db.prepare(`SELECT email,domain FROM outreach_prospects WHERE lower(email) IN (${emails.map(()=>'?').join(',')}) OR lower(domain) IN (${domains.map(()=>'?').join(',')})`).bind(...emails,...domains).all<{email:string;domain:string}>()).results;
 const knownEmails=new Set(existing.map(r=>r.email.toLowerCase())),knownDomains=new Set(existing.map(r=>r.domain.toLowerCase().replace(/^www\./,'')));
 const fresh=rows.filter((r,i)=>!knownEmails.has(r.email.toLowerCase())&&!knownDomains.has(domains[i]));
 if(!fresh.length)return {message:'The researched businesses are already in your workspace.',alreadyImported:true};
 const result=await mutateOutreach({action:'import',mutationId,source:'Schurr service-fit research · October 3, 2026',rows:fresh});
 return {...result,message:`${fresh.length} researched businesses added. Existing business domains and emails were preserved.`,alreadyImported:false};
}
