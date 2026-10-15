import { listTasks, getLead } from '@/lib/crm';
import { CRMShell, crmContext, AccessDenied, Unavailable, TaskList, TaskForm, Empty, Saved, todayFor, url } from '../crm-ui';
import { RequestError } from '@/lib/inquiries';
export const dynamic='force-dynamic';
export const metadata={title:'Follow-ups | Schurr CRM'};
export default async function TasksPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams; const get=(key:string)=>typeof params[key]==='string'?params[key] as string:undefined;
  return <TasksContent status={get('status')||'open'} leadId={get('leadId')} cursor={get('cursor')} saved={get('saved')}/>;
}
async function TasksContent({status,leadId,cursor,saved}:{status:string;leadId?:string;cursor?:string;saved?:string}) {
  const {access,settings}=await crmContext(url('/manage/tasks',{status,leadId,cursor})); let content;
  if(!access.allowed) content=<AccessDenied access={access}/>;
  else if(!settings) content=<Unavailable/>;
  else {try {
    const today=todayFor(settings); const [data,lead]=await Promise.all([listTasks({status,leadId,cursor,today}),leadId?getLead(leadId):Promise.resolve(null)]);
    content=<><Saved value={saved}/><p className="crm-alert"><a href="/manage/schedule#followup-queue">Open inquiry follow-ups and priority callbacks</a>. These reminders stop when their request is handled, booked or paused.</p><div className="crm-tabs" aria-label="Task filters">{[['open','Open'],['overdue','Overdue'],['today','Today'],['done','Completed'],['all','All tasks']].map(([key,label])=><a key={key} href={url('/manage/tasks',{status:key,leadId})} aria-current={status===key?'page':undefined}>{label}</a>)}</div>{leadId&&<div className="crm-alert">Tasks for {lead?.name||'a deleted lead'}. <a href={url('/manage/tasks',{status})}>Show all contacts</a></div>}<div className="crm-task-layout"><section className="crm-panel"><div className="crm-section-heading"><h2>{status==='done'?'Completed follow-ups':'Your follow-ups'}</h2><span className="crm-muted">{settings.timezone}</span></div>{data.items.length?<TaskList tasks={data.items} today={today} editable/>:<Empty title={status==='overdue'?'No overdue follow-ups':'No tasks in this view'}>Add a follow-up here or from a contact record.</Empty>}<div className="crm-pagination">{cursor&&<a href={url('/manage/tasks',{status,leadId})}>First page</a>}{data.nextCursor&&<a href={url('/manage/tasks',{status,leadId,cursor:data.nextCursor})}>More tasks</a>}</div></section><section className="crm-panel crm-task-create"><h2>Add a follow-up</h2><p className="crm-help">{lead?'Linked to '+lead.name+'.':'For a specific contact, add the task from their lead record.'}</p>{leadId&&!lead?<p className="crm-alert">This contact no longer exists. Clear the contact filter to create an unlinked task.</p>:<TaskForm leadId={lead?.id} today={today}/>}<p className="crm-help">Tasks stay visible in the workspace until completed. Automatic email, SMS, and calendar reminders are not connected.</p></section></div></>;
  }catch(error){content=<Unavailable message={error instanceof RequestError?error.message:undefined}/>;}}
  return <CRMShell active="/manage/tasks" title="Follow-ups" description="Keep the next conversation on your schedule." access={access} settings={settings}>{content}</CRMShell>;
}
