import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {connectRetell,provisionRetell,retellVoices,setRetellMode} from '@/lib/retell';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  const origin=checkOrigin(request),access=await getOwnerAccess();
  if(!access)return privateJson({ok:false,error:'Sign in to connect your receptionist.'},401);
  if(!access.allowed)return privateJson({ok:false,error:'This account does not have access.'},403);
  const input=await readJson(request,2048);
  switch(input.action){
    case 'connect':return privateJson({ok:true,...await connectRetell(input.apiKey)});
    case 'voices':return privateJson({ok:true,voices:await retellVoices()});
    case 'provision':return privateJson({ok:true,setup:await provisionRetell(origin,input.voiceId)});
    case 'mode':return privateJson({ok:true,setup:await setRetellMode(input.mode,input.number)});
    default:throw new RequestError(400,'Choose a valid setup action.');
  }
}catch(error){return routeError(error);}}
