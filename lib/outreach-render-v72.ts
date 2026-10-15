import type {Prospect,Step} from './outreach-shared';
import {outreachWorkflow} from './outreach-workflows-v71';
import {outreachSales} from './outreach-sales-v72';

// Rewrite exact reviewed research notes into reader-facing observations. The
// saved research remains intact, and unknown or edited evidence is preserved.
const emailObservations:Record<string,string>={
 "The official site offers free roof inspections and describes coordinating an on-site meeting with the homeowner's insurance adjuster. The contact page explicitly publishes Abram's call/text number and business email.":'I saw that you offer free roof inspections and coordinate on-site meetings with homeowners’ insurance adjusters. That creates several points where customer details and the next action need to stay connected.',
 'The official homepage offers roof repair/replacement, rebuilds after water/fire/mold/storm damage, and kitchen/bath/basement remodeling. It says reconstruction work follows mitigation and abatement partners, and offers a free on-site consultation.':'I saw that Restoration Contractors handles roofing, post-mitigation reconstruction, and remodeling, with a free on-site consultation. Those inquiries need different information before your team can scope the next step.',
 'The official contact page asks customers to call or email comprehensive project details, then describes assessing the request, arranging a site visit, obtaining estimate approval/deposit and scheduling the work. It lists Broomfield, Arvada, Westminster and Denver among service areas.':'I saw that your project process runs from detailed customer inquiries through assessment, a site visit, estimate approval, and scheduling. That is a useful sequence to examine for repeated information handling and follow-up.',
 'The official site lists foundation repair, structural-engineer collaboration, excavation, helical piers/tiebacks, wall anchors and basement waterproofing. It publishes a free-estimate path and lists office hours Monday–Friday, 9 a.m.–5 p.m.':'I saw that you handle foundation repair, structural work, and basement waterproofing, with a free-estimate path for customers. Organizing the initial project details gives your team a clearer starting point for assessing each request.',
};

export function hasReviewedResearch(p:Prospect,now=Date.now()){
 const observed=Date.parse(p.observed_at);
 return p.status==='ready'&&Boolean(p.evidence&&p.source_url)&&Number.isFinite(observed)&&observed<=now&&observed>=now-90*86400000;
}
// Imported names and notes are not a verified website observation. Blank or stale
// research produces a neutral service email, without altering the source record.
export function renderOutreachEmail(template:Step,p:Prospect,sender:string){
 const researched=hasReviewedResearch(p),values:Record<string,string>={...outreachWorkflow(p.industry||''),...outreachSales(p.industry||''),greeting:researched&&p.contact?`Hello ${p.contact},`:`Hello ${p.company} team,`,company:p.company,contact:researched&&p.contact?p.contact:'there',evidence:researched?(emailObservations[p.evidence]||p.evidence):'',sender};
 const render=(s:string)=>s.replace(/{{(company|contact|evidence|sender|angle|opportunity|workflow|outcome|example|task|greeting|sales_subject|sales_hook|sales_problem|sales_actions|sales_support|sales_value)}}/g,(_,key)=>values[key]).replace(/\n{3,}/g,'\n\n').trim();
 return {subject:render(template.subject),body:render(template.body)};
}
