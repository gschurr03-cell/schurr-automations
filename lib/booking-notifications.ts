import {database} from './inquiries';
import {contentHash} from './automation-desk';
import {scheduleOwnerAlert} from './owner-alerts';
import {OWNER_ALERT_EMAIL,OWNER_ALERT_FROM,OWNER_ALERT_ORIGIN} from './owner-alert-content';
import type {Appointment} from './booking';
type Notice=Pick<Appointment,'id'|'name'|'start'|'end'|'timezone'|'status'|'notes'|'revision'>;
export async function bookingNoticeId(id:string,revision:number){const hash=await contentHash(`appointment:${id}:${revision}`);return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;}
export async function bookingNoticeStatement(a:Notice){
 const id=await bookingNoticeId(a.id,a.revision),action=a.status==='cancelled'?'cancelled':a.revision>1?'rescheduled':'booked';
 const format=new Intl.DateTimeFormat('en-US',{timeZone:a.timezone,weekday:'long',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 const payload=JSON.stringify({from:OWNER_ALERT_FROM,to:[OWNER_ALERT_EMAIL],subject:`Meeting ${action}: ${a.name}`,text:[`Your meeting was ${action}.`,a.name,`When: ${format.format(a.start)}`,`Length: ${(a.end-a.start)/60000} minutes`,a.notes,`Open your calendar: ${OWNER_ALERT_ORIGIN}/manage/schedule`,`Reference: ${a.id}`,'Check the calendar for the latest details. Outside calendars are not synced.'].join('\n\n'),tags:[{name:'purpose',value:'appointment_update'}]});
 return database().prepare(`INSERT INTO owner_alerts(id,lead_id,payload,created_at) SELECT ?,COALESCE(j.lead_id,c.id),?,? FROM appointments a JOIN response_jobs j ON j.id=a.response_id LEFT JOIN crm_leads c ON c.inquiry_id=j.inquiry_id WHERE a.id=? AND a.kind='meeting' AND a.revision=? AND a.status=? AND COALESCE(j.lead_id,c.id) IS NOT NULL ON CONFLICT(id) DO NOTHING`).bind(id,payload,new Date().toISOString(),a.id,a.revision,a.status);
}
export async function scheduleBookingNotice(a:Pick<Appointment,'id'|'revision'|'kind'>){try{if(a.kind==='meeting')scheduleOwnerAlert(await bookingNoticeId(a.id,a.revision));}catch{console.error('Booking saved; owner alert remains queued.');}}
