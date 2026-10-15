import {env,waitUntil} from 'cloudflare:workers';
import {database,RequestError} from './inquiries';
import {readRetellMonitoring,connectRetellCallEvents} from './monitoring-retell';
import {reconcileCheckIncidents,openCallIncident} from './monitoring-incidents';
import {drainMonitoringAlerts} from './monitoring-alerts';
import {getMonitoredCall,pendingMonitoredCalls,markMonitoredCallReconciled} from './monitoring-calls';
import {verifiedEmailConnection} from './owner-alerts';
import {cleanBookingConfig} from './booking-policy';
import {listAuditions} from './receptionist-auditions';
import {auditionCatalogue,auditionSummary} from './receptionist-audition-policy';
import {MONITOR_BASELINE_MAX_AGE_MS,runnerCheck,type MonitoringCheck,type MonitoringSettingsView,type MonitorRun} from './monitoring-policy';

type Runtime={MONITORING_RUNNER_SECRET?:string;MONITORING_ALERTS_ENABLED?:string};
type SettingsRow=Omit<MonitoringSettingsView,'alertsEnabled'|'runnerExpected'|'runnerConfigured'>&{alertsEnabled:number;runnerExpected:number};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const selectSettings="SELECT revision,alerts_enabled AS alertsEnabled,baseline_hash AS baselineHash,baseline_agent_id AS baselineAgentId,baseline_agent_version AS baselineAgentVersion,baseline_at AS baselineAt,last_runner_at AS lastRunnerAt,runner_expected AS runnerExpected FROM monitoring_settings WHERE id='monitoring'";
const selectRun='SELECT id,source,started_at AS startedAt,finished_at AS finishedAt,checks,agent_id AS agentId,agent_version AS agentVersion,configuration_hash AS configurationHash FROM monitoring_checks';
type RunRow=Omit<MonitorRun,'checks'>&{checks:string};
const decodeRun=(row:RunRow):MonitorRun=>({...row,checks:JSON.parse(row.checks)});
export function monitoringRunnerConfigured(){return /^[A-Za-z0-9_-]{40,180}$/.test((env as unknown as Runtime).MONITORING_RUNNER_SECRET||'');}
async function ensureSettings(){
 const now=new Date().toISOString(),enabled=(env as unknown as Runtime).MONITORING_ALERTS_ENABLED==='true'?1:0;
 await database().prepare("INSERT OR IGNORE INTO monitoring_settings(id,alerts_enabled,created_at,updated_at) VALUES('monitoring',?,?,?)").bind(enabled,now,now).run();
}
export async function monitoringSettings():Promise<MonitoringSettingsView>{
 await ensureSettings();const row=await database().prepare(selectSettings).first<SettingsRow>();
 if(!row)throw new RequestError(503,'Monitoring settings could not load.');
 return {...row,alertsEnabled:row.alertsEnabled===1,runnerExpected:row.runnerExpected===1,runnerConfigured:monitoringRunnerConfigured()};
}
export async function latestMonitoringRun():Promise<MonitorRun|null>{
 const row=await database().prepare(selectRun+' ORDER BY finished_at DESC,id DESC LIMIT 1').first<RunRow>();return row?decodeRun(row):null;
}
export async function saveMonitoringSettings(data:Record<string,unknown>){
 await ensureSettings();
 if(!Number.isSafeInteger(data.revision)||typeof data.alertsEnabled!=='boolean'||typeof data.runnerExpected!=='boolean')throw new RequestError(400,'Review the monitoring settings.');
 if(data.runnerExpected&&!monitoringRunnerConfigured())throw new RequestError(409,'Configure the private monitoring connection first.');
 const row=await database().prepare("UPDATE monitoring_settings SET alerts_enabled=?,runner_expected=?,revision=revision+1,updated_at=? WHERE id='monitoring' AND revision=? RETURNING id").bind(data.alertsEnabled?1:0,data.runnerExpected?1:0,new Date().toISOString(),Number(data.revision)).first();
 if(!row)throw new RequestError(409,'Monitoring settings changed. Refresh and review your draft.');
 return monitoringSettings();
}
export async function verifyMonitoringRunner(request:Request){
 const expected=(env as unknown as Runtime).MONITORING_RUNNER_SECRET||'',supplied=request.headers.get('authorization')||'';
 if(!monitoringRunnerConfigured()||!/^Bearer [A-Za-z0-9_-]{40,180}$/.test(supplied))throw new RequestError(401,'Monitoring authorization required.');
 const encoder=new TextEncoder(),[a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(expected)),crypto.subtle.digest('SHA-256',encoder.encode(supplied.slice(7)))]);
 const aa=new Uint8Array(a),bb=new Uint8Array(b);let difference=0;for(let i=0;i<aa.length;i++)difference|=aa[i]^bb[i];
 if(difference!==0)throw new RequestError(401,'Monitoring authorization required.');
}
export function scheduleMonitoringDelivery(){
 const task=drainMonitoringAlerts(5).catch(()=>{console.error('Monitoring notification recovery is pending.');});
 try{waitUntil(task);}catch{void task;}
}
async function localChecks(agentId:string,agentVersion:number|null):Promise<MonitoringCheck[]>{
 const checks:MonitoringCheck[]=[{key:'database',status:'pass',summary:'The application database answered this check.'}];
 const booking=await database().prepare("SELECT config FROM booking_settings WHERE id='main'").first<{config:string}>();
 if(!booking)checks.push({key:'booking_setup',status:'unknown',summary:'Open the appointment calendar and confirm the saved hours.'});
 else try{const config=cleanBookingConfig(JSON.parse(booking.config));checks.push({key:'booking_setup',status:config.enabled?'pass':'unknown',summary:config.enabled?'Saved booking rules are valid. This is not a live booking test.':'Native booking is paused in the saved settings.'});}catch{checks.push({key:'booking_setup',status:'fail',summary:'The saved booking settings could not be validated.'});}
 try{const connection=await verifiedEmailConnection();checks.push({key:'email_connection',status:connection?'pass':'unknown',summary:connection?'Saved sender verification is available. Inbox delivery has not been retested.':'Connect and verify the owner email sender.'});}catch{checks.push({key:'email_connection',status:'fail',summary:'The saved email connection could not be read.'});}
 const old=new Date(Date.now()-5*60*1000).toISOString();
 const pending=await database().prepare("SELECT (SELECT count(*) FROM owner_alerts WHERE status IN ('failed','uncertain') OR (status IN ('pending','sending') AND created_at<?))+(SELECT count(*) FROM customer_first_emails WHERE status IN ('failed','uncertain') OR (status IN ('pending','sending') AND created_at<?))+(SELECT count(*) FROM review_requests WHERE status IN ('failed','uncertain') OR (status='sending' AND created_at<?)) AS count").bind(old,old,old).first<{count:number}>();
 checks.push({key:'delivery_backlog',status:pending?.count?'fail':'pass',summary:pending?.count?'Saved delivery records need review in the response or review desk.':'No stalled or failed delivery records were found in this check.'});
 try{const latest=(await listAuditions()).latestPhone,catalogue=await auditionCatalogue();
  if(!latest||latest.agentId!==agentId||latest.agentVersion===null||latest.agentVersion!==agentVersion||Date.now()-Date.parse(latest.testedAt)>7*86400000)checks.push({key:'phone_audition',status:'unknown',summary:'Record a recent phone test for the observed agent and version.'});
  else{const summary=auditionSummary(latest,catalogue.hash),poor=[latest.naturalness,latest.interruptions,latest.pacing].some(n=>n!==null&&n<=2);checks.push({key:'phone_audition',status:summary.failed||poor?'fail':summary.notTested||!summary.scored||!summary.current||!latest.results.length?'unknown':'pass',summary:summary.failed||poor?'The latest reported phone test needs attention.':summary.notTested||!summary.scored||!summary.current||!latest.results.length?'The reported phone test has unfinished or out-of-date checks.':'The owner reported passing phone checks for this version. Audio is not automatically verified.'});}
 }catch{checks.push({key:'phone_audition',status:'unknown',summary:'Phone test evidence could not be checked.'});}
 return checks;
}
export async function runMonitoring(source:'owner'|'runner',force=false):Promise<MonitorRun>{
 await ensureSettings();const db=database(),started=Date.now(),startedAt=new Date(started).toISOString(),token=crypto.randomUUID();
 const latest=await latestMonitoringRun();
 // Recover committed observations before another check; superseded runs are inert.
 if(latest){await reconcileCheckIncidents(latest.checks,latest.id);scheduleMonitoringDelivery();}
 for(const pending of await pendingMonitoredCalls(20))await reconcileMonitoringCall(pending.callId);
 if(!force&&latest&&started>=Date.parse(latest.finishedAt)&&started-Date.parse(latest.finishedAt)<30000&&!(source==='runner'&&!latest.checks.some(c=>c.key==='monitor_runner'&&c.status==='pass'))){
  if(source==='runner')await db.prepare("UPDATE monitoring_settings SET last_runner_at=?,revision=revision+CASE WHEN runner_expected=0 THEN 1 ELSE 0 END,runner_expected=1 WHERE id='monitoring' AND last_runner_at<=?").bind(startedAt,startedAt).run();
  return latest;
 }
 const acquired=await db.prepare("UPDATE monitoring_settings SET lease_token=?,lease_until=? WHERE id='monitoring' AND lease_until<=? RETURNING id").bind(token,started+120000,started).first();
 if(!acquired)throw new RequestError(409,'A monitoring check is already running. Try again shortly.');
 try{
  let observed:Awaited<ReturnType<typeof readRetellMonitoring>>;
  try{observed=await readRetellMonitoring();}catch{observed={checks:[{key:'retell_connection',status:'unknown',summary:'Retell could not be checked. Review provider status and try again.'}],agentId:'',agentVersion:null,inboundNumber:'',configurationHash:null,webhookConnected:false,checkedAt:new Date().toISOString()};}
  const settings=await monitoringSettings(),checks=[...observed.checks,...await localChecks(observed.agentId,observed.agentVersion)];
  checks.push({key:'configuration_drift',status:!observed.configurationHash||!settings.baselineHash?'unknown':settings.baselineHash===observed.configurationHash?'pass':'fail',summary:!observed.configurationHash?'Current configuration could not be compared.':!settings.baselineHash?'Review and approve an observed configuration before tracking changes.':settings.baselineHash===observed.configurationHash?'Observed configuration matches the approved baseline.':'The observed configuration differs from the approved baseline. Review the change before approving it.'});
  const finishedAt=new Date().toISOString();
  checks.push(runnerCheck(source==='runner'?{...settings,lastRunnerAt:finishedAt,runnerExpected:true}:settings));
  const run:MonitorRun={id:crypto.randomUUID(),source,startedAt,finishedAt,checks,agentId:observed.agentId,agentVersion:observed.agentVersion,configurationHash:observed.configurationHash};
  const saved=await db.prepare("INSERT INTO monitoring_checks(id,source,started_at,finished_at,checks,agent_id,agent_version,configuration_hash) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitoring_settings WHERE id='monitoring' AND lease_token=? AND lease_until>?) RETURNING id").bind(run.id,source,startedAt,finishedAt,JSON.stringify(checks),run.agentId,run.agentVersion,run.configurationHash,token,Date.now()).first();
  if(!saved)throw new RequestError(409,'This check expired before it could be saved. Run a fresh check.');
  if(source==='runner')await db.prepare("UPDATE monitoring_settings SET last_runner_at=?,revision=revision+CASE WHEN runner_expected=0 THEN 1 ELSE 0 END,runner_expected=1 WHERE id='monitoring' AND lease_token=?").bind(finishedAt,token).run();
  await reconcileCheckIncidents(checks,run.id);
  scheduleMonitoringDelivery();
  try{await db.prepare('DELETE FROM monitoring_checks WHERE id IN (SELECT id FROM monitoring_checks WHERE finished_at<? ORDER BY finished_at LIMIT 1000)').bind(new Date(Date.now()-30*86400000).toISOString()).run();}catch{console.error('Monitoring retention cleanup is pending.');}
  return run;
 }finally{try{await db.prepare("UPDATE monitoring_settings SET lease_token='',lease_until=0 WHERE id='monitoring' AND lease_token=?").bind(token).run();}catch{console.error('Monitoring lease will expire automatically.');}}
}
export async function approveMonitoringBaseline(data:Record<string,unknown>){
 if(data.confirmed!==true||typeof data.runId!=='string'||!UUID.test(data.runId)||!Number.isSafeInteger(data.revision))throw new RequestError(400,'Review the observed configuration and confirm it.');
 const run=await latestMonitoringRun();
 if(!run||run.id!==data.runId||!run.configurationHash||(!Number.isFinite(Date.parse(run.finishedAt))||Date.parse(run.finishedAt)>Date.now()+60000||Date.now()-Date.parse(run.finishedAt)>MONITOR_BASELINE_MAX_AGE_MS))throw new RequestError(409,'Run a fresh check before approving the current configuration.');
 const observed=await readRetellMonitoring();
 if(observed.configurationHash!==run.configurationHash||observed.agentId!==run.agentId||observed.agentVersion!==run.agentVersion||!['retell_connection','phone_routing','agent_configuration','voice_tools'].every(key=>observed.checks.some(c=>c.key===key&&c.status==='pass')))throw new RequestError(409,'The observed configuration changed or is incomplete. Run a fresh check and review it.');
 const saved=await database().prepare("UPDATE monitoring_settings SET baseline_hash=?,baseline_agent_id=?,baseline_agent_version=?,baseline_at=?,revision=revision+1,updated_at=? WHERE id='monitoring' AND revision=? AND lease_until<=? AND (SELECT id FROM monitoring_checks ORDER BY finished_at DESC,id DESC LIMIT 1)=? RETURNING id").bind(run.configurationHash,run.agentId,run.agentVersion,new Date().toISOString(),new Date().toISOString(),Number(data.revision),Date.now(),run.id).first();
 if(!saved)throw new RequestError(409,'Monitoring settings changed or a check is running. Refresh before approving.');
 return monitoringSettings();
}
export async function connectMonitoringEvents(origin:string){await connectRetellCallEvents(origin);return runMonitoring('owner',true);}
export async function reconcileMonitoringCall(callId:string){
 await ensureSettings();
 const call=await getMonitoredCall(callId);if(!call)return;
 for(const kind of call.flagCodes)await openCallIncident(callId,kind,'');
 await markMonitoredCallReconciled(callId,call.observationRevision);
 scheduleMonitoringDelivery();
}
