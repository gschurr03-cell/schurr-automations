import {privateJson,readJson,routeError} from '@/lib/inquiries';
import {verifyMonitoringRunner,runMonitoring} from '@/lib/monitoring';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 await verifyMonitoringRunner(request);
 const data=await readJson(request,1024);if(Object.keys(data).length)return privateJson({ok:false,error:'Send an empty JSON object.'},400);
 const run=await runMonitoring('runner');
 const core=new Set(['database','retell_connection','phone_routing','agent_configuration','voice_tools']);
 const available=[...core].every(key=>run.checks.some(c=>c.key===key&&c.status==='pass'));
 return privateJson({ok:available,status:available?'ok':'needs_review',checkedAt:run.finishedAt},available?200:503);
}catch(error){return routeError(error);}}
