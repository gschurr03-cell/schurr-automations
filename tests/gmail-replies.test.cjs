const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {DatabaseSync}=require('node:sqlite');
const {webcrypto}=require('node:crypto');
const root=process.env.SCHURR_SOURCE_ROOT||path.resolve(__dirname,'..');
const dependencyRequire=createRequire(process.env.SCHURR_PACKAGE_JSON||path.join(root,'package.json'));
const ts=dependencyRequire('typescript'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
// Proposal tests can run before root has integrated the additive migration.
sql.exec(`CREATE TABLE IF NOT EXISTS gmail_connections(id TEXT PRIMARY KEY,email TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'connected',last_sync_at TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',sync_lock_token TEXT NOT NULL DEFAULT '',sync_lock_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS gmail_outbox(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL UNIQUE,mailbox_email TEXT NOT NULL,connection_revision INTEGER NOT NULL,draft_revision INTEGER NOT NULL,sender_revision INTEGER NOT NULL,prospect_id TEXT NOT NULL,campaign_id TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,raw_mime TEXT NOT NULL,raw_hash TEXT NOT NULL,rfc_message_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL,first_attempt_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,gmail_message_id TEXT NOT NULL DEFAULT '',thread_id TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',lock_token TEXT NOT NULL DEFAULT '',lock_until INTEGER NOT NULL DEFAULT 0,last_checked_at TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmail_replies(id TEXT PRIMARY KEY,mailbox_email TEXT NOT NULL,message_id TEXT NOT NULL,thread_id TEXT NOT NULL,outbox_id TEXT NOT NULL,sender_email TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,received_at TEXT NOT NULL,kind TEXT NOT NULL,import_token TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(mailbox_email,message_id));`);
sql.exec('PRAGMA foreign_keys=ON');
let beforeBatch=null;
class Statement{
 constructor(query,values=[]){this.query=query;this.values=values;}
 bind(...values){assert.ok(values.length<=100,'D1 bound-parameter limit');return new Statement(this.query,values);}
 async first(){return sql.prepare(this.query).get(...this.values)||null;}
 async all(){return {results:sql.prepare(this.query).all(...this.values)};}
 async run(){return sql.prepare(this.query).run(...this.values);}
}
const db={prepare:q=>new Statement(q),async batch(statements){
 if(beforeBatch){const fn=beforeBatch;beforeBatch=null;fn();}
 sql.exec('BEGIN');try{const result=statements.map(s=>({results:sql.prepare(s.query).all(...s.values)}));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}
}};
class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
const mailbox='gavin@schurrautomations.com';
const calls=[],threads=new Map(),fullMessages=new Map();let beforeRequest=null,holdRequest=null;
async function getGmailConnection(){return sql.prepare("SELECT email,revision,status FROM gmail_connections WHERE id='gmail' AND status='connected'").get()||null;}
async function gmailRequest(url,init,expected){
 assert.ok(!init||!init.method||init.method==='GET','Reply sync must never mutate Gmail');
 const connection=await getGmailConnection();if(!connection||connection.email!==expected.email||connection.revision!==expected.revision)throw new RequestError(409,'Connection changed');
 calls.push(url);
 if(beforeRequest){const fn=beforeRequest;beforeRequest=null;await fn(url);}
 if(holdRequest){const fn=holdRequest;holdRequest=null;await fn();}
 const parsed=new URL(url,'https://gmail.test');
 if(parsed.pathname.startsWith('/threads/')){
  assert.equal(parsed.searchParams.get('format'),'metadata');
  const id=parsed.pathname.split('/').at(-1),value=threads.get(id);if(value instanceof Error)throw value;
  assert.ok(value,'Only registered known threads may be fetched');return structuredClone(value);
 }
 if(parsed.pathname.startsWith('/messages/')){
  assert.equal(parsed.searchParams.get('format'),'full');
  const value=fullMessages.get(parsed.pathname.split('/').at(-1));if(value instanceof Error)throw value;
  assert.ok(value,'Only matched known replies may be fetched');return structuredClone(value);
 }
 assert.fail('Unexpected Gmail endpoint: '+url);
}
const source=fs.readFileSync(path.join(__dirname,'../lib/gmail-replies.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
const moduleObject={exports:{}};
vm.runInNewContext(compiled.outputText,{module:moduleObject,exports:moduleObject.exports,require:name=>name==='./inquiries'?{database:()=>db,RequestError}:name==='./gmail-connection'?{getGmailConnection,gmailRequest}:(()=>{throw Error(name);})(),crypto:webcrypto,TextDecoder,Uint8Array,atob,URLSearchParams,Date,console},{filename:'gmail-replies.ts'});
const app=moduleObject.exports,uuid=()=>webcrypto.randomUUID();let seq=100;
const encode=s=>Buffer.from(s).toString('base64url');
function insert(table,values){
 // Accommodate additional encrypted credential fields in the real migration.
 for(const field of sql.prepare(`PRAGMA table_info(${table})`).all())if(field.notnull&&field.dflt_value===null&&!(field.name in values))values[field.name]=field.type==='INTEGER'?0:'';
 const keys=Object.keys(values);sql.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>values[k]));
}
function reset(){
 for(const table of ['gmail_replies','gmail_outbox','gmail_connections','response_followups','response_outcomes','customer_first_emails','response_jobs','crm_leads','inquiries','outreach_activity','outreach_drafts','outreach_prospects','outreach_campaigns','outreach_suppressions'])sql.prepare(`DELETE FROM ${table}`).run();
 insert('gmail_connections',{id:'gmail',email:mailbox,revision:1,status:'connected'});calls.length=0;threads.clear();fullMessages.clear();beforeBatch=null;beforeRequest=null;holdRequest=null;
}
function seed(options={}){
 const email=options.email||`owner${++seq}@business.example.com`,thread=options.thread||(++seq).toString(16),id=uuid(),prospect=uuid(),campaign=uuid(),sent=uuid(),pending=uuid(),at=Date.now()-60000,now=new Date(at).toISOString(),rfc=`<${id}@schurrautomations.com>`,sentMessage=(++seq).toString(16);
 insert('outreach_prospects',{id:prospect,company:'Synthetic Business',email,status:options.status||'ready',evidence:'Synthetic evidence',source_url:'https://business.example.com',observed_at:now.slice(0,10),created_at:now,updated_at:now});
 insert('outreach_campaigns',{id:campaign,name:'Synthetic campaign',service:'calls',audience:'Synthetic businesses',steps:'[]',created_at:now,updated_at:now});
 insert('outreach_drafts',{id:sent,campaign_id:campaign,prospect_id:prospect,step:0,recipient:email,subject:'Hello',body:'Sent body',status:'sent',created_at:now,updated_at:now});
 insert('outreach_drafts',{id:pending,campaign_id:campaign,prospect_id:prospect,step:1,recipient:email,subject:'Follow up',body:'Pending body',status:'approved',approved_at:now,approved_revision:1,sender_revision:1,created_at:now,updated_at:now});
 insert('gmail_outbox',{id,draft_id:sent,mailbox_email:mailbox,connection_revision:1,draft_revision:1,sender_revision:1,prospect_id:prospect,campaign_id:campaign,recipient:email,subject:'Hello',body:'Sent body',raw_mime:'synthetic',raw_hash:'synthetic',rfc_message_id:rfc,status:'accepted',first_attempt_at:at,gmail_message_id:sentMessage,thread_id:thread,created_at:now,updated_at:now});
 const original={id:sentMessage,threadId:thread,labelIds:['SENT'],internalDate:String(at),payload:{mimeType:'text/plain',headers:[{name:'From',value:mailbox},{name:'To',value:email}],body:{data:encode('Sent body')}}};
 const current=threads.get(thread)||{id:thread,messages:[]};current.messages.push(original);threads.set(thread,current);
 return {id,email,thread,prospect,campaign,sent,pending,at,rfc,sentMessage};
}
function reply(s,body='Yes, please tell me more.',options={}){
 const id=(++seq).toString(16),message={id,threadId:s.thread,labelIds:['INBOX'],internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers:[{name:'From',value:s.email},{name:'To',value:mailbox},{name:'Subject',value:'Re: Hello'},{name:'In-Reply-To',value:s.rfc}],body:{data:encode(body)}}};
 if(options.from)message.payload.headers[0].value=options.from;
 if(options.to)message.payload.headers[1].value=options.to;
 if(options.date)message.internalDate=String(options.date);
 if(options.labels)message.labelIds=options.labels;
 if(options.headers)message.payload.headers.push(...options.headers);
 if(options.payload)message.payload=options.payload;
 threads.get(s.thread).messages.push(message);fullMessages.set(id,message);return message;
}
function row(table,id){return sql.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);}
function sameEmailInquiry(email){
 const id=uuid(),now=new Date().toISOString(),followup=uuid();
 insert('inquiries',{id,submission_key:uuid(),body_hash:'test',name:'Synthetic inquiry',email,service:'calls',message:'A separate inbound inquiry',preferred_contact:'email',consent_at:now,created_at:now});
 insert('response_jobs',{id,inquiry_id:id,source_key:'inquiry:'+id,body_hash:'test',channel:'email',status:'needs_review',consent_scope:'test',created_at:now,updated_at:now});
 insert('customer_first_emails',{id,recipient:email,payload:'{}',consent_scope:'test',consent_text:'Test',consent_at:now,created_at:now});
 insert('response_followups',{id:followup,response_id:id,body_hash:'test',channel:'email',recipient:email,due_ms:Date.now(),note:'Separate inquiry',permission_evidence:'Test',created_at:now,updated_at:now});
 return {id,followup};
}
(async()=>{
 let checks=0;const pass=s=>{checks++;console.log('PASS '+s);};
 reset();const s=seed(),inquiry=sameEmailInquiry(s.email),m=reply(s);let result=await app.syncGmailReplies();
 assert.equal(result.checked,1);assert.equal(result.imported,1);assert.equal(result.remaining,0);
 assert.equal(row('outreach_prospects',s.prospect).status,'responded');const draft=row('outreach_drafts',s.pending);assert.equal(draft.status,'stopped');assert.equal(draft.approved_revision,null);assert.equal(draft.sender_revision,null);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM outreach_activity').get().n,1);assert.equal(row('response_followups',inquiry.followup).status,'open');assert.equal(row('customer_first_emails',inquiry.id).status,'pending');
 const revision=draft.revision;result=await app.syncGmailReplies();assert.equal(result.imported,0);assert.equal(row('outreach_drafts',s.pending).revision,revision);assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,1);assert.equal(calls.filter(x=>x.includes('/messages/')).length,1);
 pass('known replies import once, clear outreach approvals and leave distinct inbound workflows alone');

 reset();const privateCase=seed();reply(privateCase,'wrong sender',{from:'somebody@other.example.com'});reply(privateCase,'wrong destination',{to:'other@schurrautomations.com'});reply(privateCase,'own outgoing',{from:mailbox});reply(privateCase,'draft',{labels:['DRAFT']});reply(privateCase,'too early',{date:privateCase.at-1});reply(privateCase,'ambiguous from',{from:`${privateCase.email}, other@other.example.com`});
 threads.set('unrelated-inbox',{id:'unrelated-inbox',messages:[{id:'private-unrelated'}]});result=await app.syncGmailReplies();assert.equal(result.imported,0);assert.equal(calls.length,1);assert.ok(calls[0].includes('/threads/'+privateCase.thread));
 pass('wrong sender, recipient, earlier mail, outgoing and unrelated inbox stay outside CRM');

 reset();const quoted=seed();reply(quoted,'Sounds useful.\n\nOn Friday, Gavin wrote:\n> Reply "unsubscribe" if you prefer no further emails.');await app.syncGmailReplies();assert.equal(sql.prepare('SELECT kind FROM gmail_replies').get().kind,'reply');assert.equal(sql.prepare('SELECT count(*) AS n FROM outreach_suppressions').get().n,0);
 assert.equal(app.isExplicitGmailUnsubscribe('Please do not unsubscribe me.'),false);assert.equal(app.isExplicitGmailUnsubscribe('Reply "unsubscribe" if you prefer no further emails.'),false);
 assert.equal(app.isExplicitGmailUnsubscribe(app.authoredGmailReply('Yes\n> unsubscribe')),false);
 pass('quoted footers and discussions of unsubscribing cannot become opt-outs');

 reset();const opt=seed(),related=sameEmailInquiry(opt.email);reply(opt,'Please unsubscribe me.');await app.syncGmailReplies();assert.equal(sql.prepare('SELECT kind FROM gmail_replies').get().kind,'unsubscribe');assert.ok(sql.prepare('SELECT email FROM outreach_suppressions WHERE email=?').get(opt.email));assert.equal(row('response_followups',related.followup).status,'cancelled');assert.equal(row('customer_first_emails',related.id).status,'cancelled');
 pass('explicit authored unsubscribe creates global suppression and stops matching email reminders');

 for(const status of ['converted','paused','archived']){reset();const stable=seed({status});reply(stable);await app.syncGmailReplies();assert.equal(row('outreach_prospects',stable.prospect).status,status);assert.equal(row('outreach_drafts',stable.pending).status,'stopped');}
 reset();const edited=seed();reply(edited);sql.prepare('UPDATE outreach_prospects SET email=? WHERE id=?').run('replacement@business.example.com',edited.prospect);await app.syncGmailReplies();assert.equal(sql.prepare('SELECT sender_email FROM gmail_replies').get().sender_email,edited.email);assert.equal(row('outreach_prospects',edited.prospect).status,'ready');assert.equal(row('outreach_drafts',edited.pending).status,'stopped');
 pass('converted, paused and archived status preserved; historical recipients never redirect');

 reset();const automatic=seed();reply(automatic,'unsubscribe',{headers:[{name:'Auto-Submitted',value:'auto-replied'}]});await app.syncGmailReplies();assert.equal(sql.prepare('SELECT kind FROM gmail_replies').get().kind,'automated');assert.equal(row('outreach_prospects',automatic.prospect).status,'paused');assert.equal(sql.prepare('SELECT count(*) AS n FROM outreach_suppressions').get().n,0);
 pass('automatic responses pause outreach separately and cannot trigger inferred unsubscribes');

 reset();const html=seed(),htmlReply=reply(html);htmlReply.payload.mimeType='multipart/mixed';delete htmlReply.payload.body;htmlReply.payload.parts=[{mimeType:'text/html',body:{data:encode('<p>unsubscribe</p>')}},{mimeType:'text/plain',filename:'private.txt',body:{attachmentId:'attachment-do-not-fetch',data:encode('unsubscribe')}}];await app.syncGmailReplies();assert.equal(sql.prepare('SELECT kind FROM gmail_replies').get().kind,'reply');assert.match(sql.prepare('SELECT body FROM gmail_replies').get().body,/no readable/);assert.equal(calls.length,2);
 pass('HTML-only or attachment-only replies stop outreach without reading attachments or storing HTML');

 reset();const bounced=seed(),bounce=reply(bounced,'',{from:'mailer-daemon@googlemail.com',headers:[{name:'Content-Type',value:'multipart/report; report-type=delivery-status'}]});bounce.payload.mimeType='multipart/report';delete bounce.payload.body;bounce.payload.parts=[{mimeType:'message/delivery-status',body:{data:encode(`Reporting-MTA: dns; mail.example.com\n\nFinal-Recipient: rfc822; ${bounced.email}\nAction: failed\nStatus: 5.1.1\n`)}}];await app.syncGmailReplies();assert.equal(sql.prepare('SELECT kind FROM gmail_replies').get().kind,'bounce');assert.equal(row('outreach_prospects',bounced.prospect).status,'paused');assert.equal(sql.prepare('SELECT count(*) AS n FROM outreach_suppressions').get().n,0);
 reset();const falseBounce=seed(),bad=reply(falseBounce,'',{from:'mailer-daemon@googlemail.com',headers:[{name:'Content-Type',value:'multipart/report'}]});bad.payload.mimeType='multipart/report';bad.payload.parts=[{mimeType:'message/delivery-status',body:{data:encode('Final-Recipient: rfc822; someone@other.example.com\nAction: failed\n')}}];await app.syncGmailReplies();assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,0);
 pass('structured bounce needs matching RFC reference and final recipient; unrelated DSNs are excluded');

 reset();const multiple=[];for(let i=0;i<11;i++)multiple.push(seed());result=await app.syncGmailReplies();assert.equal(result.checked,10);assert.equal(result.remaining,1);assert.equal(row('gmail_connections','gmail').last_sync_at,'');await app.syncGmailReplies();assert.ok(row('gmail_connections','gmail').last_sync_at);assert.ok(multiple.every(r=>row('gmail_outbox',r.id).last_checked_at));
 reset();for(let i=0;i<11;i++)seed({email:'many@business.example.com'});await assert.rejects(()=>app.syncGmailRepliesForRecipient('many@business.example.com'),/more than 10/);assert.equal(calls.length,0);
 pass('bounded oldest-thread polling advances coverage; recipient preflight refuses an unchecked backlog');

 reset();const failed=seed();threads.set(failed.thread,new Error('private provider content should not escape'));await assert.rejects(()=>app.syncGmailRepliesForRecipient(failed.email),error=>!error.message.includes('private provider')&&error.status===503);assert.equal(row('gmail_outbox',failed.id).last_checked_at,'');assert.equal(row('gmail_connections','gmail').sync_lock_token,'');assert.match(row('gmail_connections','gmail').last_error,/did not finish/);
 pass('provider failure never advances freshness or reports an empty successful sync');

 reset();const changed=seed();reply(changed);beforeBatch=()=>sql.prepare("UPDATE gmail_connections SET revision=revision+1,status='disconnected' WHERE id='gmail'").run();await assert.rejects(()=>app.syncGmailReplies(),/changed|interrupted|Sync/);assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,0);assert.equal(row('outreach_drafts',changed.pending).status,'approved');assert.equal(row('gmail_outbox',changed.id).last_checked_at,'');
 pass('disconnect or credential revision changes during import block every side effect');

 reset();const again=seed();reply(again);await app.syncGmailReplies();sql.prepare("UPDATE gmail_connections SET revision=revision+1 WHERE id='gmail'").run();await app.syncGmailReplies();assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,1);
 sql.prepare("UPDATE gmail_connections SET email='other@other.example.com',revision=revision+1 WHERE id='gmail'").run();const priorCalls=calls.length;result=await app.syncGmailReplies();assert.equal(result.checked,0);assert.equal(calls.length,priorCalls);
 pass('same-mailbox reconnect preserves dedupe; another mailbox cannot reuse old mappings');

 reset();const concurrent=seed();reply(concurrent);let release,startedResolve;const started=new Promise(r=>startedResolve=r);holdRequest=async()=>{startedResolve();await new Promise(r=>release=r);};const first=app.syncGmailReplies();await started;await assert.rejects(()=>app.syncGmailReplies(),/already running/);release();await first;assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,1);
 pass('connection lease rejects concurrent sync without duplicate imports');

 reset();const atomic=seed();reply(atomic);sql.exec("CREATE TRIGGER abort_gmail_activity BEFORE INSERT ON outreach_activity BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END");await assert.rejects(()=>app.syncGmailReplies());assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,0);assert.equal(row('outreach_drafts',atomic.pending).status,'approved');assert.equal(row('gmail_outbox',atomic.id).last_checked_at,'');sql.exec('DROP TRIGGER abort_gmail_activity');await app.syncGmailReplies();assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,1);
 pass('reply record, activity and stopping controls commit together or all roll back');

 reset();const largeThread='many-records';for(let i=0;i<110;i++)seed({thread:largeThread});result=await app.syncGmailReplies();assert.equal(result.checked,1);assert.equal(sql.prepare("SELECT count(*) AS n FROM gmail_outbox WHERE last_checked_at<>''").get().n,110);
 pass('large known-thread receipt sets remain below D1 parameter limits');

 reset();const busy=seed();for(let i=0;i<45;i++)reply(busy,'Reply number '+i);await assert.rejects(()=>app.syncGmailReplies(),/More Gmail replies/);assert.equal(calls.length,40);assert.equal(row('gmail_outbox',busy.id).last_checked_at,'');assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,39);await app.syncGmailReplies();assert.equal(sql.prepare('SELECT count(*) AS n FROM gmail_replies').get().n,45);assert.ok(row('gmail_outbox',busy.id).last_checked_at);
 pass('request budget preserves partial imports and resumes without falsely advancing thread freshness');

 reset();const incomplete=seed();sql.prepare("UPDATE gmail_outbox SET thread_id='' WHERE id=?").run(incomplete.id);await assert.rejects(()=>app.syncGmailRepliesForRecipient(incomplete.email),/missing its conversation receipt/);assert.equal(calls.length,0);
 pass('accepted sends without conversation receipts cannot pass reply preflight');
 console.log(`${checks} Gmail reply checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
