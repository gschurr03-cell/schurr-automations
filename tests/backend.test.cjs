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

const app = load('lib/inquiries.ts');
const owner = load('lib/owner.ts');
const inquiries = load('app/api/inquiries/route.ts');
const metrics = load('app/api/metrics/route.ts');
const deletion = load('app/api/manage/inquiries/route.ts');
const origin = 'https://example.chatgpt.site';
let requestSequence = 0;
function request(route, payload, extra = {}) {
  requestSequence += 1;
  return new Request(`${origin}${route}`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': `198.51.${Math.floor(requestSequence / 250)}.${requestSequence % 250 + 1}`, ...extra }, body: JSON.stringify(payload) });
}
async function submission(overrides = {}) {
  const token = await app.issueInquiryToken(origin);
  return { name: 'Ada Example', business: 'Example Co', email: 'ada@example.com', phone: '', service: 'audit', message: 'Please assess our existing chatbot.', preferredContact: 'email', consent: true, website: '', submissionKey: token.submissionKey, token: token.token, ...overrides };
}
function count(table) { return Number(sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n); }

(async () => {
  let checks = 0;
  const check = description => { checks += 1; process.stdout.write(`PASS ${description}\n`); };

  const valid = await submission();
  const first = await inquiries.POST(request('/api/inquiries', valid));
  assert.equal(first.status, 201);
  const receipt = (await first.json()).receipt;
  assert.equal(count('inquiries'), 1);
  assert.equal(sql.prepare("SELECT count FROM daily_metrics WHERE event = 'inquiry_received'").get().count, 1);
  assert.equal(sql.prepare("SELECT count FROM daily_metrics WHERE event = 'inquiry_saved' AND route='/inquire/'").get().count, 1);
  check('successful inquiry and its metric commit together');

  const retry = await inquiries.POST(request('/api/inquiries', valid));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).receipt, receipt);
  assert.equal(count('inquiries'), 1);
  assert.equal(sql.prepare("SELECT count FROM daily_metrics WHERE event = 'inquiry_received'").get().count, 1);
  assert.equal(sql.prepare("SELECT count FROM daily_metrics WHERE event = 'inquiry_saved'").get().count, 1);
  sql.prepare("UPDATE owner_alerts SET status='failed',last_error='Synthetic alert failure' WHERE id=?").run(receipt);
  const alertFailureRetry = await inquiries.POST(request('/api/inquiries', valid));
  assert.equal(alertFailureRetry.status, 200);
  const alertFailureBody = await alertFailureRetry.json();
  assert.equal(alertFailureBody.receipt, receipt);
  assert.equal(alertFailureBody.ownerAlertStatus, 'failed');
  assert.equal(Object.hasOwn(alertFailureBody, 'last_error'), false);
  assert.ok(sql.prepare('SELECT id FROM inquiries WHERE id=?').get(receipt));
  const mismatch = await inquiries.POST(request('/api/inquiries', { ...valid, message: 'This is a different valid message.' }));
  assert.equal(mismatch.status, 409);
  check('idempotent retries avoid duplicate rows/counts; changed content conflicts');

  const pair = await submission();
  const parallel = await Promise.all([inquiries.POST(request('/api/inquiries', pair)), inquiries.POST(request('/api/inquiries', pair))]);
  assert.deepEqual(parallel.map(response => response.status).sort(), [200, 201]);
  assert.equal(count('inquiries'), 2);
  check('concurrent retries share one receipt');

  assert.equal((await inquiries.POST(request('/api/inquiries', valid, { origin: 'https://other.example' }))).status, 403);
  assert.equal((await inquiries.POST(request('/api/inquiries', { ...valid, token: valid.token.slice(0, -3) + 'BAD' }))).status, 403);
  assert.equal((await inquiries.POST(request('/api/inquiries', { ...valid, submissionKey: webcrypto.randomUUID() }))).status, 403);
  const oldNow = Date.now;
  Date.now = () => oldNow() + 21 * 60 * 1000;
  try { assert.equal((await inquiries.POST(request('/api/inquiries', valid))).status, 403); } finally { Date.now = oldNow; }
  const refreshed = await app.issueInquiryToken(origin, valid.submissionKey);
  assert.equal((await inquiries.POST(request('/api/inquiries', { ...valid, token: refreshed.token }))).status, 200);
  check('origin, signature, token/key binding, expiry, and refresh are enforced');

  for (const mutation of [{ consent: 'true' }, { website: 'spam' }, { email: 'not-an-address' }, { name: 'x'.repeat(101) }, { phone: 'x'.repeat(41) }, { service: 'unknown' }, { preferredContact: 'text', phone: '' }, { name: ['wrong type'] }, { recipient: 'unauthorized@example.com' }, { sendEmail: true }, { requestKind: { toString: 'call' } }, { automaticEmailConsent: 'true' }, { automaticCallConsent: 'true' }, { automaticCallConsent: true, automaticCallConsentVersion: 'website_ai_callback_v1', requestKind: 'call' }, { automaticEmailConsent: true, automaticEmailConsentVersion: 'unapproved' }]) {
    assert.equal((await inquiries.POST(request('/api/inquiries', { ...valid, ...mutation }))).status, 400);
  }
  assert.equal((await inquiries.POST(request('/api/inquiries', { ...valid, message: 'x'.repeat(14000) }))).status, 413);
  assert.equal((await inquiries.POST(new Request(`${origin}/api/inquiries`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{bad' }))).status, 400);
  check('consent, honeypot, types, field bounds, JSON, and streaming body limit are validated');

  const phoneReply = await submission({ preferredContact: 'phone', email: '', phone: '(985) 555-0101' });
  assert.equal((await inquiries.POST(request('/api/inquiries', phoneReply))).status, 201);
  assert.equal(count('customer_first_emails'), 0);
  assert.equal(count('website_callbacks'), 0);
  check('phone reply needs no email; unchecked optional choices create no email or AI callback');

  const originalDb = runtime.DB;
  runtime.DB = undefined;
  assert.equal((await inquiries.POST(request('/api/inquiries', await submission()))).status, 503);
  runtime.DB = originalDb;
  const secret = runtime.INQUIRY_SIGNING_SECRET;
  runtime.INQUIRY_SIGNING_SECRET = undefined;
  assert.equal((await inquiries.POST(request('/api/inquiries', valid))).status, 503);
  runtime.INQUIRY_SIGNING_SECRET = secret;
  check('missing storage or signing secret fails closed');

  const rowsBeforeFailure = count('inquiries');
  sql.exec('ALTER TABLE daily_metrics RENAME TO unavailable_metrics');
  try {
    assert.equal((await inquiries.POST(request('/api/inquiries', await submission()))).status, 503);
    assert.equal(count('inquiries'), rowsBeforeFailure);
  } finally { sql.exec('ALTER TABLE unavailable_metrics RENAME TO daily_metrics'); }
  check('a metric failure rolls back inquiry creation instead of producing a partial write');

  const hostile = await submission({ message: "<script>alert('test')</script> '); DROP TABLE inquiries; --" });
  assert.equal((await inquiries.POST(request('/api/inquiries', hostile))).status, 201);
  assert.equal(count('inquiries'), 4);
  assert.ok((await app.listInquiries()).items.some(row => row.message === hostile.message));
  check('hostile text remains data in prepared statements');

  await Promise.all(Array.from({ length: 20 }, () => metrics.POST(request('/api/metrics', { event: 'page_view', route: '/', service: 'general' }))));
  assert.equal(sql.prepare("SELECT count FROM daily_metrics WHERE event = 'page_view'").get().count, 20);
  for (const payload of [{ event: 'inquiry_received', route: '/' }, { event: 'inquiry_saved', route: '/inquire/' }, { event: 'fit_call_requested', route: '/book/' }, { event: 'booking_confirmed', route: '/book/' }, { event: 'page_view', route: '/?email=private@example.com' }, { event: 'page_view', route: '/', service: 'private@example.com' }]) assert.equal((await metrics.POST(request('/api/metrics', payload))).status, 400);
  assert.deepEqual(sql.prepare('PRAGMA table_info(daily_metrics)').all().map(row => row.name), ['day', 'event', 'route', 'service', 'count']);
  check('metrics are atomic fixed buckets; public clients cannot claim saved inquiries');

  currentUser = null;
  assert.equal(await owner.getOwnerAccess(), null);
  assert.equal((await deletion.POST(new Request(`${origin}/api/manage/inquiries`, { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: `id=${receipt}` }))).status, 401);
  currentUser = { userId: 'stranger', email: 'stranger@example.com' };
  assert.equal((await owner.getOwnerAccess()).allowed, false);
  currentUser = { userId: 'owner', email: 'OWNER@EXAMPLE.COM' };
  assert.equal((await owner.getOwnerAccess()).allowed, true);
  runtime.OWNER_EMAIL = '';
  assert.equal((await owner.getOwnerAccess()).allowed, false);
  runtime.OWNER_EMAIL = 'owner@example.com';
  const deleted = await deletion.POST(new Request(`${origin}/api/manage/inquiries`, { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: `id=${receipt}` }));
  assert.equal(deleted.status, 303);
  assert.equal(deleted.headers.get('Location'), `/manage/leads/${receipt}`);
  assert.ok(sql.prepare('SELECT id FROM inquiries WHERE id = ?').get(receipt));
  await app.deleteInquiry(receipt);
  assert.equal(sql.prepare('SELECT id FROM inquiries WHERE id = ?').get(receipt), undefined);
  check('owner checks fail closed; legacy deletion redirects to the CRM confirmation flow');

  const day = new Date().toISOString().slice(0, 10);
  const fill = sql.prepare('INSERT INTO inquiries (id, submission_key, body_hash, name, business, email, phone, service, message, preferred_contact, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const existingRows = count('inquiries');
  for (let i = existingRows; i < 500; i += 1) fill.run(webcrypto.randomUUID(), webcrypto.randomUUID(), 'quota-test', 'Test', '', 'test@example.com', '', 'general', 'Quota boundary test', 'email', `${day}T01:00:00.000Z`, `${day}T01:00:00.000Z`);
  assert.equal((await inquiries.POST(request('/api/inquiries', await submission()))).status, 429);
  assert.equal((await inquiries.POST(request('/api/inquiries', pair))).status, 200);
  assert.equal(count('inquiries'), 500);
  check('daily intake limit is explicit and does not prevent a committed retry receipt');

  process.stdout.write(`\n${checks} backend checks passed using real SQLite and mocked runtime/auth bindings.\n`);
  sql.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
