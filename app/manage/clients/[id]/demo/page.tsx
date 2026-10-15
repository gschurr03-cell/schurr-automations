import {requireOwner} from '@/lib/owner';
import {AccessDenied,Unavailable} from '../../../crm-ui';
import {getClientSetup} from '@/lib/client-setups';
import {buildClientPresentation} from '@/lib/client-demo';
import {RequestError} from '@/lib/inquiries';
import ClientPresentationView from '../../presentation';
export const dynamic='force-dynamic';
export const metadata={title:'Client demonstration | Schurr Automations',robots:{index:false,follow:false}};
export default async function Demo({params}:{params:Promise<{id:string}>}){const {id}=await params;const access=await requireOwner(`/manage/clients/${id}/demo`);if(!access.allowed)return <div className="crm-app"><AccessDenied access={access}/></div>;try{const setup=await getClientSetup(id);return <ClientPresentationView presentation={buildClientPresentation(setup.profile,setup.revision,setup.offers)} backHref={`/manage/clients/${setup.id}`}/>;}catch(error){return <div className="crm-app">{error instanceof RequestError&&(error.status===400||error.status===404)?<div className="crm-empty"><h1>Client setup not found</h1><a href="/manage/clients">Back to client setups</a></div>:<Unavailable/>}</div>;}}
