import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {runMonitoring,saveMonitoringSettings,approveMonitoringBaseline,connectMonitoringEvents,scheduleMonitoringDelivery} from '@/lib/monitoring';
import {acknowledgeIncident,resolveIncident} from '@/lib/monitoring-incidents';
import {deliverMonitoringAlert} from '@/lib/monitoring-alerts';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const owner=await getOwnerAccess();if(!owner)return privateJson({ok:false,error:'Sign in to manage monitoring.'},401);
 if(!owner.allowed||!owner.configured)return privateJson({ok:false,error:'This account does not have access.'},403);
 const origin=checkOrigin(request),data=await readJson(request,4096);
 switch(data.action){
  case 'run':await runMonitoring('owner');return privateJson({ok:true,message:'Monitoring check saved.'});
  case 'connect_events':await connectMonitoringEvents(origin);return privateJson({ok:true,message:'Call event configuration checked and monitoring refreshed. New calls will supply event evidence.'});
  case 'settings':return privateJson({ok:true,settings:await saveMonitoringSettings(data),message:'Monitoring settings saved.'});
  case 'approve_baseline':return privateJson({ok:true,settings:await approveMonitoringBaseline(data),message:'Observed configuration approved for change detection. This does not certify phone quality.'});
  case 'acknowledge':if(typeof data.id!=='string')throw new RequestError(400,'Choose an incident.');await acknowledgeIncident(data.id);return privateJson({ok:true,message:'Incident acknowledged. Its condition remains open.'});
  case 'resolve':if(typeof data.id!=='string')throw new RequestError(400,'Choose an incident.');await resolveIncident(data.id);scheduleMonitoringDelivery();return privateJson({ok:true,message:'Incident closed by the owner. Current health still requires a fresh check.'});
  case 'retry_alert':if(typeof data.id!=='string')throw new RequestError(400,'Choose a notification.');await deliverMonitoringAlert(data.id);return privateJson({ok:true,message:'Notification status checked. Review the recorded outcome.'});
  default:throw new RequestError(400,'Choose a monitoring action.');
 }
}catch(error){return routeError(error);}}
