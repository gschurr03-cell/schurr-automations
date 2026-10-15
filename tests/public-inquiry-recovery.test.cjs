// The real inquiry API with in-memory SQLite and a small DOM contract harness.
// No browser, live records, external requests or notification providers.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite'), { webcrypto } = require('node:crypto');
const ts = require('typescript'), root = path.resolve(__dirname, '..');
const origin = 'https://schurrautomations.com';
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync(path.join(root, 'drizzle')).filter(file => file.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', file), 'utf8'));
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  async first() { return sql.prepare(this.query).get(...this.values) || null; }
  async all() { return { results: sql.prepare(this.query).all(...this.values) }; }
  async run() { return sql.prepare(this.query).run(...this.values); }
}
const runtime = { INQUIRY_SIGNING_SECRET: 'synthetic-inquiry-recovery-'.repeat(3), DB: {
  prepare(query) { return new Statement(query); },
  async batch(statements) {
    sql.exec('BEGIN');
    try { const results = statements.map(s => ({ results: sql.prepare(s.query).all(...s.values) })); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
} };
const modules = new Map();
function load(relative) {
  const schedules = { 'lib/owner-alerts.ts': 'scheduleOwnerAlert', 'lib/customer-email.ts': 'scheduleCustomerEmail', 'lib/website-callbacks.ts': 'scheduleWebsiteCallback' };
  if (schedules[relative]) return { [schedules[relative]]() {} };
  if (relative === 'lib/rate-limit.ts') return { async enforceRequestLimit() {} };
  if (modules.has(relative)) return modules.get(relative);
  const module = { exports: {} }; modules.set(relative, module.exports);
  const localRequire = name => name === 'cloudflare:workers' ? { env: runtime } : name.startsWith('@/') ? load(name.slice(2) + '.ts') : name.startsWith('.') ? load(path.posix.join(path.posix.dirname(relative), name + '.ts')) : require(name);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports, require: localRequire, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Request, Response, URL, Date, btoa, atob, console: { error() {} },
  }, { filename: relative });
  return module.exports;
}
const inquiries = load('lib/inquiries.ts'), route = load('app/api/inquiries/route.ts');
const count = table => sql.prepare(`SELECT count(*) n FROM ${table}`).get().n;

