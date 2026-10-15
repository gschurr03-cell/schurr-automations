import {CALL_TESTS} from './retell-profile';

export type AuditionEnvironment='phone'|'browser';
export type AuditionOutcome='pass'|'fail'|'not_tested';
export type AuditionCheck={id:string;title:string;scenario:string;expected:string};
export type AuditionResult=AuditionCheck&{outcome:AuditionOutcome;notes:string};
export type AuditionSession={id:string;catalogueHash:string;environment:AuditionEnvironment;testedAt:string;agentId:string;agentVersion:number|null;configEvidence:string;notes:string;naturalness:number|null;interruptions:number|null;pacing:number|null;recordedBy:string;recordedAt:string;results:AuditionResult[]};

// These IDs belong to the actual CALL_TESTS entries, never their array positions.
// Keep an ID when editing a check's wording. Retired IDs must not be repurposed.
const CHECK_IDS:Record<string,string>={
 'Greeting continuity':'greeting_continuity','Normal inquiry':'normal_inquiry',
 'Interruptions':'interruptions','Thinking and spelling':'thinking_spelling',
 'Pricing':'pricing','Reschedule and cancel':'reschedule_cancel',
 'Booking and transfer':'booking_transfer','Contact preference':'contact_preference',
 'Change of mind':'change_of_mind','Noise and recovery':'noise_recovery',
 'Tool failure':'tool_failure','Private information':'private_information',
};
export function auditionChecks():AuditionCheck[]{
 const seen=new Set<string>();
 return CALL_TESTS.map(([title,scenario,expected])=>{
  const id=CHECK_IDS[title];
  if(!id||seen.has(id))throw new Error('Each CALL_TESTS entry needs a unique stable audition ID.');
  seen.add(id);return {id,title,scenario,expected};
 });
}
export async function auditionHash(value:unknown):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function auditionCatalogue(){const checks=auditionChecks();return {checks,hash:await auditionHash(checks)};}
export function auditionSummary(session:AuditionSession,currentCatalogueHash?:string){
 const passed=session.results.filter(result=>result.outcome==='pass').length;
 const failed=session.results.filter(result=>result.outcome==='fail').length;
 const notTested=session.results.filter(result=>result.outcome==='not_tested').length;
 const scored=[session.naturalness,session.interruptions,session.pacing].every(score=>score!==null);
 const current=currentCatalogueHash===undefined||session.catalogueHash===currentCatalogueHash;
 // No label is a claim that the provider's current configuration is verified.
 const label=session.environment==='browser'?'Browser rehearsal only':!current?'Earlier phone checklist':failed?'Phone checks need attention':notTested||!scored||!session.results.length?'Phone audition incomplete':'All phone checks recorded as passed';
 return {passed,failed,notTested,scored,current,label};
}
