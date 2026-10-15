const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {DatabaseSync}=require('node:sqlite');
const {webcrypto}=require('node:crypto');
const root=process.env.SCHURR_ROOT||path.resolve(__dirname,'..');
const ts=createRequire(path.join(root,'package.json'))('typescript');
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(path.join(root,'drizzle')).filter(name=>name.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',name),'utf8'));
let beforeBatch;
class Statement{
 constructor(query,values=[]){this.query=query;this.values=values;}
 bind(...values){return new Statement(this.query,values);}
 async first(){return sql.prepare(this.query).get(...this.values)||null;}
 async all(){return {results:sql.prepare(this.query).all(...this.values)};}
 async run(){return sql.prepare(this.query).run(...this.values);}
}
const runtime={DB:{prepare:query=>new Statement(query),async batch(statements){
 if(beforeBatch){const change=beforeBatch;beforeBatch=null;change();}
 sql.exec('BEGIN');try{const result=statements.map(statement=>({results:sql.prepare(statement.query).all(...statement.values)}));sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}
}}};
const modules=new Map();
function load(relative){
 if(modules.has(relative))return modules.get(relative);
 const compiled=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 const module={exports:{}};
 const customRequire=name=>name==='cloudflare:workers'?{env:runtime}:name.startsWith('@/')?load(name.slice(2)+'.ts'):name.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(relative),name+'.ts'))):require(name);
 new vm.Script(compiled.outputText,{filename:relative}).runInContext(vm.createContext({module,exports:module.exports,require:customRequire,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,URL,URLSearchParams,btoa,atob,Date,console}));
 modules.set(relative,module.exports);return module.exports;
}
const outreach=load('lib/outreach.ts');
const now=new Date().toISOString(),today=now.slice(0,10),prospectId=webcrypto.randomUUID(),campaignId=webcrypto.randomUUID();
sql.prepare("INSERT INTO outreach_prospects(id,company,website,domain,email,status,evidence,source_url,observed_at,created_at,updated_at) VALUES(?,?,?,?,?,'ready',?,?,?,?,?)").run(prospectId,'Freeze test business','https://freeze-business.com/','freeze-business.com','recipient@freeze-business.com','Public business appointment service.','https://freeze-business.com/',today,now,now);
sql.prepare("INSERT INTO outreach_campaigns(id,name,service,audience,steps,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(campaignId,'Freeze test campaign','calls','Businesses',JSON.stringify([{subject:'Question',body:'{{evidence}}',delay:0}]),now,now);
sql.prepare("INSERT INTO outreach_settings(id,sender_name,sender_email,postal_address,revision,updated_at) VALUES('main','Test sender','sender@business.example','1 Test business address',1,?)").run(now);
function createDraft(){
 const id=webcrypto.randomUUID();
 // Distinct campaign keeps the real unique campaign/prospect/step invariant.
 const campaign=webcrypto.randomUUID();sql.prepare('INSERT INTO outreach_campaigns SELECT ?,name,service,audience,status,steps,revision,created_at,updated_at FROM outreach_campaigns WHERE id=?').run(campaign,campaignId);
 const senderRevision=sql.prepare("SELECT revision FROM outreach_settings WHERE id='main'").get().revision;
 sql.prepare("INSERT INTO outreach_drafts(id,campaign_id,prospect_id,step,recipient,subject,body,status,approved_revision,sender_revision,revision,created_at,updated_at) VALUES(?,?,?,0,?,?,?,'approved',1,?,1,?,?)").run(id,campaign,prospectId,'recipient@freeze-business.com','Reviewed subject','Reviewed body',senderRevision,now,now);return id;
}
function receipt(draftId,attempted=true){
 const draft=sql.prepare('SELECT * FROM outreach_drafts WHERE id=?').get(draftId),id=webcrypto.randomUUID();
 sql.prepare(`INSERT INTO gmail_outbox(id,draft_id,mailbox_email,connection_revision,draft_revision,sender_revision,prospect_id,campaign_id,recipient,subject,body,raw_mime,raw_hash,rfc_message_id,status,first_attempt_at,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,draftId,'sender@business.example',1,draft.revision,draft.sender_revision,prospectId,draft.campaign_id,draft.recipient,draft.subject,draft.body,'frozen-mime','frozen-hash',`<${id}@business.example>`,attempted?'uncertain':'prepared',attempted?Date.now():0,attempted?1:0,now,now);return id;
}
const savedDraft=id=>sql.prepare('SELECT * FROM outreach_drafts WHERE id=?').get(id);
const command=(action,id,extra={})=>({action,id,revision:savedDraft(id).revision,mutationId:webcrypto.randomUUID(),...extra});
const mutate=(action,id,extra)=>outreach.mutateOutreach(command(action,id,extra));
const conflict=error=>error.status===409;
const actions=[['draft',{subject:'Unreviewed change',body:'Unreviewed changed body'}],['approve',{}],['unapprove',{}],['sent',{confirmation:'SENT'}]];

(async()=>{
 let groups=0;const pass=label=>{groups++;console.log('PASS '+label);};
 for(const [action,extra] of actions){const id=createDraft();receipt(id);const before=savedDraft(id);await assert.rejects(()=>mutate(action,id,extra),conflict);assert.deepEqual(savedDraft(id),before);}
 pass('an attempted Gmail receipt blocks draft edits, reapproval, withdrawal and manual sent recording');

 for(const [action,extra] of actions){
  sql.exec('DELETE FROM gmail_outbox');
  const id=createDraft(),before=savedDraft(id),input=command(action,id,extra);
  beforeBatch=()=>receipt(id);
  await assert.rejects(()=>outreach.mutateOutreach(input),conflict);
  assert.equal(beforeBatch,null);assert.deepEqual(savedDraft(id),before);
  assert.equal(sql.prepare('SELECT id FROM crm_mutations WHERE id=?').get(input.mutationId),undefined);
 }
 pass('a Gmail attempt arriving after validation but before mutation commit wins the atomic receipt guard');

 sql.exec('DELETE FROM gmail_outbox');
 const frozen=createDraft();receipt(frozen);const editable=createDraft();receipt(editable,false);
 const otherProspect=webcrypto.randomUUID();sql.prepare("INSERT INTO outreach_prospects(id,company,email,status,evidence,source_url,observed_at,created_at,updated_at) SELECT ?,company,'other@freeze-business.com',status,evidence,source_url,observed_at,created_at,updated_at FROM outreach_prospects WHERE id=?").run(otherProspect,prospectId);sql.prepare("UPDATE outreach_drafts SET prospect_id=?,recipient='other@freeze-business.com' WHERE id=?").run(otherProspect,editable);sql.prepare("UPDATE gmail_outbox SET prospect_id=?,recipient='other@freeze-business.com' WHERE draft_id=?").run(otherProspect,editable);
 let csv=await outreach.approvedExport();assert.ok(!csv.includes(frozen));assert.ok(csv.includes(editable));
 const prospect=await outreach.getProspect(prospectId),sender=await outreach.getSender();
 for(const [id,expected] of [[frozen,false],[editable,true]]){const draft=savedDraft(id),campaign=sql.prepare('SELECT * FROM outreach_campaigns WHERE id=?').get(draft.campaign_id);assert.equal(await outreach.approvalCurrent(draft,await outreach.getProspect(draft.prospect_id),campaign,sender),expected);}
 await mutate('draft',editable,{subject:'Fresh zero-attempt review',body:'This untouched envelope may be changed.'});
 assert.equal(savedDraft(editable).status,'draft');assert.equal(savedDraft(editable).revision,2);
 pass('attempted drafts disappear from export and approval checks while zero-attempt envelopes remain editable');

 const frozenBefore=savedDraft(frozen),fresh=createDraft();const current=await outreach.getProspect(prospectId),fields={};
 for(const key of ['company','website','contact','email','phone','industry','location','address','postal_code','service','evidence','source_url','observed_at'])fields[key]=current[key];
 await outreach.mutateOutreach({action:'update',mutationId:webcrypto.randomUUID(),id:prospectId,revision:current.revision,...fields,evidence:'Updated source facts.',status:'ready',reviewed:true});
 assert.deepEqual(savedDraft(frozen),frozenBefore);assert.equal(savedDraft(fresh).status,'draft');assert.equal(savedDraft(fresh).approved_revision,null);
 pass('prospect edits preserve attempted frozen messages and clear approval on untouched drafts');

 const senderFresh=createDraft(),senderBefore=savedDraft(frozen),currentSender=await outreach.getSender();
 await outreach.mutateOutreach({action:'sender',mutationId:webcrypto.randomUUID(),revision:currentSender.revision,sender_name:'Updated sender',sender_email:'updated@business.example',postal_address:'2 Test business address'});
 assert.deepEqual(savedDraft(frozen),senderBefore);assert.equal(savedDraft(senderFresh).status,'draft');assert.equal(savedDraft(senderFresh).approved_revision,null);
 assert.equal(sql.prepare('SELECT raw_mime FROM gmail_outbox WHERE draft_id=?').get(frozen).raw_mime,'frozen-mime');
 pass('sender changes preserve attempted message evidence and clear approval on untouched drafts');
 console.log(`\n${groups} Gmail/outreach freeze regression groups passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
