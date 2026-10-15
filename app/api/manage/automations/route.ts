import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {saveAutomationSettings,prepareOperation,operationAction,deploymentKit} from '@/lib/automation-desk';
import {deliverReviewRequest} from '@/lib/review-delivery';
import {runSeoAudit} from '@/lib/site-seo';
import {importSearchReport} from '@/lib/search-reports';
export const dynamic='force-dynamic';
async function access(){const owner=await getOwnerAccess();if(!owner)throw new RequestError(401,'Sign in to use automations.');if(!owner.allowed)throw new RequestError(403,'This account does not have access.');}
export async function GET(request:Request){try{await access();const kit=await deploymentKit(new URL(request.url).searchParams.get('client'));const response=privateJson(kit);response.headers.set('Content-Disposition','attachment; filename="workflow-install-kit.json"');return response;}catch(error){return routeError(error);}}
export async function POST(request:Request){try{checkOrigin(request);await access();const data=await readJson(request,50000);let result:unknown;
 if(data.action==='settings')result=await saveAutomationSettings(data);else if(data.action==='prepare')result=await prepareOperation(data);else if(data.action==='search_import')result=await importSearchReport(data);else if(data.action==='seo')result=await runSeoAudit(data.eventKey);else if(data.action==='send_review'){if(data.confirmSend!==true)throw new RequestError(400,'Review this invitation and confirm sending.');await deliverReviewRequest(data.id);}else await operationAction(data);
 return privateJson({ok:true,result});}catch(error){return routeError(error);}}
