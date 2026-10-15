import {emptyProfile,missingFor,parseRows,RECIPES,recipesFor,runTemplate,sampleEvent,type ClientProfile,type OfferId} from './client-templates';

/** Fictional starter. Creating it only saves a draft business brief. */
export function homeServiceDemoProfile():ClientProfile {
 return {...emptyProfile(),businessName:'Oak & River Home Services · Demo',contactName:'Sample service manager',industry:'Home services · fictional example',website:'https://example.com',publicPhone:'+12025550146',alertEmail:'owner@example.com',replyEmail:'team@example.com',timezone:'America/Denver',businessHours:'Monday–Friday, 8am–5pm. After-hours requests are reviewed the next business day.',serviceArea:'Example service area. Staff confirms coverage before accepting work.',services:'Fictional demonstration business offering home maintenance and repair estimates. No emergency dispatch. A team member confirms scope and pricing.',qualificationQuestions:'What work do you need help with?\nWhat area is the property in?',handoffInstructions:'Prepare the confirmed request for the service manager. Staff confirms availability and follows up using the customer’s approved contact method.',bookingRules:'Staff confirms every appointment. No connected calendar or live transfer.',reviewLink:'https://example.com/review-demo',reviewRules:'Fictional policy: one neutral invitation after completed work, only with review-email permission. No rating-based selection.',priceBook:'INSPECT | Sample inspection | 125.25',internalKnowledge:'Who reviews exceptions? | The designated service manager reviews exceptions before work proceeds. | Fictional team handbook',fieldMap:'name | customer_name\nemail | contact_email',faqs:'What services do you offer? | We help with home maintenance and repair estimates. A team member will confirm the scope and price. | Fictional demo service guide\nCan I book a visit? | Our team confirms availability before booking a visit. I can help prepare your request for them. | Fictional demo booking policy\nDo you handle emergencies? | We do not provide emergency dispatch. For an immediate threat to safety, contact the appropriate emergency service. | Fictional demo service policy',connections:'FICTIONAL DEMO ONLY. No phone, sender, inbox, CRM or calendar is connected. Replace and approve all example information before client use.'};
}
export function setupReadiness(profile:ClientProfile,offers:OfferId[]){
 const recipes=recipesFor(offers);
 return {total:recipes.length,ready:recipes.filter(r=>missingFor(profile,r).length===0).length,missing:[...new Set(recipes.flatMap(r=>missingFor(profile,r)))]};
}
export const DEMO_CASES=[{id:'normal',label:'New customer'},{id:'unknown',label:'Question outside the approved answers'},{id:'no_permission',label:'No follow-up permission'},{id:'stopped',label:'Customer asks to stop'},{id:'duplicate',label:'Repeated event'}] as const;
export type DemoCase=typeof DEMO_CASES[number]['id'];
export type DemoChannel='phone'|'website';
export type DemoStory={channel:DemoChannel;scenario:DemoCase;label:string;status:'ready'|'paused'|'blocked';headline:string;reason:string;conversation:{speaker:string;text:string}[];record:null|{name:string;contact:string;request:string;permission:string};email:null|{subject:string;body:string};ownerAlert:string|null;nextStep:string;missing:string[]};
export type DemoStep={title:string;text?:string;conversation?:{speaker:string;text:string}[];facts?:{label:string;value:string}[];table?:{columns:string[];rows:string[][]};draft?:{subject?:string;body:string};notice?:string};
export type WorkflowScene={id:string;label:string;status:'ready'|'paused'|'blocked';steps:DemoStep[]};
export type WorkflowDemo={id:string;offer:OfferId;name:string;scope:string[];needs:string;scenes:WorkflowScene[]};
export type ClientPresentation={businessName:string;revision:number;stories:DemoStory[];scope:string[];modules:WorkflowDemo[]};

