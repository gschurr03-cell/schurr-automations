import {AutomationNavigation,CRMShell,crmContext,AccessDenied,Unavailable,Empty,dateTime} from '../crm-ui';
import {listResponseJobs,RESPONSE_STATUSES} from '@/lib/response-desk';
import {bookingSetup} from '@/lib/booking';
import {RequestNextStep} from '../schedule/workspace';
import {SERVICE_NAMES} from '@/lib/crm';
import type {Service} from '@/lib/inquiries';
import ResponseActions from './actions';
import CustomerEmailStatus from './customer-email';
import ServiceConnections,{loadServiceConnections} from '../service-connections';
export const dynamic='force-dynamic';
export const metadata={title:'Incoming requests | Schurr Automations'};
export default async function ResponseDesk({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;const {access,settings}=await crmContext('/manage/response');
 let content;
 if(!access.allowed)content=<AccessDenied access={access}/>;
 else if(!settings)content=<Unavailable/>;
 else try{
 const status=typeof params.status==='string'?params.status:'needs_review';const [data,connections,booking]=await Promise.all([listResponseJobs(status,typeof params.cursor==='string'?params.cursor:undefined),loadServiceConnections(),bookingSetup()]);
 content=<><div className="crm-setup-banner"><div><strong>Inquiries and follow-up</strong><p>Website inquiries and confirmed phone requests arrive here for review. New website inquiries can receive one automatic email confirmation when requested.</p></div><a className="crm-button crm-button-secondary" href="/demo/" target="_blank" rel="noopener">Open buyer demo</a></div>
 <div className="crm-stats">{Object.entries(RESPONSE_STATUSES).map(([key,label])=><a className="crm-stat" href={`/manage/response?status=${key}`} key={key}><span>{label}</span><strong>{data.counts.find(row=>row.status===key)?.count||0}</strong><small>{key==='contacted'?'Manually marked by owner':key==='paused'?'Follow-up paused':'Awaiting your review'}</small></a>)}</div>
 <section className="crm-panel"><div className="crm-section-heading"><h2>{RESPONSE_STATUSES[status as keyof typeof RESPONSE_STATUSES]}</h2><a href="/manage/response">Refresh</a></div>
 {data.items.length?data.items.map(job=><article key={job.id} className="response-item"><div className="crm-section-heading"><div><h3><a href={`/manage/leads/${job.leadId}`}>{job.name}</a></h3><p className="crm-help">{job.business||'Business not provided'} · {SERVICE_NAMES[job.service as Service]||job.service} · {job.sourceKey.startsWith('call:')?'Receptionist call':'Website inquiry'}</p></div><span className="crm-stage">{job.channel==='text'?'Text requested':job.channel==='phone'?'Call requested':'Email requested'}</span></div><p className="crm-help">Received {dateTime(job.createdAt,settings.timezone)}. Permission was recorded for {job.channel==='phone'?'a phone call':job.channel==='text'?'a text message':'email'} about this inquiry.</p><p className="crm-help"><strong>Current contact:</strong> {job.email||'No email'} · {job.phone||'No phone'}{job.preferredContact!==job.channel&&<> · Contact preference changed; review permission before replying.</>}</p><CustomerEmailStatus id={job.id} status={job.emailStatus} recipient={job.emailRecipient} payload={job.emailPayload} error={job.emailError} retryable={job.emailRetryable} providerId={job.emailProviderId}/>{job.draft&&<><blockquote className="response-draft">{job.draft}</blockquote><p className="crm-help">Personal follow-up draft. Review its name and details before using it. An automatic confirmation does not complete the follow-up.</p></>}<RequestNextStep id={job.id} revision={job.revision} status={job.status} timezone={booking.config.timezone} channel={job.channel} recipient={job.channel==='email'?job.email:job.phone}/><ResponseActions id={job.id} revision={job.revision} draft={job.draft} status={job.status}/><a className="crm-subtle-link" href={`/manage/leads/${job.leadId}`}>Open contact details and history</a></article>):<Empty title="No responses in this view">New inquiries submitted after the response desk was added appear here automatically. Earlier inquiries remain in Leads &amp; contacts.</Empty>}
 <div className="crm-actions">{params.cursor&&<a className="crm-button crm-button-secondary" href={`/manage/response?status=${status}`}>First page</a>}{data.nextCursor&&<a className="crm-button crm-button-secondary" href={`/manage/response?status=${status}&cursor=${encodeURIComponent(data.nextCursor)}`}>Next 100 requests</a>}</div></section>
 <ServiceConnections data={connections}/><p className="crm-help">Provider acceptance does not prove inbox delivery. Delivery reports require the Resend webhook connection. A copied draft or a handled status does not confirm delivery. Record the outcome in the contact history. Paused requests require a fresh permission check before further contact.</p></>;
 }catch{content=<Unavailable/>;}
 return <CRMShell active="/manage/response" title="Responses" description="Receptionist handoffs and first responses for your own business." access={access} settings={settings}>{content}</CRMShell>;
}
