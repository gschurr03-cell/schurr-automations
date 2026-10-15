import {websiteCallbackSetup,recentWebsiteCallbacks} from '@/lib/website-callbacks';
import WebsiteFollowupControls from './settings/website-followup';
import {ownerAlertSetup} from '@/lib/owner-alerts';
import {retellSetup} from '@/lib/retell';
import {bookingSetup} from '@/lib/booking';
import {customerEmailEnabled,deliveryWebhookConfigured} from '@/lib/customer-email';

// Render saved connection evidence, without provider writes or test messages.
export async function loadServiceConnections(){
  const [alertResult,voiceResult,bookingResult,callbackResult,recentResult]=await Promise.allSettled([ownerAlertSetup(),retellSetup(),bookingSetup(),websiteCallbackSetup(),recentWebsiteCallbacks()]);
  const alerts=alertResult.status==='fulfilled'?alertResult.value:null;
  const voice=voiceResult.status==='fulfilled'?voiceResult.value:null;
  return {alerts,voice,callbacks:callbackResult.status==='fulfilled'?callbackResult.value:null,recentCallbacks:recentResult.status==='fulfilled'?recentResult.value:[],booking:bookingResult.status==='fulfilled'?bookingResult.value:null};
}
export default function ServiceConnections({data:{alerts,voice,booking,callbacks,recentCallbacks}}:{data:Awaited<ReturnType<typeof loadServiceConnections>>}){
  const attention=alerts?.recent.filter(alert=>['failed','uncertain'].includes(alert.status)).length||0;
  return <section className="crm-panel" id="connections">
    <div className="crm-section-heading"><h2>Connected tools</h2><a href="/manage/receptionist">Receptionist &amp; alerts</a></div>
    <dl className="crm-connections">
      <div><dt>Website inquiries &amp; CRM</dt><dd className="crm-connected">Connected</dd></div>
      <div><dt>AI receptionist</dt><dd>{!voice?'Status unavailable':voice.mode==='live'&&voice.inboundNumber?`Enabled · ${voice.inboundNumber}`:voice.agentId?'Created · test mode':voice.connected?'Account connected':'Not connected'}</dd></div>
      <div><dt>Inquiry &amp; booking alerts to you</dt><dd className={alerts?.connected?'crm-connected':undefined}>{!alerts?'Status unavailable':alerts.connected?`Connected · ${alerts.recipient}`:'Not connected'}</dd></div>
      <div><dt>Information emails</dt><dd>{customerEmailEnabled()&&alerts?.connected?'Enabled · one requested email with services and booking link':'Not active'}</dd></div><div><dt>Email delivery reports</dt><dd>{deliveryWebhookConfigured()?'Signing secret configured':'Not connected · acceptance shown'}</dd></div><div><dt>Personal follow-up &amp; texts</dt><dd>Manual · response drafts ready</dd></div>
      <div><dt>Appointment booking</dt><dd>{!booking?'Status unavailable':booking.config.enabled?`Native calendar enabled · ${booking.config.timezone}`:'Native calendar paused'}</dd></div>
      <div><dt>Task reminders</dt><dd>In the CRM · no email reminders</dd></div>
    </dl>
    <p className="crm-help">{alerts?.connected?'New inquiries, bookings, reschedules and cancellations queue an email to you. Provider acceptance does not confirm inbox delivery.':'Owner alerts need a connected sender. Requests remain saved if an email fails.'} {attention>0?`${attention} recent alert${attention===1?' needs':'s need'} attention. `:''}<a href="/manage/receptionist#owner-alerts">Check alert delivery</a>.</p>
    <p><a href="/book" target="_blank" rel="noopener noreferrer">Open public booking page</a></p><WebsiteFollowupControls setup={callbacks}/>{Boolean(recentCallbacks?.length)&&<details><summary>Recent website callbacks</summary>{recentCallbacks.map(call=><p key={call.id}><a href={`/manage/leads/${call.id}`}>{call.name}</a> · {({pending:'Queued',dispatching:'Requesting call',accepted:'Call requested',uncertain:'Check Retell',cancelled:'Cancelled',stopped:'Stopped'} as Record<string,string>)[call.status]||call.status}{call.error?` · ${call.error}`:''}</p>)}</details>}<p className="crm-help">Replies to new confirmations go to gavin@schurrautomations.com. Personal follow-up needs your review. The native calendar does not sync outside commitments. <a href="/manage/settings#website-followup">Continue connecting services</a>.</p>
  </section>;
}
