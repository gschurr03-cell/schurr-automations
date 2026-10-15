'use client';
import {useRef,useState,type FormEvent} from 'react';
import type {Snapshot} from '@/lib/gmail-workspace';

type Draft=Snapshot['approved'][number];
type Outbox=Snapshot['outbox'][number]&{first_attempt_at?:number;draft_revision?:number};
type Result={ok?:boolean;error?:string;url?:string;data?:Snapshot};
const ENDPOINT='/api/manage/gmail';
const STATUS:Record<string,string>={prepared:'Prepared; no send confirmed',cancelled:'Not sent; needs review',sending:'Sending result pending',uncertain:'Check Gmail result',accepted:'Submitted to Gmail',failed:'Needs review',rejected:'Not sent; needs review'};
const REPLY_KIND:Record<string,string>={reply:'Reply',unsubscribe:'Opt-out',bounce:'Delivery notice',automated:'Automatic response',automatic:'Automatic response',auto_reply:'Automatic response'};

function timestamp(value:string,timezone:string){
  if(!value||!Number.isFinite(Date.parse(value)))return 'Not recorded';
  return new Intl.DateTimeFormat('en-US',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
function snapshotOf(value:unknown):Snapshot|null{
  if(!value||typeof value!=='object')return null;
  const envelope=value as {data?:unknown};
  const candidate=(envelope.data||value) as Snapshot;
  return candidate.setup&&typeof candidate.setup.expectedEmail==='string'&&candidate.sender&&Array.isArray(candidate.approved)&&Array.isArray(candidate.outbox)&&Array.isArray(candidate.replies)&&Number.isSafeInteger(candidate.page)&&candidate.page>0?candidate:null;
}
export async function readSnapshot(page:number,draftId?:string){
  const response=await fetch(`${ENDPOINT}?page=${page}${draftId?`&draft=${encodeURIComponent(draftId)}`:''}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
  const result:unknown=await response.json();
  if(!response.ok)throw Error('The saved email state could not be refreshed. Check your sign-in and try refreshing again.');
  const next=snapshotOf(result);if(!next)throw Error('The saved email state could not be read. Refresh before taking another action.');
  return next;
}
export async function post(payload:Record<string,unknown>){
  let response:Response;
  try{response=await fetch(ENDPOINT,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});}
  catch{throw Error('The action response was not confirmed. Refresh the saved history and check Gmail before taking another action.');}
  let result:Result;try{result=await response.json() as Result;}catch{throw Error('The action response could not be read. Refresh the saved history and check Gmail before taking another action.');}
  if(!response.ok||result.ok!==true)throw Error(typeof result.error==='string'?result.error.slice(0,1000):'The action could not be confirmed. Refresh its saved state.');
  return result;
}
function approvalKey(draft:Draft,data:Snapshot){return JSON.stringify([draft.id,draft.revision,draft.recipient,draft.subject,draft.body,data.sender.sender_email,data.sender.revision,data.setup.connection?.revision]);}
function blocksSending(record:Outbox){
  // Missing attempt evidence is deliberately conservative. Only the server can
  // establish that an earlier attempt never reached the send boundary.
  return !(['prepared','cancelled'].includes(record.status)&&record.first_attempt_at===0);
}

export default function MailWorkspace({initial,timezone='America/Denver',selectedDraft,callbackResult,embedded=false,onSendStarted,view='all'}:{initial:Snapshot;timezone?:string;selectedDraft?:string;callbackResult?:'connected'|'failed';embedded?:boolean;onSendStarted?:()=>void;view?:'all'|'responses'|'setup'}){
  const initialConnected=initial.setup.connection?.status==='connected'&&initial.setup.connection.email.toLowerCase()===initial.setup.expectedEmail.toLowerCase();
  const [data,setData]=useState(initial),[pending,setPending]=useState('');
  const [error,setError]=useState(callbackResult==='failed'?'Google authorization did not finish. Review the saved connection below, refresh its status, and reconnect if needed.':'');
  const [message,setMessage]=useState(callbackResult==='connected'?(initialConnected?'Business Gmail connection confirmed. Review an approved message when you are ready to send.':'Google returned to the CRM, but the saved connection is not confirmed. Review the connection details above.'):'');
  const [confirmed,setConfirmed]=useState(''),[disconnectConfirmed,setDisconnectConfirmed]=useState(false),[heldDrafts,setHeldDrafts]=useState<string[]>([]);
  const busy=useRef(false);
  const connection=data.setup.connection;
  const connected=connection?.status==='connected'&&connection.email.toLowerCase()===data.setup.expectedEmail.toLowerCase();
  const senderMatches=data.sender.sender_email.toLowerCase()===data.setup.expectedEmail.toLowerCase();
  const gmailSent=`https://mail.google.com/mail/?authuser=${encodeURIComponent(data.setup.expectedEmail)}#sent`;
  function noticeReset(){setError('');setMessage('');}
  function apply(next:Snapshot){
    setData(next);setConfirmed('');setDisconnectConfirmed(false);
    // An explicit, freshly saved zero-attempt cancellation may be reviewed again.
    // An absent row does not prove that an uncertain request never started.
    setHeldDrafts(ids=>ids.filter(id=>!next.outbox.some(row=>row.draft_id===id&&['prepared','cancelled'].includes(row.status)&&(row as Outbox).first_attempt_at===0)));
  }
  async function refresh(page=data.page){
    if(busy.current)return;busy.current=true;setPending('refresh');noticeReset();
    try{apply(await readSnapshot(page,embedded?selectedDraft:undefined));setMessage('Saved connection and message history refreshed. No email was sent.');}
    catch(issue){setError(issue instanceof Error?issue.message:'Saved email state could not be refreshed.');}
    finally{busy.current=false;setPending('');}
  }
  async function action(payload:Record<string,unknown>,success:string){
    if(busy.current)return;busy.current=true;setPending(String(payload.action));noticeReset();
    try{
      const result=await post(payload);
      apply(embedded?await readSnapshot(1,selectedDraft):(snapshotOf(result)||await readSnapshot(data.page)));
      setMessage(success);
    }catch(issue){
      const detail=issue instanceof Error?issue.message:'The action could not be confirmed.';
      setError(payload.action==='send'?`${detail} Do not send this draft again. Refresh its saved status and check Gmail Sent; use Check Gmail result for an uncertain record.`:detail);
    }finally{busy.current=false;setPending('');}
  }
  async function configure(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy.current)return;
    const form=event.currentTarget,values=new FormData(form);
    const clientId=String(values.get('clientId')||'').trim(),clientSecret=String(values.get('clientSecret')||'').trim(),configRevision=Number(values.get('configRevision'));
    const secret=form.elements.namedItem('clientSecret') as HTMLInputElement|null;if(secret)secret.value='';
    if(!clientId||!clientSecret||!Number.isSafeInteger(configRevision)||configRevision<0){setError('Enter the Google OAuth client ID and client secret.');return;}
    await action({action:'configure',clientId,clientSecret,configRevision},'Google OAuth settings saved. Use Connect Gmail to approve access to the business account.');
  }
  async function connect(){
    if(busy.current||!data.setup.configured)return;busy.current=true;setPending('connect');noticeReset();
    try{
      const result=await post({action:'connect'}),url=new URL(result.url||'');
      if(url.protocol!=='https:'||url.hostname!=='accounts.google.com'||url.port||url.username||url.password||url.hash||!/^\/o\/oauth2\/(?:v2\/)?auth$/.test(url.pathname)||url.searchParams.get('redirect_uri')!==data.setup.redirectUri)throw Error('The Google sign-in address could not be verified. Refresh the connection setup.');
      window.location.assign(url.href);
    }catch(issue){setError(issue instanceof Error?issue.message:'Google sign-in could not start.');}
    finally{busy.current=false;setPending('');}
  }
  async function send(draft:Draft){
    const existing=data.outbox.filter(row=>row.draft_id===draft.id);
    if(busy.current||!connected||!connection||!senderMatches||!data.sender.postal_address||heldDrafts.includes(draft.id)||existing.some(blocksSending)||confirmed!==approvalKey(draft,data))return;
    onSendStarted?.();setConfirmed('');setHeldDrafts(ids=>[...new Set([...ids,draft.id])]);
    await action({action:'send',id:draft.id,revision:draft.revision,senderRevision:data.sender.revision,connectionRevision:connection.revision,confirmSend:true},'Send request processed. Review its saved result below. Submitted to Gmail does not mean delivered.');
  }
  async function copyCallback(){
    noticeReset();try{await navigator.clipboard.writeText(data.setup.redirectUri);setMessage('Exact callback URL copied.');}catch{setError('Copy the callback URL from the field below.');}
  }
  const visibleOutbox=embedded?data.outbox.filter(row=>row.draft_id===selectedDraft):data.outbox;
  const orderedDrafts=[...data.approved].filter(draft=>!embedded||draft.id===selectedDraft).sort((a,b)=>Number(b.id===selectedDraft)-Number(a.id===selectedDraft));
  return <>
    {!embedded&&view!=='responses'&&<><nav className="crm-actions" aria-label="Email workspace links"><a href="/manage/outreach">Review outreach drafts</a><a href="/manage/settings">Workspace settings</a><a href={gmailSent} target="_blank" rel="noopener noreferrer">Open Gmail Sent</a></nav>
    <div className="crm-panel"><div className="crm-section-heading"><div><strong>{connected?`Connected: ${connection?.email}`:'Connect your business Gmail'}</strong><p className="crm-help">Last reply check: {timestamp(connection?.lastSyncAt||'',timezone)}</p></div><button type="button" className="crm-button" disabled={Boolean(pending)||!connected} onClick={()=>action({action:'sync'},'Reply check completed. Saved replies appear below; no email was sent.')}>{pending==='sync'?'Checking replies…':'Check replies'}</button></div></div>
    <details open={!connected}><summary className="crm-help">Gmail connection & settings</summary>
    <section className="crm-panel" id="mail-connection">
      <div className="crm-section-heading"><h2>Business Gmail connection</h2><span className="crm-stage">{connected?'Connected':connection?'Needs attention':'Not connected'}</span></div>
      <p>Use <strong>{data.setup.expectedEmail}</strong> for this workspace.</p>
      <p className="crm-help">Google will ask permission to send email and read Gmail. This CRM tracks messages sent here and imports replies linked to those conversations. Older Resend confirmations and messages sent directly in Gmail stay separate.</p>
      {connection&&<dl className="crm-connection-list"><div><dt>Account</dt><dd>{connection.email}</dd></div><div><dt>Connected</dt><dd>{timestamp(connection.connectedAt,timezone)}</dd></div><div><dt>Last reply check</dt><dd>{timestamp(connection.lastSyncAt,timezone)}</dd></div></dl>}
      {connection?.lastError&&<p className="crm-alert">{connection.lastError}</p>}
      {connection&&connection.email.toLowerCase()!==data.setup.expectedEmail.toLowerCase()&&<p className="crm-alert">This account does not match the approved business mailbox. Sending is unavailable.</p>}
      {!data.setup.configured&&<p className="crm-help">Finish Google OAuth setup below before connecting.{data.setup.missing.length>0&&` Still needed: ${data.setup.missing.join(', ')}.`}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-button" disabled={Boolean(pending)||!data.setup.configured} onClick={connect}>{pending==='connect'?'Opening Google…':connected?'Reconnect Gmail':'Connect Gmail'}</button>
        <button type="button" className="crm-button crm-button-secondary" disabled={Boolean(pending)} onClick={()=>refresh()}>Refresh saved status</button>
        <button type="button" className="crm-button crm-button-secondary" disabled={Boolean(pending)||!connected} onClick={()=>action({action:'sync'},'Reply check completed. Saved replies appear below; no email was sent.')}>{pending==='sync'?'Checking replies…':'Check for replies now'}</button>
      </div>
      <p className="crm-help">{data.runnerConfigured?'A background-runner credential is configured. This does not confirm that a schedule is connected or running; check the last reply-check time and the external scheduler.':'Unattended reply checks are not connected. Use Check for replies now while an external runner is being set up.'} A connection or refresh never sends an outreach message.</p>
      {connection&&<details className="crm-danger-details"><summary>Disconnect Gmail</summary><p>Stops this CRM from using the mailbox. A message already submitted to Gmail cannot be recalled.</p><label className="automation-checkbox"><input type="checkbox" checked={disconnectConfirmed} disabled={Boolean(pending)} onChange={event=>setDisconnectConfirmed(event.target.checked)}/> I want to stop this CRM’s Gmail connection.</label><button type="button" className="crm-button crm-button-secondary" disabled={Boolean(pending)||!disconnectConfirmed} onClick={()=>{if(disconnectConfirmed)void action({action:'disconnect',confirmation:'DISCONNECT'},'Gmail disconnected in this CRM. You can also remove its access in your Google Account.');}}>Confirm disconnect</button><p className="crm-help">To revoke Google’s grant as well, remove this app in <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">your Google Account connections</a>.</p></details>}
    </section>

    <section className="crm-panel" id="google-oauth-setup"><details open={!data.setup.configured}><summary>Google OAuth setup</summary>
      <p>Use a Google Cloud project owned by your Google Workspace organization, with an Internal OAuth audience and a Web application client. Enable the Gmail API and add the exact authorized redirect URI below.</p>
      <div className="crm-actions"><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud credentials</a><a href="https://developers.google.com/identity/protocols/oauth2/web-server" target="_blank" rel="noopener noreferrer">Google’s setup guide</a></div>
      <div className="crm-form"><label>Authorized redirect URI<input readOnly value={data.setup.redirectUri} onFocus={event=>event.currentTarget.select()}/></label><button type="button" className="crm-button crm-button-secondary" onClick={copyCallback}>Copy callback URL</button></div>
      <form key={data.setup.configRevision??0} className="crm-form" onSubmit={configure}><fieldset disabled={Boolean(pending)}>
        <input type="hidden" name="configRevision" value={data.setup.configRevision??0}/>
        <label>Google OAuth client ID<input name="clientId" required maxLength={300} defaultValue={data.setup.clientId||''} autoComplete="off" spellCheck={false}/></label>
        <label>Google OAuth client secret<input name="clientSecret" type="password" required maxLength={4096} autoComplete="off" spellCheck={false}/></label>
        <p className="crm-help">Enter the secret only here. It is cleared from the form when submitted and is not saved in browser storage. Saving settings does not authorize Gmail; connect the account next.</p>
        <button className="crm-button" type="submit">{pending==='configure'?'Saving OAuth settings…':'Save OAuth settings'}</button>
      </fieldset></form>
    </details></section></details></>}
    {embedded&&!connected&&<p className="crm-alert">Gmail needs attention. <a href="/manage/settings#gmail">Open Gmail settings</a></p>}
    {embedded&&<div className="crm-actions"><button type="button" className="crm-button crm-button-secondary" disabled={Boolean(pending)} onClick={()=>refresh()}>Refresh saved status</button><a href={gmailSent} target="_blank" rel="noopener noreferrer">Open Gmail Sent</a></div>}

    <div aria-live="polite" aria-atomic="true">{error?<p className="crm-alert crm-alert-error" role="alert">{error}</p>:message?<p className="crm-help" role="status">{message}</p>:pending?<p className="crm-help" role="status">Updating business email…</p>:null}</div>

    {(embedded||view==='all')&&<section className="crm-panel" id="approved-mail"><div className="crm-section-heading"><h2>{embedded?'Confirm this email':'Approved messages'}</h2>{!embedded&&<a href="/manage/outreach?tab=review">Prepare or edit drafts</a>}</div>
      <p className="crm-help">Review the recipient and complete message, then explicitly send one message. Approval alone does not send it. Sending also checks current contact permissions, sender details and daily limits.</p>
      <p className="crm-help">Sending hours: {data.sender.window_start||'08:00'}–{data.sender.window_end||'17:00'} Mountain · Daily limit: {data.sender.daily_limit||20}. <a href="/manage/settings#sending">Edit sending preferences</a></p>
      {!senderMatches&&<p className="crm-alert">Your outreach sender must match {data.setup.expectedEmail}. Update <a href="/manage/outreach">Outreach Setup</a> before sending.</p>}
      {!data.sender.postal_address&&<p className="crm-help">Complete the business mailing address in Outreach Setup before sending outreach.</p>}
      {orderedDrafts.length?orderedDrafts.map(draft=>{
        const existing=data.outbox.filter(row=>row.draft_id===draft.id),blocked=heldDrafts.includes(draft.id)||existing.some(blocksSending),key=approvalKey(draft,data);
        return <article key={draft.id} className="response-item" id={'mail-draft-'+draft.id}>
          <h3>{draft.company||draft.recipient}{!embedded&&draft.id===selectedDraft&&<span className="crm-stage">Selected draft</span>}</h3>
          <p><strong>From:</strong> {data.sender.sender_name} &lt;{data.sender.sender_email}&gt;<br/><strong>To:</strong> {draft.recipient}<br/><strong>Subject:</strong> {draft.subject}</p>
          <blockquote className="response-draft" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{draft.body}</blockquote>
          {blocked?<p className="crm-help">This draft has a submitted or unresolved sending request. Check its history below and Gmail Sent before taking any further action.</p>:<><label className="automation-checkbox"><input type="checkbox" checked={confirmed===key} disabled={Boolean(pending)||!connected||!senderMatches} onChange={event=>setConfirmed(event.target.checked?key:'')}/> I reviewed this exact message and want to email {draft.recipient}.</label><button type="button" className="crm-button" disabled={Boolean(pending)||!connected||!senderMatches||!data.sender.postal_address||confirmed!==key} onClick={()=>send(draft)}>Send this email</button></>}
        </article>;
      }):<p>{embedded?'This draft is no longer awaiting a send. Check its result below, or reopen it in Messages to review its status.':'No approved messages are waiting. Choose contacts in Outreach to prepare your next email.'}</p>}
    </section>}

    {(embedded||view==='all')&&(!embedded||visibleOutbox.length>0)&&<section className="crm-panel" id="mail-outbox"><h2>Sending history</h2><p className="crm-help">Submitted to Gmail means Gmail accepted the message; it does not confirm delivery to the recipient. Checking a result searches for the existing message and does not send it again.</p>
      {visibleOutbox.length?visibleOutbox.map(row=><article className="response-item" key={row.id}><div className="crm-section-heading"><h3>{row.subject}</h3><span className="crm-stage">{STATUS[row.status]||'Status needs review'}</span></div><p>To: {row.recipient} · {timestamp(row.created_at,timezone)}</p>{row.last_error&&<p className="crm-help">{row.last_error}</p>}{['sending','uncertain'].includes(row.status)&&<button type="button" className="crm-button crm-button-secondary" disabled={Boolean(pending)||!connected} onClick={()=>action({action:'reconcile',id:row.id},'Gmail result check completed. Review the saved outcome; no email was sent.')}>Check Gmail result</button>}</article>):<p>No Gmail sending records on this page.</p>}
    </section>}
    {!embedded&&view!=='setup'&&<><section className="crm-panel" id="mail-replies"><div className="crm-section-heading"><div><h2>Responses</h2><p className="crm-help">Last checked: {timestamp(connection?.lastSyncAt||'',timezone)}</p></div><button className="crm-button crm-button-secondary" disabled={Boolean(pending)||!connected} onClick={()=>action({action:'sync'},'Replies updated.')}>{pending==='sync'?'Checking…':'Check replies'}</button></div>{!connected&&<p className="crm-alert">Gmail needs attention. <a href="/manage/settings#gmail">Open settings</a></p>}
      {data.replies.length?data.replies.map(reply=><article key={reply.id} className="response-item"><div className="crm-section-heading"><h3>{reply.subject||'(No subject)'}</h3><span className="crm-stage">{REPLY_KIND[reply.kind]||'Message'}</span></div><p>From: {reply.sender_email} · {timestamp(reply.received_at,timezone)}</p><blockquote className="response-draft" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{reply.body}</blockquote>{reply.thread_id&&<a href={'https://mail.google.com/mail/?authuser='+encodeURIComponent(data.setup.expectedEmail)+'#all/'+encodeURIComponent(reply.thread_id)} target="_blank" rel="noopener noreferrer">Reply in Gmail</a>}</article>):<p>No saved replies or notices on this page.</p>}
    </section>
    <nav className="crm-pagination" aria-label="Email history pages"><span>History page {data.page}</span><div><button type="button" className="crm-button crm-button-secondary" disabled={Boolean(pending)||data.page<=1} onClick={()=>refresh(Math.max(1,data.page-1))}>Previous page</button><button type="button" className="crm-button crm-button-secondary" disabled={Boolean(pending)||!(view==='responses'?data.repliesHasMore:data.hasMore)||data.page>=200} onClick={()=>refresh(data.page+1)}>Next page</button></div></nav></>}
  </>;
}
