import {requireOwner} from '@/lib/owner';
import {AccessDenied} from '../../crm-ui';
import {buildClientPresentation,homeServiceDemoProfile} from '@/lib/client-demo';
import ClientPresentationView from '../presentation';
export const dynamic='force-dynamic';
export const metadata={title:'Home-service demonstration | Schurr Automations',robots:{index:false,follow:false}};
export default async function Demo(){const access=await requireOwner('/manage/clients/demo');if(!access.allowed)return <div className="crm-app"><AccessDenied access={access}/></div>;return <ClientPresentationView presentation={buildClientPresentation(homeServiceDemoProfile(),1,['calls','website','reviews','coding'])} backHref="/manage/automations" fictional/>;}
