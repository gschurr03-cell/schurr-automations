'use client';
import {useEffect,useRef,useState} from 'react';
import MailWorkspace,{readSnapshot,post} from './workspace';
import type {Snapshot} from '@/lib/gmail-workspace';

export function InlineMailReview({draftId,onManualAllowed}:{draftId:string;onManualAllowed:(allowed:boolean)=>void}){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let current=true;onManualAllowed(false);setData(null);setError('');readSnapshot(1,draftId).then(next=>{if(current){setData(next);onManualAllowed(next.approved.some(d=>d.id===draftId)&&!next.outbox.some(r=>r.draft_id===draftId&&(!['prepared','cancelled'].includes(r.status)||r.first_attempt_at!==0)));}}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[draftId,retry]);
 if(error)return <div role="alert" className="crm-alert crm-alert-error"><p>{error}</p><button type="button" className="crm-button crm-button-secondary" onClick={()=>setRetry(n=>n+1)}>Reload send review</button></div>;
 if(!data)return <p role="status">Loading the saved email and Gmail status…</p>;
 return <MailWorkspace initial={data} selectedDraft={draftId} embedded onSendStarted={()=>onManualAllowed(false)}/>;
}

export function GmailQuickStatus({paused=false,onSync}:{paused?:boolean;onSync:()=>unknown}){
 const [data,setData]=useState<Snapshot|null>(null),[working,setWorking]=useState(false),[error,setError]=useState('');
 const running=useRef(false),callback=useRef(onSync),lastCheck=useRef(0),mounted=useRef(false);
 callback.current=onSync;
 async function check(manual=false){
  if(running.current||paused||(!manual&&document.visibilityState!=='visible'))return;
  if(!manual&&Date.now()-lastCheck.current<300000)return;
  running.current=true;setWorking(true);setError('');
  try{
   let next=await readSnapshot(1);
   if(next.setup.connection?.status==='connected'&&next.setup.connection.email.toLowerCase()===next.setup.expectedEmail.toLowerCase()){
    lastCheck.current=Date.now();const result=await post({action:'sync'});next=result.data||await readSnapshot(1);if(mounted.current)callback.current();
   }
   if(mounted.current){setData(next);}
  }catch(e){lastCheck.current=Date.now();if(mounted.current)setError(e instanceof Error?e.message:'Reply check could not finish.');}
  finally{running.current=false;if(mounted.current)setWorking(false);}
 }
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(paused)return;void check();const timer=setInterval(()=>void check(),300000);const visible=()=>{if(document.visibilityState==='visible')void check();};document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[paused]);
 const connected=data?.setup.connection?.status==='connected'&&data.setup.connection.email.toLowerCase()===data.setup.expectedEmail.toLowerCase();
 const checked=data?.setup.connection?.lastSyncAt;
 return <section className="out-mail-status" aria-label="Email status"><div><strong>{connected?data?.setup.expectedEmail:working?'Checking Gmail…':data?'Gmail needs attention':'Gmail status'}</strong><p>{checked?`Last reply check: ${new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit'}).format(new Date(checked))} Mountain`:'No reply check recorded.'}</p><p>Replies check every 5 minutes while this page is open and visible.</p>{error&&<p role="alert">{error}</p>}</div><div className="crm-actions"><button className="crm-button crm-button-secondary" type="button" disabled={working||paused} onClick={()=>void check(true)}>{working?'Checking…':'Check replies'}</button><a href="/manage/mail#mail-replies">View replies</a><a href="/manage/settings#gmail">Gmail settings</a></div></section>;
}
