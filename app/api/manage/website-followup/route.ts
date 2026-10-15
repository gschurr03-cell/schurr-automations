import {configureWebsiteCallbacks} from '@/lib/website-callbacks';
import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,routeError,readJson,RequestError} from '@/lib/inquiries';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{checkOrigin(request);const owner=await getOwnerAccess();if(!owner?.allowed)throw new RequestError(403,'Sign in as the owner to manage website callbacks.');const data=await readJson(request);if(typeof data.enabled!=='boolean')throw new RequestError(400,'Choose enable or pause.');return privateJson({ok:true,setup:await configureWebsiteCallbacks(data.enabled)});}catch(error){return routeError(error);}}
