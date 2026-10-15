const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {DatabaseSync}=require('node:sqlite');
const {webcrypto}=require('node:crypto');
const root=process.env.SCHURR_ROOT||path.resolve(__dirname,'..');
const modulePath=process.env.GMAIL_SEND_SOURCE||path.join(__dirname,'../lib/gmail-send.ts');
const ts=createRequire(path.join(root,'package.json'))('typescript');
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(path.join(root,'drizzle')).filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',name),'utf8'));
let connection={email:'gavin@schurrautomations.com',revision:1,status:'connected'};
let posts=0,syncs=0,failAcceptance=false,provider=async()=>({id:'sent1',threadId:'thread1'}),sync=async()=>{},beforeProvider=async()=>{};
class Statement{
 constructor(query,values=[]){this.query=query;this.values=values;}
 bind(...values){return new Statement(this.query,values);}
 async first(){return sql.prepare(this.query).get(...this.values)||null;}
 async all(){return {results:sql.prepare(this.query).all(...this.values)};}
 async run(){return sql.prepare(this.query).run(...this.values);}
}
const db={prepare:query=>new Statement(query),async batch(statements){
 if(failAcceptance&&statements.some(s=>s.query.includes("status='accepted'"))){failAcceptance=false;throw Error('Simulated acceptance persistence outage');}
 sql.exec('BEGIN');try{const result=statements.map(s=>({results:sql.prepare(s.query).all(...s.values)}));sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}
}};
class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
const validId=value=>{if(typeof value!=='string'||!/^[a-f\d-]{36}$/.test(value))throw new RequestError(400,'Invalid ID');return value;};
const outreach={
 async getSender(){return sql.prepare("SELECT * FROM outreach_settings WHERE id='main'").get();},
 async getProspect(id){return sql.prepare('SELECT * FROM outreach_prospects WHERE id=?').get(id)||null;},
 async eligibility(p,c,step){
  if(!['needs_review','ready'].includes(p.status)||c.status!=='active')return 'Not ready';
  if(customRequire('./outreach-targets').excludedOutreachBusiness(p))return 'Excluded business';
  if(!p.email)return 'Missing email';
  if(sql.prepare('SELECT 1 FROM outreach_suppressions WHERE email=?').get(p.email))return 'Suppressed';
  if(sql.prepare("SELECT 1 FROM outreach_activity WHERE recipient_email=? AND kind IN ('reply','meeting')").get(p.email))return 'Response exists';
  if(step>0){const previous=sql.prepare("SELECT sent_at FROM outreach_drafts WHERE campaign_id=? AND prospect_id=? AND step=? AND status='sent'").get(c.id,p.id,step-1);if(!previous||Date.parse(previous.sent_at)+JSON.parse(c.steps)[step].delay*86400000>Date.now())return 'Too early';}
  return null;
 },
 messageBody(d,s){return `${d.body}\n\nSchurr Automations\n${s.sender_email}\n${s.postal_address}\nBusiness inquiry from Schurr Automations. Reply "unsubscribe" if you prefer no further emails.`;},
};
const moduleValue={exports:{}};
const customRequire=name=>{
 if(name==='./outreach-history'||name==='./outreach-targets'){const m={exports:{}};new vm.Script(ts.transpileModule(fs.readFileSync(path.join(root,'lib',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText).runInNewContext({exports:m.exports,module:m,require:customRequire,URL});return m.exports;}
 if(name==='./inquiries')return {database:()=>db,RequestError};
 if(name==='./crm')return {validId};
 if(name==='./outreach')return outreach;
 if(name==='./gmail-connection')return {getGmailConnection:async()=>connection,gmailRequest:async(url,init,expected,beforeDispatch)=>{
  if(!connection||expected.email.toLowerCase()!==connection.email.toLowerCase()||expected.revision!==connection.revision)throw new RequestError(409,'Connection changed');
  await beforeProvider();if(beforeDispatch)await beforeDispatch();if(init?.method==='POST')posts++;return provider(url,init,expected);
 }};
 if(name==='./gmail-replies')return {syncGmailRepliesForRecipient:async recipient=>{syncs++;await sync(recipient);}};
 throw Error('Unexpected import '+name);
};
const context=vm.createContext({exports:moduleValue.exports,module:moduleValue,require:customRequire,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,Uint8Array,URL,URLSearchParams,Date,Intl,Request,Response});
new vm.Script(ts.transpileModule(fs.readFileSync(modulePath,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{filename:modulePath}).runInContext(context);
const api=moduleValue.exports;
const count=table=>sql.prepare('SELECT count(*) AS n FROM '+table).get().n;
function reset(){for(const table of ['gmail_replies','gmail_outbox','outreach_activity','outreach_drafts','outreach_prospects','outreach_campaigns','outreach_suppressions','outreach_settings'])sql.exec('DELETE FROM '+table);posts=0;syncs=0;failAcceptance=false;connection={email:'gavin@schurrautomations.com',revision:1,status:'connected'};provider=async()=>({id:'sent1',threadId:'thread1'});sync=async()=>{};beforeProvider=async()=>{};}
function seed(number=1){const now=new Date().toISOString(),id=webcrypto.randomUUID(),prospectId=webcrypto.randomUUID(),campaignId=webcrypto.randomUUID();
 sql.prepare("INSERT OR IGNORE INTO outreach_settings(id,sender_name,sender_email,postal_address,revision,daily_limit,window_start,window_end,updated_at) VALUES('main','Gavin Schurr','gavin@schurrautomations.com','123 Business St, Denver CO',1,20,'00:00','23:59',?)").run(now);
 sql.prepare("INSERT INTO outreach_prospects(id,company,website,domain,email,status,evidence,source_url,observed_at,created_at,updated_at) VALUES(?,?,?,?,?,'ready',?,?,?,?,?)").run(prospectId,'Business '+number,'https://business'+number+'.com','business'+number+'.com','owner@business'+number+'.com','Offers service calls','https://business'+number+'.com',now.slice(0,10),now,now);
 sql.prepare("INSERT INTO outreach_campaigns(id,name,service,audience,steps,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(campaignId,'Campaign '+number,'calls','Local services',JSON.stringify([{subject:'Question',body:'{{evidence}}',delay:0},{subject:'Followup',body:'Review',delay:3}]),now,now);
 sql.prepare("INSERT INTO outreach_drafts(id,campaign_id,prospect_id,step,recipient,subject,body,status,approved_revision,sender_revision,revision,created_at,updated_at) VALUES(?,?,?,0,?,?,?,'approved',1,1,1,?,?)").run(id,campaignId,prospectId,'owner@business'+number+'.com','A question about work','Hello,\n\nCan we talk?\n\nGavin',now,now);
 return {id,revision:1,senderRevision:1,connectionRevision:1,confirmSend:true};
}
const outbox=input=>sql.prepare('SELECT * FROM gmail_outbox WHERE draft_id=?').get(input.id);
function providerMessage(row,changes={}){return {id:'sent1',threadId:'thread1',labelIds:['SENT'],payload:{mimeType:'text/plain',headers:[{name:'From',value:`Gavin Schurr <${row.mailbox_email}>`},{name:'To',value:row.recipient},{name:'Subject',value:row.subject},{name:'Message-ID',value:row.rfc_message_id}],body:{data:Buffer.from(row.body).toString('base64url')}},...changes};}
function reconcileProvider(row,message=providerMessage(row)){provider=async url=>url.startsWith('/messages?')?{messages:[{id:'sent1'}]}:message;}
async function uncertain(input){provider=async()=>{throw Error('Connection lost after dispatch');};const result=await api.sendApprovedOutreach(input);assert.equal(result.status,'uncertain');return outbox(input);}
let checks=0;const pass=label=>{checks++;console.log('PASS '+label);};
(async()=>{
 reset();let input=seed();await api.gmailOutboxList();assert.equal(posts,0);await assert.rejects(()=>api.sendApprovedOutreach({...input,confirmSend:false}),e=>e.status===400);assert.equal(posts,0);assert.equal(count('gmail_outbox'),0);pass('connecting/listing and prior approval do not authorize sending');
 reset();input=seed();let result=await api.sendApprovedOutreach(input);assert.equal(result.status,'accepted');assert.equal(posts,1);assert.equal(syncs,1);assert.equal(sql.prepare('SELECT status FROM outreach_drafts WHERE id=?').get(input.id).status,'sent');assert.equal(count('outreach_activity'),1);result=await api.sendApprovedOutreach(input);assert.equal(result.status,'accepted');assert.equal(posts,1);assert.equal(count('outreach_activity'),1);pass('one explicit send commits Gmail acceptance and exact retries never POST twice');
 for(const [name,mutate] of [
  ['unapproved',()=>sql.exec("UPDATE outreach_drafts SET status='draft'")],
  ['draft revision',()=>sql.exec('UPDATE outreach_drafts SET revision=2')],
  ['sender revision',()=>sql.exec('UPDATE outreach_settings SET revision=2')],
  ['mailbox revision',()=>connection.revision=2],
  ['mailbox identity',()=>connection.email='different@schurrautomations.com'],
  ['suppression',()=>sql.prepare('INSERT INTO outreach_suppressions VALUES(?,?,?)').run('owner@business1.com','Opt out',new Date().toISOString())],
  ['missing postal',()=>sql.exec("UPDATE outreach_settings SET postal_address=''")],
  ['excluded fast food',()=>sql.exec("UPDATE outreach_prospects SET industry='Fast food restaurant'")],
  ['early followup',()=>sql.exec('UPDATE outreach_drafts SET step=1')],
 ]){reset();input=seed();mutate();await assert.rejects(()=>api.sendApprovedOutreach(input));assert.equal(posts,0);}
 pass('unapproved and stale identity, suppression, targeting, postal and sequence conditions block sending');
 reset();input=seed();sync=async recipient=>sql.prepare('INSERT INTO outreach_suppressions VALUES(?,?,?)').run(recipient,'Reply opt out',new Date().toISOString());await assert.rejects(()=>api.sendApprovedOutreach(input));assert.equal(posts,0);assert.equal(outbox(input).status,'cancelled');pass('recipient sync discovers opt-out before the final atomic provider admission');
 reset();input=seed();sync=async()=>sql.exec("UPDATE outreach_drafts SET status='draft',revision=revision+1");await assert.rejects(()=>api.sendApprovedOutreach(input));assert.equal(posts,0);assert.equal(outbox(input).first_attempt_at,0);pass('an edit while reply sync runs prevents the provider call');
 reset();input=seed();let release,startedResolve;const started=new Promise(resolve=>startedResolve=resolve);sync=async()=>{startedResolve();await new Promise(resolve=>release=resolve);};const first=api.sendApprovedOutreach(input);await started;const second=await api.sendApprovedOutreach(input);assert.equal(second.status,'prepared');release();await first;assert.equal(posts,1);pass('concurrent explicit sends share one lease and one provider POST');
 reset();input=seed();let row=await uncertain(input);await api.sendApprovedOutreach(input);assert.equal(posts,1);assert.equal(outbox(input).attempts,1);provider=async()=>({messages:[]});result=await api.reconcileGmailSend(row.id);assert.equal(result.status,'uncertain');assert.equal(posts,1);pass('timeout and zero reconciliation results never authorize another provider POST');
 reset();input=seed();row=await uncertain(input);reconcileProvider(row);result=await api.reconcileGmailSend(row.id);assert.equal(result.status,'accepted');assert.equal(posts,1);assert.equal(count('outreach_activity'),1);await api.reconcileGmailSend(row.id);assert.equal(count('outreach_activity'),1);pass('exact sent MIME identity and content reconcile to one accepted activity');
 for(const field of ['From','To','Subject','Message-ID','body']){reset();input=seed();row=await uncertain(input);const message=providerMessage(row);if(field==='body')message.payload.body.data=Buffer.from('Not the approved content').toString('base64url');else message.payload.headers.find(h=>h.name===field).value='different@example.com';reconcileProvider(row,message);assert.equal((await api.reconcileGmailSend(row.id)).status,'uncertain');}
 pass('reconciliation refuses mismatched sender, recipient, subject, Message-ID or body');
 reset();input=seed();row=await uncertain(input);connection={...connection,revision:2};reconcileProvider(row);assert.equal((await api.reconcileGmailSend(row.id)).status,'accepted');assert.equal(posts,1);pass('same-mailbox reconnect can reconcile but never resend an older attempt');
 reset();input=seed();failAcceptance=true;result=await api.sendApprovedOutreach(input);assert.equal(result.status,'uncertain');assert.equal(posts,1);row=outbox(input);reconcileProvider(row);assert.equal((await api.reconcileGmailSend(row.id)).status,'accepted');assert.equal(count('outreach_activity'),1);assert.equal(posts,1);pass('lost database commit after Gmail acceptance recovers through lookup without resend');
 reset();input=seed();provider=async()=>({});assert.equal((await api.sendApprovedOutreach(input)).status,'uncertain');await api.sendApprovedOutreach(input);assert.equal(posts,1);pass('malformed successful provider response becomes uncertain and is never replayed');
 reset();input=seed();row=await uncertain(input);sql.prepare("UPDATE gmail_outbox SET status='sending',lock_until=0 WHERE id=?").run(row.id);await api.gmailOutboxList();assert.equal(outbox(input).status,'uncertain');await api.sendApprovedOutreach(input);assert.equal(posts,1);pass('expired sending lease becomes uncertain rather than a retryable job');
 reset();const one=seed(1),two=seed(2);sql.exec('UPDATE outreach_settings SET daily_limit=1');const outcomes=await Promise.allSettled([api.sendApprovedOutreach(one),api.sendApprovedOutreach(two)]);assert.equal(outcomes.filter(o=>o.status==='fulfilled'&&o.value.status==='accepted').length,1);assert.equal(posts,1);assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_outbox WHERE first_attempt_at>0').get().n,1);pass('concurrent sends atomically share the configured daily capacity');
 reset();input=seed();sql.exec("UPDATE outreach_settings SET window_start='00:00',window_end='00:01'");await assert.rejects(()=>api.sendApprovedOutreach(input));assert.equal(outbox(input).first_attempt_at,0);sql.exec("UPDATE outreach_settings SET window_start='00:00',window_end='23:59'");assert.equal((await api.sendApprovedOutreach(input)).status,'accepted');assert.equal(posts,1);pass('outside-window attempt sends nothing and an explicit later attempt can use the same draft');
 reset();input=seed();sql.exec("UPDATE outreach_settings SET sender_name='Gavin'||char(13)||char(10)||'Bcc: other@example.com'");await assert.rejects(()=>api.sendApprovedOutreach(input));assert.equal(posts,0);pass('MIME header injection fails before any provider boundary');
 reset();input=seed();sql.prepare('UPDATE outreach_drafts SET subject=?,body=? WHERE id=?').run('A café question','Hello 👋\n\nCafé workflow?',input.id);row=await uncertain(input);const unicode=providerMessage(row);unicode.payload.headers.find(h=>h.name==='Subject').value='=?UTF-8?B?'+Buffer.from(row.subject).toString('base64')+'?=';reconcileProvider(row,unicode);assert.equal((await api.reconcileGmailSend(row.id)).status,'accepted');pass('UTF-8 subject and body survive MIME creation and reconciliation');
 reset();input=seed();row=await uncertain(input);provider=async url=>url.startsWith('/messages?')?{messages:[{id:'sent1'}],nextPageToken:'more'}:providerMessage(row);await assert.rejects(()=>api.reconcileGmailSend(row.id));assert.equal(outbox(input).status,'uncertain');assert.equal(posts,1);pass('incomplete sent-search results fail closed without another send');
 reset();input=seed();row=await uncertain(input);const later=seed(2);sql.prepare('UPDATE outreach_prospects SET email=? WHERE id=(SELECT prospect_id FROM outreach_drafts WHERE id=?)').run(row.recipient,later.id);sql.prepare('UPDATE outreach_drafts SET recipient=? WHERE id=?').run(row.recipient,later.id);await assert.rejects(()=>api.sendApprovedOutreach(later),/unresolved Gmail result/);assert.equal(posts,1);assert.equal(outbox(later),undefined);pass('an unresolved earlier send blocks a new draft to the same recipient');
 reset();input=seed();row=await uncertain(input);const raced=seed(2);sync=async()=>{sql.prepare('UPDATE gmail_outbox SET recipient=? WHERE id=?').run('owner@business2.com',row.id);};await assert.rejects(()=>api.sendApprovedOutreach(raced));assert.equal(posts,1);assert.equal(outbox(raced).first_attempt_at,0);pass('an unresolved send introduced during sync is blocked by the final atomic guard');
 reset();input=seed();sync=async()=>{sql.exec("UPDATE gmail_outbox SET lock_until=0 WHERE status='prepared'");};assert.equal((await api.sendApprovedOutreach(input)).status,'accepted');assert.equal(posts,1);pass('a complete slow reply check renews a preparation lease still owned by the request');
 reset();input=seed();sync=async()=>{sql.exec("UPDATE gmail_outbox SET lock_until=0,lock_token='another-request' WHERE status='prepared'");};await assert.rejects(()=>api.sendApprovedOutreach(input));assert.equal(posts,0);assert.equal(outbox(input).first_attempt_at,0);pass('a lease taken over during reply sync cannot be renewed or sent by the old request');
 reset();input=seed();beforeProvider=async()=>sql.prepare('INSERT INTO outreach_suppressions VALUES(?,?,?)').run('owner@business1.com','Opted out while token refreshed',new Date().toISOString());result=await api.sendApprovedOutreach(input);assert.equal(result.status,'uncertain');assert.equal(posts,0);assert.ok(outbox(input).first_attempt_at>0);pass('opt-out arriving during OAuth refresh blocks the provider dispatch');
 reset();input=seed();beforeProvider=async()=>sql.exec("UPDATE gmail_outbox SET raw_mime='Changed after admission'");result=await api.sendApprovedOutreach(input);assert.equal(result.status,'uncertain');assert.equal(posts,0);pass('the final provider fence refuses an altered immutable envelope');
 reset();input=seed();const longSubject='Café workflow '.repeat(12);sql.prepare('UPDATE outreach_drafts SET subject=? WHERE id=?').run(longSubject,input.id);provider=async(url,init)=>{const raw=Buffer.from(JSON.parse(init.body).raw,'base64url').toString('utf8');const words=raw.match(/=\?UTF-8\?B\?[^?]+\?=/g);assert.ok(words.length>3);assert.ok(words.every(word=>word.length<=75));assert.ok(raw.includes('\r\n '));return {id:'sent1',threadId:'thread1'};};assert.equal((await api.sendApprovedOutreach(input)).status,'accepted');pass('long UTF-8 MIME headers fold into RFC 2047 words no longer than 75 characters');
 console.log(`${checks} Gmail send test groups passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
