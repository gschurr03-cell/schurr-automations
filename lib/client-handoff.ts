import {recipeOfferFor} from './client-templates';
import {OFFERS,PROFILE_FIELDS,recipesFor,missingFor,type OfferId,type ClientProfile} from './client-templates';
import {CLIENT_IDENTITY_FILES} from './client-preflight';

type Kit={
 clientId:string;revision:number;configurationHash:string;profile:ClientProfile;
 offers:{id:OfferId}[];
 rehearsal:{state:string};
};
type Evidence={revision:number;installationRevision?:number;installationCurrent?:boolean;checks:{id:string;label:string;record?:{setupRevision:number;installationRevision?:number;outcome:string}}[]};
type ConnectionStep={title:string;prepare:string;test:string;evidence:string};
const CHECKS_BY_OFFER:Record<OfferId,string[]>={
 calls:['phone','booking','handoff','followup'],website:['website'],reviews:['google_profile','reviews','search'],coding:['workflow'],
};
const CONNECTIONS:Record<OfferId,ConnectionStep[]>={
 calls:[
  {title:'Retell phone intake',
   prepare:'After replacing deployment identity, open /manage/receptionist on the isolated client deployment. Connect the client Retell account with its webhook-designated key in the password form, then choose a voice and create the client agent. This action creates provider resources; the downloaded files do not. Confirm every custom function uses the client origin plus /api/retell/tools. Assign only the dedicated client number in Retell; leave intake in test mode while rehearsing.',
   test:'Run a fictional browser conversation and confirm dry_run, then inspect the prompt and tool URLs. After explicit permission for a controlled live test, verify the assigned number and agent, enable phone intake, and call with confirmed contact permission. Check /manage/response for one saved request. Test duplicate capture, unknown answers, withdrawal, an unavailable tool, a muted opening and deliberate interruption. Browser tests do not prove phone audio quality.',
   evidence:'Record non-secret agent/number references, test mode versus live mode, saved request reference and observed outcomes under phone, handoff and recovery.'},
  {title:'Native appointments, if included',
   prepare:'Open /manage/schedule in the client deployment. Approve the timezone, appointment duration, buffers, lead time, horizon and weekly availability; block existing outside commitments. For phone booking, connect the scheduling tools only to the verified client agent. This native calendar also supports owner scheduling without voice.',
   test:'Use a controlled client test request to book, reject a conflicting slot, reschedule and cancel. Repeat the same request and confirm one result; verify the final CRM appointment state. A downloaded .ics file is a manual export, not external calendar sync.',
   evidence:'Record appointment references and conflict, duplicate, reschedule and cancellation outcomes under booking. Explicitly defer booking if excluded.'},
  {title:'Personal follow-up queue',
   prepare:'Use the incoming request’s next-step controls for manual reminders and recorded replies. Confirm the displayed contact, channel, timezone and permission before saving.',
   test:'Verify reply, withdrawal, staff takeover, booking and contact changes stop the appropriate reminder. A reminder does not send a text or email; incoming inbox replies are not automatically detected.',
   evidence:'Record the request/reminder reference and stop-rule results under followup.'},
 ],
 website:[
  {title:'Client website and approved-answer assistant',
   prepare:'Connect the client domain to the isolated deployment. Replace public branding, contact links, service facts, metadata, sitemap and robots references. Review the client identity already generated in lib/automation-desk.ts, preserving validation and owner authorization. Then use /manage/automations to enter approved client settings and public FAQ rows. There is no setup JSON import button. Never put staff-only knowledge, connection notes or private prices into the public FAQ.',
   test:'On mobile and desktop, ask an exact approved question and an unknown question. Confirm the exact approved answer/source or staff handoff. Submit one permitted website inquiry, verify the saved record in /manage/response, and repeat the submission to confirm one result. Test the failure path before showing success.',
   evidence:'Record the client origin, tested pages, saved inquiry reference and answer/handoff results under website. Confirm another client’s data is not accessible.'},
 ],
 reviews:[
  {title:'Business details and Google ownership',
   prepare:'Have the client owner verify access to the intended Google Business Profile location and approve business name, address/service area, phone, hours and website. Record the location reference in the saved Installation section when review invitations are included. After reviewing the generated client identity, save the approved review link and fair completed-job rules in the client business settings.',
   test:'Open the approved review link manually and confirm it resolves to the intended business. Compare the actual listing against approved facts. The application does not retrieve Google reviews or publish replies through an API; keep those actions manual or explicitly deferred.',
   evidence:'Record the location reference, owner-confirmed access and fact/link comparison under google_profile and reviews.'},
  {title:'Review invitation and response drafts',
   prepare:'In /manage/automations, prepare a review request from an approved completed-job reference, confirmed contact and review-contact permission. Use the same eligibility for every expected rating. Connect the business email path below only if invitation sending is in scope. Review responses remain drafts requiring staff approval and manual Google publication.',
   test:'Confirm incomplete work and withdrawn permission block the invitation; a repeated job reference does not create a second invitation. After owner approval of a controlled recipient and live test, inspect the saved invitation, Resend event and recipient inbox separately.',
   evidence:'Record job/invitation references, fair-eligibility checks and actual delivery result under reviews and email. Do not include private service details in a public reply.'},
  {title:'Search and source-page checks',
   prepare:'Confirm the client owner’s Search Console property access and sitemap. Review the generated property allowlists in lib/automation-desk.ts and lib/search-reports.ts and the property choices in app/manage/automations/workspace.tsx. Confirm they match the client property without removing validation. Verify lib/site-seo.ts page imports, canonical origin and sitemap against the generated client site. Reporting uses an owner-prepared English Search Console Dates CSV, not an API connection. Record searchProperty if searchReporting is prepare.',
   test:'Check the correct property/date range and imported rows. Confirm the report describes supplied data, not a live Search Console API connection. No API reporting or ranking outcome is established by this package.',
   evidence:'Record property reference, report period/source and sitemap check under search; explicitly defer unavailable API reporting.'},
 ],
 coding:[
  {title:'Quote, staff answer and application mapping',
   prepare:'After reviewing the generated client identity guard in lib/automation-desk.ts, use /manage/automations to enter approved price rows for quote drafts and approved staff-only knowledge for the private lookup. Review the exact field map in the private setup JSON. Identify source/destination account owners and permission boundaries. Arbitrary application writes require a client-specific adapter; setting destinationRef does not implement one.',
   test:'Check exact service codes and integer-cent quote totals; unknown services must block and every draft needs approval. Verify staff-only answers require authorized access and remain absent from public demos/FAQs. For an implemented adapter, test missing fields, target validation, duplicate events, authorization denial and interrupted/retried writes before allowing real writes.',
   evidence:'Record approved quote/lookup cases and source/destination test references under workflow. Keep application writes deferred until the adapter and failure recovery are implemented and tested.'},
 ],
};
function recordStatus(record:Evidence['checks'][number]['record'],revision:number,installationRevision:number,installationCurrent:boolean){
 if(!record)return 'Not recorded';
 if(!installationCurrent||record.setupRevision!==revision||(record.installationRevision??0)!==installationRevision||record.outcome==='stale')return 'Out of date — rerun for this brief';
 if(record.outcome==='passed')return 'Owner recorded pass — not automated verification';
 if(record.outcome==='deferred')return 'Deferred — include in approved scope';
 return 'Needs work';
}
const tableText=(value:string)=>value.replace(/[|\r\n]/g,' ').replace(/[<>]/g,'');
/** Owner-only implementation handoff. No profile value, custom test, evidence text or provider secret is serialized. */
export function clientImplementationReadme(kit:Kit,launch:Evidence):string{
 if(kit.revision!==launch.revision)throw new Error('The brief changed while preparing the handoff.');
 if(!/^[0-9a-f-]{36}$/i.test(kit.clientId)||!Number.isSafeInteger(kit.revision)||kit.revision<1||!/^[0-9a-f]{64}$/.test(kit.configurationHash))throw new Error('Use a current saved client setup.');
 const offers=(Object.keys(OFFERS) as OfferId[]).filter(id=>kit.offers.some(o=>o.id===id));
 if(!offers.length)throw new Error('Choose a saved client service.');
 const selected=recipesFor(offers),required=[...new Set(selected.flatMap(r=>[...r.needs]))];
 const missing=required.filter(key=>!kit.profile[key]?.trim());
 const lines=[
 '# Client implementation checklist',
 '',
 'Client reference: '+kit.clientId+' · Brief revision: '+kit.revision,
 'Installation revision: '+(launch.installationRevision??0)+(launch.installationCurrent===false?' (review required for this brief)':''),
 'Configuration fingerprint: '+kit.configurationHash,
 '',
 'Selected services: '+offers.map(id=>OFFERS[id].name).join('; ')+'.',
 '',
 'This is an owner-only handoff of preparation tasks. It creates no accounts, deploys nothing and enables no live actions. Checked boxes or recorded passes are not automatic proof of a working connection.',
 '',
 '## 1. Lock the brief and approve the missing facts',
 '',
 '- [ ] Confirm the selected services and exclusions with the client approval owner.',
 '- [ ] Save the Installation section and download client-preparation.json. Keep it private; the package includes approved business facts and staff-only configuration.',
 '- [ ] Verify the client ID, revision and configuration fingerprint agree across the files. A later CRM brief edit requires fresh downloads, a new test pack and renewed affected launch evidence.',
 '',
 missing.length?'Missing required facts: '+missing.map(key=>PROFILE_FIELDS.find(f=>f.key===key)!.label).join('; ')+'.':'Required fields are present. Presence is not client approval; confirm accuracy before configuring any provider.',
 '',
 '| Selected workflow | Required fact review |',
 '| --- | --- |',
 ...selected.map(r=>'| '+r.name+' | '+(missingFor(kit.profile,r).length?'Add: '+missingFor(kit.profile,r).join('; '):'Fields present; approval required')+' |'),
 '',
 '## 2. Prepare the isolated deployment',
 '',
 '- [ ] Create the client deployment and database through the existing deployment process. Apply the application schema to the empty client database. Do not copy Schurr contacts, outboxes, provider connection rows or secrets.',
 '- [ ] Set the intended approval owner in OWNER_EMAIL and a fresh INQUIRY_SIGNING_SECRET in the deployment secret store. Verify the owner can sign in and an unrelated account cannot access /manage or its API exports.',
 '- [ ] Review the generated deployment identity in the files below, public copy, sender/reply destinations, management instructions and error messages. The preparation runner configures these from the saved brief; verify the output rather than removing its guards.',
 ...CLIENT_IDENTITY_FILES.map(file=>'  - '+file),
 '- [ ] Run the matching reviewed source compiler: node scripts/prepare-client.cjs --config /path/client-preparation.json --output /new/client-workspace. Use a new directory, then review IMPLEMENTATION.txt and private/receipt.json. The receipt must identify this brief and installation revision.',
 '- [ ] Review the saved CRM installation references and every capability as prepare or deferred. Preparation creates no accounts or connections and keeps live actions disabled.',
 '- [ ] Use only the generated source and private settings for this client. Apply its reviewed migrations and seed to a new empty database; never use a Schurr data export.',
 '',
 'Successful source preparation validates the package, not account ownership, isolation, DNS, provider access, deployments or delivery. The saved brief is fingerprinted; edit facts in the CRM and redownload instead of modifying the brief inside the file.',
 '',
 'For reusable source preparation, save the Installation section in the CRM and download its preparation package. Run scripts/prepare-client.cjs from the matching maintained checkout with a new output directory. The generated workspace contains client identity, approved facts, inactive settings and empty data; it does not connect providers or deploy. Review its IMPLEMENTATION.txt and receipt, then complete the service checks below.',
 '',
 '## 3. Connect and test only the selected services',
 '',
 ];
 for(const offer of offers){
  lines.push('### '+OFFERS[offer].name,'');
  for(const step of CONNECTIONS[offer]){
   lines.push('**'+step.title+'**','',
    '- [ ] Prepare: '+step.prepare,
    '- [ ] Test: '+step.test,
    '- [ ] Record: '+step.evidence,'');
  }
  if(offer==='calls')lines.push('Live call transfer, external calendar sync and SMS are not connected by this application package. Leave them deferred until their adapters, access and acceptance tests exist. Live transfer also requires prepared inbound voice routing. Native owner booking, external calendars and SMS do not inherently require voice.','');
  lines.push('Workflow acceptance cases:','',...selected.filter(r=>recipeOfferFor(r,offers)===offer).flatMap(r=>r.checks.map(check=>'- [ ] '+r.name+': '+check)), '');
 }
 if(offers.some(id=>['calls','website','reviews'].includes(id))){
  lines.push('### Business email, only if included in the approved scope','',
   '- [ ] Verify the generated client sender, staff recipient, reply destination, subject and message identity in the reviewed source files. Verify the client sender domain in the client Resend account.',
   '- [ ] On the client /manage/receptionist page, use Connect and send test with the client sending key. This sends a real staff test email and enables alerts for new eligible events; obtain approval first and check the actual recipient inbox.',
   '- [ ] Configure the Resend delivery webhook to the client origin plus /api/resend/events. Store its signing secret as RESEND_WEBHOOK_SECRET in the client deployment. Confirm a signed delivery event updates the matching saved email; a forged event must fail.',
   '- [ ] Keep CUSTOMER_EMAIL_ENABLED false until automatic confirmation is approved and tested with its separate explicit opt-in. Controlled tests must check one confirmation per inquiry, suppression/withdrawal, a failed send and a safe duplicate retry. Provider acceptance is not inbox receipt.',
   '- [ ] Record email and recovery evidence in the existing launch checklist. If email is outside scope, record it as deferred and do not connect a sender.','');
 }
 lines.push('## 4. Hand off the exact tested scope','',
 'Saved rehearsal: '+(kit.rehearsal.state==='completed'?'Current template pack completed; live providers still unverified.':kit.rehearsal.state==='stale'?'Out of date; rerun the saved client test pack.':'No current complete template pack; run it before approval.'),
 '',
 '| Existing launch check | Status for this revision |',
 '| --- | --- |');
 const applicable=new Set(['facts','isolation','recovery','email','signoff',...offers.flatMap(o=>CHECKS_BY_OFFER[o])]);
 for(const check of launch.checks.filter(c=>applicable.has(c.id)))lines.push('| '+tableText(check.label)+' | '+recordStatus(check.record,kit.revision,launch.installationRevision??0,launch.installationCurrent!==false)+' |');
 lines.push('',
 '- [ ] Record non-secret observed results under Connections & launch for this exact saved brief. Preserve failed and deferred outcomes; this README does not change them.',
 '- [ ] Rerun the template test pack and complete or explicitly defer each affected launch check. Obtain client sign-off through the existing approval flow; a later brief or check change invalidates the earlier approval.',
 '- [ ] Before enabling each approved action, have the owner confirm its account, destination, operating scope and support contact. Record how to return phone intake to test mode, disable the relevant sending switch, or pause its workflow.',
 '- [ ] Give the client a walkthrough of incoming requests, staff takeover, exception review, access ownership and escalation. Do not share the owner-only setup workspace as a multi-tenant client portal.',
 '',
 '## Sharing boundary','',
 'This checklist intentionally omits brief values, inbox addresses, private prices, staff knowledge, application maps, connection notes, custom sample inputs and free-text launch evidence. Retrieve those only from the private approved setup files. Use the existing guided client presentation for demonstrations; never attach the private setup/install files to a public page or demo.',
 '');
 return lines.join('\n');
}
