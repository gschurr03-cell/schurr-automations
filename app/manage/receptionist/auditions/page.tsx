import {CRMShell,crmContext,AccessDenied,Unavailable,dateTime} from '../../crm-ui';
import {auditionCatalogue,auditionSummary,type AuditionSession} from '@/lib/receptionist-audition-policy';
import {listAuditions} from '@/lib/receptionist-auditions';
import {retellSetup} from '@/lib/retell';
import {HistoryLink} from '../../history-controls';
import AuditionForm from './form';
export const dynamic='force-dynamic';
export const metadata={title:'Phone auditions | Schurr Automations'};

function Session({session,timezone,catalogueHash}:{session:AuditionSession;timezone:string;catalogueHash:string}){
 const summary=auditionSummary(session,catalogueHash),outcome={pass:'Pass',fail:'Fail',not_tested:'Not tested'};
 return <article className="response-item" id={'audition-'+session.id}>
  <div className="crm-section-heading"><h3>{session.environment==='phone'?'Phone':'Browser / simulation'} · {dateTime(session.testedAt,timezone)}</h3></div>
  <p><strong>{summary.label}</strong> · {summary.passed} pass · {summary.failed} fail · {summary.notTested} not tested</p>
  <p className="crm-help">Naturalness {session.naturalness??'not scored'} · Interruptions {session.interruptions??'not scored'} · Pacing {session.pacing??'not scored'}</p>
  <p className="crm-help">Reported agent: {session.agentId} · {session.agentVersion===null?'Version not recorded':'Version '+session.agentVersion}</p>
  <p className="crm-preserve">{session.configEvidence}</p>
  {session.notes&&<p className="crm-preserve">{session.notes}</p>}
  {!summary.current&&<p className="crm-help">The checklist wording has changed since this session. Its original checklist is preserved below.</p>}
  <details className="crm-add-details"><summary>Read saved checks and observations</summary>{session.results.map(result=><section key={result.id}><h4>{result.title} · {outcome[result.outcome]}</h4><p>{result.scenario}</p><p className="crm-help">Pass: {result.expected}</p>{result.notes&&<p className="crm-preserve">{result.notes}</p>}</section>)}</details>
  <p className="crm-help">Entered by {session.recordedBy} on {dateTime(session.recordedAt,timezone)}. Owner-reported evidence; no live configuration verification.</p>
 </article>;
}
export default async function AuditionsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {access,settings}=await crmContext('/manage/receptionist/auditions');let content;
 if(!access.allowed)content=<AccessDenied access={access}/>;
 else if(!settings)content=<Unavailable/>;
 else try{
  const params=await searchParams,before=typeof params.before==='string'?params.before:undefined;
  let savedAgentId='';try{savedAgentId=(await retellSetup()).agentId;}catch{/* Optional prefill must not block audition history or manual entry. */}
  const catalogue=await auditionCatalogue(),history=await listAuditions(before),latest=history.latestPhone,summary=latest?auditionSummary(latest,catalogue.hash):null;
  content=<>
   <section className="crm-panel"><h2>{summary?.label||'No phone audition recorded'}</h2>
    {latest&&<p>Latest reported phone test: {dateTime(latest.testedAt,settings.timezone)} · {summary!.passed}/{latest.results.length} checks passed · {summary!.failed} failed · {summary!.notTested} not tested.</p>}
    {latest&&<p className="crm-help">Sound scores (1 poor, 5 excellent): naturalness {latest.naturalness??'not scored'} · interruptions {latest.interruptions??'not scored'} · pacing {latest.pacing??'not scored'}. Checklist passes do not mean the voice sounds good.</p>}
    <p className="crm-help">Readiness evidence comes from the latest reported phone session, without combining results across configurations. Browser rehearsals do not count as phone passes. All results and settings here are entered by the owner, not automatically verified.</p>
    <p className="crm-help">A passed session describes that test only. Retest after voice, prompt, tools, routing or provider settings change. This log does not approve a launch or prove the current live setup.</p>
   </section>
   <AuditionForm checks={catalogue.checks} catalogueHash={catalogue.hash} savedAgentId={savedAgentId}/>
   <section className="crm-panel" id="saved-auditions"><h2>Saved sessions</h2><p className="crm-help">Newest entries first. Test times and configuration evidence are reported by the owner; recorded times are saved by this app. Times below use {settings.timezone}.</p>
    {history.sessions.length?history.sessions.map(session=><Session key={session.id} session={session} timezone={settings.timezone} catalogueHash={catalogue.hash}/>):<p>No sessions saved yet. No test results have been assumed.</p>}
    <nav className="crm-actions" aria-label="Audition history pages">{before&&<HistoryLink href="/manage/receptionist/auditions#saved-auditions">Newest sessions</HistoryLink>}{history.next&&<HistoryLink href={'/manage/receptionist/auditions?before='+encodeURIComponent(history.next)+'#saved-auditions'}>Older sessions</HistoryLink>}</nav>
   </section>
  </>;
 }catch{content=<Unavailable message="The audition log could not load. Refresh to try again."/>;}
 return <CRMShell active="/manage/automations" title="Phone auditions" description="Keep an honest record of how the receptionist sounds and handles real calls." access={access} settings={settings} actions={<a className="crm-button crm-button-secondary" href="/manage/receptionist">Receptionist setup</a>}>{content}</CRMShell>;
}