/** Build an allowlisted presentation. Never serialize internal notes, staff addresses or credentials. */
export function buildClientPresentation(p:ClientProfile,revision:number,offers:OfferId[]=['calls']):ClientPresentation {
 const stories:DemoStory[]=[];
 for(const channel of ['phone','website'] as const)for(const option of DEMO_CASES){
  const scenario=option.id;
  const required=channel==='phone'?['receptionist','inquiry']:['inquiry'];
  const missing=[...new Set(required.flatMap(id=>missingFor(p,RECIPES.find(r=>r.id===id)!)))];
  const question=parseRows(p.faqs,3)[0];
  const topic=scenario==='unknown'?'A request outside the approved service information':question?.[0]||'A question about your services';
  const input={...sampleEvent('inquiry',p),permission:scenario!=='no_permission',stopped:scenario==='stopped',alreadyProcessed:scenario==='duplicate'};
  const reply=runTemplate('inquiry',p,input,'presentation');
  const paused=['no_permission','stopped','duplicate'].includes(scenario);
  const ready=!missing.length&&!paused&&reply.status==='draft_ready';
  const conversation:DemoStory['conversation']=channel==='phone'?[
   {speaker:'AI receptionist',text:`Hi, thanks for calling ${p.businessName}. I’m your AI receptionist. How can I help?`},
   {speaker:'Sample customer',text:topic},
   {speaker:'AI receptionist',text:scenario==='unknown'?'I don’t have an approved answer for that. Your team would need to confirm it.':question?.[1]||'Tell me what you need help with, and your team can confirm the details.'},
  ]:[{speaker:'Sample website inquiry',text:topic}];
  if(scenario==='normal'||scenario==='unknown')conversation.push({speaker:'Sample customer',text:'I’m Jordan Example. The team can email me at jordan@example.com about this request.'});
  if(scenario==='no_permission')conversation.push({speaker:'Sample customer',text:'I only wanted some information. Please don’t follow up.'});
  if(scenario==='stopped')conversation.push({speaker:'Sample customer',text:'Please stop contacting me about this request.'});
  if(scenario==='duplicate')conversation.push({speaker:'Example event',text:'The same inquiry arrives a second time with the same event reference.'});
  const reason=missing.length?'Add the missing business information before using this rehearsal.':scenario==='no_permission'?'No follow-up permission, so no contact draft is prepared.':scenario==='stopped'?'A withdrawal pauses further contact. This rehearsal does not change any real request.':scenario==='duplicate'?'The sample marks this event as previously processed. A live connection must store and check event references.':scenario==='unknown'?'The question goes to staff instead of inventing an answer.':'The customer’s request and permission are ready for staff review.';
  stories.push({channel,scenario,label:option.label,status:missing.length?'blocked':paused?'paused':'ready',headline:missing.length?'Business information needed':paused?'Follow-up paused':scenario==='unknown'?'Route the question to staff':'A clear handoff for the team',reason,conversation,record:ready?{name:'Jordan Example',contact:'jordan@example.com',request:topic,permission:'Email permitted for this request only'}:null,email:ready&&channel==='website'?{subject:String(reply.output.subject),body:String(reply.output.body)}:null,ownerAlert:ready?'Jordan Example has a new request. Review the request, confirmed email and permission before responding.':null,nextStep:ready?(channel==='phone'?'Staff reviews the callback request and replies through the confirmed contact method.':'After the first acknowledgment, staff reviews the inquiry and takes over.'):missing.length?'Complete the saved business brief, then reopen this presentation.':'No new follow-up is prepared for this example.',missing});
 }
 return {businessName:p.businessName,revision,stories:stories.filter(s=>s.channel==='phone'?offers.includes('calls'):offers.includes('calls')||offers.includes('website')),modules:buildWorkflowDemos(p,offers,stories),scope:['Approved business answers','Confirmed request and contact permission','Staff handoff','First email for opted-in website inquiries']};
}

