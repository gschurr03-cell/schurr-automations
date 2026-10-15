import {clientPreflightRunner} from '@/lib/client-preflight';
import {clientImplementationReadme} from '@/lib/client-handoff';
import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {saveLaunchCheck,clientLaunchStatus} from '@/lib/client-launch';
import {clientLaunchKit,mutateClientSetup,previewClientSetup,rehearseClientSetup} from '@/lib/client-setups';
export const dynamic='force-dynamic';
async function access(){const owner=await getOwnerAccess();if(!owner)throw new RequestError(401,'Sign in to manage client setups.');if(!owner.allowed)throw new RequestError(403,'This account does not have access.');return owner;}
export async function GET(request:Request){try{
 await access();
 const query=new URL(request.url).searchParams;
 if(query.get('format')==='preflight')return new Response(clientPreflightRunner(),{headers:{'Content-Type':'text/javascript; charset=utf-8','Content-Disposition':'attachment; filename="preflight.mjs"','Cache-Control':'private, no-store'}});
 if(query.get('format')==='install')throw new RequestError(410,'Use the saved Installation section to download the current preparation package. The blank legacy installation export has been retired.');
 const kit=await clientLaunchKit(query.get('id'));
 if(query.get('format')==='readme'&&query.has('revision')&&query.get('revision')!==String(kit.revision))throw new RequestError(409,'The brief changed since this page loaded. Refresh before downloading its handoff.');
 const launchEvidence=await clientLaunchStatus(kit.clientId);
 if(query.get('format')==='readme'&&query.has('installationRevision')&&query.get('installationRevision')!==String(launchEvidence.installationRevision))throw new RequestError(409,'The installation changed since this page loaded. Refresh before downloading.');
 if(launchEvidence.revision!==kit.revision)throw new RequestError(409,'The brief changed while exporting. Download it again.');
 if(query.get('format')==='readme')return new Response(clientImplementationReadme(kit,launchEvidence),{headers:{
  'Content-Type':'text/markdown; charset=utf-8',
  'Content-Disposition':'attachment; filename="client-implementation-'+kit.clientId+'-r'+kit.revision+'.md"',
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
 }});
 const response=privateJson({...kit,launchEvidence});response.headers.set('Content-Disposition','attachment; filename="client-setup-'+kit.clientId+'.json"');return response;
}catch(error){return routeError(error);}}
export async function POST(request:Request){try{checkOrigin(request);const owner=await access();const data=await readJson(request,65536);const result=data.action==='launch_check'?await saveLaunchCheck(data,owner.email):data.action==='preview'?await previewClientSetup(data):data.action==='rehearse'?await rehearseClientSetup(data):await mutateClientSetup(data);return privateJson({ok:true,...result});}catch(error){return routeError(error);}}
