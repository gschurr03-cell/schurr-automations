import {recipesFor,missingFor,runTemplate,sampleEvent,type ClientProfile,type OfferId,type RecipeId,type PreviewResult} from './client-templates';
export const REHEARSAL_VERSION=1;
export const REHEARSAL_CASES=[{id:'normal',label:'Normal request'},{id:'stopped',label:'Stopped request'},{id:'duplicate',label:'Previously processed event'},{id:'missing',label:'Missing or unsupported information'}] as const;
export type RehearsalOutcome='passed'|'needs_information'|'failed';
export type RehearsalCase={recipe:RecipeId;name:string;scenario:string;label:string;input:Record<string,unknown>;output:PreviewResult;expected:string;outcome:RehearsalOutcome;detail:string};
export function rehearsalCases(offers:OfferId[]){return recipesFor(offers).flatMap(recipe=>REHEARSAL_CASES.filter(c=>c.id!=='missing'||!['receptionist','website'].includes(recipe.id)).map(c=>({recipe,scenario:c.id,label:c.label})));}
export function runRehearsal(profile:ClientProfile,offers:OfferId[],clientId:string):RehearsalCase[]{return rehearsalCases(offers).map(({recipe,scenario,label})=>{
 const input=sampleEvent(recipe.id,profile,scenario),output=runTemplate(recipe.id,profile,input,clientId),missing=missingFor(profile,recipe);
 const expected=scenario==='stopped'||scenario==='duplicate'?'no_action':scenario==='normal'||recipe.id==='local_profile'?'draft_ready':['inquiry','review_request'].includes(recipe.id)?'no_action':'blocked';
 const honest=output.mode==='preview'&&output.externalActions===false;
 const mismatchCheck=recipe.id!=='local_profile'||scenario!=='missing'||(Array.isArray(output.output.checks)&&output.output.checks.length===5&&['businessName','website','publicPhone','businessHours','serviceArea'].every(field=>(output.output.checks as {field:string;matches:boolean}[]).some(c=>c.field===field&&c.matches===false)));
 const correct=honest&&output.status===expected&&mismatchCheck;
 return {recipe:recipe.id,name:recipe.name,scenario,label,input,output,expected,outcome:missing.length?'needs_information':correct?'passed':'failed',detail:missing.length?'Add: '+missing.join(', '):correct?output.summary:'The result differs from the expected template behavior. Review before client use.'};
});}
export type RehearsalSummary={state:'not_run'|'stale'|'completed';total:number;passed:number;needsInformation:number;failed:number;revision:number;createdAt:string;cases:{name:string;label:string;outcome:RehearsalOutcome;detail:string}[]};
export function summarizeRehearsal(revision:number,offers:OfferId[],rows:{recipe:RecipeId;scenario:string;setupRevision:number;output:string;createdAt:string}[]):RehearsalSummary{
 const expected=rehearsalCases(offers),saved=expected.map(c=>rows.find(r=>r.recipe===c.recipe.id&&r.scenario==='suite_'+c.scenario));
 const report:RehearsalSummary={state:'not_run',total:expected.length,passed:0,needsInformation:0,failed:0,revision,createdAt:'',cases:[]};
 if(saved.every(r=>!r))return report;
 const runIds=new Set<string>();let current=true;
 expected.forEach((entry,i)=>{const row=saved[i];if(!row){current=false;return;}try{
  const meta=JSON.parse(row.output).rehearsal as {version:number;runId:string;outcome:RehearsalOutcome;detail:string};
  if(meta?.version!==REHEARSAL_VERSION||typeof meta.runId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(meta.runId)||typeof meta.detail!=='string'||!['passed','needs_information','failed'].includes(meta.outcome)||row.setupRevision!==revision){current=false;return;}
  runIds.add(meta.runId);report.createdAt=row.createdAt;report.cases.push({name:entry.recipe.name,label:entry.label,outcome:meta.outcome,detail:meta.detail});
  if(meta.outcome==='passed')report.passed++;else if(meta.outcome==='needs_information')report.needsInformation++;else report.failed++;
 }catch{current=false;}});
 report.state=current&&runIds.size===1&&report.cases.length===expected.length?'completed':'stale';return report;
}