const SCENE_OPTIONS=[{id:'normal',label:'Normal request'},{id:'missing',label:'Missing or unsupported information'},{id:'stopped',label:'Staff pauses the work'},{id:'duplicate',label:'Previously processed event'}] as const;
function fromInquiry(channel:DemoChannel,offer:OfferId,stories:DemoStory[]):WorkflowDemo{return {id:channel==='phone'?'phone':'lead-response',offer,name:channel==='phone'?'AI receptionist':'Lead response',scope:['Approved answers','Confirmed contact permission','A clear staff handoff'],needs:channel==='phone'?'Connect and test the client’s phone, CRM destination and email sender. Calendar booking and transfer need their own connections.':'Connect and test the client website, CRM destination and email sender.',scenes:stories.filter(s=>s.channel===channel).map(s=>({id:s.scenario,label:s.label,status:s.status,steps:[{title:channel==='phone'?'A customer calls':'A customer reaches out',conversation:s.conversation,notice:'All customer details are fictional.'},{title:s.headline,text:s.reason,facts:s.record?[{label:'Customer',value:s.record.name},{label:'Confirmed contact',value:s.record.contact},{label:'Request',value:s.record.request},{label:'Permission',value:s.record.permission}]:s.missing.map(value=>({label:'Still needed',value})),notice:!s.record?'No new follow-up record prepared.':undefined},{title:s.email?'The first response':s.record?'The team takes over':'No follow-up prepared',draft:s.email||undefined,text:s.nextStep,notice:s.ownerAlert?'Sample staff alert: '+s.ownerAlert:undefined}]}))};}
function templateDemo(p:ClientProfile,recipeId:typeof RECIPES[number]['id']):WorkflowDemo{
 const recipe=RECIPES.find(r=>r.id===recipeId)!;
 // Demonstrations of internal tools use fictional rules. Never serialize private client prices, mappings or staff knowledge.
 const publicProfile={...p,handoffInstructions:'The designated team reviews the request and confirms the next step.'};
 const internal=['quote','knowledge','sync'].includes(recipeId),demo=internal?{...publicProfile,contactName:'Sample service manager',priceBook:'INSPECT | Sample inspection | 125.25',internalKnowledge:'Who reviews exceptions? | The designated service manager reviews exceptions before work proceeds. | Fictional team handbook',fieldMap:'name | customer_name\nemail | contact_email'}:publicProfile;
 const allowed=SCENE_OPTIONS.filter(s=>recipeId!=='website'||s.id!=='missing');
 const scenes=allowed.map(option=>{
  const event=sampleEvent(recipeId,demo,option.id);
  if(recipeId==='quote')event.quantity=2;
  if(recipeId==='sync'&&option.id!=='missing')event.record={name:'Jordan Example',email:'jordan@example.com'};
  if(recipeId==='review_reply'&&option.id==='normal')event.reviewText='The team explained the work clearly and kept me updated. Thank you.';
  if(recipeId==='local_profile'&&option.id==='missing')event.profile={businessName:demo.businessName,website:demo.website,publicPhone:'Missing from the supplied listing',businessHours:'Outdated hours',serviceArea:demo.serviceArea};
  const result=runTemplate(recipeId,demo,event,'buyer-demo'),out=result.output;
  let first:DemoStep={title:'A request comes in',facts:[{label:'Example',value:recipe.trigger}]},second:DemoStep={title:result.status==='draft_ready'?'Prepared for review':result.status==='no_action'?'The workflow stops':'Information is needed',text:result.summary},third:DemoStep={title:'The next step',text:'Staff reviews the prepared work before any real action.'};
  if(recipeId==='chat')first={title:'A visitor asks a question',conversation:[{speaker:'Sample visitor',text:String(event.question)}]};
  if(recipeId==='review_request')first={title:'A project is completed',facts:[{label:'Customer',value:'Jordan Example'},{label:'Project',value:'Sample project 001'},{label:'Service complete',value:event.completed===true?'Yes':'Not confirmed'},{label:'Review-email permission',value:event.permission===true?'Confirmed for this example':'Not confirmed'}]};
  if(recipeId==='review_reply')first={title:'A customer leaves feedback',conversation:[{speaker:'Fictional review',text:String(event.reviewText||'No review text supplied')}],notice:'This review is invented for the demonstration. Nothing was retrieved from Google.'};
  if(recipeId==='local_profile')first={title:'Check the business listing',text:'Compare supplied listing details with the approved business brief.',notice:'Sample listing data. No Google profile was fetched.'};
  if(recipeId==='quote')first={title:'Prepare a customer quote',facts:[{label:'Customer',value:'Jordan Example'},{label:'Service',value:option.id==='missing'?'Unknown service':'Sample inspection'},{label:'Quantity',value:'2'}],notice:'Illustrative service and prices. Your saved private price book is excluded.'};
  if(recipeId==='knowledge')first={title:'A team member needs an answer',conversation:[{speaker:'Sample staff member',text:String(event.question)}],notice:'Uses a fictional handbook. Your private staff knowledge is excluded.'};
  if(recipeId==='sync')first={title:'A customer record changes',facts:[{label:'Name',value:option.id==='missing'?'Missing':'Jordan Example'},{label:'Email',value:option.id==='missing'?'Missing':'jordan@example.com'}],notice:'Uses a fictional field mapping. Your private application notes are excluded.'};
  if(recipeId==='website')first={title:'Prepare the website handoff',text:'Use approved services and service-area details to prepare the website brief.'};
  if(result.status==='draft_ready'){
   if(recipeId==='chat'||recipeId==='knowledge')second={title:'An approved answer with its source',text:String(out.answer),facts:[{label:'Source',value:String(out.source)}]};
   if(recipeId==='review_request')second={title:'One neutral invitation',draft:{subject:String(out.subject),body:String(out.body)},notice:'Sample email only. Nothing is sent. Reviews are requested using the same rules for every customer.'};
   if(recipeId==='review_reply')second={title:'A response draft for approval',draft:{body:String(out.draft)},notice:'The owner reviews the actual feedback before posting. No public reply is published.'};
   if(recipeId==='local_profile'){const checks=out.checks as {field:string;approved:string;observed:string;matches:boolean}[];const labels:Record<string,string>={businessName:'Business name',website:'Website',publicPhone:'Business phone',businessHours:'Hours',serviceArea:'Service area'};second={title:checks.every(c=>c.matches)?'The supplied details match':'Listing details need attention',table:{columns:['Detail','Result'],rows:checks.map(c=>[labels[c.field]||c.field,c.matches?'Matches the approved brief':'Needs review'])},notice:'This checks supplied business information. It does not measure rankings or search traffic.'};}
   if(recipeId==='quote')second={title:'A quote draft from approved rules',table:{columns:['Service','Quantity','Unit price','Subtotal'],rows:[[String(out.description),String(out.quantity),'$'+(Number(out.unitCents)/100).toFixed(2),'$'+String(out.subtotal)]]},notice:'Fictional USD example. Tax and discounts are excluded. This is not Schurr’s pricing or a binding quote.'};
   if(recipeId==='sync')second={title:'Only the agreed fields are mapped',table:{columns:['Source field','Destination field','Example value'],rows:[['name','customer_name',String((out.mappedRecord as Record<string,unknown>).customer_name)],['email','contact_email',String((out.mappedRecord as Record<string,unknown>).contact_email)]]},notice:'No real application record is changed.'};
   if(recipeId==='website')second={title:'The content and contact route',facts:[{label:'Business',value:p.businessName},{label:'Services',value:p.services},{label:'Service area',value:p.serviceArea},{label:'Contact route',value:demo.handoffInstructions}]};
  }else if(Array.isArray(out.missing))second.facts=out.missing.map(value=>({label:'Still needed',value:String(value)}));
  if(result.status!=='draft_ready')third={title:'No external action',text:option.id==='duplicate'?'The example is flagged as already processed. A connected system needs durable event references to enforce this in production.':option.id==='stopped'?'Staff control is respected. No further work is prepared in this example.':'Complete the missing information or ask the responsible staff member to review it.'};
  else if(recipeId==='chat'||recipeId==='website')third={title:'A clear route to the team',text:demo.handoffInstructions||'Use the approved contact route for staff help.'};
  else if(recipeId==='review_request')third={title:'Approve, send, then track delivery',text:'In a connected deployment, the owner approves the saved invitation before sending. Delivery events report acceptance or failure; completed job references prevent duplicate requests.'};
  else if(recipeId==='review_reply')third={title:'Review before publishing',text:'Check the response for accuracy and privacy, then publish through the verified Google account.'};
  else if(recipeId==='local_profile')third={title:'Correct the confirmed differences',text:'Confirm outdated details with the owner before editing the Google profile. Search Console reporting needs its own connection.'};
  else if(recipeId==='quote')third={title:'Review the scope and total',text:'Staff reviews the quote, confirms any tax or discounts and approves the final customer proposal. This demonstration does not send or accept a quote.'};
  else if(recipeId==='knowledge')third={title:'Use the source or ask the owner',text:'Staff uses the approved answer and its source. Unknown questions go to the designated owner.'};
  else if(recipeId==='sync')third={title:'Validate before writing',text:'The connected application must validate permissions, required fields and repeated events before accepting a real update.'};
  if(option.id==='stopped'||option.id==='duplicate')first.notice=option.id==='stopped'?'Staff has paused this request.':'This sample event is marked as previously processed.';
  return {id:option.id,label:option.label,status:result.status==='draft_ready'?'ready' as const:result.status==='no_action'?'paused' as const:'blocked' as const,steps:[first,second,third]};
 });
 const names:Partial<Record<typeof recipeId,string>>={website:'Website handoff',chat:'Website answers',review_request:'Review requests',review_reply:'Review responses',local_profile:'Local SEO details',quote:'Quote assistant',knowledge:'Staff answers',sync:'App-to-app workflow'};
 return {id:recipeId,offer:recipe.offer,name:names[recipeId]||recipe.name,scope:[recipe.trigger,...recipe.checks],needs:OFFERS_FOR_DEMO[recipe.offer],scenes};
}
const OFFERS_FOR_DEMO:Record<OfferId,string>={calls:'Connect and test the phone, CRM and sender.',website:'Connect the website and approved staff handoff. A generative chatbot needs a separate model connection.',reviews:'Connect the client’s Google profile, review link, completed-job source and verified sender. Google publishing and search reporting require their own connections.',coding:'Connect the client’s approved rules, access controls and source/destination tools. Actual private rules stay in the operational workspace.'};
function buildWorkflowDemos(p:ClientProfile,offers:OfferId[],stories:DemoStory[]):WorkflowDemo[]{
 const modules:WorkflowDemo[]=[];
 if(offers.includes('calls'))modules.push(fromInquiry('phone','calls',stories));
 if(offers.includes('calls')||offers.includes('website'))modules.push(fromInquiry('website',offers.includes('website')?'website':'calls',stories));
 for(const recipe of recipesFor(offers))if(!['receptionist','inquiry'].includes(recipe.id))modules.push(templateDemo(p,recipe.id));
 return modules;
}
