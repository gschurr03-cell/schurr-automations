import {env} from 'cloudflare:workers';
import {database,readBoundedText,RequestError} from './inquiries';
import {encryptIntegrationSecret,decryptIntegrationSecret} from './integration-secret';

const CANONICAL_REDIRECT='https://schurrautomations.com/api/manage/gmail/callback';
const DEFAULT_EMAIL='gavin@schurrautomations.com';
const COOKIE='__Host-schurr-gmail';
const REQUIRED_SCOPES=['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'];
const encoder=new TextEncoder();
type Runtime={GMAIL_CLIENT_ID?:string;GMAIL_CLIENT_SECRET?:string;GMAIL_REDIRECT_URI?:string;GMAIL_EXPECTED_EMAIL?:string};
type ConnectionRow={id:string;email:string;status:string;token_ciphertext:string;scopes:string;revision:number;connected_at:string;updated_at:string;last_sync_at:string;last_error:string};
type ConfigRow={client_id:string;client_secret_ciphertext:string;redirect_uri:string;expected_email:string;revision:number;updated_at:string};
type Config={clientId:string;clientSecret:string;redirectUri:string;expectedEmail:string;revision:number;fingerprint:string;configured:boolean;missing:string[]};
type Token={access:string;refresh:string;expires:number;binding:string};
export type GmailConnection={email:string;revision:number;status:string};
export class GmailApiError extends RequestError {
  constructor(status:number,message='The Gmail request could not be completed.',public ambiguous=false){super(status,message);}
}
const base64url=(value:Uint8Array)=>btoa(Array.from(value,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const sha=async(value:string)=>base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const now=()=>new Date().toISOString();
const epoch=()=>Date.now();
const conflict=()=>new RequestError(409,'The Gmail connection changed. Refresh this page and try again.');
const unavailable=()=>new RequestError(503,'Complete Gmail connection setup first.');

function defaults(){
  const runtime=env as unknown as Runtime;
  const redirectUri=runtime.GMAIL_REDIRECT_URI||CANONICAL_REDIRECT;
  const expectedEmail=(runtime.GMAIL_EXPECTED_EMAIL||DEFAULT_EMAIL).trim().toLowerCase();
  let valid=false;
  try{const url=new URL(redirectUri);valid=url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/api/manage/gmail/callback';}catch{/* invalid config stays disabled */}
  if(!valid||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(expectedEmail))throw new RequestError(503,'The Gmail callback and mailbox configuration need attention.');
  return {runtime,redirectUri,expectedEmail};
}
function validId(value:string){return /^[A-Za-z0-9_-]{10,220}\.apps\.googleusercontent\.com$/.test(value);}
function validSecret(value:string){return value.length>=8&&value.length<=4096&&!/[\s\u0000-\u001f\u007f]/.test(value);}
async function config():Promise<Config>{
  const {runtime,redirectUri,expectedEmail}=defaults();
  const saved=await database().prepare('SELECT * FROM gmail_app_config WHERE id = ?').bind('gmail').first<ConfigRow>();
  let clientId=saved?.client_id||runtime.GMAIL_CLIENT_ID||'';
  let clientSecret=runtime.GMAIL_CLIENT_SECRET||'';
  if(saved){try{clientSecret=await decryptIntegrationSecret(saved.client_secret_ciphertext,'gmail-config');}catch{clientSecret='';}}
  clientId=clientId.trim();clientSecret=clientSecret.trim();
  const missing:string[]=[];
  if(!validId(clientId))missing.push('Google client ID');
  if(!validSecret(clientSecret))missing.push('Google client secret');
  // The deployment owns its callback and mailbox, including for generated clients.
  if(saved&&(saved.redirect_uri!==redirectUri||saved.expected_email!==expectedEmail))missing.push('Saved configuration does not match this deployment');
  const revision=saved?.revision||0;
  const fingerprint=await sha(JSON.stringify({clientId,clientSecret,redirectUri,expectedEmail,revision}));
  return {clientId,clientSecret,redirectUri,expectedEmail,revision,fingerprint,configured:missing.length===0,missing};
}
async function row(){return database().prepare('SELECT * FROM gmail_connections WHERE id = ?').bind('gmail').first<ConnectionRow>();}
async function tokenFor(record:ConnectionRow,cfg:Config):Promise<Token>{
  let token:Token;
  try{token=JSON.parse(await decryptIntegrationSecret(record.token_ciphertext,'gmail')) as Token;}catch{throw new RequestError(503,'Reconnect the business Gmail account.');}
  if(!token||token.binding!==cfg.fingerprint||typeof token.access!=='string'||typeof token.refresh!=='string'||!token.refresh||!Number.isFinite(token.expires))throw new RequestError(503,'Reconnect the business Gmail account.');
  return token;
}
function scopesGranted(value:string){const granted=new Set(value.split(/\s+/));return REQUIRED_SCOPES.every(scope=>granted.has(scope));}
export async function getGmailConnection():Promise<GmailConnection|null>{
  const cfg=await config();if(!cfg.configured)return null;
  const current=await row();
  if(!current||current.status!=='connected'||current.email.toLowerCase()!==cfg.expectedEmail||!scopesGranted(current.scopes))return null;
  try{await tokenFor(current,cfg);}catch{return null;}
  return {email:current.email,revision:current.revision,status:current.status};
}
export async function gmailSetup(){
  const cfg=await config();const current=await row();
  let status=current?.status||'disconnected';
  if(status==='connected'){
    try{if(!cfg.configured||!current||current.email.toLowerCase()!==cfg.expectedEmail||!scopesGranted(current.scopes))throw Error();await tokenFor(current,cfg);}catch{status='reconnect_needed';}
  }
  return {configured:cfg.configured,expectedEmail:cfg.expectedEmail,redirectUri:cfg.redirectUri,clientId:validId(cfg.clientId)?cfg.clientId:'',configRevision:cfg.revision,missing:cfg.missing,connection:current?{email:current.email,status,revision:current.revision,connectedAt:current.connected_at,updatedAt:current.updated_at,lastSyncAt:current.last_sync_at,lastError:current.last_error}:null};
}
export async function configureGmail(input:Record<string,unknown>){
  const clientId=typeof input.clientId==='string'?input.clientId.trim():'';
  const clientSecret=typeof input.clientSecret==='string'?input.clientSecret.trim():'';
  const expectedRevision=input.configRevision??input.expectedRevision;
  if(!validId(clientId)||!validSecret(clientSecret))throw new RequestError(400,'Enter a valid Google web client ID and client secret.');
  if(!Number.isSafeInteger(expectedRevision)||Number(expectedRevision)<0)throw new RequestError(400,'Refresh the Gmail setup form before saving.');
  const {redirectUri,expectedEmail}=defaults();
  const ciphertext=await encryptIntegrationSecret(clientSecret,'gmail-config');
  const timestamp=now();const revision=Number(expectedRevision)+1;
  const db=database();
  const results=await db.batch([
    db.prepare(`INSERT INTO gmail_app_config (id,client_id,client_secret_ciphertext,redirect_uri,expected_email,revision,updated_at)
      SELECT 'gmail',?,?,?,?,?,? WHERE ? = 0 OR EXISTS (SELECT 1 FROM gmail_app_config WHERE id = 'gmail')
      ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,client_secret_ciphertext=excluded.client_secret_ciphertext,redirect_uri=excluded.redirect_uri,expected_email=excluded.expected_email,revision=excluded.revision,updated_at=excluded.updated_at
      WHERE gmail_app_config.revision = ? RETURNING revision`).bind(clientId,ciphertext,redirectUri,expectedEmail,revision,timestamp,Number(expectedRevision),Number(expectedRevision)),
    db.prepare(`UPDATE gmail_connections SET status='disconnected',token_ciphertext='',scopes='',revision=revision+1,updated_at=?,last_error='',sync_lock_token='',sync_lock_until=0
      WHERE id='gmail' AND EXISTS (SELECT 1 FROM gmail_app_config WHERE id='gmail' AND revision=? AND client_secret_ciphertext=?)`).bind(timestamp,revision,ciphertext),
  ]);
  if(!results[0]?.results?.length)throw conflict();
  return gmailSetup();
}
export async function startGmailConnect(request:Request,ownerEmail:string):Promise<{url:string;cookie:string}>{
  const cfg=await config();if(!cfg.configured)throw unavailable();
  if(!ownerEmail||new URL(request.url).origin!==new URL(cfg.redirectUri).origin)throw new RequestError(403,'Connect Gmail from the configured business website.');
  const db=database();const timestamp=now();
  await db.prepare(`INSERT INTO gmail_connections(id,email,status,token_ciphertext,scopes,revision,connected_at,updated_at) VALUES('gmail',?,'disconnected','','',1,'',?) ON CONFLICT(id) DO NOTHING`).bind(cfg.expectedEmail,timestamp).run();
  const current=await row();if(!current)throw unavailable();
  const state=random();const browser=random();const verifier=random();
  await db.prepare('DELETE FROM gmail_oauth_states WHERE expires_at < ? OR consumed_at > 0').bind(epoch()).run();
  await db.prepare(`INSERT INTO gmail_oauth_states(state_hash,owner_email,browser_hash,verifier_ciphertext,redirect_uri,expires_at,consumed_at,connection_revision,created_at,config_fingerprint) VALUES(?,?,?,?,?,?,0,?,?,?)`)
    .bind(await sha(state),ownerEmail.trim().toLowerCase(),await sha(browser),await encryptIntegrationSecret(verifier,'gmail'),cfg.redirectUri,epoch()+10*60_000,current.revision,timestamp,cfg.fingerprint).run();
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const params={client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:'code',scope:REQUIRED_SCOPES.join(' '),access_type:'offline',prompt:'consent',login_hint:cfg.expectedEmail,state,code_challenge:await sha(verifier),code_challenge_method:'S256'};
  for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
  return {url:url.href,cookie:`${COOKIE}=${browser}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`};
}
export const clearGmailCookie=()=>`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
function browserCookie(request:Request){
  const matches=(request.headers.get('cookie')||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(`${COOKIE}=`));
  if(matches.length!==1)return '';
  const value=matches[0].slice(COOKIE.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';
}
type OAuthResponse={access_token?:unknown;refresh_token?:unknown;expires_in?:unknown;scope?:unknown;token_type?:unknown;error?:unknown};
async function provider(url:string,init:RequestInit,mutation=false):Promise<Record<string,unknown>>{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15_000);
  try{
    const response=await fetch(url,{...init,redirect:'manual',signal:controller.signal});
    if(response.status>=300&&response.status<400)throw new GmailApiError(502,'Gmail returned an unsupported redirect.',mutation);
    if(!response.ok){
      // No provider response text is propagated to logs, routes, or the client.
      if(response.body)await response.body.cancel();
      throw new GmailApiError(response.status,'Gmail could not complete this request.',mutation&&(response.status>=500||response.status===408));
    }
    const body=await readBoundedText(response,2*1024*1024);
    const parsed:unknown=JSON.parse(body);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid response');
    return parsed as Record<string,unknown>;
  }catch(error){if(error instanceof GmailApiError)throw error;throw new GmailApiError(502,'The Gmail response could not be confirmed.',mutation);}
  finally{clearTimeout(timeout);}
}
async function exchange(cfg:Config,body:Record<string,string>):Promise<OAuthResponse>{
  const data=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,...body});
  return provider('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:data.toString()}) as Promise<OAuthResponse>;
}
function accessToken(value:OAuthResponse){
  if(typeof value.access_token!=='string'||!value.access_token||value.access_token.length>16_384||/[\r\n\u0000]/.test(value.access_token)||value.token_type!=='Bearer')throw new GmailApiError(502,'Google returned an incomplete authorization.');
  const seconds=Number(value.expires_in);
  if(!Number.isFinite(seconds)||seconds<=0||seconds>86_400)throw new GmailApiError(502,'Google returned an invalid authorization lifetime.');
  return {access:value.access_token,expires:epoch()+seconds*1000};
}
export async function completeGmailConnect(request:Request,ownerEmail:string):Promise<void>{
  const cfg=await config();if(!cfg.configured)throw unavailable();
  const url=new URL(request.url);const callback=`${url.origin}${url.pathname}`;
  if(callback!==cfg.redirectUri||url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length>1||url.searchParams.getAll('error').length>1)throw new RequestError(400,'Restart the Gmail connection from this website.');
  const state=url.searchParams.get('state')||'';const browser=browserCookie(request);
  if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!browser||!ownerEmail)throw new RequestError(403,'This Gmail connection attempt is not valid for this browser.');
  type State={verifier_ciphertext:string;connection_revision:number};
  const attempt=await database().prepare(`UPDATE gmail_oauth_states SET consumed_at=? WHERE state_hash=? AND owner_email=? AND browser_hash=? AND expires_at>? AND consumed_at=0 AND redirect_uri=? AND config_fingerprint=? RETURNING verifier_ciphertext,connection_revision`)
    .bind(epoch(),await sha(state),ownerEmail.trim().toLowerCase(),await sha(browser),epoch(),cfg.redirectUri,cfg.fingerprint).first<State>();
  if(!attempt)throw new RequestError(403,'This Gmail connection attempt expired or was already used. Connect again.');
  if(url.searchParams.has('error'))throw new RequestError(400,'Google authorization was not completed. Connect Gmail when ready.');
  const code=url.searchParams.get('code')||'';
  if(!code||code.length>4096||/[\u0000-\u001f\u007f]/.test(code))throw new RequestError(400,'Google did not return a valid authorization code.');
  const baseline=await row();if(!baseline||baseline.revision!==attempt.connection_revision)throw conflict();
  const verifier=await decryptIntegrationSecret(attempt.verifier_ciphertext,'gmail');
  let granted:OAuthResponse;
  try{granted=await exchange(cfg,{code,code_verifier:verifier,redirect_uri:cfg.redirectUri,grant_type:'authorization_code'});}catch{throw new RequestError(502,'Google authorization could not be completed. Connect Gmail again.');}
  if(typeof granted.scope!=='string'||!scopesGranted(granted.scope))throw new RequestError(400,'Allow both sending and reading messages to connect the CRM.');
  const access=accessToken(granted);
  const profile=await provider('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${access.access}`}});
  if(typeof profile.emailAddress!=='string'||profile.emailAddress.toLowerCase()!==cfg.expectedEmail)throw new RequestError(400,`Select ${cfg.expectedEmail} when connecting Gmail.`);
  let refresh=typeof granted.refresh_token==='string'?granted.refresh_token:'';
  if(!refresh&&baseline.status==='connected'&&baseline.email.toLowerCase()===cfg.expectedEmail){try{refresh=(await tokenFor(baseline,cfg)).refresh;}catch{/* require a new grant */}}
  if(!refresh||refresh.length>16_384||/[\r\n\u0000]/.test(refresh))throw new RequestError(400,'Google did not grant background access. Connect again and approve the requested access.');
  const currentConfig=await config();if(currentConfig.fingerprint!==cfg.fingerprint)throw conflict();
  const cipher=await encryptIntegrationSecret(JSON.stringify({...access,refresh,binding:cfg.fingerprint} satisfies Token),'gmail');
  const saved=await database().prepare(`UPDATE gmail_connections SET email=?,status='connected',token_ciphertext=?,scopes=?,revision=revision+1,connected_at=?,updated_at=?,last_error='',sync_lock_token='',sync_lock_until=0 WHERE id='gmail' AND revision=? RETURNING revision`)
    .bind(cfg.expectedEmail,cipher,granted.scope,now(),now(),attempt.connection_revision).first<{revision:number}>();
  if(!saved)throw conflict();
}
export async function disconnectGmail():Promise<void>{
  const db=database();
  await db.batch([
    db.prepare(`UPDATE gmail_connections SET status='disconnected',token_ciphertext='',scopes='',revision=revision+1,updated_at=?,last_error='',sync_lock_token='',sync_lock_until=0 WHERE id='gmail'`).bind(now()),
    db.prepare('DELETE FROM gmail_oauth_states'),
  ]);
  // Deliberately do not revoke the entire Google project grant automatically.
}
function sameConnection(current:ConnectionRow|null,expected:GmailConnection){return !!current&&current.status==='connected'&&current.revision===expected.revision&&current.email.toLowerCase()===expected.email.toLowerCase();}
async function markReconnect(current:ConnectionRow){
  await database().prepare(`UPDATE gmail_connections SET status='reconnect_needed',token_ciphertext='',revision=revision+1,last_error='Reconnect the business Gmail account.',updated_at=?,sync_lock_token='',sync_lock_until=0 WHERE id='gmail' AND revision=? AND token_ciphertext=? AND status='connected'`)
    .bind(now(),current.revision,current.token_ciphertext).run();
}
async function refreshed(current:ConnectionRow,cfg:Config):Promise<{record:ConnectionRow;token:Token}>{
  const oldToken=await tokenFor(current,cfg);
  if(oldToken.expires>epoch()+60_000)return {record:current,token:oldToken};
  let result:OAuthResponse;
  try{result=await exchange(cfg,{refresh_token:oldToken.refresh,grant_type:'refresh_token'});}
  catch(error){
    // A competing refresh may already have replaced this token. Never invalidate it.
    const latest=await row();
    if(sameConnection(latest,current)&&latest!.token_ciphertext!==current.token_ciphertext){const winner=await tokenFor(latest!,cfg);if(winner.expires>epoch()+60_000)return {record:latest!,token:winner};}
    if(error instanceof GmailApiError&&(error.status===400||error.status===401)){await markReconnect(current);throw new RequestError(503,'Reconnect the business Gmail account.');}
    throw error;
  }
  const access=accessToken(result);
  if(typeof result.scope==='string'&&!scopesGranted(result.scope)){await markReconnect(current);throw new RequestError(503,'Reconnect Gmail and approve the required permissions.');}
  const refresh=typeof result.refresh_token==='string'&&result.refresh_token?result.refresh_token:oldToken.refresh;
  if(refresh.length>16_384||/[\r\n\u0000]/.test(refresh))throw new GmailApiError(502,'Google returned an incomplete authorization.');
  const token:Token={...access,refresh,binding:cfg.fingerprint};
  const cipher=await encryptIntegrationSecret(JSON.stringify(token),'gmail');
  const updated=await database().prepare(`UPDATE gmail_connections SET token_ciphertext=?,updated_at=? WHERE id='gmail' AND revision=? AND token_ciphertext=? AND status='connected' RETURNING revision`)
    .bind(cipher,now(),current.revision,current.token_ciphertext).first<{revision:number}>();
  if(updated)return {record:{...current,token_ciphertext:cipher},token};
  const latest=await row();if(!sameConnection(latest,current))throw conflict();
  const winner=await tokenFor(latest!,cfg);if(winner.expires<=epoch()+60_000)throw new RequestError(503,'Gmail authorization is refreshing. Try again.');
  return {record:latest!,token:winner};
}
function safePath(path:string,method:string){
  if(path.length>4096||/[\u0000-\u0020\u007f\\#]/.test(path)||path.startsWith('//')||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path))throw new RequestError(400,'Unsupported Gmail request.');
  const [pathname]=path.replace(/^\//,'').split('?');
  if(!/^(?:profile|history|messages(?:\/(?:send|[A-Za-z0-9_-]+))?|threads(?:\/[A-Za-z0-9_-]+)?)$/.test(pathname))throw new RequestError(400,'Unsupported Gmail request.');
  if(method==='POST'&&pathname!=='messages/send'||method==='GET'&&pathname==='messages/send'||!['GET','POST'].includes(method))throw new RequestError(400,'Unsupported Gmail request method.');
  return path.replace(/^\//,'');
}
export async function gmailRequest(path:string,init:RequestInit={},expected?:{email:string;revision:number},beforeDispatch?:()=>Promise<void>):Promise<any>{
  const method=(init.method||'GET').toUpperCase();const safe=safePath(path,method);
  const cfg=await config();if(!cfg.configured)throw unavailable();
  const current=await row();
  if(!current||current.status!=='connected'||current.email.toLowerCase()!==cfg.expectedEmail||!scopesGranted(current.scopes))throw new RequestError(503,'Connect the business Gmail account first.');
  if(expected&&!sameConnection(current,{...expected,status:'connected'}))throw conflict();
  const ready=await refreshed(current,cfg);
  const latest=await row();const freshConfig=await config();
  if(!sameConnection(latest,current)||latest!.token_ciphertext!==ready.record.token_ciphertext||freshConfig.fingerprint!==cfg.fingerprint)throw conflict();
  const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${ready.token.access}`);headers.set('Accept','application/json');
  if(method==='POST')headers.set('Content-Type','application/json');
  // Authorization is fenced immediately before dispatch. Already-dispatched network requests cannot be recalled by disconnect.
  // There is intentionally no 401, network, or POST retry here.
  if(beforeDispatch)await beforeDispatch();
  return provider(`https://gmail.googleapis.com/gmail/v1/users/me/${safe}`,{...init,method,headers},method==='POST');
}
