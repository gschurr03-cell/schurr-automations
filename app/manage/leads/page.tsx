import { listLeads, STAGES, SOURCES, type LeadFilters } from '@/lib/crm';
import { CRMShell, crmContext, AccessDenied, Unavailable, AddLead, LeadTable, Empty, Saved, url } from '../crm-ui';
import { RequestError } from '@/lib/inquiries';
export const dynamic='force-dynamic';
export const metadata={title:'Leads & contacts | Schurr CRM'};
export default async function LeadsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams; const get=(key:string)=>typeof params[key]==='string'?params[key] as string:undefined;
  return <LeadsContent filters={{q:get('q'),stage:get('stage'),source:get('source'),cursor:get('cursor')}} saved={get('saved')}/>;
}
async function LeadsContent({filters,saved}:{filters:LeadFilters;saved?:string}) {
  const {access,settings}=await crmContext(url('/manage/leads',filters)); let content;
  if(!access.allowed) content=<AccessDenied access={access}/>;
  else if(!settings) content=<Unavailable/>;
  else {try {
    const data=await listLeads(filters);
    const {cursor,...withoutCursor}=filters;
    content=<><Saved value={saved}/><form className="crm-filters" method="get"><label className="crm-search">Search contacts<input type="search" name="q" placeholder="Name, company, email, or phone" maxLength={120} defaultValue={filters.q}/></label><label>Stage<select name="stage" defaultValue={filters.stage||'all'}><option value="all">All stages</option><option value="open">Open opportunities</option>{Object.entries(STAGES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Source<select name="source" defaultValue={filters.source||'all'}><option value="all">All sources</option>{Object.entries(SOURCES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button className="crm-button crm-button-secondary" type="submit">Apply</button><a className="crm-subtle-link" href="/manage/leads">Reset</a></form>
    <section className="crm-panel"><div className="crm-section-heading"><h2>{filters.stage==='won'?'Won opportunities':'Contacts & opportunities'}</h2><a href={url('/api/manage/export',withoutCursor)}>Export matching leads</a></div>{data.items.length?<LeadTable leads={data.items} timezone={settings.timezone}/>:<Empty title={filters.q||filters.stage&&filters.stage!=='all'||filters.source&&filters.source!=='all'?'No matching leads':'Your contacts will live here'} action={<AddLead/>}>{filters.q?'Try another name or clear the filters.':'Website inquiries appear automatically. Add a lead to record a call, referral, or outreach conversation.'}</Empty>}</section><div className="crm-pagination"><span>{data.items.length} on this page · up to 50 per page</span><div>{filters.cursor&&<a href={url('/manage/leads',withoutCursor)}>First page</a>}{data.nextCursor&&<a className="crm-button crm-button-secondary" href={url('/manage/leads',{...withoutCursor,cursor:data.nextCursor})}>Older leads</a>}</div></div><p className="crm-help">Each project inquiry is a separate opportunity. Records are not merged automatically. CSV exports include all matching leads, across every page.</p></>;
  }catch(error){content=<Unavailable message={error instanceof RequestError?error.message:undefined}/>;}}
  return <CRMShell active="/manage/leads" title="Leads & contacts" description="Keep every opportunity and conversation in one place." access={access} settings={settings} actions={access.allowed?<AddLead/>:undefined}>{content}</CRMShell>;
}
