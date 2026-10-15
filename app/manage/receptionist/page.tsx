import {CRMShell,crmContext,AccessDenied,Unavailable} from '../crm-ui';
import {retellSetup,initializeRetellConnection} from '@/lib/retell';
import {RECEPTIONIST_GREETING,RECEPTIONIST_PROMPT,CALL_TESTS} from '@/lib/retell-profile';
import {VOICE_OPERATIONS_PROMPT} from '@/lib/voice-operations';
import {VoiceToolsInstall} from '../schedule/workspace';
import {RequestError} from '@/lib/inquiries';
import ReceptionistSetup from './setup';
import OwnerAlerts from './alerts';
import {ownerAlertSetup} from '@/lib/owner-alerts';
export const dynamic='force-dynamic';
export const metadata={title:'Receptionist setup | Schurr Automations'};
export default async function ReceptionistPage(){
  const {access,settings}=await crmContext('/manage/receptionist');let content;
  if(!access.allowed)content=<AccessDenied access={access}/>;
  else if(!settings)content=<Unavailable/>;
  else try{let connectionError='';try{await initializeRetellConnection();}catch(error){connectionError=error instanceof RequestError?error.message:'The saved Retell key could not be connected. Try entering a key below.';}const setup=await retellSetup(),alerts=await ownerAlertSetup();content=<>
    {connectionError&&<div className="crm-alert" role="alert">{connectionError}</div>}
    <div className="crm-setup-banner"><div><strong>Schurr’s first AI receptionist</strong><p>Connect Retell, test it on your own calls, then use the same setup for buyer demonstrations.</p></div><a className="crm-button crm-button-secondary" href="/manage/response">Open response desk</a></div>
    <div className="crm-settings-grid"><div><ReceptionistSetup initial={setup}/><OwnerAlerts initial={alerts}/></div><div>
      <section className="crm-panel"><h2>How it answers</h2><blockquote className="response-draft">{RECEPTIONIST_GREETING}</blockquote><p className="crm-help">Based on the current website: natural answers about receptionists, custom automation, websites, and SEO/AEO. It recommends a useful starting point and offers a call with Gavin, one question at a time.</p><p className="crm-help">Apply the current script to the connected phone agent below. The update verifies the routed conversation and preserves its voice and greeting.</p><VoiceToolsInstall/><details className="crm-add-details"><summary>Read the base and appointment instructions</summary><pre className="crm-preserve">{RECEPTIONIST_PROMPT}</pre><h3>Managed appointment rules</h3><p className="crm-help">Installed separately through Appointments &amp; follow-up. These extend the base instructions when the connected tools are enabled.</p><pre className="crm-preserve">{VOICE_OPERATIONS_PROMPT}</pre></details></section>
      <section className="crm-panel"><h2>Phone audition</h2><p><a className="crm-button crm-button-secondary" href="/manage/receptionist/auditions">Record and review auditions</a></p><p className="crm-help">Start with these {CALL_TESTS.length} checks. Then run 30 to 50 calls across both voice options, different speakers, mobile reception and ordinary background noise. Choose the voice that sounds natural and handles the work reliably.</p><p className="crm-help">Score naturalness, interruptions and pacing from 1 to 5. Contact accuracy, permission and truthful tool results must pass every time. Listen over a real phone before calling it ready.</p>{CALL_TESTS.map(([title,scenario,pass])=><details className="crm-add-details" key={title}><summary>{title}</summary><p>{scenario}</p><p className="crm-help">Pass: {pass}</p></details>)}</section>
      <section className="crm-panel"><h2>First-response workflow</h2><ol className="crm-instructions"><li>The caller confirms their request and allows a specific contact method.</li><li>The receptionist saves one contact, a request summary and a reply draft in the response desk.</li><li>When email alerts are connected, Gavin receives an alert. He reviews the request and replies personally.</li></ol><p className="crm-help">Call recordings and transcripts are not stored by this configuration. The CRM keeps only the confirmed request and contact permission.</p></section>
    </div></div>
  </>;}catch{content=<Unavailable message="Receptionist setup is temporarily unavailable. Please refresh in a moment."/>;}
  return <CRMShell active="/manage/automations" title="Receptionist setup" description="Your Retell voice, connected to your Schurr CRM." access={access} settings={settings}>{content}</CRMShell>;
}
