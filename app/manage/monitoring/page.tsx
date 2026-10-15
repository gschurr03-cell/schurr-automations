import {HistoryLink} from '../history-controls';
import {CRMShell,crmContext,AccessDenied,Unavailable,AutomationNavigation,dateTime} from '../crm-ui';
import {latestMonitoringRun,monitoringSettings} from '@/lib/monitoring';
import {monitoringSummary} from '@/lib/monitoring-policy';
import {listMonitoredCalls,type MonitoredCall} from '@/lib/monitoring-calls';
import {listMonitoringIncidents,type MonitoringIncident} from '@/lib/monitoring-incidents';
import {listMonitoringAlerts,type MonitoringAlert} from '@/lib/monitoring-alerts';
import {listClientSetups} from '@/lib/client-setups';
import MonitoringWorkspace,{MonitorActionButton} from './workspace';

export const dynamic='force-dynamic';
export const metadata={title:'Client Health | Schurr Automations',robots:{index:false,follow:false}};
const PATH='/manage/monitoring';
const FLAGS={provider_error:'Provider error',tool_error:'Tool error',quality_review:'AI result needs review'} as const;
const INCIDENT_STATUS={open:'Open',acknowledged:'Acknowledged',resolved:'Closed'} as const;
const ALERT_STATUS:Record<string,string>={pending:'Waiting to send',sending:'Acceptance not yet confirmed',accepted:'Accepted by email provider',failed:'Attempt failed',uncertain:'Needs provider review',cancelled:'Stopped'};
const words=(value:string)=>value.replace(/_/g,' ');
const milliseconds=(value:number|null)=>value===null?'Not reported':`${value.toLocaleString('en-US')} ms`;
function CallRow({call,timezone}:{call:MonitoredCall;timezone:string}){
 const technical=call.flagCodes.filter(flag=>flag!=='quality_review');
 return <tr>
  <td><time dateTime={call.firstReceivedAt}>{dateTime(call.firstReceivedAt,timezone)}</time><p className="crm-record-reference">{call.callId}</p><p className="crm-help">{call.agentVersion===null?'Version not reported':`Agent version ${call.agentVersion}`}</p></td>
  <td>{words(call.lifecycle)} · {words(call.providerStatus)}{call.durationMs!==null&&<p className="crm-help">{Math.round(call.durationMs/1000).toLocaleString('en-US')} seconds</p>}{call.disconnectionReason&&<p className="crm-help">End reason: {words(call.disconnectionReason)}</p>}</td>
  <td>CRM handoffs saved: <strong>{call.actualCaptureCount}</strong><p>Active voice bookings: <strong>{call.actualVoiceBookingCount}</strong></p>{call.actualVoiceAppointment&&<p className="crm-help">Voice appointment: {words(call.actualVoiceAppointment.status)}</p>}{call.otherLinkedAppointmentCount>0&&<p className="crm-help">Other linked appointments: {call.otherLinkedAppointmentCount}. These are not evidence of a voice booking.</p>}</td>
  <td>{call.toolAttempts===null?'No tool observations recorded':<>{call.toolAttempts} attempts · {call.toolSuccesses??0} successful<p className="crm-help">{call.failedToolCount??0} technical failures · {call.rejectedToolCount??0} rejected actions · {call.unclassifiedToolCount??0} unclassified failures</p></>}</td>
  <td>p50: {milliseconds(call.latencyP50Ms)}<p>p95: {milliseconds(call.latencyP95Ms)}</p><p className="crm-help">Provider-reported end-to-end latency</p></td>
  <td>{technical.length?technical.map(flag=><p key={flag}><strong>{FLAGS[flag]}</strong></p>):'No recorded technical error flag'}<p className="crm-help"><strong>AI-reported outcome:</strong> {call.providerReportedCallSuccessful===null?'Not reported':call.providerReportedCallSuccessful?'Successful':'Needs review'}. This is separate from saved CRM receipts.</p>{!call.terminal&&<p className="crm-help">No completed-call event recorded yet.</p>}</td>
 </tr>;
}
function IncidentRow({incident,timezone}:{incident:MonitoringIncident;timezone:string}){
 return <article className="response-item" id={'incident-'+incident.id}>
  <div className="crm-section-heading"><div><h3>{incident.summary}</h3><p className="crm-help">{incident.source==='call'?'Call event':'Connection check'} · {incident.severity==='warning'?'Review needed':'Error'} · {dateTime(incident.createdAt,timezone)}</p></div><span className="crm-stage">{INCIDENT_STATUS[incident.status]}</span></div>
  <p className="crm-record-reference">Incident {incident.id}</p>
  {incident.acknowledgedAt&&<p className="crm-help">Acknowledged {dateTime(incident.acknowledgedAt,timezone)}.</p>}
  {incident.status==='resolved'?<p className="crm-help">{incident.resolutionKind==='check_pass'?'A later check passed for this condition.':'Closed manually by the owner; recovery was not verified.'}{incident.resolvedAt&&` ${dateTime(incident.resolvedAt,timezone)}.`}</p>:<div className="crm-actions">{incident.status==='open'&&<MonitorActionButton action="acknowledge" id={incident.id}/>}<MonitorActionButton action="resolve" id={incident.id}>Close incident manually</MonitorActionButton></div>}
 </article>;
}
function retryEligible(alert:MonitoringAlert,enabled:boolean,now:number){
 return enabled&&['pending','failed'].includes(alert.status)&&alert.retryable===1&&alert.attempts<5&&alert.nextAttemptAt<=now&&(alert.firstAttemptAt===0||alert.firstAttemptAt>now-23*60*60*1000+10000);
}
function AlertRow({alert,enabled,timezone,now}:{alert:MonitoringAlert;enabled:boolean;timezone:string;now:number}){
 return <tr><td>{alert.kind==='opened'?'Incident opened':'Incident closed'}<p className="crm-help">{dateTime(alert.createdAt,timezone)}</p><p className="crm-record-reference">Incident {alert.incidentId}</p></td>
 <td><strong>{ALERT_STATUS[alert.status]||'Status unavailable'}</strong>{alert.acceptedAt&&<p className="crm-help">Accepted {dateTime(alert.acceptedAt,timezone)}</p>}{alert.lastError&&<p className="crm-help">{alert.lastError}</p>}</td><td>{alert.attempts}</td>
 <td>{retryEligible(alert,enabled,now)?<MonitorActionButton action="retry_alert" id={alert.id}>{alert.attempts?'Retry alert email':'Try alert email'}</MonitorActionButton>:alert.status==='accepted'?'No retry needed':alert.status==='uncertain'?'Check the email provider; automatic retries stopped':alert.status==='sending'?'Await the saved outcome or safe lease recovery':alert.retryable===1&&['pending','failed'].includes(alert.status)&&alert.nextAttemptAt>now?<span>Next attempt no earlier than {dateTime(new Date(alert.nextAttemptAt).toISOString(),timezone)}</span>:!enabled&&alert.retryable===1?'Alert emails are disabled':'No eligible retry'}</td></tr>;
}

