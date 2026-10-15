import {recipeOfferFor,recipeOffers} from './client-templates';
import {database,RequestError} from './inquiries';
import {runRehearsal,summarizeRehearsal,REHEARSAL_VERSION} from './client-rehearsal';
import {OFFERS,PROFILE_FIELDS,RECIPES,emptyProfile,parseRows,recipesFor,missingFor,runTemplate,sampleEvent,receptionistPrompt,type ClientProfile,type OfferId,type RecipeId} from './client-templates';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SELECT='id,business_name AS businessName,offers,profile,revision,created_at AS createdAt,updated_at AS updatedAt';
const SCENARIOS=['normal','stopped','duplicate','missing'];
type Row={id:string;businessName:string;offers:string;profile:string;revision:number;createdAt:string;updatedAt:string};
export type ClientSetup=Omit<Row,'offers'|'profile'>&{offers:OfferId[];profile:ClientProfile};
export type SavedPreview={recipe:RecipeId;scenario:string;setupRevision:number;input:string;output:string;createdAt:string};
const decode=(row:Row):ClientSetup=>({...row,offers:JSON.parse(row.offers),profile:JSON.parse(row.profile)});
function id(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))throw new RequestError(400,'Choose a valid client setup.');return value.toLowerCase();}
function revision(value:unknown):number{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new RequestError(400,'Reload this client setup before saving.');return n;}
function noCredentials(text:string){if(/(?:\b(?:re_|whsec_|sk-|key_)[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9_.-]{15,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(text))throw new RequestError(400,'Keep keys, passwords and tokens out of client setup fields. Use the deployment secret store.');}
export function cleanProfile(value:unknown):ClientProfile{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new RequestError(400,'Provide the client business information.');
 const raw=value as Record<string,unknown>;const profile=emptyProfile();const errors:Record<string,string>={};
 for(const field of PROFILE_FIELDS){const input=raw[field.key]??'';if(typeof input!=='string'){errors[field.key]='Use text for this field.';continue;}const v=input.trim().replace(/\r\n?/g,'\n');if(v.length>field.max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v))errors[field.key]='Check the field length and remove unsupported characters.';profile[field.key]=v;}
 if(!profile.businessName)errors.businessName='Enter the business name.';
 for(const key of ['alertEmail','replyEmail'] as const){profile[key]=profile[key].toLowerCase();if(profile[key]&&!/^[^\s@<>,;"\\]+@[^\s@<>,;"\\]+\.[^\s@<>,;"\\]+$/.test(profile[key]))errors[key]='Use one plain email address.';}
 if(profile.timezone)try{new Intl.DateTimeFormat('en',{timeZone:profile.timezone});}catch{errors.timezone='Use a valid IANA timezone, such as America/Denver.';}
 for(const key of ['website','reviewLink'] as const){if(profile[key])try{const url=new URL(profile[key]);if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(k=>/token|secret|password|api.?key/i.test(k)))throw Error();}catch{errors[key]='Use an HTTPS URL without credentials or tokens.';}}
 for(const [key,width] of [['faqs',3],['internalKnowledge',3],['priceBook',3],['fieldMap',2]] as const){if(!profile[key])continue;const lines=profile[key].split('\n').filter(x=>x.trim());const rows=parseRows(profile[key],width);if(rows.length!==lines.length)errors[key]=`Use ${width} nonempty parts separated by | on every line.`;const primary=rows.map(r=>r[0].toLowerCase());if(new Set(primary).size!==primary.length)errors[key]='Use a different question, code or source field on every line.';}
 for(const row of parseRows(profile.priceBook,3))if(!/^\d{1,8}(\.\d{1,2})?$/.test(row[2]))errors.priceBook='Use nonnegative USD prices with no more than two decimal places.';
 const maps=parseRows(profile.fieldMap,2);if(maps.some(pair=>pair.some(s=>! /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(s)||['__proto__','constructor','prototype'].includes(s))))errors.fieldMap='Use plain field names with letters, numbers and underscores.';
 if(new Set(maps.map(r=>r[1])).size!==maps.length)errors.fieldMap='Each destination field must appear only once.';
 noCredentials(JSON.stringify(profile));if(Object.keys(errors).length)throw new RequestError(400,'Check the client setup fields.',errors);
 return profile;
}
function cleanOffers(value:unknown):OfferId[]{if(!Array.isArray(value)||!value.length||value.length>4||value.some(v=>typeof v!=='string'||!Object.hasOwn(OFFERS,v)))throw new RequestError(400,'Choose one or more of the four service offers.');return (Object.keys(OFFERS) as OfferId[]).filter(k=>value.includes(k));}
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function listClientSetups(){const rows=await database().prepare(`SELECT ${SELECT} FROM client_setups ORDER BY updated_at DESC,id DESC LIMIT 201`).all<Row>();return {items:rows.results.slice(0,200).map(decode),hasMore:rows.results.length>200};}
export async function getClientSetup(value:unknown){const row=await database().prepare(`SELECT ${SELECT} FROM client_setups WHERE id=?`).bind(id(value)).first<Row>();if(!row)throw new RequestError(404,'This client setup was not found.');return decode(row);}
export async function listSetupPreviews(value:unknown){return (await database().prepare('SELECT recipe,scenario,setup_revision AS setupRevision,input,output,created_at AS createdAt FROM client_setup_previews WHERE client_id=? ORDER BY recipe,scenario').bind(id(value)).all<SavedPreview>()).results;}
/** Read the brief and its results in one consistent database snapshot. */
export async function getClientSetupWithPreviews(value:unknown){
 const clientId=id(value),db=database();
 const rows=await db.batch([
  db.prepare(`SELECT ${SELECT} FROM client_setups WHERE id=?`).bind(clientId),
  db.prepare('SELECT recipe,scenario,setup_revision AS setupRevision,input,output,created_at AS createdAt FROM client_setup_previews WHERE client_id=? ORDER BY recipe,scenario').bind(clientId),
 ]);
 const row=rows[0]?.results?.[0] as Row|undefined;if(!row)throw new RequestError(404,'This client setup was not found.');
 return {setup:decode(row),previews:(rows[1]?.results||[]) as SavedPreview[]};
}
export async function mutateClientSetup(data:Record<string,unknown>){
 const clientId=id(data.id);const db=database();
 if(data.action==='create'||data.action==='update'){
  const profile=cleanProfile(data.profile),offers=cleanOffers(data.offers),now=new Date().toISOString();const serialized=JSON.stringify(profile),offerJson=JSON.stringify(offers);
  if(data.action==='create'){
   const createHash=await hash(serialized+'\n'+offerJson);
   await db.prepare('INSERT INTO client_setups(id,business_name,offers,profile,create_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(clientId,profile.businessName,offerJson,serialized,createHash,now,now).run();
   const saved=await db.prepare('SELECT create_hash AS createHash FROM client_setups WHERE id=?').bind(clientId).first<{createHash:string}>();if(saved?.createHash!==createHash)throw new RequestError(409,'This setup reference was already used. Reload the saved client before making changes.');
  }else{
   const changed=await db.prepare('UPDATE client_setups SET business_name=?,offers=?,profile=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING id').bind(profile.businessName,offerJson,serialized,now,clientId,revision(data.revision)).first();
   if(!changed)throw new RequestError(409,'This setup changed in another tab or was removed. Reload it before saving.');
  }
  return {redirect:`/manage/clients/${clientId}`};
 }
 if(data.action==='delete'){
  if(data.confirmation!=='DELETE')throw new RequestError(400,'Confirm deletion of this client setup.');
  const changed=await db.prepare('DELETE FROM client_setups WHERE id=? AND revision=? RETURNING id').bind(clientId,revision(data.revision)).first();if(!changed)throw new RequestError(409,'This setup changed or was removed. Reload it before deleting.');
  return {redirect:'/manage/clients'};
 }
 throw new RequestError(400,'Choose a supported client setup action.');
}
export async function previewClientSetup(data:Record<string,unknown>){
 const setup=await getClientSetup(data.id);if(setup.revision!==revision(data.revision))throw new RequestError(409,'The business information changed. Reload before testing.');
 const recipe=recipesFor(setup.offers).find(r=>r.id===data.recipe);if(!recipe)throw new RequestError(400,'Choose a template included in this client’s selected offers.');
 const scenario=String(data.scenario||'normal');if(!SCENARIOS.includes(scenario))throw new RequestError(400,'Choose a supported test case.');
 if(scenario==='missing'&&['receptionist','website'].includes(recipe.id))throw new RequestError(400,'This brief template uses the saved business information. Edit that information to test a missing field.');
 let input=sampleEvent(recipe.id,setup.profile,scenario);
 if(data.input!==undefined){if(!data.input||typeof data.input!=='object'||Array.isArray(data.input))throw new RequestError(400,'Sample input must be a JSON object.');const encoded=JSON.stringify(data.input);if(encoded.length>12000)throw new RequestError(400,'Keep sample input under 12,000 characters.');noCredentials(encoded);input=data.input as Record<string,unknown>;}
 const output=runTemplate(recipe.id,setup.profile,input,setup.id);
 const saved=await database().prepare(`INSERT INTO client_setup_previews(client_id,recipe,scenario,setup_revision,input,output,created_at)
 SELECT id,?,?,?,?,?,? FROM client_setups WHERE id=? AND revision=?
 ON CONFLICT(client_id,recipe,scenario) DO UPDATE SET setup_revision=excluded.setup_revision,input=excluded.input,output=excluded.output,created_at=excluded.created_at RETURNING client_id`).bind(recipe.id,scenario,setup.revision,JSON.stringify(input),JSON.stringify(output),new Date().toISOString(),setup.id,setup.revision).first();
 if(!saved)throw new RequestError(409,'The setup changed while testing. Reload and run the example again.');
 return {output};
}
export async function rehearseClientSetup(data:Record<string,unknown>){
 const setup=await getClientSetup(data.id);if(setup.revision!==revision(data.revision))throw new RequestError(409,'The business information changed. Reload before running the test pack.');
 const cases=runRehearsal(setup.profile,setup.offers,setup.id),db=database(),now=new Date().toISOString(),runId=crypto.randomUUID();
 const saved=await db.batch(cases.map(test=>db.prepare(`INSERT INTO client_setup_previews(client_id,recipe,scenario,setup_revision,input,output,created_at)
 SELECT id,?,?,?,?,?,? FROM client_setups WHERE id=? AND revision=?
 ON CONFLICT(client_id,recipe,scenario) DO UPDATE SET setup_revision=excluded.setup_revision,input=excluded.input,output=excluded.output,created_at=excluded.created_at RETURNING client_id`).bind(test.recipe,'suite_'+test.scenario,setup.revision,JSON.stringify(test.input),JSON.stringify({...test.output,rehearsal:{version:REHEARSAL_VERSION,runId,outcome:test.outcome,expected:test.expected,detail:test.detail}}),now,setup.id,setup.revision)));
 if(saved.length!==cases.length||saved.some(result=>result.results?.[0]?.client_id!==setup.id))throw new RequestError(409,'The setup changed while testing. Reload and run the test pack again.');
 const snapshot=await getClientSetupWithPreviews(setup.id);
 if(snapshot.setup.revision!==setup.revision)throw new RequestError(409,'The business information changed while testing. Reload and rerun the test pack.');
 return {rehearsal:summarizeRehearsal(snapshot.setup.revision,snapshot.setup.offers,snapshot.previews)};
}
export async function clientConfigurationHash(setup:ClientSetup){return hash(JSON.stringify({clientId:setup.id,revision:setup.revision,offers:setup.offers,profile:setup.profile}));}
export async function clientLaunchKit(value:unknown){
 const {setup,previews}=await getClientSetupWithPreviews(value);
 return {format:'schurr-client-setup-v1',configurationHash:await clientConfigurationHash(setup),mode:'setup_only',live:false,clientId:setup.id,businessName:setup.businessName,revision:setup.revision,profile:setup.profile,
  offers:setup.offers.map(key=>({id:key,...OFFERS[key]})),
  rehearsal:summarizeRehearsal(setup.revision,setup.offers,previews),
  workflows:recipesFor(setup.offers).map(recipe=>({...recipe,offer:recipeOfferFor(recipe,setup.offers),applicableOffers:recipeOffers(recipe),missingInformation:missingFor(setup.profile,recipe),connectionState:'not_verified',enabled:false})),
  receptionistPrompt:setup.offers.includes('calls')?receptionistPrompt(setup.profile):undefined,
  tests:previews.map(row=>({...row,current:row.setupRevision===setup.revision,input:JSON.parse(row.input),output:JSON.parse(row.output)})),
  launchSteps:['Review and approve the client business facts and scope','Create an isolated client deployment, database and provider account/subaccount','Set client-owned credentials in that deployment secret store; never reuse Schurr credentials','Connect the selected source, phone, sender, calendar and destination adapters','Run real delivery, booking, failure, opt-out and isolation tests','Obtain client sign-off before enabling each external action'],
  limitations:['This file configures templates; importing it does not create or connect provider accounts.','No client can access this owner-only setup workspace.','No live sends, calls, bookings, Google updates or application writes run from these sample tests.','Account notes are not evidence that a connector is working.','Custom software, live chat, review integrations and app adapters need client-specific implementation.']};
}
