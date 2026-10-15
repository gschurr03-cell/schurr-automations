import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {getClientInstallation,saveClientInstallation,clientPreparationPackage} from '@/lib/client-installations';
export const dynamic='force-dynamic';
async function access(){const owner=await getOwnerAccess();if(!owner)throw new RequestError(401,'Sign in to manage client installations.');if(!owner.allowed)throw new RequestError(403,'This account does not have access.');}
export async function GET(request:Request){try{await access();const q=new URL(request.url).searchParams;const pack=q.get('format')==='package';const result=pack?await clientPreparationPackage(q.get('id'),q.get('revision'),q.get('installationRevision')):await getClientInstallation(q.get('id'));const response=privateJson(result);if(pack)response.headers.set('Content-Disposition','attachment; filename="client-preparation.json"');response.headers.set('X-Content-Type-Options','nosniff');return response;}catch(error){return routeError(error);}}
export async function POST(request:Request){try{checkOrigin(request);await access();const result=await saveClientInstallation(await readJson(request,16000));return privateJson({ok:true,installation:result});}catch(error){return routeError(error);}}
