import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {previewQueue,confirmQueue,cancelQueue,resumeQueue,queueSnapshot,runQueue} from '@/lib/gmail-queue';
export const dynamic='force-dynamic';
async function owner(){const a=await getOwnerAccess();if(!a)throw new RequestError(401,'Sign in to the CRM.');if(!a.allowed||!a.configured)throw new RequestError(403,'This account cannot access the workspace.');return a;}
export async function GET(){try{await owner();return privateJson({ok:true,data:await queueSnapshot()});}catch(e){return routeError(e);}}
export async function POST(request:Request){try{checkOrigin(request);const a=await owner(),p=await readJson(request,5000);
 if(p.action==='preview')return privateJson({ok:true,preview:await previewQueue(p.ids)});
 if(p.action==='confirm')return privateJson({ok:true,...await confirmQueue(p,a.email!)});
 if(p.action==='cancel')return privateJson({ok:true,...await cancelQueue(p.id)});
 if(p.action==='resume')return privateJson({ok:true,...await resumeQueue(p)});
 if(p.action==='run')return privateJson({ok:true,...await runQueue()});
 throw new RequestError(400,'Choose a supported queue action.');
}catch(e){return routeError(e);}}
