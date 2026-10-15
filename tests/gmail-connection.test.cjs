const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {webcrypto}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const appRoot=process.env.SCHURR_ROOT||path.resolve(__dirname,'..');
const sourceRoot=process.env.GMAIL_CONNECTION_ROOT||path.resolve(__dirname,'..');
const ts=createRequire(path.join(appRoot,'package.json'))('typescript');
const sql=new DatabaseSync(':memory:');
sql.exec(`
CREATE TABLE gmail_app_config(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,client_secret_ciphertext TEXT NOT NULL,redirect_uri TEXT NOT NULL,expected_email TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE gmail_connections(id TEXT PRIMARY KEY,email TEXT NOT NULL,status TEXT NOT NULL,token_ciphertext TEXT NOT NULL,scopes TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,connected_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_sync_at TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',sync_lock_token TEXT NOT NULL DEFAULT '',sync_lock_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE gmail_oauth_states(state_hash TEXT PRIMARY KEY,owner_email TEXT NOT NULL,browser_hash TEXT NOT NULL,verifier_ciphertext TEXT NOT NULL,redirect_uri TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed_at INTEGER NOT NULL DEFAULT 0,connection_revision INTEGER NOT NULL,created_at TEXT NOT NULL,config_fingerprint TEXT NOT NULL);
`);
function statement(query,values=[]){return {query,values,bind(...args){return statement(query,args);},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return sql.prepare(query).run(...values);}};}
const db={prepare:statement,async batch(statements){sql.exec('BEGIN');try{const values=statements.map(s=>({results:sql.prepare(s.query).all(...s.values)}));sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const runtime={INQUIRY_SIGNING_SECRET:'test-only-gmail-secret-with-at-least-32-characters'};
class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
async function readBoundedText(response,max){const reader=response.body.getReader();const parts=[];let length=0;while(true){const result=await reader.read();if(result.done)break;length+=result.value.length;if(length>max){await reader.cancel();throw Error('too big');}parts.push(result.value);}return Buffer.concat(parts).toString();}
const calls=[];let fetcher=async()=>{throw Error('unexpected network');};
const modules=new Map();
function load(name){
  if(modules.has(name))return modules.get(name);
  const source=fs.readFileSync(name==='integration-secret'?path.join(appRoot,'lib/integration-secret.ts'):path.join(sourceRoot,'lib/gmail-connection.ts'),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  const require=name=>{if(name==='cloudflare:workers')return {env:runtime};if(name==='./inquiries')return {database:()=>db,readBoundedText,RequestError};if(name==='./integration-secret')return load('integration-secret');throw Error(name);};
  vm.runInNewContext(output,{module,exports:module.exports,require,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,Request,Response,Headers,AbortController,URL,URLSearchParams,Date,Number,JSON,setTimeout,clearTimeout,fetch:async(url,init)=>{calls.push({url,init});return fetcher(url,init);}}, {filename:name});
  modules.set(name,module.exports);return module.exports;
}
const api=load('gmail-connection');const secrets=load('integration-secret');
const origin='https://schurrautomations.com';const owner='gschurr03@gmail.com';const business='gavin@schurrautomations.com';
const scopes='https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
const clientId='1234567890-test.apps.googleusercontent.com';
let checks=0;
function check(condition,message){assert.ok(condition,message);checks++;}
async function rejects(action,status){await assert.rejects(action,error=>error.status===status);checks++;}
function request(route){return new Request(`${origin}${route}`);}
async function start(){const result=await api.startGmailConnect(request('/api/manage/gmail'),owner);const url=new URL(result.url);return {result,state:url.searchParams.get('state'),cookie:result.cookie.split(';')[0],url};}
function callback(attempt,opts={}){const url=`${origin}/api/manage/gmail/callback?state=${attempt.state}&code=google-auth-code${opts.query||''}`;return new Request(url,{headers:{cookie:opts.cookie||attempt.cookie}});}
function authorize({email=business,scope=scopes}={}){fetcher=async(url)=>{if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'access-token',refresh_token:'refresh-token',token_type:'Bearer',expires_in:3600,scope});if(url.endsWith('/profile'))return Response.json({emailAddress:email,historyId:'123'});throw Error('unexpected request');};}
async function connect(){authorize();const attempt=await start();await api.completeGmailConnect(callback(attempt),owner);return api.getGmailConnection();}
(async()=>{
  check((await api.gmailSetup()).configured===false,'missing setup disabled');
  await rejects(()=>api.startGmailConnect(request('/api/manage/gmail'),owner),503);
  await rejects(()=>api.configureGmail({clientId:'bad',clientSecret:'fake-secret',configRevision:0}),400);
  const configured=await api.configureGmail({clientId,clientSecret:'fake-client-secret',configRevision:0});
  check(configured.configured&&configured.configRevision===1,'saved config');
  check(!JSON.stringify(configured).includes('fake-client-secret'),'status hides secret');
  check(!sql.prepare('SELECT client_secret_ciphertext FROM gmail_app_config').get().client_secret_ciphertext.includes('fake-client-secret'),'encrypted credentials');
  await rejects(()=>api.configureGmail({clientId,clientSecret:'another-secret',configRevision:0}),409);
  const attempt=await start();
  check(attempt.url.searchParams.get('code_challenge_method')==='S256'&&attempt.result.cookie.includes('HttpOnly; Secure; SameSite=Lax'),'PKCE and secure cookie');
  const before=calls.length;
  await rejects(()=>api.completeGmailConnect(callback(attempt), 'other@example.com'),403);
  await rejects(()=>api.completeGmailConnect(callback(attempt,{cookie:'__Host-schurr-gmail='+'a'.repeat(43)}),owner),403);
  check(calls.length===before,'owner and browser mismatches rejected before provider');
  authorize();await api.completeGmailConnect(callback(attempt),owner);
  check((await api.getGmailConnection()).email===business,'connection established');
  const tokenStored=sql.prepare('SELECT token_ciphertext FROM gmail_connections').get().token_ciphertext;
  check(!tokenStored.includes('access-token')&&!tokenStored.includes('refresh-token'),'tokens encrypted');
  await rejects(()=>api.completeGmailConnect(callback(attempt),owner),403);
  const established=(await api.getGmailConnection()).revision;
  const denied=await start();authorize({scope:'https://www.googleapis.com/auth/gmail.send'});
  await rejects(()=>api.completeGmailConnect(callback(denied),owner),400);
  check((await api.getGmailConnection()).revision===established,'partial consent preserves prior connection');
  const wrong=await start();authorize({email:'other@example.com'});
  await rejects(()=>api.completeGmailConnect(callback(wrong),owner),400);
  const stale=await start();await api.disconnectGmail();authorize();
  await rejects(()=>api.completeGmailConnect(callback(stale),owner),403);
  check(await api.getGmailConnection()===null&&sql.prepare('SELECT token_ciphertext FROM gmail_connections').get().token_ciphertext==='','disconnect erases credentials');
  await connect();const beforeConfig=await start();
  await api.configureGmail({clientId,clientSecret:'changed-client-secret',configRevision:1});
  await rejects(()=>api.completeGmailConnect(callback(beforeConfig),owner),403);
  check(await api.getGmailConnection()===null,'config changes disconnect');
  await connect();
  const baseline=await api.getGmailConnection();
  for(const hostile of ['https://evil.example/x','//evil.example/x','../profile','%2e%2e/profile','messages/../profile','profile#secret','messages\\send'])await rejects(()=>api.gmailRequest(hostile),400);
  await rejects(()=>api.gmailRequest('/profile',{method:'POST'}),400);
  await rejects(()=>api.gmailRequest('/messages/send',{method:'GET'}),400);
  await rejects(()=>api.gmailRequest('/profile',{}, {email:business,revision:baseline.revision-1}),409);
  fetcher=async(url,init)=>{check(url==='https://gmail.googleapis.com/gmail/v1/users/me/profile','fixed provider base');check(new Headers(init.headers).get('Authorization')==='Bearer access-token'&&init.redirect==='manual','server auth and redirect fence');return Response.json({emailAddress:business});};
  await api.gmailRequest('/profile',{},baseline);
  fetcher=async()=>new Response('',{status:302,headers:{location:'https://evil.example'}});
  await rejects(()=>api.gmailRequest('/profile'),502);
  fetcher=async()=>{throw Error('provider sensitive body');};
  const beforeSend=calls.length;
  await assert.rejects(()=>api.gmailRequest('/messages/send',{method:'POST',body:'{}'},baseline),error=>error instanceof api.GmailApiError&&error.ambiguous&&!error.message.includes('sensitive'));checks++;
  check(calls.length===beforeSend+1,'ambiguous send never retried');
  fetcher=async()=>new Response('sensitive provider error',{status:403});
  await assert.rejects(()=>api.gmailRequest('/messages/send',{method:'POST',body:'{}'},baseline),error=>error.status===403&&!error.ambiguous&&!error.message.includes('sensitive'));checks++;
  fetcher=async()=>Response.json({bad:'x'.repeat(2*1024*1024)});
  await rejects(()=>api.gmailRequest('/profile'),502);
  const record=sql.prepare('SELECT * FROM gmail_connections').get();
  const stored=JSON.parse(await secrets.decryptIntegrationSecret(record.token_ciphertext,'gmail'));stored.expires=0;
  const expired=await secrets.encryptIntegrationSecret(JSON.stringify(stored),'gmail');sql.prepare('UPDATE gmail_connections SET token_ciphertext=?').run(expired);
  let refreshes=0;
  fetcher=async(url)=>{if(url.includes('/token')){refreshes++;return Response.json({access_token:'refreshed',token_type:'Bearer',expires_in:3600});}return Response.json({emailAddress:business});};
  await api.gmailRequest('/profile',{},baseline);
  check(refreshes===1&&(await api.getGmailConnection()).revision===baseline.revision,'refresh preserves connection revision');
  const updated=sql.prepare('SELECT token_ciphertext FROM gmail_connections').get();
  const refreshed=JSON.parse(await secrets.decryptIntegrationSecret(updated.token_ciphertext,'gmail'));
  check(refreshed.refresh==='refresh-token','refresh retains refresh token when omitted');
  refreshed.expires=0;sql.prepare('UPDATE gmail_connections SET token_ciphertext=?').run(await secrets.encryptIntegrationSecret(JSON.stringify(refreshed),'gmail'));
  fetcher=async(url)=>{if(url.includes('/token')){await api.disconnectGmail();return Response.json({access_token:'obsolete',token_type:'Bearer',expires_in:3600});}throw Error('must not call Gmail after disconnect');};
  await rejects(()=>api.gmailRequest('/profile',{},baseline),409);
  check(await api.getGmailConnection()===null,'refresh cannot resurrect disconnected account');
  await connect();
  const active=sql.prepare('SELECT * FROM gmail_connections').get();
  const shared=JSON.parse(await secrets.decryptIntegrationSecret(active.token_ciphertext,'gmail'));shared.expires=0;
  sql.prepare('UPDATE gmail_connections SET token_ciphertext=?').run(await secrets.encryptIntegrationSecret(JSON.stringify(shared),'gmail'));
  let releaseRefresh;const bothStarted=new Promise(resolve=>{releaseRefresh=resolve;});let started=0;
  fetcher=async(url)=>{if(url.includes('/token')){const n=++started;if(started===2)releaseRefresh();await bothStarted;return Response.json({access_token:'concurrent-'+n,refresh_token:'rotated-'+n,token_type:'Bearer',expires_in:3600});}return Response.json({ok:true});};
  const races=await Promise.allSettled([api.gmailRequest('/profile'),api.gmailRequest('/profile')]);
  check(races.some(x=>x.status==='fulfilled')&&races.every(x=>x.status==='fulfilled'||x.reason.status===409),'concurrent refresh either uses winning token or fails before dispatch');
  check((await api.getGmailConnection()).revision===active.revision,'concurrent refresh preserves revision');
  const finalToken=JSON.parse(await secrets.decryptIntegrationSecret(sql.prepare('SELECT token_ciphertext FROM gmail_connections').get().token_ciphertext,'gmail'));
  check(['rotated-1','rotated-2'].includes(finalToken.refresh),'one refresh token CAS wins');
  finalToken.expires=0;sql.prepare('UPDATE gmail_connections SET token_ciphertext=?').run(await secrets.encryptIntegrationSecret(JSON.stringify(finalToken),'gmail'));
  let refreshComplete=false,dispatchGuardRan=false,providerPosts=0;
  fetcher=async(url)=>{if(url.includes('/token')){refreshComplete=true;return Response.json({access_token:'guard-refresh',token_type:'Bearer',expires_in:3600});}providerPosts++;return Response.json({id:'should-not-send'});};
  await assert.rejects(()=>api.gmailRequest('/messages/send',{method:'POST',body:'{}'},undefined,async()=>{dispatchGuardRan=true;assert.ok(refreshComplete);throw new Error('Eligibility changed while refreshing');}),/Eligibility changed/);
  check(dispatchGuardRan&&providerPosts===0,'final dispatch guard runs after refresh and blocks provider send');
  const expiring=await start();sql.prepare('UPDATE gmail_oauth_states SET expires_at=0').run();
  await rejects(()=>api.completeGmailConnect(callback(expiring),owner),403);
  const badConfig=sql.prepare('SELECT * FROM gmail_app_config').get();sql.prepare("UPDATE gmail_app_config SET client_secret_ciphertext='corrupt'").run();
  const recovery=await api.gmailSetup();check(!recovery.configured&&recovery.configRevision===badConfig.revision,'corrupt secret leaves setup editable');
  console.log(`PASS ${checks} Gmail connection controls (real SQLite and token encryption; provider network mocked)`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>sql.close());
