import { CRMShell,crmContext,AccessDenied,Unavailable } from '../crm-ui';
import { snapshot } from '@/lib/outreach';
import {logOutreachFailure} from '@/lib/outreach-errors';
import OutreachWorkspace from './workspace';
import {QueuePanel} from './batch-review';
import './outreach.css';
export const dynamic='force-dynamic';
export const metadata={title:'Outreach | Schurr CRM'};
export default async function Outreach(){const {access,settings}=await crmContext('/manage/outreach');let content;if(!access.allowed)content=<AccessDenied access={access}/>;else if(!settings)content=<Unavailable/>;else try{content=<OutreachWorkspace initial={await snapshot({email:'available',fit:'recommended'})}/>;}catch(error){logOutreachFailure(error,'page');content=<div className="out-workspace"><QueuePanel/><Unavailable message="The business list could not load. Your saved sending queue is available above; you do not need to create it again."/></div>;}return <CRMShell active="/manage/outreach" title="Outreach" description="Choose up to 20 businesses, review your emails, then send in batches." access={access} settings={settings}>{content}</CRMShell>;}
