import { getOverview, listLeads, listTasks } from '@/lib/crm';
import { CRMShell, crmContext, AccessDenied, Unavailable, AddLead, LeadTable, TaskList, Empty, money, todayFor } from './crm-ui';
export const dynamic='force-dynamic';
export const metadata={title:'Overview | Schurr CRM'};
export default async function Dashboard() {
  const context=await crmContext('/manage'); const {access,settings}=context;
  let content;
  if(!access.allowed) content=<AccessDenied access={access}/>;
  else if(!settings) content=<Unavailable/>;
  else {
    try {
      const today=todayFor(settings);
      const [overview,leads,tasks]=await Promise.all([getOverview(today),listLeads({stage:'new'},5),listTasks({today,limit:5})]);
      const active=overview.stages.filter(s=>['new','contacted','discovery','proposal'].includes(s.stage));
      const openCount=active.reduce((n,s)=>n+s.count,0), openValue=active.reduce((n,s)=>n+s.monthlyCents,0);
      const won=overview.stages.find(s=>s.stage==='won');
      content=<>{!settings.setupComplete&&<div className="crm-setup-banner"><div><strong>Make this workspace yours</strong><p>Confirm your business details and timezone. Website inquiries already arrive here.</p></div><a className="crm-button crm-button-secondary" href="/manage/settings">Complete setup</a></div>}
      <div className="crm-stats"><a className="crm-stat" href="/manage/leads?stage=open"><span>Open opportunities</span><strong>{openCount}</strong><small>New through proposal</small></a><a className="crm-stat" href="/manage/pipeline"><span>Open monthly potential</span><strong>{money(openValue)}</strong><small>Estimated fees · USD</small></a><a className="crm-stat" href="/manage/tasks?status=overdue"><span>Overdue follow-ups</span><strong className={overview.tasks.overdue?'crm-overdue':''}>{overview.tasks.overdue||0}</strong><small>{overview.tasks.today||0} due today</small></a><a className="crm-stat" href="/manage/leads?stage=won"><span>Won opportunities</span><strong>{won?.count||0}</strong><small>{money(won?.monthlyCents||0)} in monthly fees recorded</small></a></div>
      <div className="crm-dashboard-grid"><section className="crm-panel"><div className="crm-section-heading"><div><p className="crm-eyebrow">NEXT ACTIONS</p><h2>Your follow-ups</h2></div><a href="/manage/tasks">View all</a></div>{tasks.items.length?<TaskList tasks={tasks.items} today={today}/>:<Empty title="Your next step starts here" action={<a className="crm-button crm-button-secondary" href="/manage/tasks">Add a follow-up</a>}>Schedule a call, a proposal follow-up, or the next step for a client.</Empty>}</section>
      <section className="crm-panel"><div className="crm-section-heading"><div><p className="crm-eyebrow">SALES PIPELINE</p><h2>Where things stand</h2></div></div><div className="crm-stage-summary">{['new','contacted','discovery','proposal','won'].map(stage=>{const row=overview.stages.find(s=>s.stage===stage);return <a href={`/manage/leads?stage=${stage}`} key={stage}><span><i className={`crm-stage-dot crm-stage-dot-${stage}`}/>{stage.charAt(0).toUpperCase()+stage.slice(1)}</span><strong>{row?.count||0}</strong></a>;})}</div><p className="crm-help">Contract values are estimates you enter. They are not a record of payments received.</p></section></div>
      <section className="crm-panel"><div className="crm-section-heading"><div><p className="crm-eyebrow">READY FOR A RESPONSE</p><h2>New opportunities</h2></div><a href="/manage/leads?stage=new">View all new leads</a></div>{leads.items.length?<LeadTable leads={leads.items} timezone={settings.timezone}/>:<Empty title="Ready for your first opportunity" action={<AddLead/>}>Website inquiries appear here automatically. You can also add a contact from a call, referral, or outreach.</Empty>}</section>
      </>;
    } catch {content=<Unavailable/>;}
  }
  return <CRMShell active="/manage" title="Overview" description="Your leads, priorities, and next conversations." access={access} settings={settings} actions={access.allowed?<AddLead/>:undefined}>{content}</CRMShell>;
}
