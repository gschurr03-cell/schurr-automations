import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {connectOwnerAlerts,deliverOwnerAlert,ownerAlertSetup,testBusinessInbox} from '@/lib/owner-alerts';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  checkOrigin(request);const access=await getOwnerAccess();
  if(!access)return privateJson({ok:false,error:'Sign in to manage alerts.'},401);
  if(!access.allowed)return privateJson({ok:false,error:'This account does not have access.'},403);
  const input=await readJson(request,2048);
  if(input.action==='test_business_inbox')return privateJson({ok:true,setup:await testBusinessInbox()});
  if(input.action==='connect')return privateJson({ok:true,setup:await connectOwnerAlerts(input.apiKey)});
  if(input.action==='retry'&&typeof input.id==='string'){await deliverOwnerAlert(input.id);return privateJson({ok:true,setup:await ownerAlertSetup()});}
  if(input.action==='refresh')return privateJson({ok:true,setup:await ownerAlertSetup(input.offset===undefined?0:typeof input.offset==='number'?input.offset:-1)});
  throw new RequestError(400,'Choose a valid alert action.');
}catch(error){return routeError(error);}}
