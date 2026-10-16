const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const dependencyRequire = createRequire(process.env.SCHURR_PACKAGE_JSON || path.join(process.cwd(), 'package.json'));
const ts = dependencyRequire('typescript');
const root = path.resolve(__dirname, '..');
const runtime = { INQUIRY_SIGNING_SECRET: 'test-only-'.repeat(8), OWNER_EMAIL: 'owner@example.com' };
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
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
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, Date, Intl, console: { error() {} }, JSON, Array, Object, String, Number, Boolean, Math, Error, Promise, Map, Set, RegExp });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

(async () => {
  const crm = load('lib/crm.ts');
  const outreach = load('lib/outreach.ts');
  let checks = 0;
  const pass = (msg) => { checks++; process.stdout.write('PASS ' + msg + '\n'); };

  // Migration applied the unique index.
  const idx = sql.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='crm_leads_email_active_idx'").get();
  assert.ok(idx && /email/.test(idx.sql) && /deleted_at/.test(idx.sql));
  pass('migration created partial unique email index');

  // Pre-index duplicate merge path: simulate leftover duplicates then re-run merge logic is already in 0028;
  // verify runtime uniqueness rejects a raw second insert.
  const a = webcrypto.randomUUID(), b = webcrypto.randomUUID(), now = new Date().toISOString();
  sql.prepare("INSERT INTO crm_leads(id,name,business,email,phone,service,preferred_contact,source,stage,monthly_cents,setup_cents,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(a, 'A', '', 'unique-dealer@example.com', '', 'general', 'email', 'manual', 'new', 0, 0, 1, now, now);
  assert.throws(() => sql.prepare("INSERT INTO crm_leads(id,name,business,email,phone,service,preferred_contact,source,stage,monthly_cents,setup_cents,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(b, 'B', '', 'unique-dealer@example.com', '', 'general', 'email', 'manual', 'new', 0, 0, 1, now, now));
  pass('unique active email rejects a second raw insert');

  // Soft-deleted email may be reused for a new active lead.
  sql.prepare('UPDATE crm_leads SET deleted_at=? WHERE id=?').run(now, a);
  sql.prepare("INSERT INTO crm_leads(id,name,business,email,phone,service,preferred_contact,source,stage,monthly_cents,setup_cents,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(b, 'B', '', 'unique-dealer@example.com', '', 'general', 'email', 'manual', 'new', 0, 0, 1, now, now);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM crm_leads WHERE email='unique-dealer@example.com' AND deleted_at IS NULL").get().n, 1);
  pass('soft-deleted email can be reused by a new active lead');

  // Concurrent-style convert: two prospects, same email, both convert — one CRM lead.
  await outreach.mutateOutreach({ action: 'sender', mutationId: webcrypto.randomUUID(), revision: 1, sender_name: 'Gavin', sender_email: 'gavin@schurr.test', postal_address: '1 Test St', daily_limit: 10, window_start: '08:00', window_end: '17:00' });
  const p1 = webcrypto.randomUUID(), p2 = webcrypto.randomUUID();
  for (const [pid, company] of [[p1, 'Dealer One'], [p2, 'Dealer Two']]) {
    await outreach.mutateOutreach({
      action: 'create', mutationId: pid, company, website: `https://${company.replace(/\s/g,'').toLowerCase()}.com`, contact: 'Owner',
      email: 'shared-convert@example.com', phone: '', industry: 'Auto', location: 'Denver', address: '', postal_code: '',
      service: 'calls', evidence: 'Verified observation for convert test.', source_url: `https://${company.replace(/\s/g,'').toLowerCase()}.com/contact`, observed_at: '2026-10-01',
    });
  }
  const r1 = await outreach.getProspect(p1), r2 = await outreach.getProspect(p2);
  const [c1, c2] = await Promise.all([
    outreach.mutateOutreach({ action: 'convert', mutationId: webcrypto.randomUUID(), id: p1, revision: r1.revision }),
    outreach.mutateOutreach({ action: 'convert', mutationId: webcrypto.randomUUID(), id: p2, revision: r2.revision }),
  ]);
  assert.ok(c1.redirect.startsWith('/manage/leads/'));
  assert.ok(c2.redirect.startsWith('/manage/leads/'));
  assert.equal(sql.prepare("SELECT count(*) AS n FROM crm_leads WHERE email='shared-convert@example.com' AND deleted_at IS NULL").get().n, 1);
  const lead1 = sql.prepare('SELECT lead_id AS leadId FROM outreach_prospects WHERE id=?').get(p1).leadId;
  const lead2 = sql.prepare('SELECT lead_id AS leadId FROM outreach_prospects WHERE id=?').get(p2).leadId;
  assert.equal(lead1, lead2);
  assert.equal(c1.redirect, `/manage/leads/${lead1}`);
  assert.equal(c2.redirect, `/manage/leads/${lead2}`);
  pass('concurrent converts with the same email link both prospects to one CRM lead');

  assert.equal((await crm.listLeads({ q: 'shared-convert@example.com' })).items.length, 1);
  console.log(`\n${checks} CRM email dedupe / soft-delete checks passed.`);
  sql.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
