import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError} from '@/lib/inquiries';
import {updateResponseJob} from '@/lib/response-desk';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  checkOrigin(request); const access=await getOwnerAccess();
  if(!access) return privateJson({ok:false,error:'Sign in to the CRM to manage responses.'},401);
  if(!access.allowed) return privateJson({ok:false,error:'This account does not have access.'},403);
  await updateResponseJob(await readJson(request,2048)); return privateJson({ok:true});
}catch(error){return routeError(error);}}
