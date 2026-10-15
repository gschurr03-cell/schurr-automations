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


sql.exec('PRAGMA foreign_keys = ON');
const outreach=load('lib/outreach.ts'); const crm=load('lib/crm.ts');
const now=new Date().toISOString(); const today=now.slice(0,10);
function prospect(address,domain){const id=webcrypto.randomUUID();sql.prepare("INSERT INTO outreach_prospects(id,company,website,domain,email,status,evidence,source_url,observed_at,created_at,updated_at) VALUES(?,?,?,?,?,'ready',?,?,?,?,?)").run(id,'Test Company','https://'+domain,domain,address,'Business offers appointments.','https://'+domain,today,now,now);return id;}
function campaign(){const id=webcrypto.randomUUID();sql.prepare("INSERT INTO outreach_campaigns(id,name,service,audience,steps,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(id,'Test campaign','calls','Businesses',JSON.stringify([{subject:'Question',body:'{{evidence}}',delay:0}]),now,now);return sql.prepare('SELECT * FROM outreach_campaigns WHERE id=?').get(id);}
(async()=>{
 const c=campaign(),p1=prospect('shared@contact.com','one-company.com'),p2=prospect('shared@contact.com','two-company.com');
 await outreach.mutateOutreach({action:'outcome',mutationId:webcrypto.randomUUID(),id:p1,revision:1,kind:'reply',body:'They replied.'});
 const blockedBefore=await outreach.eligibility(await outreach.getProspect(p2),c);
 const old=await outreach.getProspect(p1);
 const fields={};for(const key of ['company','website','contact','email','phone','industry','location','service','evidence','source_url','observed_at'])fields[key]=old[key];
 await outreach.mutateOutreach({action:'update',mutationId:webcrypto.randomUUID(),id:p1,revision:old.revision,...fields,email:'different@contact.com',status:'ready',reviewed:true});
 const blockedAfter=await outreach.eligibility(await outreach.getProspect(p2),c);
 console.log(JSON.stringify({check:'Reply block survives contact edit',blockedBefore,blockedAfter,pass:Boolean(blockedBefore&&blockedAfter)}));
 const original=webcrypto.randomUUID();
 sql.prepare('INSERT INTO inquiries(id,submission_key,body_hash,name,email,business,phone,service,message,preferred_contact,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(original,webcrypto.randomUUID(),'test-hash','Current owner','old@identity.com','','','calls','Original website request','email',now,now);
 sql.prepare("INSERT INTO crm_leads(id,inquiry_id,name,email,source,created_at,updated_at) VALUES(?,?,?,?,'website',?,?)").run(original,original,'Current owner','corrected@identity.com',now,now);
 const p3=prospect('old@identity.com','three-company.com');
 await outreach.mutateOutreach({action:'convert',mutationId:webcrypto.randomUUID(),id:p3,revision:1});
 const converted=await outreach.getProspect(p3);const matched=await crm.getLead(converted.lead_id);
 console.log(JSON.stringify({check:'Conversion matches current CRM email',prospectEmail:converted.email,matchedEmail:matched.email,pass:converted.email===matched.email}));
 if(!blockedAfter||converted.email!==matched.email)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