export default async function ClientHealth({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}={}){
 const params=await searchParams||{},{access,settings}=await crmContext(PATH);let content;
 if(!access.allowed)content=<AccessDenied access={access}/>;
 else if(!settings)content=<Unavailable/>;
 else try{
  const callCursor=typeof params.callCursor==='string'?params.callCursor:undefined,incidentCursor=typeof params.incidentCursor==='string'?params.incidentCursor:undefined,alertCursor=typeof params.alertCursor==='string'?params.alertCursor:undefined;
  const incidentStatus=params.incidentStatus==='all'||params.incidentStatus==='resolved'?params.incidentStatus:'active';
  const monitor=await monitoringSettings();
  const [latest,calls,incidents,alerts,clients]=await Promise.all([latestMonitoringRun(),listMonitoredCalls(callCursor),listMonitoringIncidents({cursor:incidentCursor,status:incidentStatus}),listMonitoringAlerts({cursor:alertCursor}),listClientSetups()]);
  const now=Date.now(),summary=monitoringSummary(latest,now);
  const historyHref=(section:'calls'|'incidents'|'alerts',cursor?:string,status=incidentStatus)=>{
   const query=new URLSearchParams({incidentStatus:status});
   for(const [key,value] of [['callCursor',callCursor],['incidentCursor',incidentCursor],['alertCursor',alertCursor]] as const)if(value)query.set(key,value);
   const key=section==='calls'?'callCursor':section==='incidents'?'incidentCursor':'alertCursor';
   if(cursor)query.set(key,cursor);else query.delete(key);
   return PATH+'?'+query.toString()+'#'+section;
  };
  content=<><AutomationNavigation active={PATH}/>
   <div className="crm-setup-banner"><div><strong>Schurr deployment · {summary.label}</strong><p>This workspace is scoped to Schurr. Signed call events, saved action receipts and check results appear here; client setup briefs still need their own connections.</p></div><a className="crm-button crm-button-secondary" href="#health-checks">Review checks</a></div>
   <nav className="automation-jump" aria-label="Client Health sections"><a href="#incidents">{incidents.counts.active} active incidents</a><a href="#calls">Call history</a><a href="#alerts">Alert delivery</a><a href="#client-connections">Client connections</a><a href="#scheduled-monitoring">Scheduled monitoring</a></nav>
   <section className="crm-panel" id="incidents"><div className="crm-section-heading"><h2>Incident queue</h2><span className="crm-help">{incidents.counts.active} active · {incidents.counts.resolved} closed</span></div>
    <nav className="crm-actions" aria-label="Incident status">{(['active','all','resolved'] as const).map(status=><HistoryLink key={status} href={historyHref('incidents',undefined,status)} current={incidentStatus===status}>{status==='active'?'Active':status==='all'?'All incidents':'Closed'}</HistoryLink>)}</nav>
    <p className="crm-help">Acknowledging keeps the issue open. Manual closure records your decision, not verified recovery. A new failed check can open another incident; historical call flags remain in call history.</p>
    {incidents.items.length?incidents.items.map(incident=><IncidentRow key={incident.id} incident={incident} timezone={settings.timezone}/>):<p>{incidentStatus==='active'?'No active incidents are recorded. Review check freshness before treating the service as healthy.':'No incidents in this view.'}</p>}
    <nav className="crm-pagination" aria-label="Incident pages"><span>{incidents.items.length} on this page</span><div>{incidentCursor&&<HistoryLink href={historyHref('incidents')}>Newest matching incidents</HistoryLink>}{incidents.nextCursor&&<HistoryLink href={historyHref('incidents',incidents.nextCursor)}>Older matching incidents</HistoryLink>}</div></nav>
   </section>
   <MonitoringWorkspace settings={monitor} latest={latest}/>
   <section className="crm-panel" id="calls"><div className="crm-section-heading"><h2>Actual call evidence</h2><span className="crm-help">{calls.items.length} calls on this page</span></div>
    <p className="crm-help">Only signed inbound phone events for the saved Schurr agent and number are included. CRM handoffs and voice bookings come from saved application records. Tool counts include retries; a rejected action can be a correct permission or availability check. Zero saved actions alone does not mean a call failed.</p><p className="crm-help">Provider latency and AI-reported outcomes do not prove clear audio, a natural greeting or a completed booking. This view contains no caller numbers, transcripts or recordings.</p>
    {calls.items.length?<><nav className="crm-pagination" aria-label="Call history pages"><span>Newest first by first received event</span><div>{callCursor&&<HistoryLink href={historyHref('calls')}>Newest calls</HistoryLink>}{calls.nextCursor&&<HistoryLink href={historyHref('calls',calls.nextCursor)}>Older calls</HistoryLink>}</div></nav><div className="crm-table-wrap"><table className="crm-table"><thead><tr><th scope="col">Call received</th><th scope="col">Provider event</th><th scope="col">Saved CRM receipts</th><th scope="col">Observed tool results</th><th scope="col">Provider latency</th><th scope="col">Flags and AI report</th></tr></thead><tbody>{calls.items.map(call=><CallRow key={call.callId} call={call} timezone={settings.timezone}/>)}</tbody></table></div></>:<><p>No calls are recorded in this view. Connect call events above, then make a real phone test and confirm its receipt here. Browser voice tests are excluded.</p>{callCursor&&<HistoryLink href={historyHref('calls')}>Newest calls</HistoryLink>}</>}
   </section>
   <section className="crm-panel" id="alerts"><div className="crm-section-heading"><h2>Incident alert delivery</h2><span className="crm-help">{alerts.counts.pending} waiting · {alerts.counts.needsReview} need review</span></div>
    <p className="crm-help">{alerts.enabled?'Incident alert emails are enabled.':'Incident alert emails are disabled.'} A verified sender is required. “Accepted” means the email provider returned a message reference; it does not confirm inbox delivery. Notifications contain a generic incident summary, not caller details.</p>
    {alerts.items.length?<><nav className="crm-pagination" aria-label="Alert delivery pages"><span>{alerts.items.length} on this page · {alerts.counts.total} recorded</span><div>{alertCursor&&<HistoryLink href={historyHref('alerts')}>Newest alerts</HistoryLink>}{alerts.nextCursor&&<HistoryLink href={historyHref('alerts',alerts.nextCursor)}>Older alerts</HistoryLink>}</div></nav><div className="crm-table-wrap"><table className="crm-table"><thead><tr><th scope="col">Notification</th><th scope="col">Delivery state</th><th scope="col">Attempts</th><th scope="col">Next action</th></tr></thead><tbody>{alerts.items.map(alert=><AlertRow key={alert.id} alert={alert} enabled={alerts.enabled} timezone={settings.timezone} now={now}/>)}</tbody></table></div></>:<><p>No incident notifications in this view. Running a check does not send a test alert.</p>{alertCursor&&<HistoryLink href={historyHref('alerts')}>Newest alerts</HistoryLink>}</>}
   </section>
   <section className="crm-panel" id="client-connections"><div className="crm-section-heading"><h2>Client connections</h2><a href="/manage/clients">Open client setups</a></div><p className="crm-help">{clients.hasMore?'More than 200':clients.items.length} saved client briefs. A brief or rehearsal does not enroll a client in live monitoring. Each business needs separate provider credentials, routing, alert recipients and a verified test before activation.</p>
    {clients.items.length?<><p className="crm-help">Showing {Math.min(clients.items.length,10)} most recently updated briefs.</p><div className="crm-table-wrap"><table className="crm-table"><thead><tr><th scope="col">Business</th><th scope="col">Monitoring</th></tr></thead><tbody>{clients.items.slice(0,10).map(client=><tr key={client.id}><td>{client.businessName}</td><td>Not connected</td></tr>)}</tbody></table></div></>:<p>No client briefs saved yet. Prove the Schurr workflow first, then prepare each buyer’s setup.</p>}
   </section>
  </>;
 }catch{content=<><Unavailable message="Client Health could not load. Refresh the page, or return to the newest history if a page link is out of date."/><HistoryLink href={PATH}>Open newest monitoring history</HistoryLink></>;}
 return <CRMShell active="/manage/automations" title="Client Health" description="Review connection checks, real call evidence and incidents for the Schurr deployment." access={access} settings={settings}>{content}</CRMShell>;
}
