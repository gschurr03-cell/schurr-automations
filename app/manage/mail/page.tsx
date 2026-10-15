import {CRMShell,crmContext,AccessDenied,Unavailable} from '../crm-ui';
import {gmailWorkspace} from '@/lib/gmail-workspace';
import MailWorkspace from './workspace';

export const dynamic='force-dynamic';
export const metadata={title:'Business email | Schurr Automations',robots:{index:false,follow:false}};
const PATH='/manage/mail';

export default async function MailPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}={}){
  const params=await searchParams||{};
  const {access,settings}=await crmContext(PATH);
  let content;
  if(!access.allowed)content=<AccessDenied access={access}/>;
  else if(!settings)content=<Unavailable/>;
  else try{
    const raw=typeof params.page==='string'?params.page:'1';
    const page=/^[1-9]\d{0,2}$/.test(raw)&&Number(raw)<=200?Number(raw):1;
    const draft=typeof params.draft==='string'&&/^[0-9a-f-]{36}$/i.test(params.draft)?params.draft:undefined;
    const callbackResult=params.gmail==='connected'||params.gmail==='failed'?params.gmail:undefined;
    content=<MailWorkspace initial={await gmailWorkspace(page)} timezone={settings.timezone} selectedDraft={draft} callbackResult={callbackResult} view={draft?'all':callbackResult?'setup':'responses'}/>;
  }catch{
    content=<Unavailable message="Business email could not load. Refresh to check the saved connection and sending history."/>;
  }
  return <CRMShell active={PATH} title="Responses" description="Replies to your outreach conversations." access={access} settings={settings}>{content}</CRMShell>;
}
