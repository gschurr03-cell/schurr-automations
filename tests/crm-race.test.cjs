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
const crm = load('lib/crm.ts');
const realBatch = runtime.DB.batch;
const gates=[]; let hold=true;
runtime.DB.batch=async statements=>{
  if(hold) await new Promise(resolve=>gates.push(resolve));
  return realBatch(statements);
};
async function waitFor(n) { while(gates.length<n) await new Promise(resolve=>setImmediate(resolve)); }
(async()=>{
 const key=webcrypto.randomUUID();
 const payload={action:'createLead',mutationId:key,name:'Race Test',business:'',email:'race@example.com',phone:'',preferredContact:'email',service:'general',stage:'new',monthlyValue:'0',setupValue:'0',source:'manual',note:'Initial note'};
 const first=crm.mutateCrm(payload); await waitFor(1);
 const duplicate=crm.mutateCrm(payload); await waitFor(2);
 hold=false; gates[0](); await first;
 await crm.mutateCrm({action:'deleteLead',mutationId:webcrypto.randomUUID(),leadId:key,revision:'1',confirmation:'DELETE'});
 assert.equal(await crm.getLead(key),null);
 gates[1](); await duplicate;
 const resurrected=await crm.getLead(key);
 process.stdout.write(JSON.stringify({expected:'Lead remains deleted',actual:resurrected?'Lead resurrected':'Lead remains deleted',events:sql.prepare('SELECT count(*) AS n FROM crm_events WHERE lead_id=?').get(key).n})+'\n');
 assert.equal(resurrected,null,'Delayed duplicate must not resurrect a soft-deleted lead');
 assert.ok(sql.prepare('SELECT deleted_at FROM crm_leads WHERE id=?').get(key).deleted_at);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM crm_leads WHERE id=? AND deleted_at IS NULL').get(key).n,0);
 sql.close();
 process.stdout.write('PASS delayed retries cannot resurrect soft-deleted records\n');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
