import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {saveAudition} from '@/lib/receptionist-auditions';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 checkOrigin(request);
 const owner=await getOwnerAccess();
 if(!owner)throw new RequestError(401,'Sign in to record an audition.');
 if(!owner.allowed)throw new RequestError(403,'This account does not have access.');
 const data=await readJson(request,50000);
 return privateJson({ok:true,...await saveAudition(data,owner.email)});
}catch(error){return routeError(error);}}
