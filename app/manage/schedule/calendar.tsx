'use client';
import {useEffect,useMemo,useRef,useState,useTransition} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {ChevronLeft,ChevronRight,Plus} from 'lucide-react';
import type {Appointment,BookingSetup} from '@/lib/booking';
import {calendarDays,calendarDate,calendarDayGroups,calendarDayLabel,calendarTime,shiftCalendarMonth} from '@/lib/calendar-view';
import {AppointmentActions,AppointmentForm,BlockTimeForm,RescheduleForm,type RequestChoice} from './workspace';
type CalendarAppointment=Appointment&{currentPhone:string};
export default function AppointmentCalendar({month,today,appointments,truncated,setup,requests,initialRequest}:{month:string;today:string;appointments:CalendarAppointment[];truncated:boolean;setup:BookingSetup;requests:RequestChoice[];initialRequest?:string}){
 const router=useRouter(),params=useSearchParams(),[loading,startTransition]=useTransition(),editorHeading=useRef<HTMLHeadingElement>(null);
 const days=calendarDays(month),timezone=setup.config.timezone;
 const [selection,setSelection]=useState(today),[editor,setEditor]=useState<'meeting'|'block'|null>(initialRequest?'meeting':null),[forms,setForms]=useState({meeting:{date:today,version:0,started:Boolean(initialRequest)},block:{date:today,version:0,started:false}}),[message,setMessage]=useState('');
 useEffect(()=>{if(editor){editorHeading.current?.focus({preventScroll:true});editorHeading.current?.scrollIntoView({block:'nearest'});}},[editor]);
 const selected=days.includes(selection)?selection:month===today.slice(0,7)?today:month+'-01';
 const byDay=useMemo(()=>calendarDayGroups(appointments,days,timezone),[appointments,month,timezone]),dayItems=byDay[selected]||[],booked=dayItems.filter(a=>a.status==='booked'),cancelled=dayItems.filter(a=>a.status==='cancelled');
 function navigate(target:string,day=target+'-01'){const query=new URLSearchParams(params.toString());query.set('month',target);setSelection(day);startTransition(()=>router.push('/manage/schedule?'+query.toString(),{scroll:false}));}
 function openEditor(kind:'meeting'|'block'){setForms(current=>current[kind].started?current:{...current,[kind]:{date:selected,version:current[kind].version+1,started:true}});setEditor(kind);setMessage('');}
 function saved(kind:'meeting'|'block'){setMessage(kind==='block'?'Blocked time saved.':'Appointment saved.');setEditor(null);setForms(current=>({...current,[kind]:{...current[kind],started:false}}));}
 function timeRange(a:CalendarAppointment){const first=calendarDate(a.start,timezone),last=calendarDate(a.end,timezone);return `${first!==selected?calendarDayLabel(first,{month:'short',day:'numeric'})+' · ':''}${calendarTime(a.start,timezone,true)} – ${last!==selected?calendarDayLabel(last,{month:'short',day:'numeric'})+' · ':''}${calendarTime(a.end,timezone,true)}`;}
 function appointmentDetails(a:CalendarAppointment){return <details className={'schedule-appointment'+(a.status==='cancelled'?' schedule-cancelled':'')} key={a.id}>
  <summary><span className="schedule-appointment-time">{timeRange(a)}</span><strong>{a.name}</strong><span className="schedule-appointment-kind">{a.status==='cancelled'?'Cancelled':a.kind==='block'?'Blocked time':'Phone appointment'}</span></summary>
  <div className="schedule-appointment-body">{a.currentPhone&&a.kind==='meeting'&&<p><a href={'tel:'+a.currentPhone}>{a.currentPhone}</a></p>}{a.notes&&<p className="crm-help">{a.notes}</p>}<AppointmentActions appointment={a}/><RescheduleForm appointment={a} setup={setup} phone={a.currentPhone}/></div>
 </details>;}
 return <>
  <section className="schedule-calendar crm-panel" aria-label="Appointment calendar" aria-busy={loading}>
   <div className="schedule-toolbar"><div><h2>{calendarDayLabel(month+'-01',{month:'long',year:'numeric'})}</h2><p className="schedule-timezone">{timezone.replaceAll('_',' ')} · {setup.config.duration}-minute calls</p></div>
    <div className="schedule-toolbar-actions"><div className="schedule-month-controls" aria-label="Calendar navigation"><button type="button" className="crm-button crm-button-secondary" aria-label="Previous month" disabled={loading||month==='1900-01'} onClick={()=>navigate(shiftCalendarMonth(month,-1))}><ChevronLeft size={18} aria-hidden="true"/></button><button type="button" className="crm-button crm-button-secondary" disabled={loading} onClick={()=>navigate(today.slice(0,7),today)}>Today</button><button type="button" className="crm-button crm-button-secondary" aria-label="Next month" disabled={loading||month==='2199-12'} onClick={()=>navigate(shiftCalendarMonth(month,1))}><ChevronRight size={18} aria-hidden="true"/></button></div>
    <button type="button" className="crm-button" onClick={()=>openEditor('meeting')} aria-expanded={editor==='meeting'} aria-controls="new-booking"><Plus size={17} aria-hidden="true"/> Add appointment</button></div>
   </div>
   {truncated&&<p className="crm-alert" role="alert">This month contains more than 500 records. Some appointments are not shown; check incoming requests before planning more calls.</p>}
   <div className="schedule-layout"><div className="schedule-month">
    <div className="schedule-weekdays" aria-hidden="true">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span key={d}>{d}</span>)}</div>
    <div className="schedule-days" role="group" aria-label={calendarDayLabel(month+'-01',{month:'long',year:'numeric'})}>
     {days.map(day=>{const items=(byDay[day]||[]).filter(a=>a.status==='booked'),meetings=items.filter(a=>a.kind!=='block').length,blocks=items.length-meetings;return <button type="button" key={day} className={'schedule-day'+(day.slice(0,7)!==month?' schedule-outside':'')+(day===today?' schedule-today':'')+(day===selected?' schedule-selected':'')} aria-pressed={day===selected} aria-current={day===today?'date':undefined} aria-label={`${calendarDayLabel(day,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}${day===today?', today':''}, ${meetings} appointment${meetings===1?'':'s'}, ${blocks} blocked period${blocks===1?'':'s'}`} onClick={()=>setSelection(day)}>
      <span className="schedule-day-number">{Number(day.slice(-2))}</span><span className="schedule-cell-events" aria-hidden="true">{items.slice(0,2).map(a=><span key={a.id} className={'schedule-cell-event'+(a.kind==='block'?' schedule-cell-block':'')}><span>{a.kind==='block'?'Blocked':calendarDate(a.start,timezone)<day?'Continues':calendarTime(a.start,timezone)}</span> {a.name}</span>)}{items.length>2&&<span className="schedule-more">+{items.length-2} more</span>}</span>{items.length>0&&<span className="schedule-mobile-count" aria-hidden="true">{items.length}<span className="schedule-count-dot"/></span>}
     </button>;})}
    </div><p className="schedule-calendar-note">Select a date to view its appointments.</p>
   </div>
   <aside className="schedule-agenda" aria-label="Selected day"><div className="schedule-agenda-heading"><p>{calendarDayLabel(selected,{weekday:'long'})}</p><h3>{calendarDayLabel(selected,{month:'long',day:'numeric'})}</h3></div>
    <div aria-live="polite"><p className="schedule-day-total">{booked.length?`${booked.length} scheduled ${booked.length===1?'item':'items'}`:'No appointments or blocks'}</p></div>
    {booked.length?booked.map(appointmentDetails):<p className="crm-help">Choose another date or add an appointment.</p>}
    {cancelled.length>0&&<details className="schedule-cancelled-list"><summary>{cancelled.length} cancelled {cancelled.length===1?'appointment':'appointments'}</summary>{cancelled.map(appointmentDetails)}</details>}
    <button type="button" className="schedule-text-button" onClick={()=>openEditor('block')} aria-expanded={editor==='block'} aria-controls="block-time">Block time on this date</button>
   </aside></div>
  </section>
  {message&&<p role="status" className="crm-alert crm-alert-success">{message}</p>}
  <section className="crm-panel schedule-editor" hidden={!editor} aria-label="Add to calendar"><div className="crm-section-heading"><h2 ref={editorHeading} tabIndex={-1}>{editor==='block'?'Block time':'Add appointment'}</h2><button type="button" className="crm-button crm-button-secondary" onClick={()=>setEditor(null)}>Close</button></div>
   <div id="new-booking" hidden={editor!=='meeting'}><AppointmentForm key={'meeting-'+forms.meeting.version} setup={setup} requests={requests} initialRequest={initialRequest} today={forms.meeting.date} onSaved={()=>saved('meeting')}/></div>
   <div id="block-time" hidden={editor!=='block'}><BlockTimeForm key={'block-'+forms.block.version} setup={setup} initialDate={forms.block.date} onSaved={()=>saved('block')}/></div>
  </section>
 </>;
}
