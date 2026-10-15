import {handleWebsiteCallbackTool} from '@/lib/website-callbacks';
import {privateJson,routeError} from '@/lib/inquiries';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{return privateJson(await handleWebsiteCallbackTool(request));}catch(error){return routeError(error);}}
