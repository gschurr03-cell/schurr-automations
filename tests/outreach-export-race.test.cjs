const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const dependencyRequire = createRequire(process.env.SCHURR_PACKAGE_JSON || path.join(process.cwd(), 'package.json'));
const ts = dependencyRequire('typescript');
const root = path.resolve(__dirname,'..');
const runtime = { INQUIRY_SIGNING_SECRET: 'test-only-'.repeat(8), OWNER_EMAIL: 'owner@example.com' };
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
const sql = new DatabaseSync(':memory:');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  async first() { return sql.prepare(this.query).get(...this.values) || null; }
  async all() { return { results: sql.prepare(this.query).all(...this.values) }; }
  async run() { return sql.prepare(this.query).run(...this.values); }
}
runtime.DB = {
  prepare(query) { return new Statement(query); },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const output = statements.map(statement => ({ results: sql.prepare(statement.query).all(...statement.values) }));
      sql.exec('COMMIT');
      return output;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};

function load(relative) {
  if (modules.has(relative)) return modules.get(relative);
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  const customRequire = name => {
    if (name === 'cloudflare:workers') return { env: runtime };
    if (name === '@/app/chatgpt-auth') return {
      getChatGPTUser: async () => currentUser && currentUser.userId && currentUser.email ? currentUser : null,
      requireChatGPTUser: async () => { if (!currentUser?.userId || !currentUser?.email) throw new Error('SIGN_IN_REDIRECT'); return currentUser; },
    };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), `${name}.ts`));
    return require(name);
  };
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, Date, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}


sql.exec('PRAGMA foreign_keys = ON');const outreach=load('lib/outreach.ts');
const now=new Date().toISOString(),today=now.slice(0,10),id=webcrypto.randomUUID(),campaignId=webcrypto.randomUUID(),draftId=webcrypto.randomUUID();
sql.prepare("INSERT INTO outreach_prospects(id,company,website,domain,email,status,evidence,source_url,observed_at,created_at,updated_at) VALUES(?,?,?,?,?,'ready',?,?,?,?,?)").run(id,'Review Race','https://review-business.com/','review-business.com','owner@review-business.com','Business offers appointments.','https://review-business.com/',today,now,now);
sql.prepare("INSERT INTO outreach_campaigns(id,name,service,audience,steps,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(campaignId,'Test campaign','calls','Businesses',JSON.stringify([{subject:'Question',body:'{{evidence}}',delay:0}]),now,now);
sql.prepare("INSERT INTO outreach_settings(id,sender_name,sender_email,postal_address,revision,updated_at) VALUES('main','Test sender','sender@business.com','Test business mailing address',1,?)").run(now);
sql.prepare("INSERT INTO outreach_drafts(id,campaign_id,prospect_id,step,recipient,subject,body,status,approved_revision,sender_revision,revision,created_at,updated_at) VALUES(?,?,?,0,?,?,?,'approved',1,1,1,?,?)").run(draftId,campaignId,id,'owner@review-business.com','Old approved subject','Old approved body',now,now);
let release,startedResolve,hold=true;const started=new Promise(resolve=>startedResolve=resolve),realAll=Statement.prototype.all;
Statement.prototype.all=async function(){if(hold&&this.query.includes('SELECT d.*,p.company FROM outreach_drafts d')){startedResolve();await new Promise(resolve=>release=resolve);}return realAll.call(this);};
(async()=>{
 const pending=outreach.approvedExport();await started;hold=false;
 const current=await outreach.getProspect(id),fields={};for(const key of ['company','website','contact','email','phone','industry','location','service','evidence','source_url','observed_at'])fields[key]=current[key];
 await outreach.mutateOutreach({action:'update',mutationId:webcrypto.randomUUID(),id,revision:1,...fields,evidence:'Updated evidence requiring review.',status:'ready',reviewed:true});
 release();const output=await pending;const currentDraft=sql.prepare('SELECT status,revision FROM outreach_drafts WHERE id=?').get(draftId);
 console.log(JSON.stringify({check:'Export respects invalidated approval',currentDraftStatus:currentDraft.status,currentDraftRevision:currentDraft.revision,containsInvalidatedDraft:output.includes(draftId)}));
 assert.equal(output.includes(draftId),false);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
