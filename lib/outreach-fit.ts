type Business={industry?:string;company?:string};
// Campaign relevance, not a claim that a business has an unmet need.
const groups=[
 {key:'home',label:'Estimates & service jobs',reason:'Potential fit: inquiry capture, estimate follow-up and job handoffs.',terms:['hvac','heating','air conditioning','plumbing','plumber','sewer','roofing','roof replacement','restoration','foundation','remodeling','remodelling','renovation','home improvement','general contractor','garage door','electrician','electrical contractor','electrical contracting','window installation','whole home windows','pool builder','pool construction','outdoor living','landscaping','landscaper','pest control','tree service','cleaning service']},
 {key:'appointments',label:'Health & wellness appointments',reason:'Potential fit: non-clinical intake, scheduling, reminders and review requests.',terms:['med spa','medspa','medical spa','aesthetics','aesthetic clinic','dentist','dental','orthodontist','orthodontics','implants','physical therapy','physical therapist','physiotherapy','physiotherapist','massage','chiropractor','chiropractic','optometrist','optometry','dermatology','elective surgery','plastic surgery','cosmetic surgery','acupuncture','acupuncturist','podiatrist','podiatry','counseling','counselling','mental health clinic']},
 {key:'beauty',label:'Beauty & personal services',reason:'Potential fit: booking inquiries, customer follow-up and review requests.',terms:['salon','cosmetology','esthetician','aesthetician','barber','barbershop','hairdresser','hair stylist','nail salon','lash studio','waxing','skin care clinic','skincare clinic','day spa','spa']},
 {key:'local',label:'Local appointment services',reason:'Potential fit: service inquiries, appointments, estimates and follow-up.',terms:['auto repair','car repair','auto body','collision repair','auto detailing','car detailing','veterinarian','veterinary','pet groomer','pet grooming','dog groomer','dog grooming','dog training','fitness studio','pilates','yoga studio']},
 {key:'professional',label:'Professional service intake',reason:'Potential fit: lead intake, appointment coordination and document workflows.',terms:['law firm','attorney','lawyer','accountant','accounting','bookkeeping','tax preparation']},
] as const;
const poor=['supply store','wholesale','wholesaler','manufacturer','school','academy','training center','association','government office','hospital','pharmacy','restaurant','supermarket','department store','directory','bank','grocery'];
const variants=(term:string)=>/(ist|or|er|ian|clinic|salon|spa|studio)$/.test(term)?[term,term+'s']:[term];
const normalize=(s:string)=>' '+s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
const contains=(value:string,term:string)=>value.includes(' '+term+' ');
export function prospectFit(p:Business){const industry=normalize(p.industry||'');if(poor.some(term=>contains(industry,term)))return null;const group=groups.find(g=>g.terms.some(term=>variants(term).some(v=>contains(industry,v))));return group?{key:group.key,label:group.label,reason:group.reason}:null;}
function sqlIndustry(alias:string){let value=`lower(coalesce(${alias}.industry,''))`;for(const c of ['-','_','/',',',';','|','&','(',')','.',String.fromCharCode(10),String.fromCharCode(9)])value=`replace(${value},'${c}',' ')`;return `' '||trim(${value})||' '`;}
export function recommendedFitSql(alias='outreach_prospects'){
 const value=sqlIndustry(alias),terms=JSON.stringify(groups.flatMap(g=>g.terms).flatMap(variants)),excluded=JSON.stringify(poor);
 // D1 limits expression depth to 100. Iterate trusted terms instead of building
 // a left-deep OR expression for every industry and plural variant.
 return `(EXISTS(SELECT 1 FROM json_each('${terms}') fit_term WHERE instr(${value},' '||fit_term.value||' ')>0) AND NOT EXISTS(SELECT 1 FROM json_each('${excluded}') poor_term WHERE instr(${value},' '||poor_term.value||' ')>0))`;
}
export function recommendedPoolSql(alias='outreach_prospects'){
 // Most imported contacts share a small set of categories. Materialization
 // prevents the optimizer from repeating every term match for every business.
 return `${alias}.industry IN (WITH fit_industries AS MATERIALIZED (SELECT DISTINCT industry FROM outreach_prospects) SELECT industry FROM fit_industries WHERE ${recommendedFitSql('fit_industries')})`;
}
