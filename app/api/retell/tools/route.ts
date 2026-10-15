import {privateJson,routeError} from '@/lib/inquiries';
import {handleRetellTool} from '@/lib/retell';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{return privateJson(await handleRetellTool(request));}catch(error){return routeError(error);}}
