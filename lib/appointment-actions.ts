import {bookingNoticeStatement,scheduleBookingNotice} from './booking-notifications';
import {database,RequestError} from './inquiries';
import {validId} from './crm';
import {contentHash} from './automation-desk';
import {bookingSetup,cancelAppointment,type Appointment} from './booking';
import {candidateSlots,localParts} from './booking-policy';
const SELECT='id,response_id AS responseId,kind,name,start_ms AS start,end_ms AS end,timezone,status,notes,revision,created_at AS createdAt';
export async function currentCallAppointment(callSid:string){return database().prepare(`SELECT ${SELECT} FROM appointments WHERE request_key=?`).bind(`voice:${callSid}`).first<Appointment>();}
export async function changeAppointment(data:Record<string,unknown>,callSid?:string){
 const db=database(),action=data.action;if(action!=='reschedule'&&action!=='cancel')throw new RequestError(400,'Choose reschedule or cancel.');if(data.confirmed!==true)throw new RequestError(400,'Confirm this appointment change first.');
 const target=callSid?await currentCallAppointment(callSid):await db.prepare(`SELECT ${SELECT} FROM appointments WHERE id=?`).bind(validId(data.id)).first<Appointment>();if(!target)throw new RequestError(404,'No appointment was found for this request.');
 const revision=Number(data.appointmentRevision);if(!Number.isSafeInteger(revision)||revision<1)throw new RequestError(400,'Refresh the appointment.');
 const key=callSid?`call:${callSid}:${action}:${revision}`:'owner:'+validId(data.requestKey),scope=callSid?`call:${callSid}`:'owner';
 const start=Number(data.start),scheduleRevision=Number(data.scheduleRevision),phone=callSid?'':String(data.confirmedPhone||'');
 const hash=await contentHash(JSON.stringify({id:target.id,scope,action,revision,...(action==='reschedule'?{start,scheduleRevision,phone}:{})}));
 const prior=()=>db.prepare('SELECT request_hash AS hash,to_revision AS toRevision,attempt_id AS attemptId FROM appointment_operations WHERE id=?').bind(key).first<{hash:string;toRevision:number;attemptId:string}>();
 const receipt=await prior();if(receipt){if(receipt.hash!==hash)throw new RequestError(409,'This change reference already has different details.');const current=await db.prepare(`SELECT ${SELECT} FROM appointments WHERE id=?`).bind(target.id).first<Appointment>();if(!current)throw new RequestError(404,'Appointment removed.');await scheduleBookingNotice(current);return {appointment:current,duplicate:true,superseded:current.revision!==receipt.toRevision};}
 if(target.status!=='booked'||target.revision!==revision)throw new RequestError(409,'The appointment changed or was cancelled. Refresh it.');
 const now=new Date().toISOString(),attempt=crypto.randomUUID(),guardValues:(string|number|null)[]=[target.id,revision],guards=["a.id=? AND a.revision=? AND a.status='booked'"];
 let end=target.end,buffer=0,timezone=target.timezone,notes=target.notes;
 if(callSid){guards.push('a.request_key=?');guardValues.push(`voice:${callSid}`);}
 if(action==='reschedule'){
  const setup=await bookingSetup();if(target.kind!=='meeting'||!setup.config.enabled||scheduleRevision!==setup.revision||!Number.isSafeInteger(start)||!candidateSlots(setup.config,localParts(start,setup.config.timezone).date).some(s=>s.start===start))throw new RequestError(409,'Booking is paused, the schedule changed, or this time is unavailable.');
  end=start+setup.config.duration*60000;buffer=setup.config.buffer*60000;timezone=setup.config.timezone;
  const contact=await db.prepare(`SELECT COALESCE(w.phone,c.phone,i.phone,'') AS phone,j.confirmed_phone AS confirmedPhone FROM response_jobs j LEFT JOIN inquiries i ON i.id=j.inquiry_id LEFT JOIN crm_leads c ON c.id=j.lead_id LEFT JOIN crm_leads w ON w.inquiry_id=j.inquiry_id WHERE j.id=?`).bind(target.responseId).first<{phone:string;confirmedPhone:string}>();
  const confirmedPhone=callSid?contact?.confirmedPhone:phone;if(!contact?.phone||contact.phone!==confirmedPhone)throw new RequestError(409,'The confirmed contact changed. Review it before rescheduling.');notes='Phone appointment. Gavin will call '+confirmedPhone+'.';
  guards.push("COALESCE((SELECT revision FROM booking_settings WHERE id='main'),0)=?");guardValues.push(setup.revision);
  guards.push("NOT EXISTS(SELECT 1 FROM appointments other WHERE other.id!=a.id AND other.status='booked' AND other.busy_start_ms<? AND other.busy_end_ms>?)");guardValues.push(end+buffer,start-buffer);
  guards.push(`EXISTS(SELECT 1 FROM response_jobs j LEFT JOIN inquiries i ON i.id=j.inquiry_id LEFT JOIN crm_leads c ON c.id=j.lead_id LEFT JOIN crm_leads w ON w.inquiry_id=j.inquiry_id WHERE j.id=a.response_id AND j.status!='paused' AND COALESCE(w.phone,c.phone,i.phone,'')=? AND NOT EXISTS(SELECT 1 FROM voice_call_controls v WHERE 'call:'||v.call_sid=j.source_key) AND (?=0 OR (j.confirmed_phone=? AND j.channel='phone' AND COALESCE(w.preferred_contact,c.preferred_contact,i.preferred_contact)='phone' AND EXISTS(SELECT 1 FROM retell_connection WHERE id='retell' AND mode='live'))))`);guardValues.push(confirmedPhone,callSid?1:0,confirmedPhone);
 }
 const admitted='EXISTS(SELECT 1 FROM appointment_operations WHERE id=? AND request_hash=? AND attempt_id=?)';
 await db.batch([
  db.prepare(`INSERT INTO appointment_operations(id,request_hash,attempt_id,appointment_id,action,actor_scope,from_revision,to_revision,created_at) SELECT ?,?,?,a.id,?,?,a.revision,a.revision+1,? FROM appointments a WHERE ${guards.join(' AND ')} ON CONFLICT(id) DO NOTHING`).bind(key,hash,attempt,action,scope,now,...guardValues),
  action==='reschedule'?db.prepare(`UPDATE appointments SET start_ms=?,end_ms=?,busy_start_ms=?,busy_end_ms=?,timezone=?,notes=?,schedule_revision=?,revision=revision+1,updated_at=? WHERE id=? AND ${admitted}`).bind(start,end,start-buffer,end+buffer,timezone,notes,scheduleRevision,now,target.id,key,hash,attempt):db.prepare(`UPDATE appointments SET status='cancelled',revision=revision+1,updated_at=? WHERE id=? AND ${admitted}`).bind(now,target.id,key,hash,attempt),
  db.prepare(`INSERT INTO response_outcomes(response_id,outcome,note,recorded_at) SELECT response_id,?,?,? FROM appointments WHERE id=? AND response_id IS NOT NULL AND ${admitted} ON CONFLICT(response_id) DO UPDATE SET outcome=excluded.outcome,note=excluded.note,recorded_at=excluded.recorded_at`).bind(action==='cancel'?'booking_cancelled':'booked',action==='cancel'?'Appointment cancelled; follow-ups remain stopped.':'Phone appointment rescheduled.',now,target.id,key,hash,attempt),
  db.prepare(`UPDATE response_followups SET status='cancelled',reason='Appointment changed; no automatic follow-up.',revision=revision+1,updated_at=? WHERE response_id=? AND status='open' AND ${admitted}`).bind(now,target.responseId,key,hash,attempt),
  await bookingNoticeStatement({...target,start:action==='reschedule'?start:target.start,end,timezone,notes,status:action==='cancel'?'cancelled':'booked',revision:target.revision+1}),
 ]);
 const saved=await prior();if(!saved)throw new RequestError(409,'That time was taken or the request changed. This change was not applied; check the current appointment.');if(saved.hash!==hash)throw new RequestError(409,'This change reference already has different details.');const current=await db.prepare(`SELECT ${SELECT} FROM appointments WHERE id=?`).bind(target.id).first<Appointment>();if(!current)throw new RequestError(404,'Appointment removed.');await scheduleBookingNotice(current);return {appointment:current,duplicate:saved.attemptId!==attempt,superseded:current.revision!==saved.toRevision};
}

// Preserve old owner action URLs while routing every meeting cancellation through the ledger.
export async function cancelOwnerAppointment(data:Record<string,unknown>){
 const row=await database().prepare('SELECT kind FROM appointments WHERE id=?').bind(validId(data.id)).first<{kind:string}>();
 if(!row)throw new RequestError(404,'Appointment not found.');
 if(row.kind==='block')return cancelAppointment(data);
 return changeAppointment({action:'cancel',id:data.id,requestKey:data.requestKey||data.id,appointmentRevision:data.revision,confirmed:true});
}
