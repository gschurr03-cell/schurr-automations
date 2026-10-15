export type MonitoringCheck={key:string;status:'pass'|'fail'|'unknown';summary:string};
export type MonitorRun={id:string;source:'owner'|'runner';startedAt:string;finishedAt:string;checks:MonitoringCheck[];agentId:string;agentVersion:number|null;configurationHash:string|null};
export type MonitoringSettingsView={revision:number;alertsEnabled:boolean;baselineHash:string;baselineAgentId:string;baselineAgentVersion:number|null;baselineAt:string;lastRunnerAt:string;runnerExpected:boolean;runnerConfigured:boolean};
export const MONITOR_FRESH_MS=15*60*1000;
export const MONITOR_BASELINE_MAX_AGE_MS=10*60*1000;
export const MONITOR_CHECK_LABELS:Record<string,string>={database:'Application database',retell_connection:'Retell access',phone_routing:'Phone routing',agent_configuration:'Active agent',event_webhook:'Call events',voice_tools:'Receptionist tools',configuration_drift:'Approved configuration',booking_setup:'Booking settings',email_connection:'Email connection evidence',delivery_backlog:'Delivery recovery',monitor_runner:'Background checks',phone_audition:'Reported phone test'};
export function monitoringSummary(run:MonitorRun|null,now=Date.now()){
 if(!run)return {status:'unknown',label:'Not checked yet'};
 const finished=Date.parse(run.finishedAt);
 if(!Number.isFinite(finished)||now-finished>MONITOR_FRESH_MS||finished>now+60000)return {status:'unknown',label:'Check is out of date'};
 if(run.checks.some(c=>c.status==='fail'))return {status:'fail',label:'Needs attention'};
 if(!Object.keys(MONITOR_CHECK_LABELS).every(key=>run.checks.some(c=>c.key===key))||run.checks.some(c=>c.status==='unknown'))return {status:'unknown',label:'Checks incomplete'};
 return {status:'pass',label:'Checks passed'};
}
export function runnerCheck(settings:MonitoringSettingsView,now=Date.now()):MonitoringCheck{
 if(!settings.runnerConfigured)return {key:'monitor_runner',status:'unknown',summary:'The private monitoring connection has not been configured.'};
 if(!settings.runnerExpected)return {key:'monitor_runner',status:'unknown',summary:'Connect an external monitor to run checks while this workspace is closed.'};
 const time=Date.parse(settings.lastRunnerAt);
 if(!Number.isFinite(time))return {key:'monitor_runner',status:'unknown',summary:'Waiting for the first authenticated background check.'};
 if(now-time>MONITOR_FRESH_MS||time>now+60000)return {key:'monitor_runner',status:'fail',summary:'No background check has arrived in the last 15 minutes. Check the external monitor.'};
 return {key:'monitor_runner',status:'pass',summary:'An authenticated background check arrived within the last 15 minutes.'};
}
