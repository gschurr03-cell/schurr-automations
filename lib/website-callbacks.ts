import {waitUntil} from 'cloudflare:workers';
import {database,RequestError,readBoundedText} from './inquiries';
import {decryptIntegrationSecret} from './integration-secret';
import {verifyRetellSignature} from './retell';
import {contentHash} from './automation-desk';
import {WEBSITE_CALLBACK_CONSENT,callbackPhone,callbackLLMConfig,CALLBACK_PROMPT,callbackTools,callbackConfigurationMatches} from './website-callback-policy';
import {availableSlots,bookingSetup,createAppointment} from './booking';
import {localParts,appointmentTimeLabel} from './booking-policy';
type Settings={enabled:number;llm_id:string;phase:string;marker:string;config_hash:string;revision:number;lock_until:number};
type Voice={api_key_ciphertext:string;agent_id:string;llm_id:string;mode:string;inbound_number:string};
const settings=()=>database().prepare("SELECT * FROM website_callback_settings WHERE id='main'").first<Settings>();
const voice=()=>database().prepare("SELECT api_key_ciphertext,agent_id,llm_id,mode,inbound_number FROM retell_connection WHERE id='retell'").first<Voice>();
const expectedHash=()=>contentHash(JSON.stringify(callbackLLMConfig('managed-configuration')));
async function provider(v:Voice,path:string,method='GET',body?:unknown){let response:Response;try{response=await fetch('https://api.retellai.com'+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+await decryptIntegrationSecret(v.api_key_ciphertext),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}catch{throw new RequestError(502,'Retell did not confirm the result. No automatic redial will be made.');}if(!response.ok){await response.body?.cancel();throw new RequestError(502,'Retell did not accept this operation. Check your account connection.');}try{return JSON.parse(await readBoundedText(response,256*1024));}catch{throw new RequestError(502,'Retell returned an unconfirmed result. Review the provider before trying again.');}}
export async function websiteCallbackSetup(){const [s,v]=await Promise.all([settings(),voice()]);return {enabled:Boolean(s?.enabled&&s.phase==='ready'&&s.config_hash===await expectedHash()&&v?.mode==='live'),connected:Boolean(v?.agent_id&&v?.inbound_number),number:v?.inbound_number||'',phase:s?.phase||'new',busy:Boolean(s&&s.lock_until>Date.now()),revision:s?.revision||0};}
export async function configureWebsiteCallbacks(enabled:boolean){
 const db=database();if(!enabled){await db.prepare("UPDATE website_callback_settings SET enabled=0,revision=revision+1,updated_at=? WHERE id='main'").bind(new Date().toISOString()).run();return websiteCallbackSetup();}
 const v=await voice();if(!v||v.mode!=='live'||!v.agent_id||!v.inbound_number)throw new RequestError(409,'Connect the live receptionist and its business number first.');
 await db.prepare("INSERT INTO website_callback_settings(id,marker,updated_at) VALUES('main',?,?) ON CONFLICT(id) DO NOTHING").bind(crypto.randomUUID(),new Date().toISOString()).run();
 const token=crypto.randomUUID(),locked=await db.prepare("UPDATE website_callback_settings SET enabled=0,revision=revision+1,lock_token=?,lock_until=? WHERE id='main' AND lock_until<=? RETURNING id").bind(token,Date.now()+120000,Date.now()).first();if(!locked)throw new RequestError(409,'Callback setup is already running. Check again shortly.');
 try{
  const s=(await settings())!,number=await provider(v,'/get-phone-number/'+encodeURIComponent(v.inbound_number)),agent=await provider(v,'/get-agent/'+encodeURIComponent(v.agent_id));
  if(number.phone_number!==v.inbound_number||agent.agent_id!==v.agent_id||agent.response_engine?.llm_id!==v.llm_id)throw new RequestError(409,'The phone or receptionist configuration changed. Review it before enabling callbacks.');
  let llmId=s.llm_id;const desired=callbackLLMConfig(s.marker);
  if(!llmId&&s.phase==='requested'){
   const list=await provider(v,'/v2/list-retell-llms?limit=1000'),matches=Array.isArray(list.items)?list.items.filter((x:any)=>x.default_dynamic_variables?.schurr_callback_config===s.marker):[];
   if(matches.length!==1)throw new RequestError(409,'An earlier setup was not confirmed. Check Retell for the callback configuration before trying again.');llmId=matches[0].llm_id;
  }
  if(!llmId){await db.prepare("UPDATE website_callback_settings SET phase='requested',enabled=0 WHERE id='main' AND lock_token=?").bind(token).run();const created=await provider(v,'/create-retell-llm','POST',desired);llmId=created.llm_id;}
  if(typeof llmId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(llmId))throw new RequestError(502,'Callback setup was not confirmed by Retell.');
  await db.prepare("UPDATE website_callback_settings SET llm_id=? WHERE id='main' AND lock_token=?").bind(llmId,token).run();
  const current=await provider(v,'/get-retell-llm/'+llmId);if(current.default_dynamic_variables?.schurr_callback_config!==s.marker)throw new RequestError(409,'This is not the expected callback configuration.');
  if(!callbackConfigurationMatches(current,s.marker))await provider(v,'/update-retell-llm/'+llmId,'PATCH',desired);
  const verified=await provider(v,'/get-retell-llm/'+llmId);if(!callbackConfigurationMatches(verified,s.marker))throw new RequestError(502,'Retell has not confirmed the callback tools.');
  const changed=await db.prepare("UPDATE website_callback_settings SET enabled=1,phase='ready',config_hash=?,revision=revision+1,updated_at=? WHERE id='main' AND lock_token=? AND revision=? RETURNING id").bind(await expectedHash(),new Date().toISOString(),token,s.revision).first();if(!changed)throw new RequestError(409,'Callback settings changed during setup. Refresh before enabling.');
 }finally{await db.prepare("UPDATE website_callback_settings SET lock_until=0,lock_token='' WHERE id='main' AND lock_token=?").bind(token).run();}
 return websiteCallbackSetup();
}
const ELIGIBLE=`EXISTS(SELECT 1 FROM inquiries i JOIN crm_leads c ON c.inquiry_id=i.id JOIN response_jobs j ON j.inquiry_id=i.id WHERE i.id=website_callbacks.id AND i.phone=c.phone AND i.preferred_contact='phone' AND c.preferred_contact='phone' AND j.status='needs_review' AND NOT EXISTS(SELECT 1 FROM response_outcomes o WHERE o.response_id=j.id)) AND consent_scope='${WEBSITE_CALLBACK_CONSENT}'`;
export async function deliverWebsiteCallback(id:string){
 const db=database(),s=await settings(),v=await voice();
 const cancelPending=async(reason:string)=>{await db.prepare("UPDATE website_callbacks SET status='cancelled',last_error=? WHERE id=? AND status='pending' AND attempted_at=0").bind(reason,id).run();};
 if(!s?.enabled||s.phase!=='ready'||s.config_hash!==await expectedHash()||!v||v.mode!=='live'){await cancelPending('AI callbacks are not ready. No call was made; follow up personally.');return;}
 const candidate=await db.prepare(`SELECT w.*,i.phone AS original_phone FROM website_callbacks w JOIN inquiries i ON i.id=w.id WHERE w.id=?`).bind(id).first<any>();if(!candidate||candidate.status!=='pending'||candidate.attempted_at)return;
 if(callbackPhone(candidate.original_phone)!==candidate.recipient){await cancelPending('The contact number changed. No call was made.');return;}
 let providerConfig:any;try{providerConfig=await provider(v,'/get-retell-llm/'+s.llm_id);}catch{await cancelPending('Callback configuration could not be checked. No call was made; follow up personally.');return;}if(!callbackConfigurationMatches(providerConfig,s.marker)){await db.prepare("UPDATE website_callbacks SET status='cancelled',last_error='Callback configuration changed. Reconnect callbacks before a new request.' WHERE id=? AND status='pending' AND attempted_at=0").bind(id).run();return;}
 const now=Date.now();
 await db.prepare(`UPDATE website_callbacks SET status='cancelled',last_error='Request handled, changed, or callback window expired.' WHERE id=? AND status='pending' AND (created_at<? OR NOT (${ELIGIBLE}))`).bind(id,new Date(now-15*60000).toISOString()).run();
 // Atomic admission prevents concurrent deliveries and limits public-form abuse.
 const admitted=await db.prepare(`UPDATE website_callbacks SET status='dispatching',attempted_at=?,from_number=?,agent_id=?,settings_revision=? WHERE id=? AND status='pending' AND attempted_at=0 AND (${ELIGIBLE}) AND EXISTS(SELECT 1 FROM website_callback_settings WHERE id='main' AND enabled=1 AND revision=? AND config_hash=?) AND EXISTS(SELECT 1 FROM retell_connection WHERE id='retell' AND mode='live' AND agent_id=? AND inbound_number=?) AND NOT EXISTS(SELECT 1 FROM website_callbacks other WHERE other.id!=website_callbacks.id AND other.recipient=website_callbacks.recipient AND other.attempted_at>?) AND (SELECT count(*) FROM website_callbacks WHERE attempted_at>?)<30 RETURNING id`).bind(now,v.inbound_number,v.agent_id,s.revision,id,s.revision,s.config_hash,v.agent_id,v.inbound_number,now-86400000,now-86400000).first();if(!admitted){await cancelPending('The callback limit was reached or settings changed. No call was made; follow up personally.');return;}
 try{
  // Final permission check; attempted_at remains set even if an ambiguous provider result follows.
  const active=await db.prepare(`SELECT id FROM website_callbacks WHERE id=? AND status='dispatching' AND (${ELIGIBLE}) AND EXISTS(SELECT 1 FROM website_callback_settings WHERE id='main' AND enabled=1 AND revision=?) AND EXISTS(SELECT 1 FROM retell_connection WHERE id='retell' AND mode='live' AND agent_id=? AND inbound_number=? AND api_key_ciphertext=?)`).bind(id,s.revision,v.agent_id,v.inbound_number,v.api_key_ciphertext).first();if(!active){await db.prepare("UPDATE website_callbacks SET status='cancelled',last_error='Callback paused before dialing.' WHERE id=? AND status='dispatching'").bind(id).run();return;}
  const result=await provider(v,'/v2/create-phone-call','POST',{from_number:v.inbound_number,to_number:candidate.recipient,override_agent_id:v.agent_id,agent_override:{agent:{response_engine:{type:'retell-llm',llm_id:s.llm_id},max_call_duration_ms:600000,ring_duration_ms:30000,voicemail_option:{action:{type:'hangup'}}}},metadata:{schurr_website_callback:id}});
  if(typeof result.call_id!=='string'||!/^call_[A-Za-z0-9_-]{1,100}$/.test(result.call_id))throw new Error('Call result unconfirmed');
  await db.prepare("UPDATE website_callbacks SET status='accepted',call_id=?,last_error='' WHERE id=? AND status='dispatching' AND attempted_at=?").bind(result.call_id,id,now).run();
 }catch{await db.prepare("UPDATE website_callbacks SET status='uncertain',last_error='Call acceptance is unconfirmed. Check Retell; this request will not redial automatically.' WHERE id=? AND status='dispatching'").bind(id).run();}
}
export function scheduleWebsiteCallback(id:string){try{waitUntil(deliverWebsiteCallback(id).catch(()=>console.error('Website callback remains saved for review.')));}catch{console.error('Website callback scheduling unavailable.');}}
export async function handleWebsiteCallbackTool(request:Request){
 const v=await voice();if(!v)throw new RequestError(503,'Callback connection unavailable.');const raw=await readBoundedText(request,256*1024);if(!await verifyRetellSignature(raw,request.headers.get('x-retell-signature')||'',await decryptIntegrationSecret(v.api_key_ciphertext)))throw new RequestError(401,'Invalid callback signature.');
 let input:any;try{input=JSON.parse(raw);}catch{throw new RequestError(400,'Invalid callback tool request.');}const callId=input?.call?.call_id,args=input?.args||{},name=input?.name;
 if(typeof callId!=='string'||!/^call_[A-Za-z0-9_-]{1,100}$/.test(callId)||!['callback_availability','callback_book','callback_stop'].includes(name))throw new RequestError(400,'Invalid callback tool.');
 const db=database();let row=await db.prepare(`SELECT w.*,i.phone AS original_phone,c.phone AS current_phone,j.id AS response_id,j.status AS response_status,c.preferred_contact FROM website_callbacks w JOIN inquiries i ON i.id=w.id JOIN crm_leads c ON c.inquiry_id=i.id JOIN response_jobs j ON j.inquiry_id=i.id WHERE w.call_id=? AND w.attempted_at>0`).bind(callId).first<any>();
 const actual=await provider(v,'/v2/get-call/'+callId);
 if(!row&&typeof actual.metadata?.schurr_website_callback==='string'){
  // Provider-confirmed metadata can recover only a previously admitted exact call. Never redial.
  const candidate=await db.prepare("SELECT * FROM website_callbacks WHERE id=? AND attempted_at>0 AND call_id='' AND status IN ('dispatching','uncertain')").bind(actual.metadata.schurr_website_callback).first<any>();
  if(candidate&&actual.call_id===callId&&actual.call_type==='phone_call'&&actual.direction==='outbound'&&actual.agent_id===candidate.agent_id&&actual.from_number===candidate.from_number&&actual.to_number===candidate.recipient){
   await db.prepare("UPDATE website_callbacks SET call_id=?,status='accepted',last_error='' WHERE id=? AND call_id='' AND status IN ('dispatching','uncertain')").bind(callId,candidate.id).run();
   row=await db.prepare(`SELECT w.*,i.phone AS original_phone,c.phone AS current_phone,j.id AS response_id,j.status AS response_status,c.preferred_contact FROM website_callbacks w JOIN inquiries i ON i.id=w.id JOIN crm_leads c ON c.inquiry_id=i.id JOIN response_jobs j ON j.inquiry_id=i.id WHERE w.call_id=? AND w.attempted_at>0`).bind(callId).first<any>();
  }
 }
 if(!row)throw new RequestError(403,'This call is not a saved website callback.');if(actual.call_id!==callId||actual.call_type!=='phone_call'||actual.direction!=='outbound'||actual.agent_id!==row.agent_id||actual.from_number!==row.from_number||actual.to_number!==row.recipient||!['ongoing','ended'].includes(actual.call_status))throw new RequestError(403,'Callback identity could not be verified.');
 if(name==='callback_stop'){await db.batch([
  db.prepare("UPDATE website_callbacks SET status='stopped',last_error='Contact declined further follow-up.' WHERE id=?").bind(row.id),
  db.prepare("UPDATE response_jobs SET status='paused',revision=revision+1,updated_at=? WHERE id=?").bind(new Date().toISOString(),row.response_id),
  db.prepare("UPDATE response_followups SET status='cancelled',reason='Callback contact declined.',revision=revision+1 WHERE response_id=? AND status='open'").bind(row.response_id),
  db.prepare("UPDATE customer_first_emails SET status='cancelled',retryable=0,last_error='Contact declined follow-up.' WHERE id=? AND status IN ('pending','sending','failed')").bind(row.id)
 ]);return {ok:true,status:'stopped'};}
 const setup=await websiteCallbackSetup();if(!setup.enabled||row.status!=='accepted'||row.response_status==='paused'||row.original_phone!==row.current_phone||callbackPhone(row.current_phone)!==row.recipient||row.preferred_contact!=='phone')throw new RequestError(409,'This callback is paused or the contact changed.');
 if(name==='callback_availability'){if(!args.date){const b=await bookingSetup();return {ok:true,enabled:b.config.enabled,timezone:b.config.timezone,today:localParts(Date.now(),b.config.timezone).date,duration:b.config.duration};}return {ok:true,...await availableSlots(args.date)};}
 const a=await createAppointment({requestKey:row.id,kind:'meeting',responseId:row.response_id,confirmedPhone:row.current_phone,start:args.start,revision:args.revision,confirmed:args.confirmed},undefined,{id:row.id,callId,settingsRevision:setup.revision,connectionCiphertext:v.api_key_ciphertext});return {ok:true,status:a.status,start:a.start,end:a.end,timezone:a.timezone,label:appointmentTimeLabel(a.start,a.timezone),duplicate:a.duplicate};
}
export async function recentWebsiteCallbacks(){return (await database().prepare('SELECT w.id,c.name,w.status,w.last_error AS error,w.created_at AS createdAt FROM website_callbacks w JOIN crm_leads c ON c.inquiry_id=w.id ORDER BY w.created_at DESC LIMIT 10').all<{id:string;name:string;status:string;error:string;createdAt:string}>()).results;}
