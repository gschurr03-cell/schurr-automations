import templates from './outreach-legacy-templates';
import templateV74 from './outreach-template-v74';
import {renderOutreachEmail as renderV74} from './outreach-render-v74';
import type {Prospect} from './outreach-shared';
import {hasReviewedResearch} from './outreach-render';
import {outreachWorkflow} from './outreach-workflows-v71';
import {renderOutreachEmail as renderV72} from './outreach-render-v72';
import {renderOutreachEmail as renderV73} from './outreach-render-v73';

// Exact historical subject AND body equality only. A shared phrase or campaign
// name does not establish that a draft is untouched. Freeze substitutions too.
export function isLegacyGeneratedDraft(subject:string,body:string,p:Prospect,sender:string){
 const previous=renderV74(templateV74,p,sender);if(previous.subject===subject&&previous.body===body)return true;
 const researched=hasReviewedResearch(p),values:Record<string,string>={...outreachWorkflow(p.industry||''),company:p.company,contact:researched&&p.contact?p.contact:'there',evidence:researched?p.evidence:'',sender};
 const render=(s:string)=>s.replace(/{{(\w+)}}/g,(whole,key)=>values[key]??whole).replace(/\n{3,}/g,'\n\n').trim();
 return templates.some(template=>{
  if(render(template.subject)===subject&&render(template.body)===body)return true;
  return [renderV72,renderV73].some(render=>{const old=render(template,p,sender);return old.subject===subject&&old.body===body;});
 });
}
