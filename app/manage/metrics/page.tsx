import { listMetrics } from '@/lib/inquiries';
import { requireOwner } from '@/lib/owner';
import { getSettings } from '@/lib/crm';
import { CRMShell, AccessDenied, Unavailable, Empty } from '../crm-ui';
export const dynamic='force-dynamic';
export const metadata={title:'Site activity | Schurr CRM'};
const numberFormat=new Intl.NumberFormat('en-US');
const eventName=(value:string)=>value==='inquiry_start'?'Form opened (not submitted)':value==='inquiry_received'?'Inquiry received (saved)':value.replace(/[_-]/g,' ');
export default async function MetricsPage() {
  const access=await requireOwner('/manage/metrics');let settings=null;let content;
  if(!access.allowed) content=<AccessDenied access={access}/>;
  else {try {
    const [metrics,prefs]=await Promise.all([listMetrics(),getSettings()]);settings=prefs;
    const byEvent=new Map<string,number>();for(const metric of metrics) byEvent.set(metric.event,(byEvent.get(metric.event)||0)+metric.count);
    content=<><div className="crm-stats crm-metrics-stats"><div className="crm-stat"><span>Recorded events</span><strong>{numberFormat.format(metrics.reduce((n,m)=>n+m.count,0))}</strong><small>Last 30 days</small></div><div className="crm-stat"><span>Inquiries received</span><strong>{numberFormat.format(byEvent.get('inquiry_received')||0)}</strong><small>Saved website submissions · <a href="/manage/inquiries">View inquiries</a></small></div><div className="crm-stat"><span>Call button clicks</span><strong>{numberFormat.format(byEvent.get('call_click')||0)}</strong><small>Clicks, not verified calls</small></div><div className="crm-stat"><span>Text button clicks</span><strong>{numberFormat.format(byEvent.get('text_click')||0)}</strong><small>Clicks, not verified messages</small></div></div><p className="crm-alert">These are event counts, not unique visitors or a verified conversion rate. Repeat actions and automated traffic can contribute. Dates are grouped by UTC day.</p>{metrics.length?<section className="crm-panel"><div className="crm-section-heading"><h2>Daily detail</h2><span className="crm-muted">Last 30 days · UTC</span></div><div className="crm-table-wrap" role="region" aria-label="Daily website event counts" tabIndex={0}><table className="crm-table"><thead><tr><th scope="col">Day (UTC)</th><th scope="col">Event</th><th scope="col">Page</th><th scope="col">Service</th><th scope="col">Count</th></tr></thead><tbody>{metrics.map(metric=><tr key={JSON.stringify([metric.day,metric.event,metric.route,metric.service])}><td>{metric.day}</td><td>{eventName(metric.event)}</td><td>{metric.route||'None'}</td><td>{metric.service||'None'}</td><td className="crm-numeric">{numberFormat.format(metric.count)}</td></tr>)}</tbody></table></div></section>:<section className="crm-panel"><Empty title="No website activity yet">Supported events will appear here as visitors use your website.</Empty></section>}<p className="crm-help">Deleting a lead does not remove its original aggregate inquiry count. Manual CRM leads are not counted as website submissions.</p></>;
  }catch{content=<Unavailable message="Website activity could not load. Please try again."/>;}}
  return <CRMShell active="/manage/metrics" title="Site activity" description="Understand how visitors use your website." access={access} settings={settings}>{content}</CRMShell>;
}
