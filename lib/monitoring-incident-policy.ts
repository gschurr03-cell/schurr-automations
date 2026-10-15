import {RequestError} from './inquiries';
import {OWNER_ALERT_EMAIL,OWNER_ALERT_FROM,OWNER_ALERT_ORIGIN} from './owner-alert-content';

export const MONITORING_CHECK_SUMMARIES={
 database:'The monitoring database check failed.',
 retell_connection:'The saved receptionist connection needs attention.',
 phone_routing:'The monitored inbound phone routing check failed.',
 agent_configuration:'The monitored receptionist configuration check failed.',
 event_webhook:'The monitored call-event webhook check failed.',
 voice_tools:'The monitored receptionist tool configuration check failed.',
 configuration_drift:'The monitored receptionist configuration differs from the approved baseline.',
 booking_setup:'The monitored booking setup check failed.',
 email_connection:'The monitored owner email connection check failed.',
 delivery_backlog:'The monitored delivery backlog needs attention.',
 monitor_runner:'The scheduled monitoring check did not run within its expected window.',
 phone_audition:'The recorded phone audition check needs attention.',
} as const;
export const MONITORING_CALL_SUMMARIES={
 provider_error:'A verified call event reported a provider error.',
 tool_error:'A verified call event reported a tool error.',
 quality_review:'A verified call event was flagged for owner quality review.',
} as const;
export type MonitoringCheckKey=keyof typeof MONITORING_CHECK_SUMMARIES;
export type MonitoringCallKind=keyof typeof MONITORING_CALL_SUMMARIES;
export const MONITORING_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function monitoringId(value:unknown){if(typeof value!=='string'||!MONITORING_UUID.test(value))throw new RequestError(400,'Choose a valid monitoring record.');return value.toLowerCase();}
export function knownCheck(value:unknown):MonitoringCheckKey{if(typeof value!=='string'||!Object.hasOwn(MONITORING_CHECK_SUMMARIES,value))throw new RequestError(400,'Unknown monitoring check.');return value as MonitoringCheckKey;}
export function knownCallKind(value:unknown):MonitoringCallKind{if(typeof value!=='string'||!Object.hasOwn(MONITORING_CALL_SUMMARIES,value))throw new RequestError(400,'Unknown monitored call event.');return value as MonitoringCallKind;}
export async function monitoringHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
export function monitoringPayload(incidentId:string,summary:string,kind:'opened'|'resolved',resolutionKind='' ){
 const message=kind==='opened'?'A monitoring incident was opened.':resolutionKind==='check_pass'?'A later check passed for this incident.':'The owner manually closed this incident. This is not verified recovery.';
 return JSON.stringify({from:OWNER_ALERT_FROM,to:[OWNER_ALERT_EMAIL],subject:kind==='opened'?'Schurr monitoring: attention needed':'Schurr monitoring: incident closed',text:[message,summary,`Incident: ${incidentId}`,'A monitoring result does not verify phone audio quality or every connected service.',`Review current status: ${OWNER_ALERT_ORIGIN}/manage/monitoring`].join('\n\n')});
}
