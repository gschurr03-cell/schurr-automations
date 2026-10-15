import {recipeOfferFor,recipeOffers,recipesFor} from './client-templates';
import {database,RequestError} from './inquiries';
import {cleanProfile,getClientSetup,clientConfigurationHash} from './client-setups';
import {runTemplate,parseRows,RECIPES,OFFERS,type RecipeId} from './client-templates';
import {defaultAutomationSettings,type AutomationSettings} from './automation-profile';
import {OWNER_ALERT_FROM,OWNER_ALERT_EMAIL} from './owner-alert-content';
import {cursorDecode,cursorEncode} from './crm';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const operationId=(value:unknown)=>{if(typeof value!=='string'||!UUID.test(value))throw new RequestError(400,'Refresh and try again.');return value;};
export async function contentHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
export function textField(value:unknown,label:string,max:number,required=true){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)||(required&&!value.trim()))throw new RequestError(400,`Check ${label}.`);return value.trim();}
export async function getAutomationSettings():Promise<AutomationSettings>{
 const row=await database().prepare("SELECT profile,chat_enabled AS chatEnabled,google_eligibility AS googleEligibility,search_console_property AS searchConsoleProperty,revision FROM automation_settings WHERE id='business'").first<{profile:string;chatEnabled:number;googleEligibility:AutomationSettings['googleEligibility'];searchConsoleProperty:string;revision:number}>();
 return row?{...row,profile:JSON.parse(row.profile),chatEnabled:row.chatEnabled===1}:defaultAutomationSettings();
}
export async function saveAutomationSettings(data:Record<string,unknown>){
 const profile=cleanProfile(data.profile),revision=Number(data.revision),eligibility=String(data.googleEligibility),property=textField(data.searchConsoleProperty??'','Search Console property',200,false);
 if(!Number.isSafeInteger(revision)||revision<0||!['unconfirmed','online_only','visits_customers','receives_customers'].includes(eligibility)||typeof data.chatEnabled!=='boolean')throw new RequestError(400,'Reload the business setup.');
 // Live provider identity belongs to this deployment, never an arbitrary client profile.
 if(profile.businessName!=='Schurr Automations'||profile.website!=='https://schurrautomations.com'||profile.replyEmail!==OWNER_ALERT_EMAIL||profile.alertEmail!==OWNER_ALERT_EMAIL)throw new RequestError(400,'Keep this workspace connected to Schurr. Prepare other businesses in Client setups.');
 if(profile.reviewLink&&!validGoogleReviewLink(profile.reviewLink))throw new RequestError(400,'Paste the Google-provided review link, using g.page, search.google.com, or maps.app.goo.gl.');
 if(property&&property!=='sc-domain:schurrautomations.com'&&property!=='https://schurrautomations.com/')throw new RequestError(400,'Use Schurr’s Search Console property.');
 const now=new Date().toISOString();
 const saved=revision===0?await database().prepare("INSERT INTO automation_settings(id,profile,chat_enabled,google_eligibility,search_console_property,revision,updated_at) VALUES('business',?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING RETURNING revision").bind(JSON.stringify(profile),data.chatEnabled?1:0,eligibility,property,now).first<{revision:number}>():await database().prepare("UPDATE automation_settings SET profile=?,chat_enabled=?,google_eligibility=?,search_console_property=?,revision=revision+1,updated_at=? WHERE id='business' AND revision=? RETURNING revision").bind(JSON.stringify(profile),data.chatEnabled?1:0,eligibility,property,now,revision).first<{revision:number}>();
 if(!saved)throw new RequestError(409,'The setup changed in another tab. Reload before saving.');
 return {profile,revision:saved.revision,chatEnabled:data.chatEnabled,googleEligibility:eligibility as AutomationSettings['googleEligibility'],searchConsoleProperty:property} satisfies AutomationSettings;
}
export function validGoogleReviewLink(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['g.page','search.google.com','maps.app.goo.gl'].includes(u.hostname)&&u.pathname!=='/';}catch{return false;}}
export type OperationRun={id:string;kind:string;eventKey:string;profileRevision:number;input:string;output:string;status:string;createdAt:string;updatedAt:string};
export const OPERATION_KINDS={all:'All work',quote:'Quotes',review_request:'Review invitations',review_reply:'Review responses',knowledge:'Staff answers',seo:'SEO checks'} as const;
export const OPERATION_STATUSES={all:'All statuses',draft:'Draft',approved:'Approved',sending:'Sending',accepted:'Accepted',delayed:'Delayed',delivered:'Delivered',failed:'Failed',uncertain:'Uncertain',stopped:'Stopped',cancelled:'Cancelled',bounced:'Bounced',suppressed:'Suppressed',complained:'Complained'} as const;
export async function listOperationRunsPage(options:{excludeSearch?:boolean;kind?:string;status?:string;cursor?:string}={}){
 const kind=options.kind||'all',status=options.status||'all';
 if(!Object.hasOwn(OPERATION_KINDS,kind)||!Object.hasOwn(OPERATION_STATUSES,status))throw new RequestError(400,'Choose a saved-work filter.');
 const where:string[]=[],args:string[]=[];
 if(options.excludeSearch)where.push("r.kind!='search_import'");
 if(kind!=='all'){where.push('r.kind=?');args.push(kind);}
 if(status!=='all'){where.push('COALESCE(q.status,r.status)=?');args.push(status);}
 const boundary=cursorDecode(options.cursor);if(boundary){where.push('(r.created_at,r.id)<(?,?)');args.push(...boundary);}
 const rows=(await database().prepare(`SELECT r.id,r.kind,r.event_key AS eventKey,r.profile_revision AS profileRevision,r.input,r.output,r.status,r.created_at AS createdAt,r.updated_at AS updatedAt FROM automation_runs r LEFT JOIN review_requests q ON q.id=r.id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY r.created_at DESC,r.id DESC LIMIT 51`).bind(...args).all<OperationRun>()).results;
 const items=rows.slice(0,50),last=items.at(-1);return {items,nextCursor:rows.length>50&&last?cursorEncode(last.createdAt,last.id):null};
}
export async function listOperationRuns(excludeSearch=false){return (await listOperationRunsPage({excludeSearch})).items;}
export async function saveOperation(kind:string,eventKey:string,input:Record<string,unknown>,output:Record<string,unknown>,revision:number){
 const id=crypto.randomUUID(),now=new Date().toISOString(),encoded=JSON.stringify(input),hash=await contentHash(encoded);
 await database().prepare(`INSERT INTO automation_runs(id,kind,event_key,body_hash,profile_revision,input,output,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM automation_settings WHERE id='business'),0)=? ON CONFLICT(kind,event_key) DO NOTHING`).bind(id,kind,eventKey,hash,revision,encoded,JSON.stringify(output),now,now,revision).run();
 const saved=await database().prepare(`SELECT id,body_hash AS bodyHash,profile_revision AS profileRevision FROM automation_runs WHERE kind=? AND event_key=? AND profile_revision=COALESCE((SELECT revision FROM automation_settings WHERE id='business'),0)`).bind(kind,eventKey).first<{id:string;bodyHash:string;profileRevision:number}>();
 if(!saved||saved.bodyHash!==hash||saved.profileRevision!==revision)throw new RequestError(409,'This reference was already used with different information. Open the saved record or use a new reference.');return saved.id;
}
export async function prepareOperation(data:Record<string,unknown>){
 const settings=await getAutomationSettings();if(Number(data.revision)!==settings.revision)throw new RequestError(409,'The business information changed. Reload first.');
 const key=textField(data.eventKey,'the reference',100);if(!/^[a-zA-Z0-9_-]+$/.test(key))throw new RequestError(400,'Use letters, numbers, hyphens or underscores for the reference.');
 if(data.kind==='review_request')return prepareReview(data,settings,key);
 let input:Record<string,unknown>,output:Record<string,unknown>;
 if(data.kind==='quote'){
  const customer=textField(data.customer,'customer name',160),lines=data.lines;if(!Array.isArray(lines)||!lines.length||lines.length>30)throw new RequestError(400,'Add 1–30 quote lines.');
  const results=lines.map(line=>{if(!line||typeof line!=='object')throw new RequestError(400,'Check the quote lines.');const r=runTemplate('quote',settings.profile,line,'deployment');if(r.status!=='draft_ready')throw new RequestError(400,r.summary);return r.output;});
  const subtotalCents=results.reduce((n,row)=>n+Number(row.subtotalCents),0);if(!Number.isSafeInteger(subtotalCents))throw new RequestError(400,'This quote is too large.');
  input={customer,lines};output={customer,currency:'USD',lines:results,subtotalCents,subtotal:(subtotalCents/100).toFixed(2),tax:'Not calculated',status:'Draft for owner review; not sent or binding'};
 }else if(data.kind==='review_reply'){
  input={reviewText:textField(data.reviewText,'review text',4000)};const r=runTemplate('review_reply',settings.profile,input,'deployment');if(r.status!=='draft_ready')throw new RequestError(400,r.summary);output={...r.output,status:'Draft only; review and post through Google Business Profile. No Google account is connected.'};
 }else if(data.kind==='knowledge'){
  input={question:textField(data.question,'question',500)};const r=runTemplate('knowledge',settings.profile,input,'deployment');if(r.status!=='draft_ready')throw new RequestError(400,r.summary);output=r.output;
 }else throw new RequestError(400,'Choose an available workflow.');
 const id=await saveOperation(String(data.kind),key,input,output,settings.revision);return {id,output};
}
async function prepareReview(data:Record<string,unknown>,settings:AutomationSettings,key:string){
 if(!['visits_customers','receives_customers'].includes(settings.googleEligibility))throw new RequestError(400,'Confirm Google Business Profile eligibility in Business setup first.');
 if(!validGoogleReviewLink(settings.profile.reviewLink))throw new RequestError(400,'Add the real Google review link in Business setup first.');
 if(data.completed!==true||data.permission!==true)throw new RequestError(400,'A completed service and permission for this review email are required.');
 const name=textField(data.customer,'customer name',160),email=textField(data.email,'email',254).toLowerCase(),evidence=textField(data.consentEvidence,'review email permission evidence',500);
 const input={eventId:key,name,email,completed:true,permission:true,consentEvidence:evidence};const r=runTemplate('review_request',settings.profile,input,'deployment');if(r.status!=='draft_ready')throw new RequestError(400,r.summary);
 if(await database().prepare('SELECT email FROM outreach_suppressions WHERE email=?').bind(email).first())throw new RequestError(400,'This contact is suppressed. No invitation was prepared.');
 const output={recipient:email,subject:r.output.subject,body:r.output.body,permission:evidence,status:'Awaiting your send approval'};
 const id=crypto.randomUUID(),now=new Date().toISOString(),hash=await contentHash(JSON.stringify(input));
 // Both the event receipt and the invitation commit together; a failed outbox write rolls back the draft.
 await database().batch([
  database().prepare(`INSERT INTO automation_runs(id,kind,event_key,body_hash,profile_revision,input,output,created_at,updated_at) SELECT ?,'review_request',?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM automation_settings WHERE id='business'),0)=? ON CONFLICT(kind,event_key) DO NOTHING`).bind(id,key,hash,settings.revision,JSON.stringify(input),JSON.stringify(output),now,now,settings.revision),
  database().prepare(`INSERT INTO review_requests(id,job_id,recipient,consent_evidence,payload,profile_revision,created_at) SELECT id,event_key,?,?,json_object('from',?,'to',json_array(?),'reply_to',?,'subject',?,'text',?,'tags',json_array(json_object('name','purpose','value','review_request'),json_object('name','request_id','value',id))),profile_revision,created_at FROM automation_runs WHERE kind='review_request' AND event_key=? AND body_hash=? AND profile_revision=? AND profile_revision=COALESCE((SELECT revision FROM automation_settings WHERE id='business'),0) ON CONFLICT(job_id) DO NOTHING`).bind(email,evidence,OWNER_ALERT_FROM,email,settings.profile.replyEmail,String(r.output.subject),String(r.output.body),key,hash,settings.revision)
 ]);
 const saved=await database().prepare(`SELECT r.id,r.output FROM automation_runs r JOIN review_requests q ON q.id=r.id WHERE r.kind='review_request' AND r.event_key=? AND r.body_hash=? AND r.profile_revision=? AND r.profile_revision=COALESCE((SELECT revision FROM automation_settings WHERE id='business'),0)`).bind(key,hash,settings.revision).first<{id:string;output:string}>();
 if(!saved)throw new RequestError(409,'This reference was already used with different information or the setup changed. Reload first.');
 return {id:saved.id,output:JSON.parse(saved.output)};
}
export async function operationAction(data:Record<string,unknown>){
 const id=operationId(data.id),settings=await getAutomationSettings();
 if(data.action==='approve'){
  const row=await database().prepare("UPDATE automation_runs SET status='approved',updated_at=? WHERE id=? AND status='draft' AND kind IN ('quote','review_reply') AND profile_revision=? AND profile_revision=COALESCE((SELECT revision FROM automation_settings WHERE id='business'),0) RETURNING id").bind(new Date().toISOString(),id,settings.revision).first();if(!row)throw new RequestError(409,'This draft changed, was already reviewed, or uses older business information.');
 }else if(data.action==='cancel'){
  await database().batch([database().prepare("UPDATE automation_runs SET status='cancelled',updated_at=? WHERE id=?").bind(new Date().toISOString(),id),database().prepare("UPDATE review_requests SET status=CASE WHEN first_attempt_at>0 THEN 'stopped' ELSE 'cancelled' END,retryable=0,last_error='Owner stopped this invitation.' WHERE id=? AND status NOT IN ('delivered','bounced','complained','suppressed')").bind(id)]);
 }else throw new RequestError(400,'Choose an available action.');
}
export async function deploymentKit(clientId?:string|null){
 const setup=clientId?await getClientSetup(clientId):null,settings=await getAutomationSettings();const profile=setup?.profile||settings.profile;
 return {format:'schurr-workflow-install-v1',clientId:setup?.id||null,configurationHash:setup?await clientConfigurationHash(setup):null,business:profile,revision:setup?.revision??settings.revision,mode:'isolated_deployment_required',credentialsIncluded:false,enabled:false,
 modules:RECIPES.map(r=>({id:r.id,offer:OFFERS[recipeOfferFor(r,setup?.offers||[])].name,applicableOffers:recipeOffers(r),selected:setup?recipesFor(setup.offers).some(selected=>selected.id===r.id):true,requiredFields:r.needs})),
 implementation:{booking:'Native calendar with confirmed phone appointments, blocked time, conflict prevention and cancellation',handoff:'Priority callback queue; live transfer not connected',followups:'Manual follow-up reminders with reply, booking, contact-change and withdrawal stop rules',launch:'Revision-bound client evidence and scoped launch approval',inquiries:'Atomic intake, CRM, first-email and owner-alert outboxes',reviews:'Completed-service eligibility, saved invitations, owner approval and Resend delivery events',quotes:'Saved multi-line drafts using exact approved prices',knowledge:'Approved-source lookup',seo:'Source-page audit with saved history',assistant:'Approved public question lookup with contact-form handoff'},
 requiredConnections:['An isolated database and deployment','Dedicated voice account/agent/number','Verified sender and delivery webhook','Eligible Google profile and actual review link','Search Console property access','Approved price book and business facts'],
 activation:['Deploy this shared application to the client’s isolated environment','Replace deployment identity and provider bindings; do not import Schurr credentials','Load and approve the client brief','Test normal, duplicate, stopped and failed operations','Enable each connected channel after client sign-off'],
 unavailable:['Automatic Google review retrieval/reply publishing','Search Console API reporting','Google Calendar sync, customer confirmations, SMS and live call transfer','Arbitrary application adapters and unattended retry scheduling'],
 };
}
export function publicAssistant(settings:AutomationSettings){return {enabled:settings.chatEnabled,businessName:settings.profile.businessName,questions:settings.chatEnabled?parseRows(settings.profile.faqs,3).slice(0,30).map(([question,answer,source],index)=>({id:String(index),question,answer,source})):[],contactUrl:'/#contact'};}
