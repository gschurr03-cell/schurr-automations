// Server-only adapter: import only from owner/server routes or server monitoring.
// cloudflare:workers and the encrypted connection never belong in a client bundle.
// Docs: https://docs.retellai.com/api-references/get-phone-number
// https://docs.retellai.com/api-references/get-agent
// https://docs.retellai.com/api-references/get-retell-llm
// https://docs.retellai.com/api-references/update-agent
// https://docs.retellai.com/agent/version
import {env} from 'cloudflare:workers';
import {database,readBoundedText,RequestError} from './inquiries';
import {decryptIntegrationSecret} from './integration-secret';
import {voiceOperationsTools,applyVoiceOperationsPrompt} from './voice-operations';
import {applyReceptionistSalesPrompt} from './receptionist-sales';

export type RetellMonitoringCheck={key:'retell_connection'|'phone_routing'|'agent_configuration'|'event_webhook'|'voice_tools';status:'pass'|'fail'|'unknown';summary:string};
export type RetellMonitoring={checks:RetellMonitoringCheck[];agentId:string;agentVersion:number|null;inboundNumber:string;configurationHash:string|null;webhookConnected:boolean;checkedAt:string};
type ObjectValue=Record<string,unknown>;
type Connection={apiKeyCiphertext:string;agentId:string;llmId:string;inboundNumber:string;phase:string;mode:string;lockUntil:number;lockToken:string};
type Snapshot={connection:Connection;key:string;phone:ObjectValue;agent:ObjectValue;llm:ObjectValue;selector:number|string;result:RetellMonitoring};
const CANONICAL='https://schurrautomations.com',NATIVE='https://schurr-automations.gavschurr.chatgpt.site';
const EVENT_URL=CANONICAL+'/api/retell/events',LIFECYCLE=['call_started','call_ended','call_analyzed'];
const ID=/^[A-Za-z0-9_-]{1,120}$/,PHONE=/^\+[1-9]\d{7,14}$/;
const isObject=(value:unknown):value is ObjectValue=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const version=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function selector(value:unknown):value is number|string{return version(value)||(typeof value==='string'&&/^(latest|latest_published|(?!(?:v\d+)$)[a-z][a-z0-9_-]{0,19})$/.test(value));}
function sameSiteEndpoint(value:unknown,path:string){if(typeof value!=='string')return false;try{const url=new URL(value);return [CANONICAL,NATIVE].includes(url.origin)&&url.pathname===path&&!url.search&&!url.hash&&!url.username&&!url.password;}catch{return false;}}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(isObject(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
function stable(value:unknown){return JSON.stringify(canonical(value));}
function config(value:ObjectValue,omit:string[]=[]){return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='last_modification_timestamp'&&!omit.includes(key)));}
async function digest(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
function blank():RetellMonitoring{return {checks:[
 {key:'retell_connection',status:'unknown',summary:'The saved Retell connection has not been checked.'},
 {key:'phone_routing',status:'unknown',summary:'The inbound route has not been checked.'},
 {key:'agent_configuration',status:'unknown',summary:'The routed agent and response engine have not been checked.'},
 {key:'event_webhook',status:'unknown',summary:'Lifecycle webhook configuration has not been checked.'},
 {key:'voice_tools',status:'unknown',summary:'The routed voice tools have not been checked.'},
 ],agentId:'',agentVersion:null,inboundNumber:'',configurationHash:null,webhookConnected:false,checkedAt:new Date().toISOString()};}
function check(result:RetellMonitoring,key:RetellMonitoringCheck['key'],status:RetellMonitoringCheck['status'],summary:string){const item=result.checks.find(item=>item.key===key)!;Object.assign(item,{status,summary});}
async function savedConnection(){return database().prepare("SELECT api_key_ciphertext AS apiKeyCiphertext,agent_id AS agentId,llm_id AS llmId,inbound_number AS inboundNumber,phase,mode,lock_until AS lockUntil,lock_token AS lockToken FROM retell_connection WHERE id='retell'").first<Connection>();}
class ProviderError extends Error{constructor(public status:number){super('Retell monitoring request was not confirmed.');}}
async function api(key:string,path:string,signal:AbortSignal,body?:ObjectValue):Promise<ObjectValue>{
 let response:Response;try{response=await fetch('https://api.retellai.com'+path,{method:body?'PATCH':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,redirect:'manual'});}catch{throw new ProviderError(0);}
 if(response.status>=300&&response.status<400){await response.body?.cancel();throw new ProviderError(0);}
 if(!response.ok){await response.body?.cancel();throw new ProviderError(response.status);}
 try{const data:unknown=JSON.parse(await readBoundedText(response,524288));if(!isObject(data))throw Error();return data;}catch{throw new ProviderError(0);}
}
function selectedEvents(agent:ObjectValue):string[]|null{
 if(agent.webhook_events===undefined||agent.webhook_events===null)return [...LIFECYCLE];
 if(!Array.isArray(agent.webhook_events)||agent.webhook_events.some(event=>typeof event!=='string'||event.length>100))return null;
 return agent.webhook_events as string[];
}
function toolCheck(llm:ObjectValue){
 const tools=Array.isArray(llm.general_tools)?llm.general_tools.filter(isObject):[];
 const required=['capture_lead','stop_contact',...voiceOperationsTools(CANONICAL).map(tool=>tool.name)];
 if(required.some(name=>tools.filter(tool=>tool.name===name).length!==1))return false;
 const names=new Set(['capture_lead','stop_contact','check_availability','book_appointment','request_handoff','current_appointment','change_appointment']);
 return tools.filter(tool=>names.has(String(tool.name))).every(tool=>tool.type==='custom'&&tool.method==='POST'&&tool.args_at_root===false&&sameSiteEndpoint(tool.url,'/api/retell/tools'))&&typeof llm.general_prompt==='string'&&applyVoiceOperationsPrompt(llm.general_prompt)===llm.general_prompt;
}
// Private snapshots may contain prompt text. Only a SHA-256 fingerprint leaves this
// module; no prompt, tool parameters, credentials or provider error body is returned.
async function observe(signal:AbortSignal,ownedLockToken?:string):Promise<{result:RetellMonitoring;snapshot:Snapshot|null}>{
 const result=blank();let stage:RetellMonitoringCheck['key']='retell_connection';
 const done=(snapshot:Snapshot|null=null)=>{result.checkedAt=new Date().toISOString();return {result,snapshot};};
 try{
  const connection=await savedConnection();
  if(!connection){check(result,stage,'fail','No saved Retell connection is available.');return done();}
  const fallback=(env as unknown as {RETELL_INBOUND_NUMBER?:string}).RETELL_INBOUND_NUMBER;
  result.agentId=typeof connection.agentId==='string'&&ID.test(connection.agentId)?connection.agentId:'';
  const number=connection.inboundNumber||(typeof fallback==='string'?fallback.trim():'');result.inboundNumber=PHONE.test(number)?number:'';
  if(!result.agentId||!ID.test(connection.llmId)||connection.phase!=='ready'){check(result,stage,'unknown','Complete receptionist setup before checking the live route.');return done();}
  if(ownedLockToken?connection.lockToken!==ownedLockToken||connection.lockUntil<=Date.now():connection.lockUntil>Date.now()){check(result,stage,'unknown','Receptionist setup is changing or its update lock expired. Check again after it finishes.');return done();}
  const key=await decryptIntegrationSecret(connection.apiKeyCiphertext);
  check(result,stage,'pass',connection.mode==='live'?'The encrypted Retell connection is available; CRM intake is live.':'The encrypted Retell connection is available; CRM intake is in test mode.');
  stage='phone_routing';
  if(!result.inboundNumber){check(result,stage,'fail','No valid dedicated inbound number is configured.');return done();}
  const phone=await api(key,'/get-phone-number/'+encodeURIComponent(result.inboundNumber),signal);
  if(phone.phone_number!==result.inboundNumber){check(result,stage,'unknown','Retell returned a different phone-number reference.');return done();}
  if(!Array.isArray(phone.inbound_agents)){check(result,stage,'unknown','Retell did not expose a supported versioned inbound route.');return done();}
  if(phone.inbound_agents.some(route=>!isObject(route)||typeof route.weight!=='number'||!Number.isFinite(route.weight)||route.weight<0)){check(result,stage,'unknown','The inbound routing weights could not be resolved.');return done();}
  const routes=(phone.inbound_agents as ObjectValue[]).filter(route=>(route.weight as number)>0);
  if(!routes.length){check(result,stage,'fail','The number has no enabled inbound agent.');return done();}
  if(routes.length!==1||Math.abs((routes[0].weight as number)-1)>0.000001){check(result,stage,'unknown','The number uses multiple or unsupported weighted routes; no single active configuration is assumed.');return done();}
  const route=routes[0];
  if(route.agent_id!==connection.agentId){check(result,stage,'fail','The inbound number routes to a different agent than the saved Schurr connection.');return done();}
  if(!selector(route.agent_version)){check(result,stage,'unknown','The routed agent version is missing or unsupported.');return done();}
  if(phone.inbound_webhook_url!==undefined&&phone.inbound_webhook_url!==null&&phone.inbound_webhook_url!==''&&!sameSiteEndpoint(phone.inbound_webhook_url,'/api/retell/inbound')){check(result,stage,'unknown','An unrecognized inbound webhook can override the selected agent; the effective route is not assumed.');return done();}
  const activeSelector=route.agent_version;
  check(result,stage,'pass','The dedicated number selects the saved Schurr agent; any configured inbound hook is this Site’s supported hook.');
  stage='agent_configuration';
  const agent=await api(key,'/get-agent/'+encodeURIComponent(connection.agentId)+'?version='+encodeURIComponent(String(activeSelector)),signal);
  if(agent.agent_id!==connection.agentId||!version(agent.version)||typeof agent.is_published!=='boolean'||typeof agent.voice_id!=='string'||!agent.voice_id||agent.voice_id.length>512||(typeof activeSelector==='number'&&agent.version!==activeSelector)||(activeSelector==='latest_published'&&!agent.is_published)){check(result,stage,'unknown','Retell did not confirm the exact routed agent version.');return done();}
  result.agentVersion=agent.version;
  if(!isObject(agent.response_engine)||agent.response_engine.type!=='retell-llm'||typeof agent.response_engine.llm_id!=='string'||!ID.test(agent.response_engine.llm_id)||!version(agent.response_engine.version)){check(result,stage,'unknown','The routed agent does not expose a supported, explicitly versioned Retell LLM.');return done();}
  const engine=agent.response_engine;
  const llm=await api(key,'/get-retell-llm/'+encodeURIComponent(String(engine.llm_id))+'?version='+engine.version,signal);
  if(llm.llm_id!==engine.llm_id||llm.version!==engine.version){check(result,stage,'unknown','Retell did not confirm the exact LLM version attached to this agent.');return done();}
  const sameEngine=engine.llm_id===connection.llmId,privateStorage=agent.data_storage_setting==='basic_attributes_only';
  check(result,stage,sameEngine&&privateStorage?'pass':'fail',!sameEngine?'The routed agent uses a different LLM than the saved Schurr connection.':!privateStorage?'The routed agent is not using the approved basic-attributes-only storage setting.':`Resolved agent version ${agent.version} (${agent.is_published?'published':'draft'}) and LLM version ${engine.version}; basic-attributes-only storage is configured.`);
  const events=selectedEvents(agent);
  result.webhookConnected=agent.webhook_url===EVENT_URL&&events!==null&&LIFECYCLE.every(event=>events.includes(event));
  check(result,'event_webhook',events===null?'unknown':result.webhookConnected?'pass':'fail',events===null?'The lifecycle event selection is unreadable.':result.webhookConnected?'The canonical Schurr lifecycle URL and required events are configured. This does not prove delivery.':'The canonical lifecycle URL or one of its required events is not configured.');
  check(result,'voice_tools',toolCheck(llm)?'pass':'fail',toolCheck(llm)?'The routed conversation has capture, stop, booking, change and callback tools plus current booking instructions. This does not prove a successful call.':'The routed conversation is missing current booking instructions or a required capture, stop, appointment or callback tool. Update receptionist tools.');
  result.configurationHash=await digest({schema:'schurr-retell-monitor-v1',phone:config(phone),agent:config(agent),llm:config(llm)});
  return done({connection,key,phone,agent,llm,selector:activeSelector,result});
 }catch(error){
  if(error instanceof ProviderError&&(error.status===401||error.status===403))check(result,'retell_connection','fail','Retell rejected the saved key or its access to the requested configuration.');
  check(result,stage,error instanceof ProviderError&&[404,422].includes(error.status)?'fail':'unknown',stage==='retell_connection'?'The saved Retell connection could not be read securely.':'Retell did not confirm this configuration check. Try again; no configuration is assumed.');
  return done();
 }
}
/** Observation only. Baseline approval belongs to the owner monitoring workflow. */
export async function readRetellMonitoring():Promise<RetellMonitoring>{return (await observe(AbortSignal.timeout(15000))).result;}
function safeToConnect(snapshot:Snapshot){
 if(snapshot.result.checks.some(check=>['retell_connection','phone_routing','agent_configuration'].includes(check.key)&&check.status!=='pass'))throw new RequestError(409,'Resolve the saved connection, route and privacy configuration before connecting call events.');
 const existing=snapshot.agent.webhook_url;
 if(existing!==undefined&&existing!==null&&existing!==''&&!sameSiteEndpoint(existing,'/api/retell/events'))throw new RequestError(409,'This agent already uses another lifecycle webhook. Review it in Retell; it was not replaced.');
 if(selectedEvents(snapshot.agent)===null)throw new RequestError(409,'Review the unreadable lifecycle event selection in Retell before connecting.');
}
function preserved(before:Snapshot,after:Snapshot,events:string[]){
 return before.result.agentId===after.result.agentId&&before.result.agentVersion===after.result.agentVersion&&stable(config(before.phone))===stable(config(after.phone))&&stable(config(before.llm))===stable(config(after.llm))&&stable(config(before.agent,['webhook_url','webhook_events']))===stable(config(after.agent,['webhook_url','webhook_events']))&&stable([...(selectedEvents(after.agent)||[])].sort())===stable([...events].sort());
}
/** Call only after the owner route checks owner identity, origin and explicit action.
 * This sets an agent webhook, which supersedes account-level webhooks for this agent.
 * Retell documents no usable CAS field here: fresh reads + pinned version + readback
 * do not provide atomic exclusion against simultaneous Retell dashboard edits.
 */
export async function connectRetellCallEvents(origin:string):Promise<RetellMonitoring>{
 if(![CANONICAL,NATIVE].includes(origin))throw new RequestError(400,'Connect call events from the published Schurr website.');
 const signal=AbortSignal.timeout(30000),initial=await observe(signal);
 if(!initial.snapshot)throw new RequestError(409,'The exact live agent and LLM versions could not be resolved. No webhook was changed.');
 safeToConnect(initial.snapshot);
 if(initial.result.webhookConnected)return initial.result;
 if(initial.snapshot.agent.is_published!==false)throw new RequestError(409,'The routed agent version is published and read-only. Connecting events requires a controlled draft and routing workflow in Retell. No version was created or promoted.');
 const latest=await api(initial.snapshot.key,'/get-agent/'+encodeURIComponent(initial.result.agentId)+'?version=latest',signal);
 if(latest.agent_id!==initial.result.agentId||latest.version!==initial.result.agentVersion||latest.is_published!==false)throw new RequestError(409,'The routed version is not Retell’s current draft. Review version routing before connecting events; no version was changed.');
 const fresh=await observe(signal);
 if(!fresh.snapshot||fresh.result.configurationHash!==initial.result.configurationHash||stable(fresh.snapshot.connection)!==stable(initial.snapshot.connection))throw new RequestError(409,'Receptionist configuration changed during the check. Review it before connecting events.');
 safeToConnect(fresh.snapshot);
 const events=selectedEvents(fresh.snapshot.agent)!,merged=[...new Set([...events,...LIFECYCLE])];
 const body:ObjectValue={webhook_url:EVENT_URL};
 if(!LIFECYCLE.every(event=>events.includes(event)))body.webhook_events=merged;
 // No automatic PATCH retry. A lost reply is resolved only through a fresh read.
 try{await api(fresh.snapshot.key,'/update-agent/'+encodeURIComponent(fresh.result.agentId)+'?version='+fresh.result.agentVersion,signal,body);}catch{/* Read back even when the PATCH reply is lost; never assume success. */}
 const after=await observe(signal);
 if(!after.snapshot||!after.result.webhookConnected||!preserved(fresh.snapshot,after.snapshot,merged))throw new RequestError(502,'The event connection and unchanged configuration could not be confirmed. Refresh monitoring and review Retell before retrying.');
 return after.result;
}

/** Owner-only operation, under the caller's still-active receptionist setup lock. */
export async function syncRoutedVoiceOperations(origin:string,ownedLockToken:string){
 if(![CANONICAL,NATIVE].includes(origin)||!ownedLockToken)throw new RequestError(400,'Open the published Schurr website to update receptionist tools.');
 const read=()=>observe(AbortSignal.timeout(15000),ownedLockToken);
 const initial=await read(),before=initial.snapshot;
 if(!before||initial.result.checks.some(c=>['retell_connection','phone_routing','agent_configuration'].includes(c.key)&&c.status!=='pass'))throw new RequestError(409,'The actual phone route could not be verified. Review receptionist monitoring before updating tools.');
 if(before.agent.is_published!==false||before.llm.is_published!==false)throw new RequestError(409,'The phone routes to a published configuration. Review its draft and routing in Retell; no version was changed.');
 const llmId=String(before.llm.llm_id),llmVersion=before.llm.version;
 const latest=await api(before.key,'/get-retell-llm/'+encodeURIComponent(llmId),AbortSignal.timeout(10000));
 if(latest.llm_id!==llmId||latest.version!==llmVersion||latest.is_published!==false||stable(config(latest))!==stable(config(before.llm)))throw new RequestError(409,'The phone routes to an older conversation version. Review version routing in Retell; no configuration was changed.');
 if(typeof before.llm.general_prompt!=='string'||!Array.isArray(before.llm.general_tools))throw new RequestError(409,'The routed conversation configuration could not be read.');
 const desired=voiceOperationsTools(CANONICAL),names=new Set(desired.map(t=>t.name));
 const general_tools=[...before.llm.general_tools.filter(tool=>!isObject(tool)||!names.has(String(tool.name))),...desired];
 const general_prompt=applyVoiceOperationsPrompt(applyReceptionistSalesPrompt(before.llm.general_prompt));
 const desiredConversation={...before.llm,general_prompt,general_tools};
 if(!toolCheck(desiredConversation))throw new RequestError(409,'The routed capture or stop tool is missing or invalid. Repair receptionist intake before updating the script.');
 const fresh=await read();
 if(!fresh.snapshot||fresh.result.configurationHash!==initial.result.configurationHash||stable(fresh.snapshot.connection)!==stable(before.connection))throw new RequestError(409,'Receptionist configuration changed during the check. Refresh before updating.');
 if(stable(before.llm.general_tools)===stable(general_tools)&&before.llm.general_prompt===general_prompt){if(!toolCheck(before.llm))throw new RequestError(409,'The routed capture or stop tool is missing or invalid. Repair receptionist intake before testing booking.');return {synced:true,message:'The actual phone route already has the current revenue-focused script, booking and callback tools.'};}
 const lease=await savedConnection();if(!lease||lease.lockToken!==ownedLockToken||lease.lockUntil<=Date.now()||stable(lease)!==stable(before.connection))throw new RequestError(409,'Receptionist update lock expired or the connection changed. Refresh before updating.');
 // No retry: a lost PATCH response is reconciled with a separate read budget.
 try{await api(before.key,'/update-retell-llm/'+encodeURIComponent(llmId)+'?version='+llmVersion,AbortSignal.timeout(15000),{general_tools,general_prompt});}catch{}
 const after=await read(),snapshot=after.snapshot;
 if(!snapshot||stable(config(before.phone))!==stable(config(snapshot.phone))||stable(config(before.agent))!==stable(config(snapshot.agent))||stable(config(before.llm,['general_tools','general_prompt']))!==stable(config(snapshot.llm,['general_tools','general_prompt']))||stable(before.connection)!==stable(snapshot.connection)||snapshot.llm.general_prompt!==general_prompt||stable(snapshot.llm.general_tools)!==stable(general_tools)||!toolCheck(snapshot.llm))throw new RequestError(502,'The routed tool update could not be confirmed. Refresh monitoring before retrying; no routing or version promotion was requested.');
 return {synced:true,message:'Current revenue-focused script, booking and callback tools verified on the conversation this phone number uses. Saved availability switches still apply.'};
}
