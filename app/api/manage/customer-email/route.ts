import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {deliverCustomerEmail} from '@/lib/customer-email';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 checkOrigin(request);const access=await getOwnerAccess();if(!access)return privateJson({ok:false,error:'Sign in to manage email.'},401);if(!access.allowed)return privateJson({ok:false,error:'This account does not have access.'},403);
 const data=await readJson(request,2048);if(typeof data.id!=='string'||data.action!=='retry')throw new RequestError(400,'Choose a saved email to retry.');
 await deliverCustomerEmail(data.id);return privateJson({ok:true});
}catch(error){return routeError(error);}}
