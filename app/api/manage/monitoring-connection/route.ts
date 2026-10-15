import {env} from 'cloudflare:workers';
import {getOwnerAccess} from '@/lib/owner';
import {privateJson,routeError} from '@/lib/inquiries';
import {monitoringRunnerConfigured} from '@/lib/monitoring';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const owner=await getOwnerAccess();if(!owner)return privateJson({ok:false,error:'Sign in to obtain the monitoring connection.'},401);
 if(!owner.allowed||!owner.configured)return privateJson({ok:false,error:'This account does not have access.'},403);
 if(request.headers.get('sec-fetch-site')==='cross-site')return privateJson({ok:false,error:'Open this download from the owner workspace.'},403);
 if(!monitoringRunnerConfigured())return privateJson({ok:false,error:'The private monitoring credential has not been configured.'},409);
 const token=(env as unknown as {MONITORING_RUNNER_SECRET:string}).MONITORING_RUNNER_SECRET;
 const connection={purpose:'Private monitoring connection. Keep this file out of public folders and source control.',availability:{method:'GET',url:'https://schurrautomations.com/api/health',expectedStatus:200},checks:{method:'POST',url:'https://schurrautomations.com/api/monitoring/run',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',expectedStatus:200,recommendedIntervalSeconds:300},scope:'This credential can run health observations and fixed-recipient operational alerts. It cannot change agents, book appointments, or retrieve customer records.',instructions:'Create monitors in your external uptime account. Configure its own email or push alerts so an app outage can still reach you. After the first check, confirm its timestamp in Client Health.'};
 return new Response(JSON.stringify(connection,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="schurr-private-monitoring-connection.json"','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}catch(error){return routeError(error);}}