class Element {
  constructor(name = '', value = '') {
    this.name = name; this.value = value; this.initialValue = value; this.id = name ? 'inquiry-' + name : ''; this.attrs = {}; this.handlers = {}; this.children = [];
    this.disabled = false; this.required = false; this.checked = false; this.initialChecked = false; this.hidden = false; this.textContent = ''; this.dataset = {};
    this.classes = new Set(); this.classList = { contains: value => this.classes.has(value), add: (...values) => values.forEach(v => this.classes.add(v)), remove: (...values) => values.forEach(v => this.classes.delete(v)) };
  }
  addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
  dispatchEvent(event) { for (const handler of this.handlers[event.type] || []) handler(event); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || null; }
  removeAttribute(name) { delete this.attrs[name]; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  focus() { this.focused = true; }
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  closest(selector) { return selector === 'label' ? this.label : null; }
  insertAdjacentElement() {}
  checkValidity() { return !this.required || (this.type === 'checkbox' ? this.checked : !!this.value); }
  get validationMessage() { return this.checkValidity() ? '' : 'Complete this field.'; }
}
function harness(mode = '', search = '') {
  const names = { name: 'Synthetic Form Owner', business: '', preferredContact: 'email', email: 'fixture@example.com', phone: '', message: 'Please review our customer inquiry handoff.', service: 'general', requestType: 'quote', website: '', consent: 'on', automaticEmailConsent: 'on', automaticCallConsent: 'on' };
  const fields = Object.fromEntries(Object.entries(names).map(([name, value]) => [name, new Element(name, value)]));
  for (const name of ['consent', 'automaticEmailConsent', 'automaticCallConsent']) fields[name].type = 'checkbox';
  fields.consent.checked = true; fields.consent.initialChecked = true; fields.consent.required = true;
  fields.phone.disabled = true; fields.automaticEmailConsent.disabled = true; fields.automaticCallConsent.disabled = true;
  fields.name.required = true; fields.message.required = true;
  fields.service.options = ['general', 'calls', 'coding', 'website', 'reviews'].map(value => ({ value }));
  for (const field of Object.values(fields)) field.label = new Element();
  const form = new Element(), submit = new Element(), status = new Element(), summary = new Element(), list = new Element();
  form.classes.add('compact-inquiry'); form.elements = { namedItem: name => fields[name] };
  const controls = [...Object.values(fields), submit], contactLabels = { email: fields.email.label, phone: fields.phone.label };
  form.querySelectorAll = selector => selector === 'input,select,textarea,button' ? controls : selector === 'input,select,textarea' ? Object.values(fields) : selector === '[aria-invalid]' ? controls.filter(c => c.hasAttribute('aria-invalid')) : [];
  form.querySelector = selector => contactLabels[selector.match(/data-contact-field="(.*?)"/)?.[1]] || null;
  form.reset = () => { for (const field of Object.values(fields)) { field.value = field.initialValue; field.checked = field.initialChecked; } };
  summary.querySelector = selector => selector === 'ul' ? list : selector === 'li' ? list.children[0] : null;
  const mappings = { '#inquiry-form': form, '#inquiry-submit': submit, '#inquiry-status': status, '#inquiry-errors': summary, '#email-field-label': new Element(), '#phone-field-label': new Element(), '#automatic-email-option': new Element(), '#automatic-call-option': new Element() };
  const document = { querySelector: selector => mappings[selector] || null, addEventListener() {}, createElement: () => new Element() };
  const location = { pathname: '/inquire/', search };
  const timers = new Map(), requests = []; let timerId = 0, behavior = mode, stalledBody = false;
  let signalBodyStarted;
  const bodyStarted = new Promise(resolve => { signalBodyStarted = resolve; });
  const stalled = (response, signal) => ({ ok: response.ok, status: response.status, json() { stalledBody = true; signalBodyStarted(); return new Promise((resolve, reject) => signal.addEventListener('abort', () => { const error = new Error('Synthetic body timeout'); error.name = 'AbortError'; reject(error); }, { once: true })); } });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/site.js'), 'utf8'), {
    document, window: {}, location, URLSearchParams, AbortController, TypeError, Error, Element,
    Event: class { constructor(type) { this.type = type; } },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); },
    FormData: class { constructor() { this.values = Object.values(fields).filter(f => !f.disabled && (f.type !== 'checkbox' || f.checked)).map(f => [f.name, f.value]); } entries() { return this.values[Symbol.iterator](); } },
    fetch: async (url, options = {}) => {
      if (url === '/api/metrics') return Response.json({ ok: true });
      if (url === '/api/website-followup') return Response.json({ callbacksEnabled: true, emailEnabled: true });
      if (url.startsWith('/api/inquiry-token')) {
        if (behavior === 'token-failure') { behavior = ''; throw new TypeError('Synthetic token outage'); }
        return Response.json(await inquiries.issueInquiryToken(origin, new URL(url, origin).searchParams.get('key')));
      }
      assert.equal(url, '/api/inquiries'); requests.push(JSON.parse(options.body));
      const response = await route.POST(new Request(origin + url, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: options.body }));
      if (behavior === 'lost') { behavior = ''; throw new TypeError('Synthetic lost response after commit'); }
      if (behavior === 'body-timeout') { behavior = ''; return stalled(response, options.signal); }
      return response;
    },
  });
  return { fields, controls, submit, status, summary, requests, timers, bodyStarted, get stalledBody() { return stalledBody; },
    send: () => form.handlers.submit[0]({ preventDefault() {} }),
    changeSearch(value) { location.search = value; },
    changeContact(value) { fields.preferredContact.value = value; fields.preferredContact.dispatchEvent({ type: 'change' }); },
    expire() { for (const callback of [...timers.values()]) callback(); },
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

(async () => {
  const lost = harness('lost', '?source=dealer-card'); await settle();
  const before = count('inquiries'), emailsBefore = count('customer_first_emails');
  await Promise.all([lost.send(), lost.send()]);
  assert.equal(count('inquiries'), before + 1); assert.equal(lost.requests.length, 1);
  assert.equal(lost.fields.message.disabled, true); assert.equal(lost.submit.disabled, false); assert.equal(lost.submit.textContent, 'Check and retry this inquiry');
  lost.fields.message.value = 'An edited value must not replace the uncertain request.';
  lost.fields.automaticEmailConsent.checked = true;
  lost.changeSearch('?source=repair-hanger');
  await lost.send();
  assert.equal(lost.requests.length, 2); assert.equal(lost.requests[0].submissionKey, lost.requests[1].submissionKey); assert.equal(lost.requests[0].message, lost.requests[1].message);
  assert.equal(lost.requests[1].automaticEmailConsent, false); assert.equal(count('customer_first_emails'), emailsBefore); assert.equal(count('inquiries'), before + 1);
  assert.equal(lost.requests[0].source, 'dealer-card'); assert.equal(lost.requests[1].source, 'dealer-card');
  assert.equal(sql.prepare('SELECT source FROM crm_leads WHERE id=(SELECT id FROM inquiries WHERE submission_key=?)').get(lost.requests[1].submissionKey).source, 'dealer-card');
  assert.match(lost.status.textContent, /^Your inquiry is saved\./); assert.equal(lost.fields.message.disabled, false); assert.equal(lost.fields.phone.disabled, true);
  console.log('PASS lost-response recovery retains the exact body/key, source and consent, blocks double submit, recovers one receipt, and restores chosen-channel controls');

  for (const source of Object.keys(load('lib/inquiry-attribution.ts').INQUIRY_SOURCES)) {
    const attributed = harness('', '?source=' + encodeURIComponent(source)); await settle(); await attributed.send();
    assert.match(attributed.status.textContent, /^Your inquiry is saved\./);
    assert.equal(attributed.requests[0].source, source);
    assert.equal(sql.prepare('SELECT source FROM crm_leads WHERE id=(SELECT id FROM inquiries WHERE submission_key=?)').get(attributed.requests[0].submissionKey).source, source);
  }
  for (const query of ['', '?source=', '?source=unknown', '?source=__proto__', '?source=fixture%40example.com', '?source=dealer&source=repair']) {
    const untrusted = harness('', query); await settle(); await untrusted.send();
    assert.match(untrusted.status.textContent, /^Your inquiry is saved\./);
    assert.equal(untrusted.requests[0].source, 'website');
    assert.equal(sql.prepare('SELECT source FROM crm_leads WHERE id=(SELECT id FROM inquiries WHERE submission_key=?)').get(untrusted.requests[0].submissionKey).source, 'website');
  }
  console.log('PASS all seven allowed inquiry sources persist in CRM; missing, unknown, personal and duplicate query values use website');

  const timeout = harness('body-timeout'); await settle();
  const waiting = timeout.send();
  let watchdog;
  try {
    await Promise.race([
      timeout.bodyStarted,
      new Promise((resolve, reject) => { watchdog = setTimeout(() => reject(new Error('The inquiry fixture did not begin reading its response body within 10 seconds.')), 10000); }),
    ]);
  } finally { clearTimeout(watchdog); }
  assert.equal(timeout.stalledBody, true); assert.equal(timeout.timers.size, 1, 'Deadline must remain active while parsing the response body');
  timeout.expire(); await waiting;
  assert.equal(timeout.timers.size, 0); assert.equal(timeout.fields.message.disabled, true); assert.equal(timeout.submit.disabled, false);
  await timeout.send(); assert.match(timeout.status.textContent, /^Your inquiry is saved\./);
  assert.equal(timeout.requests[0].message, timeout.requests[1].message); assert.equal(timeout.requests[0].submissionKey, timeout.requests[1].submissionKey);
  console.log('PASS a response body that stalls after headers times out, retains the request and recovers its saved receipt');

  const unavailable = harness('token-failure'); await settle(); await unavailable.send();
  assert.equal(unavailable.requests.length, 0); assert.equal(unavailable.fields.message.disabled, false);
  unavailable.fields.message.value = 'An edited inquiry is allowed before any post attempt.';
  await unavailable.send(); assert.match(unavailable.requests[0].message, /edited inquiry/); assert.match(unavailable.status.textContent, /^Your inquiry is saved\./);
  const invalid = harness(); await settle(); invalid.fields.email.value = 'invalid'; await invalid.send();
  assert.equal(invalid.fields.email.disabled, false); assert.equal(invalid.fields.email.getAttribute('aria-invalid'), 'true'); assert.equal(invalid.summary.hidden, false);
  invalid.fields.email.value = 'corrected@example.com'; await invalid.send(); assert.match(invalid.status.textContent, /^Your inquiry is saved\./);
  console.log('PASS token failures before POST and explicit 400 validation keep the form editable, display errors, and accept corrected details');

  const paused = harness(); await settle(); paused.changeContact('phone'); paused.fields.phone.value = '+13035550123'; paused.fields.automaticCallConsent.checked = true;
  const callsBefore = count('website_callbacks'); await paused.send(); assert.match(paused.status.textContent, /currently paused/); assert.equal(paused.fields.automaticCallConsent.disabled, false);
  paused.fields.automaticCallConsent.checked = false; await paused.send(); assert.match(paused.status.textContent, /^Your inquiry is saved\./); assert.equal(count('website_callbacks'), callsBefore);
  console.log('PASS a newly paused optional callback can be unchecked and resubmitted without creating a callback');

  const removed = harness('lost'); await settle(); await removed.send();
  const receipt = sql.prepare('SELECT id FROM inquiries WHERE submission_key=?').get(removed.requests[0].submissionKey).id;
  await inquiries.deleteInquiry(receipt); await removed.send(); assert.equal(removed.submit.disabled, true); assert.match(removed.status.textContent, /removed/);
  const attempts = removed.requests.length; await removed.send(); assert.equal(removed.requests.length, attempts);
  console.log('PASS a removed inquiry stays removed and recovery offers no further submission');

  const events = [], handlers = {};
  class Link extends Element { constructor(href) { super(); this.href = href; } closest() { return this; } }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/agency.js'), 'utf8'), {
    document: { querySelectorAll: () => [], querySelector: () => null, addEventListener(name, handler) { (handlers[name] ||= []).push(handler); } },
    location: { pathname: '/meet-gavin/', hash: '', href: origin + '/meet-gavin/', origin }, URL, Element,
    fetch: async (url, options) => { events.push(JSON.parse(options.body)); return Response.json({}); },
  });
  for (const href of ['tel:+19857710552', 'tel:+19852328337']) for (const handler of handlers.click) handler({ target: new Link(href) });
  assert.deepEqual(events.map(e => e.event), ['page_view', 'demo_phone_clicked', 'call_click']);
  console.log('PASS phone metrics distinguish the receptionist demo from a direct call to Gavin');
  console.log('All public inquiry recovery fixtures passed. Zero live records, provider calls or messages.');
})().catch(error => { console.error(error); process.exitCode = 1; });
