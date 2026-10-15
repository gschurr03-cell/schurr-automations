"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {AuditionCheck} from '@/lib/receptionist-audition-policy';

export function localTestTimestamp(value:string){
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
 if(!match)return null;
 const [year,month,day,hour,minute]=match.slice(1).map(Number),time=new Date(value);
 if(!Number.isFinite(time.getTime())||time.getFullYear()!==year||time.getMonth()+1!==month||time.getDate()!==day||time.getHours()!==hour||time.getMinutes()!==minute)return null;
 return time.toISOString();
}
export default function AuditionForm({checks,catalogueHash,savedAgentId}:{checks:AuditionCheck[];catalogueHash:string;savedAgentId:string}){
 const router=useRouter(),frozen=useRef<Record<string,unknown>|null>(null),uncertain=useRef(false);
 const [pending,setPending]=useState(false),[locked,setLocked]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[mustRefresh,setMustRefresh]=useState(false),[conflictSnapshot,setConflictSnapshot]=useState(''),[deviceTimezone,setDeviceTimezone]=useState('your device’s timezone');
 useEffect(()=>{setDeviceTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);},[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending||mustRefresh)return;
  const form=event.currentTarget;setError('');setMessage('');
  if(!frozen.current){
   const data=new FormData(form),field=(name:string)=>String(data.get(name)||'');
   const testedAt=localTestTimestamp(field('testedAt'));if(!testedAt){setError('Enter a valid local test time. Times skipped by daylight saving cannot be recorded.');return;}
   const score=(name:string)=>field(name)?Number(field(name)):null;
   frozen.current={requestKey:crypto.randomUUID(),catalogueHash,environment:field('environment'),testedAt,agentId:field('agentId'),agentVersion:field('agentVersion')?Number(field('agentVersion')):null,configEvidence:field('configEvidence'),notes:field('notes'),naturalness:score('naturalness'),interruptions:score('interruptions'),pacing:score('pacing'),confirmed:data.get('confirmed')==='on',results:checks.map(check=>({id:check.id,outcome:field(check.id+'-outcome'),notes:field(check.id+'-notes')}))};
  }
  setPending(true);setLocked(true);let definitiveRejection=false;
  try{
   const response=await fetch('/api/manage/receptionist-auditions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(frozen.current)});
   const result=await response.json() as {ok?:boolean;error?:string;duplicate?:boolean};
   if(!response.ok||!result.ok){
    if([400,401,403,409,413,415,422].includes(response.status))definitiveRejection=true;
    if([400,401,403,413,415,422].includes(response.status)&&!uncertain.current){frozen.current=null;setLocked(false);}
    if(response.status===409){setMustRefresh(true);setConflictSnapshot(JSON.stringify({notice:'Submitted audition draft, not proof of a saved test result. Review the current checklist before any new submission.',submission:frozen.current,checklist:checks},null,2));}
    throw new Error(result.error||'The save could not be confirmed.');
   }
   frozen.current=null;uncertain.current=false;setLocked(false);form.reset();setMessage(result.duplicate?'Your earlier save was confirmed. No duplicate session was created.':'Audition recorded. Its results and configuration evidence are now fixed.');router.refresh();
  }catch(error){if(!definitiveRejection)uncertain.current=true;setError(error instanceof Error?error.message:'The save could not be confirmed.');}
  finally{setPending(false);}
 }
 return <section className="crm-panel"><h2>Record a test session</h2><p className="crm-help">Use one environment and one agent configuration per session. Leave checks you did not perform as not tested. Record browser or simulation checks separately from real phone calls.</p>
  <form className="crm-form" onSubmit={submit}>
   <fieldset disabled={pending||locked} style={{border:0,padding:0,margin:0,minWidth:0}}>
    <div className="crm-field-grid">
     <label>Test environment<select name="environment" required defaultValue=""><option value="" disabled>Choose an environment</option><option value="phone">Real phone call</option><option value="browser">Browser or simulation</option></select></label>
     <label>When you tested<input name="testedAt" type="datetime-local" required/><span className="crm-help">Local time in {deviceTimezone}.</span></label>
     <label>Agent ID tested<input name="agentId" required maxLength={120} pattern="agent_[A-Za-z0-9_\-]+" placeholder="Copy from Retell" autoComplete="off" defaultValue={savedAgentId}/></label>
     <label>Agent version tested (optional)<input name="agentVersion" type="number" min="0" step="1" placeholder="Not recorded"/><span className="crm-help">Enter it if known, including 0 for a draft. Blank means version not recorded.</span></label>
    </div>
    <label>Configuration evidence<textarea name="configEvidence" required maxLength={2000} rows={3} placeholder="Voice ID, voice speed, model, interruption settings and draft/published state you checked in Retell."/></label>
    <p className="crm-help">When available, the agent ID starts from this app’s saved connection and remains editable. These details are owner-reported. Saving does not inspect Retell, verify the active number’s route, place a call or change an agent.</p>
    <div className="crm-field-grid">{[['naturalness','Naturalness'],['interruptions','Interruptions'],['pacing','Pacing']].map(([name,label])=><label key={name}>{label}<select name={name} defaultValue=""><option value="">Not scored</option>{[1,2,3,4,5].map(score=><option key={score} value={score}>{score}{score===1?' · Poor':score===5?' · Excellent':''}</option>)}</select></label>)}</div>
    <p className="crm-help">Score what you heard from 1 (poor) to 5 (excellent). For interruptions, score how well it lets you speak and handles a deliberate interruption.</p>
    {checks.map((check,index)=><details className="crm-add-details" key={check.id} open={index===0}><summary>{index+1}. {check.title}</summary><p>{check.scenario}</p><p className="crm-help">Pass: {check.expected}</p><label>Result for {check.title}<select name={check.id+'-outcome'} defaultValue="not_tested"><option value="not_tested">Not tested</option><option value="pass">Pass</option><option value="fail">Fail</option></select></label><label>Notes for {check.title}<textarea name={check.id+'-notes'} rows={2} maxLength={500} placeholder="Brief observations; no customer details or transcript."/></label></details>)}
    <label>Session notes<textarea name="notes" maxLength={1000} rows={3} placeholder="Device, reception, room noise or what to retest."/></label>
    <p className="crm-help">Use fictional details for tests. Keep customer contact details, transcripts, credentials and recordings out of this log. Saved sessions cannot be edited; record a new session to correct or retest.</p>
    <label className="automation-checkbox"><input name="confirmed" type="checkbox" required/> I performed these tests and these entries reflect what I observed.</label>
   </fieldset>
   {error&&<div className="crm-alert" role="alert"><p>{error}</p><p className="crm-help">{mustRefresh?'Copy the submitted draft below before refreshing to review the current checklist and saved history. This conflicting submission will not be retried or assigned a new save key.':locked?'The submitted results are locked for a safe retry. You can also refresh to review saved history before starting another session.':'Your observations remain in this form. Correct the issue and save again.'}</p></div>}
   {conflictSnapshot&&<label>Submitted draft to keep before refreshing<textarea aria-describedby="audition-conflict-help" readOnly rows={12} value={conflictSnapshot} onFocus={event=>event.currentTarget.select()}/><span id="audition-conflict-help" className="crm-help">Select this text and copy it to keep your observations and original checklist. This is a draft snapshot, not a saved audition receipt.</span></label>}
   {message&&<p className="crm-alert crm-alert-success" role="status">{message}</p>}
   <div className="crm-actions">{!mustRefresh&&<button className="crm-button" disabled={pending} type="submit">{pending?'Saving…':locked?'Retry this save':'Save audition'}</button>}{locked&&!pending&&<a className="crm-button crm-button-secondary" href="/manage/receptionist/auditions">Refresh history</a>}</div>
  </form>
 </section>;
}
