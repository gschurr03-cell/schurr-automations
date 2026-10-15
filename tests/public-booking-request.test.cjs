// Local SQLite fixtures + synthetic transport only. No external providers.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite'), { webcrypto } = require('node:crypto');
const ts = require('typescript'), root = path.resolve(__dirname, '..');
const origin = 'https://schurrautomations.com';
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for (const name of fs.readdirSync(path.join(root, 'drizzle')).filter(name => name.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', name), 'utf8'));
let failBatch = false, failAlert = false, alerts = 0, rateChecks = 0;
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  async first() { return sql.prepare(this.query).get(...this.values) || null; }
  async all() { return { results: sql.prepare(this.query).all(...this.values) }; }
  async run() { return sql.prepare(this.query).run(...this.values); }
}
const runtime = { INQUIRY_SIGNING_SECRET: 'local-only-test-secret-'.repeat(4), DB: {
  prepare(query) { return new Statement(query); },
  async batch(statements) {
    sql.exec('BEGIN');
    try { const result = statements.map(s => ({ results: sql.prepare(s.query).all(...s.values) })); if (failBatch) throw Error('Synthetic transaction failure'); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
} };
const modules = new Map();
function load(relative) {
  if (relative === 'lib/owner-alerts.ts') return { scheduleOwnerAlert() { alerts++; if (failAlert) throw Error('Synthetic dispatcher outage'); } };
  if (relative === 'lib/rate-limit.ts') return { async enforceRequestLimit() { rateChecks++; } };
  if (modules.has(relative)) return modules.get(relative);
  const module = { exports: {} }; modules.set(relative, module.exports);
  const requireLocal = name => name === 'cloudflare:workers' ? { env: runtime } : name.startsWith('@/') ? load(name.slice(2) + '.ts') : name.startsWith('.') ? load(path.posix.join(path.posix.dirname(relative), name + '.ts')) : require(name);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, require: requireLocal, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Request, Response, URL, Date, Intl, btoa, atob, console: { error() {} } }, { filename: relative });
  return module.exports;
}
const inquiries = load('lib/inquiries.ts'), route = load('app/api/booking/route.ts');
const post = data => new Request(origin + '/api/booking', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const count = table => sql.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const make = async extra => { const { token, submissionKey } = await inquiries.issueInquiryToken(origin); return ({ token, submissionKey, action: 'request', bookingMode: 'request', name: 'Synthetic Owner', business: '', email: '', phone: '+13035550123', message: 'Please help us keep callbacks visible.', preferredWindow: 'Tuesday afternoon', timezone: 'America/Denver', source: 'dealer-card', consent: true, website: '', ...extra }); };

function uiHarness() {
  const cells = [], effects = [], requests = []; let cursor = 0, queued = [], loseResponse = true;
  const react = {
    useState(value) { const i = cursor++; if (!(i in cells)) cells[i] = value; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useRef(value) { const i = cursor++; return cells[i] ||= { current: value }; },
    useEffect(effect, deps) { const i = cursor++; if (!effects[i] || deps.some((v, j) => !Object.is(v, effects[i][j]))) { effects[i] = deps; queued.push(effect); } },
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'app/book/booking-form.tsx'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : require(name),
    AbortController, setTimeout, clearTimeout, setInterval, clearInterval, Intl, Date, Error, TypeError,
    FormData: class { constructor(form) { this.values = form.values; } get(name) { return this.values[name] ?? null; } *[Symbol.iterator]() { yield* Object.entries(this.values); } },
    fetch: async (url, options = {}) => {
      if (url.startsWith('/api/inquiry-token')) return Response.json(await inquiries.issueInquiryToken(origin, new URL(url, origin).searchParams.get('key')));
      assert.equal(url, '/api/booking'); const body = JSON.parse(options.body); requests.push(body);
      const result = await route.POST(post(body));
      if (loseResponse && body.action === 'request') { loseResponse = false; throw new TypeError('Synthetic lost response after save'); }
      return result;
    },
  });
  const render = () => { cursor = 0; const tree = module.exports.default({ source: 'dealer' }); const pending = queued; queued = []; pending.forEach(effect => effect()); return tree; };
  return { render, requests };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
(async () => {
  const settings = await (await route.GET(new Request(origin + '/api/booking?date=2026-11-01'))).json();
  assert.equal(settings.mode, 'request'); assert.equal(settings.enabled, false); assert.equal(settings.duration, 15); assert.equal(settings.slots.length, 0); assert.equal(count('appointments'), 0);
  const input = await make();
  assert.equal((await route.POST(post({ ...input, token: 'forged' }))).status, 403);
  assert.equal((await route.POST(post({ ...input, bookingMode: undefined, start: Date.now(), confirmed: true }))).status, 409);
  assert.equal((await route.POST(post({ ...input, automaticCallConsent: true }))).status, 400);
  assert.equal((await route.POST(post({ ...input, consent: false }))).status, 400);
  assert.equal((await route.POST(post({ ...input, timezone: 'MST-fixed-invented' }))).status, 400);
  for (const source of ['someone@example.com', '__proto__', 'other', null, ['dealer']]) {
    assert.equal((await route.POST(post({ ...input, source }))).status, 400);
  }
  assert.equal(count('inquiries'), 0);
  let missing = await route.POST(post({ ...input, action: 'lookup' })); assert.equal((await missing.json()).found, false); assert.equal(count('inquiries'), 0); assert.equal(alerts, 0);
  const saved = await route.POST(post(input)), receipt = await saved.json(); assert.equal(saved.status, 201, JSON.stringify(receipt)); assert.equal(receipt.status, 'requested'); assert.ok(receipt.receipt); assert.equal(receipt.appointment, undefined);
  assert.equal(count('inquiries'), 1); assert.equal(count('owner_alerts'), 1); assert.equal(count('appointments'), 0); assert.equal(count('customer_first_emails'), 0); assert.equal(count('website_callbacks'), 0);
  const row = sql.prepare('SELECT message FROM inquiries WHERE id=?').get(receipt.receipt); assert.match(row.message, /15-minute fit call/); assert.match(row.message, /not been confirmed/); assert.match(row.message, /Source: dealer-card/); assert.match(row.message, /America\/Denver/);
  const crm = load('lib/crm.ts');
  assert.deepEqual(Object.keys(crm.MANUAL_SOURCES), ['manual', 'referral', 'outreach', 'event', 'other'], 'Manual lead creation retains its existing choices');
  assert.equal((await crm.getLead(receipt.receipt)).source, 'dealer-card');
  assert.equal((await crm.listLeads({ source: 'dealer-card' })).items.length, 1);
  const beforeLookup = { alerts, checks: rateChecks };
  const lookup = await route.POST(post({ ...input, action: 'lookup' })); assert.equal(lookup.headers.get('Cache-Control'), 'private, no-store, max-age=0'); assert.equal((await lookup.json()).receipt, receipt.receipt); assert.equal(alerts, beforeLookup.alerts); assert.equal(rateChecks, beforeLookup.checks);
  assert.equal((await route.POST(post({ ...input, message: 'Changed details after a possible save.' }))).status, 409);
  assert.equal((await route.POST(post({ ...input, source: 'dealer-hanger' }))).status, 409);
  const repeated = await Promise.all([route.POST(post(input)), route.POST(post(input))]); assert.ok(repeated.every(r => r.status === 200)); assert.equal(count('inquiries'), 1); assert.equal(count('owner_alerts'), 1);
  const concurrent = await make(); const concurrentResults = await Promise.all([route.POST(post(concurrent)), route.POST(post(concurrent))]); const bodies = await Promise.all(concurrentResults.map(r => r.json())); assert.equal(bodies[0].receipt, bodies[1].receipt); assert.equal(count('inquiries'), 2); assert.equal(count('owner_alerts'), 2);
  failAlert = true; const delayed = await route.POST(post(await make())); assert.equal(delayed.status, 201); assert.equal((await delayed.json()).status, 'requested'); assert.equal(count('owner_alerts'), 3); failAlert = false;
  failBatch = true; const rolledBack = await route.POST(post(await make())); assert.equal(rolledBack.status, 503); assert.equal(count('inquiries'), 3); assert.equal(count('owner_alerts'), 3); failBatch = false;
  await inquiries.deleteInquiry(receipt.receipt); assert.equal((await route.POST(post({ ...input, action: 'lookup' }))).status, 410); assert.equal((await route.POST(post(input))).status, 410);
  console.log('PASS request-only public contract, signed lookup, permission/field rejection, durable atomic save, concurrent deduplication, notification outage, rollback and deletion tombstone');

  const ui = uiHarness(), form = { reportValidity: () => true, values: { name: 'Browser Fixture', business: '', phone: '+13035550177', email: '', message: 'Review our unanswered customer inquiries.', preferredWindow: 'November 1 afternoon', timezone: 'America/New_York', consent: 'on', website: '' } };
  let tree = ui.render(); await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: form });
  tree = ui.render(); assert.equal(nodes(tree).find(n => n.type === 'fieldset').props.disabled, true); assert.ok(nodes(tree).some(n => n.props?.role === 'alert'));
  const inquiryCount = count('inquiries'); form.values.message = 'This edited message must never replace the uncertain request.';
  await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: form }); tree = ui.render();
  assert.deepEqual(ui.requests.map(r => r.action), ['request', 'lookup']); assert.equal(ui.requests[0].submissionKey, ui.requests[1].submissionKey); assert.equal(ui.requests[0].message, ui.requests[1].message); assert.equal(count('inquiries'), inquiryCount); assert.equal(tree.props.role, 'status');
  assert.ok(JSON.stringify(tree).includes('not booked yet')); assert.ok(!JSON.stringify(tree).includes('Your fit call with Gavin is booked'));
  console.log('PASS lost-response browser recovery locks the original payload and looks up the receipt before retrying; requested state never renders confirmed');

  const policy = load('lib/booking-policy.ts'), config = { ...policy.defaultBookingConfig(), enabled: true, duration: 15, notice: 0, horizon: 60, hours: Array.from({ length: 7 }, () => ({ enabled: true, start: '00:00', end: '04:00' })) };
  const slots = policy.candidateSlots(config, '2026-11-01', Date.parse('2026-10-14T16:30:00Z'));
  assert.ok(slots.some(s => s.label.includes('GMT-6'))); assert.ok(slots.some(s => s.label.includes('GMT-7'))); assert.ok(slots.every(s => s.end - s.start === 15 * 60000));
  const a = Date.parse('2026-11-01T07:15:00Z'), b = Date.parse('2026-11-01T08:15:00Z'); assert.notEqual(policy.appointmentTimeLabel(a, 'America/Denver'), policy.appointmentTimeLabel(b, 'America/Denver'));
  assert.equal(policy.validTimezone('Asia/Kathmandu'), 'Asia/Kathmandu');
  const campaigns = load('app/book/automotive/campaigns.ts'); for (const audience of ['dealer', 'repair']) { const campaign = campaigns.getAutomotiveCampaign(audience); assert.equal(campaign.video.src, `/videos/${audience}-explainer.mp4`); assert.equal(campaign.video.enabled, false); } assert.equal(campaigns.getAutomotiveCampaign(['dealer', 'repair']), null); assert.equal(campaigns.getCampaignSource('hanger'), 'hanger');
  console.log('PASS Denver fall-back time remains timezone-aware, customer zones valid, and printed QR selectors/media paths preserved');
  for (const source of Object.keys(load('lib/inquiry-attribution.ts').INQUIRY_SOURCES)) {
    const payload = await make({ source }), response = await route.POST(post(payload)), saved = await response.json();
    assert.equal(response.status, 201);
    assert.equal((await crm.getLead(saved.receipt)).source, source);
    assert.ok((await crm.listLeads({ source })).items.some(lead => lead.id === saved.receipt));
    assert.equal((await route.POST(post(payload))).status, 200);
    assert.equal(sql.prepare('SELECT count(*) n FROM crm_leads WHERE inquiry_id=?').get(saved.receipt).n, 1);
  }
  const { token, submissionKey } = await inquiries.issueInquiryToken(origin);
  const defaultPayload = { name: 'Ordinary Fixture', email: 'fixture@example.com', message: 'Review our inquiry workflow.', service: 'general', preferredContact: 'email', consent: true, token, submissionKey };
  const defaultInput = inquiries.validateInquiry(defaultPayload);
  assert.equal(defaultInput.source, 'website');
  const legacyInput = { ...defaultInput }; delete legacyInput.source;
  assert.equal(await inquiries.inquiryDigest(defaultInput), await inquiries.inquiryDigest(legacyInput), 'Existing ordinary-form receipt hashes remain valid');
  assert.throws(() => inquiries.validateInquiry({ ...defaultPayload, source: 'personal@example.com' }), /highlighted fields/);
  assert.throws(() => inquiries.validateInquiry({ ...defaultPayload, source: null }), /highlighted fields/);
  const metricColumns = sql.prepare('PRAGMA table_info(daily_metrics)').all().map(column => column.name);
  assert.deepEqual(metricColumns, ['day', 'event', 'route', 'service', 'count']);
  console.log('PASS all seven allowlisted source labels persist separately in CRM, remain filterable and idempotent; invalid attribution rejected; default receipt hashes preserved; no campaign or personal data added to metrics');
  console.log('All public booking fixtures passed. Zero live provider calls or messages.');
})().catch(error => { console.error(error); process.exitCode = 1; });
