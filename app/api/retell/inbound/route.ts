import {privateJson,routeError} from '@/lib/inquiries';
import {handleRetellInbound} from '@/lib/retell';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{return privateJson(await handleRetellInbound(request));}catch(error){return routeError(error);}}
