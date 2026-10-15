/* Synthetic core/route tests. Provider, alert, incident and call adapters are bounded stubs;
 * actual monitoring orchestration, policy, owner gate, JSON parsing and SQL are exercised.
 * Run from any checkout with SCHURR_SOURCE_ROOT=/absolute/checkout node this-file.cjs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const root = process.env.SCHURR_SOURCE_ROOT || path.resolve(__dirname, '..');
const ts = createRequire(process.env.SCHURR_PACKAGE_JSON || path.join(root, 'package.json'))('typescript');
const origin = 'https://schurrautomations.com';
const secret = 'synthetic_private_runner_credential_'.repeat(2);
const initialClock = Date.parse('2026-10-02T12:00:00.000Z');
const runtime = { OWNER_EMAIL: 'owner@example.com', MONITORING_RUNNER_SECRET: secret };
let clock = initialClock, currentUser, sqlLog, events, providerReads, connectWrites, alertDrains, callReads, networkAttempts;
let observed, observeHook, incidentHook, healthFailure, latestPhone, emailConnection, emailFailure;
let monitoredCalls, callIncidentHook, callMarks;
let background = [];
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const plain = value => JSON.parse(JSON.stringify(value));
const iso = value => new Date(value).toISOString();
const sql = new DatabaseSync(':memory:');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
}
// During isolated candidate development only: use the two core tables from db/schema.ts.
// Once canonical migrations exist they always take precedence.
if (!sql.prepare("SELECT name FROM sqlite_master WHERE name='monitoring_settings'").get()) {
  sql.exec(`CREATE TABLE monitoring_settings (
    id TEXT PRIMARY KEY NOT NULL, alerts_enabled INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1, baseline_hash TEXT NOT NULL DEFAULT '',
    baseline_agent_id TEXT NOT NULL DEFAULT '', baseline_agent_version INTEGER,
    baseline_at TEXT NOT NULL DEFAULT '', last_runner_at TEXT NOT NULL DEFAULT '',
    runner_expected INTEGER NOT NULL DEFAULT 0, lease_token TEXT NOT NULL DEFAULT '',
    lease_until INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); CREATE TABLE monitoring_checks (
    id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL, checks TEXT NOT NULL, agent_id TEXT NOT NULL,
    agent_version INTEGER, configuration_hash TEXT
  );`);
}
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  execute(method) {
    sqlLog.push({ query: this.query, values: this.values.slice() });
    if (healthFailure && this.query === 'SELECT 1 AS available') throw Error('synthetic private DB diagnostic');
    return sql.prepare(this.query)[method](...this.values);
  }
  async first() { return this.execute('get') || null; }
  async all() { return { results: this.execute('all') }; }
  async run() { return this.execute('run'); }
}
runtime.DB = {
  prepare(query) { events.push('prepare'); return new Statement(query); },
  async batch(statements) {
    sql.exec('BEGIN');
    try { const result = statements.map(s => ({ results: s.execute('all') })); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const stubs = {
  'lib/monitoring-retell.ts': {
    async readRetellMonitoring() { providerReads++; events.push('observe'); if (observeHook) await observeHook(); return plain(observed); },
    async connectRetellCallEvents(url) { connectWrites++; events.push('connect'); assert.equal(url, origin); },
  },
  'lib/monitoring-incidents.ts': {
    async reconcileCheckIncidents(checks, runId) {
      events.push('incidents');
      const saved = sql.prepare('SELECT checks FROM monitoring_checks WHERE id=?').get(runId);
      assert.ok(saved, 'check evidence must be durable before incident reconciliation');
      assert.deepEqual(JSON.parse(saved.checks), plain(checks));
      if (incidentHook) await incidentHook(checks, runId);
    },
    async openCallIncident(callId, kind, detail) {
      events.push('call-incident:' + callId + ':' + kind);
      assert.equal(detail, '', 'incident detail must not copy caller content');
      if (callIncidentHook) await callIncidentHook(callId, kind);
    },
    async acknowledgeIncident(id) { events.push('acknowledge:' + id); },
    async resolveIncident(id) { events.push('resolve:' + id); },
  },
  'lib/monitoring-alerts.ts': {
    async drainMonitoringAlerts(limit) { alertDrains++; events.push('alerts'); assert.equal(limit, 5); },
    async deliverMonitoringAlert(id) { events.push('retry:' + id); },
  },
  'lib/monitoring-calls.ts': {
    async getMonitoredCall(callId) { callReads++; const call = monitoredCalls.get(callId); return call ? plain(call) : null; },
    async pendingMonitoredCalls(limit) {
      assert.equal(limit, 20); events.push('pending-calls');
      return [...monitoredCalls.values()].filter(call => call.observationRevision > call.reconciledRevision).slice(0, limit).map(call => ({ callId: call.callId }));
    },
    async markMonitoredCallReconciled(callId, revision) {
      events.push('mark-call:' + callId + ':' + revision); callMarks.push({ callId, revision });
      const call = monitoredCalls.get(callId);
      if (!call || call.observationRevision !== revision) return false;
      call.reconciledRevision = revision; return true;
    },
  },
  'lib/owner-alerts.ts': {
    async verifiedEmailConnection() { if (emailFailure) throw Error('synthetic email credential diagnostic'); return emailConnection; },
  },
  'lib/receptionist-auditions.ts': { async listAuditions() { return { latestPhone }; } },
  'lib/receptionist-audition-policy.ts': {
    async auditionCatalogue() { return { hash: 'fictional-catalogue-hash' }; },
    auditionSummary(session, hash) { return { failed: session.failed || 0, notTested: session.notTested || 0, scored: [session.naturalness, session.interruptions, session.pacing].every(n => n !== null), current: session.catalogueHash === hash }; },
  },
};
const modules = new Map();
function load(relative) {
  if (stubs[relative]) return stubs[relative];
  if (modules.has(relative)) return modules.get(relative);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  function customRequire(name) {
    if (name === 'cloudflare:workers') return { env: runtime, waitUntil(task) { background.push(task); } };
    if (name === '@/app/chatgpt-auth') return {
      getChatGPTUser: async () => currentUser,
      requireChatGPTUser: async () => currentUser,
    };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), name + '.ts'));
    throw Error('Unexpected test dependency: ' + name);
  }
  vm.runInNewContext(code, {
    module, exports: module.exports, require: customRequire, crypto: webcrypto,
    Date: Clock, TextEncoder, TextDecoder, Request, Response, URL, URLSearchParams,
    Uint8Array, ReadableStream, AbortSignal, Intl, btoa, atob,
    console: { error() {} },
    fetch: async () => { networkAttempts++; throw Error('Network is prohibited in monitoring core tests'); },
  }, { filename: relative });
  modules.set(relative, module.exports);
  return module.exports;
}
const monitoring = load('lib/monitoring.ts');
const policy = load('lib/monitoring-policy.ts');
const bookingPolicy = load('lib/booking-policy.ts');
const ownerRoute = load('app/api/manage/monitoring/route.ts');
const connectionRoute = load('app/api/manage/monitoring-connection/route.ts');
const runnerRoute = load('app/api/monitoring/run/route.ts');
const healthRoute = load('app/api/health/route.ts');
const ownerRequest = (body, headers = {}) => new Request(origin + '/api/manage/monitoring', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const runnerRequest = (body = {}, headers = {}) => new Request(origin + '/api/monitoring/run', {
  method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const connectionRequest = headers => new Request(origin + '/api/manage/monitoring-connection', { headers });
const coreKeys = ['retell_connection', 'phone_routing', 'agent_configuration', 'voice_tools'];
const check = (key, status = 'pass') => ({ key, status, summary: 'Fictional check evidence.' });
const count = table => sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
const settingsRow = () => sql.prepare("SELECT * FROM monitoring_settings WHERE id='monitoring'").get();
function reset() {
  for (const table of ['monitoring_checks', 'monitoring_settings', 'booking_settings']) sql.exec(`DELETE FROM ${table}`);
  clock = initialClock; currentUser = { userId: 'synthetic-owner-id', email: 'owner@example.com' };
  runtime.OWNER_EMAIL = 'owner@example.com'; runtime.MONITORING_RUNNER_SECRET = secret;
  delete runtime.MONITORING_ALERTS_ENABLED;
  sqlLog = []; events = []; background = [];
  providerReads = connectWrites = alertDrains = callReads = networkAttempts = 0;
  observeHook = incidentHook = null; healthFailure = emailFailure = false;
  emailConnection = { verified: true }; latestPhone = null;
  monitoredCalls = new Map(); callIncidentHook = null; callMarks = [];
  observed = { checks: coreKeys.map(key => check(key)), agentId: 'agent_fictional_monitor',
    agentVersion: 7, inboundNumber: '+12025550123', configurationHash: 'a'.repeat(64),
    webhookConnected: true, checkedAt: iso(clock) };
}
async function seedSettings() { return monitoring.monitoringSettings(); }
function seedRun(overrides = {}) {
  const run = { id: webcrypto.randomUUID(), source: 'owner', startedAt: iso(clock - 1000),
    finishedAt: iso(clock), checks: coreKeys.map(key => check(key)),
    agentId: observed.agentId, agentVersion: observed.agentVersion,
    configurationHash: observed.configurationHash, ...overrides };
  sql.prepare('INSERT INTO monitoring_checks(id,source,started_at,finished_at,checks,agent_id,agent_version,configuration_hash) VALUES(?,?,?,?,?,?,?,?)')
    .run(run.id, run.source, run.startedAt, run.finishedAt, JSON.stringify(run.checks), run.agentId, run.agentVersion, run.configurationHash);
  return run;
}
async function rejectStatus(fn, status) { await assert.rejects(fn, e => e.status === status); }
function privateResponse(response) { assert.match(response.headers.get('cache-control'), /private, no-store/); }
function noOperationalWrites() {
  const writes = sqlLog.filter(entry => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(entry.query));
  for (const entry of writes) assert.match(entry.query, /^\s*(?:INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM) monitoring_(?:settings|checks)\b/i);
  assert.equal(connectWrites, 0, 'observations never patch the provider');
  assert.equal(callReads, 0, 'runner never retrieves customer call details');
  assert.equal(networkAttempts, 0, 'no provider network traffic is possible');
}
const tests = [];
const test = (name, body) => tests.push({ name, body });

test('owner authorization and exact-origin checks precede database and provider operations', async () => {
  for (const [user, expected] of [[null, 401], [{ userId: 'other', email: 'other@example.com' }, 403]]) {
    currentUser = user;
    const response = await ownerRoute.POST(ownerRequest({ action: 'run' }));
    assert.equal(response.status, expected); privateResponse(response);
    assert.equal((await connectionRoute.GET(connectionRequest())).status, expected);
  }
  currentUser = { userId: 'synthetic-owner-id', email: 'owner@example.com' };
  runtime.OWNER_EMAIL = '';
  assert.equal((await ownerRoute.POST(ownerRequest({ action: 'run' }))).status, 403);
  assert.equal((await connectionRoute.GET(connectionRequest())).status, 403);
  runtime.OWNER_EMAIL = 'owner@example.com';
  for (const headers of [{ origin: 'https://cross-site.example' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await ownerRoute.POST(ownerRequest({ action: 'run' }, headers))).status, 403);
  }
  assert.equal((await ownerRoute.POST(new Request(origin + '/api/manage/monitoring', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"run"}',
  }))).status, 403);
  assert.equal((await connectionRoute.GET(connectionRequest({ 'sec-fetch-site': 'cross-site' }))).status, 403);
  assert.equal(events.length, 0); assert.equal(providerReads, 0); assert.equal(sqlLog.length, 0);
});

test('private connection download exposes the runner credential only after owner checks and disables caching', async () => {
  runtime.MONITORING_RUNNER_SECRET = 'too-short';
  assert.equal((await connectionRoute.GET(connectionRequest())).status, 409);
  runtime.MONITORING_RUNNER_SECRET = secret;
  const response = await connectionRoute.GET(connectionRequest());
  assert.equal(response.status, 200); privateResponse(response);
  assert.match(response.headers.get('content-disposition'), /attachment; filename="schurr-private-monitoring-connection.json"/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  const document = await response.json();
  assert.equal(document.availability.url, origin + '/api/health');
  assert.equal(document.checks.url, origin + '/api/monitoring/run');
  assert.equal(document.checks.headers.Authorization, 'Bearer ' + secret);
  assert.equal(document.checks.body, '{}');
  assert.equal(document.checks.recommendedIntervalSeconds, 300);
  assert.equal(events.length, 0, 'credential download does not query operational data');
});

test('runner rejects missing, malformed and incorrect bearer tokens before parsing or touching the database', async () => {
  for (const authorization of ['', 'Bearer wrong', 'Basic ' + secret, 'Bearer ' + 'z'.repeat(64), 'bearer ' + secret]) {
    const response = await runnerRoute.POST(new Request(origin + '/api/monitoring/run', {
      method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: 'not-json',
    }));
    assert.equal(response.status, 401); privateResponse(response);
    assert.equal((await response.text()).includes(secret), false);
  }
  runtime.MONITORING_RUNNER_SECRET = '';
  assert.equal((await runnerRoute.POST(runnerRequest())).status, 401);
  assert.equal(sqlLog.length, 0); assert.equal(events.length, 0);
});

test('runner accepts only a bounded empty JSON object and cannot request owner actions', async () => {
  for (const [body, status] of [[{ action: 'connect_events' }, 400], [{ action: 'settings', alertsEnabled: true }, 400], [[], 400], [null, 400], [{ pad: 'x'.repeat(1500) }, 413]]) {
    assert.equal((await runnerRoute.POST(runnerRequest(body))).status, status);
  }
  assert.equal((await runnerRoute.POST(runnerRequest({}, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal(events.length, 0); assert.equal(sqlLog.length, 0);
});

test('public health output is minimal and does not expose database failure diagnostics', async () => {
  let response = await healthRoute.GET();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: 'ok' });
  assert.match(response.headers.get('cache-control'), /no-store/);
  healthFailure = true; response = await healthRoute.GET();
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { status: 'unavailable' });
  assert.equal(providerReads, 0); assert.equal(alertDrains, 0);
});

test('stale, missing and future health evidence stays unknown; runner heartbeat has explicit freshness', async () => {
  const run = { checks: Object.keys(policy.MONITOR_CHECK_LABELS).map(key => check(key)), finishedAt: iso(clock) };
  assert.equal(policy.monitoringSummary(null, clock).status, 'unknown');
  assert.equal(policy.monitoringSummary(run, clock).status, 'pass');
  assert.equal(policy.monitoringSummary({ ...run, checks: [] }, clock).status, 'unknown');
  assert.equal(policy.monitoringSummary({ ...run, checks: [check('database')] }, clock).status, 'unknown');
  for (const finishedAt of ['invalid', iso(clock - policy.MONITOR_FRESH_MS - 1), iso(clock + 60001)]) {
    assert.equal(policy.monitoringSummary({ ...run, finishedAt, checks: [check('database', 'fail')] }, clock).status, 'unknown');
  }
  assert.equal(policy.monitoringSummary({ ...run, checks: [check('database', 'unknown')] }, clock).status, 'unknown');
  assert.equal(policy.monitoringSummary({ ...run, checks: [check('database', 'unknown'), check('phone_routing', 'fail')] }, clock).status, 'fail');
  const settings = { runnerConfigured: true, runnerExpected: true, lastRunnerAt: iso(clock) };
  assert.equal(policy.runnerCheck(settings, clock).status, 'pass');
  for (const override of [{ runnerConfigured: false }, { runnerExpected: false }, { lastRunnerAt: '' }]) {
    assert.equal(policy.runnerCheck({ ...settings, ...override }, clock).status, 'unknown');
  }
  for (const lastRunnerAt of [iso(clock - policy.MONITOR_FRESH_MS - 1), iso(clock + 60001)]) {
    assert.equal(policy.runnerCheck({ ...settings, lastRunnerAt }, clock).status, 'fail');
  }
});

test('settings use optimistic revisions and cannot enable an unconfigured runner', async () => {
  const initial = await seedSettings();
  assert.equal(initial.alertsEnabled, false); assert.equal(initial.runnerExpected, false);
  const saved = await monitoring.saveMonitoringSettings({ revision: initial.revision, alertsEnabled: true, runnerExpected: true });
  assert.equal(saved.revision, initial.revision + 1); assert.equal(saved.alertsEnabled, true); assert.equal(saved.runnerExpected, true);
  await rejectStatus(() => monitoring.saveMonitoringSettings({ revision: initial.revision, alertsEnabled: false, runnerExpected: false }), 409);
  assert.equal(settingsRow().alerts_enabled, 1);
  for (const override of [{ revision: '2' }, { alertsEnabled: 1 }, { runnerExpected: 'true' }]) {
    await rejectStatus(() => monitoring.saveMonitoringSettings({ revision: saved.revision, alertsEnabled: false, runnerExpected: false, ...override }), 400);
  }
  runtime.MONITORING_RUNNER_SECRET = '';
  await rejectStatus(() => monitoring.saveMonitoringSettings({ revision: saved.revision, alertsEnabled: false, runnerExpected: true }), 409);
  assert.equal(settingsRow().revision, saved.revision);
});

test('baseline approval requires recent selected evidence, confirmation, re-read matching configuration and optimistic revision', async () => {
  const settings = await seedSettings(); const run = seedRun();
  const input = { confirmed: true, runId: run.id, revision: settings.revision };
  await rejectStatus(() => monitoring.approveMonitoringBaseline({ ...input, confirmed: false }), 400);
  await rejectStatus(() => monitoring.approveMonitoringBaseline({ ...input, runId: 'not-an-id' }), 400);
  await rejectStatus(() => monitoring.approveMonitoringBaseline({ ...input, runId: webcrypto.randomUUID() }), 409);
  assert.equal(providerReads, 0);
  clock += policy.MONITOR_BASELINE_MAX_AGE_MS + 1;
  await rejectStatus(() => monitoring.approveMonitoringBaseline(input), 409); assert.equal(providerReads, 0);
  clock = initialClock;
  for (const key of ['configurationHash', 'agentId', 'agentVersion']) {
    const original = observed[key]; observed[key] = typeof original === 'number' ? original + 1 : original + '-changed';
    await rejectStatus(() => monitoring.approveMonitoringBaseline(input), 409); observed[key] = original;
  }
  for (const key of coreKeys) {
    for (const status of ['fail', 'unknown']) {
      observed.checks = coreKeys.map(k => check(k, k === key ? status : 'pass'));
      await rejectStatus(() => monitoring.approveMonitoringBaseline(input), 409);
    }
  }
  observed.checks = coreKeys.map(key => check(key));
  await rejectStatus(() => monitoring.approveMonitoringBaseline({ ...input, revision: input.revision + 1 }), 409);
  sql.prepare("UPDATE monitoring_settings SET lease_token='other-run',lease_until=?").run(clock + 1000);
  await rejectStatus(() => monitoring.approveMonitoringBaseline(input), 409);
  sql.prepare("UPDATE monitoring_settings SET lease_token='',lease_until=0").run();
  const reads = providerReads; const approved = await monitoring.approveMonitoringBaseline(input);
  assert.equal(providerReads, reads + 1); assert.equal(approved.baselineHash, run.configurationHash);
  assert.equal(approved.baselineAgentId, run.agentId); assert.equal(approved.baselineAgentVersion, run.agentVersion);
  assert.equal(approved.revision, input.revision + 1);
  await rejectStatus(() => monitoring.approveMonitoringBaseline(input), 409);
  assert.equal(settingsRow().revision, approved.revision);
});

test('baseline approval refuses a provider observation missing a required routing or tool check', async () => {
  const settings = await seedSettings(), run = seedRun();
  observed.checks = observed.checks.filter(c => c.key !== 'phone_routing');
  await rejectStatus(() => monitoring.approveMonitoringBaseline({ confirmed: true, runId: run.id, revision: settings.revision }), 409);
  assert.equal(settingsRow().baseline_hash, '');
});

test('baseline approval refuses evidence superseded while re-reading the provider', async () => {
  const settings = await seedSettings(), run = seedRun();
  observeHook = async () => { clock += 1000; seedRun(); };
  await rejectStatus(() => monitoring.approveMonitoringBaseline({ confirmed: true, runId: run.id, revision: settings.revision }), 409);
  assert.equal(settingsRow().baseline_hash, '');
  assert.equal(settingsRow().revision, settings.revision);
});

test('runner records evidence and heartbeat before incident/alert work without call or customer writes', async () => {
  await seedSettings();
  sql.prepare("UPDATE monitoring_settings SET baseline_hash=?").run(observed.configurationHash);
  observed.checks[0].summary = 'Synthetic caller Private Name, private@example.com, +12025550199; ' + secret;
  const response = await runnerRoute.POST(runnerRequest());
  assert.equal(response.status, 200); privateResponse(response);
  assert.deepEqual(await response.json(), { ok: true, status: 'ok', checkedAt: iso(clock) });
  const run = await monitoring.latestMonitoringRun();
  assert.equal(run.source, 'runner'); assert.equal(count('monitoring_checks'), 1);
  assert.equal(run.checks.find(c => c.key === 'configuration_drift').status, 'pass');
  assert.equal(run.checks.find(c => c.key === 'monitor_runner').status, 'pass');
  assert.equal(settingsRow().last_runner_at, run.finishedAt); assert.equal(settingsRow().runner_expected, 1);
  assert.equal(settingsRow().lease_token, ''); assert.equal(settingsRow().lease_until, 0);
  const insert = sqlLog.findIndex(e => /^INSERT INTO monitoring_checks/.test(e.query));
  const heartbeat = sqlLog.findIndex(e => /^UPDATE monitoring_settings SET last_runner_at/.test(e.query));
  assert.ok(insert >= 0 && heartbeat > insert);
  assert.ok(events.indexOf('observe') < events.indexOf('incidents'));
  assert.ok(events.indexOf('incidents') < events.indexOf('alerts'));
  assert.equal(providerReads, 1); assert.equal(alertDrains, 1); await Promise.all(background);
  noOperationalWrites();
});

test('runner reports required provider failures or missing checks with minimal unavailable output', async () => {
  for (const missing of [false, true]) {
    reset();
    observed.checks = missing ? observed.checks.filter(c => c.key !== 'voice_tools') : observed.checks.map(c => c.key === 'phone_routing' ? check(c.key, 'fail') : c);
    const response = await runnerRoute.POST(runnerRequest());
    assert.equal(response.status, 503, missing ? 'missing required check is unavailable' : 'failed required check is unavailable');
    assert.deepEqual(await response.json(), { ok: false, status: 'needs_review', checkedAt: iso(clock) });
    noOperationalWrites();
  }
});

test('local booking health reads the real main singleton and reports honest saved evidence', async () => {
  const config = { ...plain(bookingPolicy.defaultBookingConfig()), enabled: true };
  sql.prepare("INSERT INTO booking_settings(id,config,revision,updated_at) VALUES('main',?,1,?)").run(JSON.stringify(config), iso(clock));
  let run = await monitoring.runMonitoring('owner', true);
  let booking = run.checks.find(c => c.key === 'booking_setup');
  assert.equal(booking.status, 'pass'); assert.match(booking.summary, /not a live booking test/i);
  const email = run.checks.find(c => c.key === 'email_connection');
  assert.equal(email.status, 'pass'); assert.match(email.summary, /delivery has not been retested/i);
  sql.prepare("UPDATE booking_settings SET config='{broken' WHERE id='main'").run();
  clock += 1000; run = await monitoring.runMonitoring('owner', true);
  assert.equal(run.checks.find(c => c.key === 'booking_setup').status, 'fail');
});

test('drift, provider outage and manual phone evidence preserve fail/unknown distinctions', async () => {
  await seedSettings();
  sql.prepare("UPDATE monitoring_settings SET baseline_hash='prior-baseline'").run();
  latestPhone = { agentId: observed.agentId, agentVersion: observed.agentVersion, testedAt: iso(clock),
    catalogueHash: 'fictional-catalogue-hash', naturalness: 5, interruptions: 5, pacing: 5, results: [{ outcome: 'pass' }] };
  let run = await monitoring.runMonitoring('owner', true);
  assert.equal(run.checks.find(c => c.key === 'configuration_drift').status, 'fail');
  assert.equal(run.checks.find(c => c.key === 'phone_audition').status, 'pass');
  assert.match(run.checks.find(c => c.key === 'phone_audition').summary, /Audio is not automatically verified/);
  latestPhone.naturalness = 2; clock += 1000; run = await monitoring.runMonitoring('owner', true);
  assert.equal(run.checks.find(c => c.key === 'phone_audition').status, 'fail');
  latestPhone.naturalness = null; clock += 1000; run = await monitoring.runMonitoring('owner', true);
  assert.equal(run.checks.find(c => c.key === 'phone_audition').status, 'unknown');
  latestPhone.naturalness = 5; latestPhone.results = []; clock += 1000; run = await monitoring.runMonitoring('owner', true);
  assert.equal(run.checks.find(c => c.key === 'phone_audition').status, 'unknown');
  latestPhone.results = [{ outcome: 'pass' }];
  latestPhone.naturalness = 5; latestPhone.agentVersion++; clock += 1000; run = await monitoring.runMonitoring('owner', true);
  assert.equal(run.checks.find(c => c.key === 'phone_audition').status, 'unknown');
  observeHook = async () => { throw Error('synthetic provider key or body must stay private'); };
  clock += 1000; run = await monitoring.runMonitoring('runner', true);
  assert.equal(run.checks.find(c => c.key === 'retell_connection').status, 'unknown');
  assert.equal(run.checks.find(c => c.key === 'configuration_drift').status, 'unknown');
  assert.equal(JSON.stringify(run).includes('synthetic provider key'), false);
  assert.equal(settingsRow().lease_token, '');
});

test('cooldown reuses runner evidence and refreshes heartbeat while recovering incident and alert work', async () => {
  const initial = await seedSettings();
  const ownerRun = await monitoring.runMonitoring('owner', true);
  clock += 1000;
  const run = await monitoring.runMonitoring('runner');
  assert.notEqual(run.id, ownerRun.id, 'first runner activity must replace an unverified runner check');
  assert.equal(settingsRow().revision, initial.revision + 1, 'first observed runner invalidates an older settings draft');
  const revision = settingsRow().revision, reads = providerReads, drains = alertDrains; clock += 5000;
  const cached = await monitoring.runMonitoring('runner');
  assert.equal(cached.id, run.id); assert.equal(count('monitoring_checks'), 2);
  assert.equal(providerReads, reads); assert.equal(alertDrains, drains + 1);
  assert.equal(settingsRow().last_runner_at, iso(clock)); assert.equal(settingsRow().runner_expected, 1);
  assert.equal(settingsRow().revision, revision, 'repeated heartbeats do not churn settings revisions');
  await rejectStatus(() => monitoring.saveMonitoringSettings({ revision: initial.revision, alertsEnabled: false, runnerExpected: false }), 409);
  clock += 30000; await monitoring.runMonitoring('runner');
  assert.equal(providerReads, reads + 1); assert.equal(count('monitoring_checks'), 3);
});

test('concurrent runs hold one lease; expired evidence cannot save or release another owner lease', async () => {
  await seedSettings();
  sql.prepare("UPDATE monitoring_settings SET lease_token='existing',lease_until=?").run(clock + 1000);
  await rejectStatus(() => monitoring.runMonitoring('runner', true), 409); assert.equal(providerReads, 0);
  sql.prepare('UPDATE monitoring_settings SET lease_until=?').run(clock - 1);
  let releaseRead, enteredRead;
  const entered = new Promise(resolve => { enteredRead = resolve; });
  observeHook = async () => { enteredRead(); await new Promise(resolve => { releaseRead = resolve; }); };
  const first = monitoring.runMonitoring('owner', true); await entered;
  await rejectStatus(() => monitoring.runMonitoring('runner', true), 409);
  assert.equal(providerReads, 1); releaseRead(); await first;
  assert.equal(count('monitoring_checks'), 1); assert.equal(settingsRow().lease_token, '');
  reset(); await seedSettings();
  observeHook = async () => {
    clock += 120001;
    sql.prepare("UPDATE monitoring_settings SET lease_token='replacement-owner',lease_until=?").run(clock + 120000);
  };
  await rejectStatus(() => monitoring.runMonitoring('runner', true), 409);
  assert.equal(count('monitoring_checks'), 0); assert.equal(alertDrains, 0);
  assert.equal(events.includes('incidents'), false); assert.equal(settingsRow().last_runner_at, '');
  assert.equal(settingsRow().lease_token, 'replacement-owner');
});

test('latest run ordering is deterministic and retention removes only expired saved evidence', async () => {
  await seedSettings();
  seedRun({ id: '00000000-0000-4000-8000-000000000001', finishedAt: iso(clock - 31 * 86400000) });
  seedRun({ id: '00000000-0000-4000-8000-000000000002', finishedAt: iso(clock - 29 * 86400000) });
  seedRun({ id: '00000000-0000-4000-8000-000000000003', finishedAt: iso(clock - 60000) });
  const last = seedRun({ id: '00000000-0000-4000-8000-000000000004', finishedAt: iso(clock - 60000) });
  assert.equal((await monitoring.latestMonitoringRun()).id, last.id);
  await monitoring.runMonitoring('owner', true);
  assert.equal(count('monitoring_checks'), 4);
  assert.equal(sql.prepare('SELECT id FROM monitoring_checks WHERE id=?').get('00000000-0000-4000-8000-000000000001'), undefined);
  assert.ok(sql.prepare('SELECT id FROM monitoring_checks WHERE id=?').get('00000000-0000-4000-8000-000000000002'));
});

test('owner-only event connection action performs the explicit provider update before a forced new check', async () => {
  await monitoring.runMonitoring('owner', true);
  const before = count('monitoring_checks'); events = [];
  const response = await ownerRoute.POST(ownerRequest({ action: 'connect_events' }));
  assert.equal(response.status, 200); privateResponse(response);
  assert.equal(connectWrites, 1); assert.equal(count('monitoring_checks'), before + 1);
  assert.ok(events.indexOf('connect') < events.indexOf('observe'));
  assert.equal(networkAttempts, 0);
});

test('pending call recovery marks its revision only after every incident succeeds and retries failed work', async () => {
  const callId = 'call_fictional_pending';
  monitoredCalls.set(callId, { callId, observationRevision: 3, reconciledRevision: 1, flagCodes: ['tool_failure', 'call_failed'] });
  callIncidentHook = async (_id, kind) => { if (kind === 'call_failed') throw Error('synthetic incident write failure'); };
  await assert.rejects(() => monitoring.runMonitoring('runner'), /synthetic incident write failure/);
  assert.equal(callMarks.length, 0, 'partially opened incidents must leave durable recovery pending');
  assert.equal(monitoredCalls.get(callId).reconciledRevision, 1);
  assert.equal(providerReads, 0, 'pending recovery happens before a fresh provider observation');
  assert.equal(count('monitoring_checks'), 0);
  callIncidentHook = null; events = [];
  await monitoring.runMonitoring('runner');
  assert.deepEqual(callMarks, [{ callId, revision: 3 }]);
  assert.equal(monitoredCalls.get(callId).reconciledRevision, 3);
  const first = events.indexOf('call-incident:' + callId + ':tool_failure');
  const second = events.indexOf('call-incident:' + callId + ':call_failed');
  const mark = events.indexOf('mark-call:' + callId + ':3');
  assert.ok(first >= 0 && second > first && mark > second);
  assert.ok(events.indexOf('observe') > mark);
  assert.equal(connectWrites, 0); assert.equal(networkAttempts, 0);
});

test('call reconciliation uses the observed revision so a concurrent update stays pending and recovers even during cooldown', async () => {
  const run = await monitoring.runMonitoring('runner');
  const callId = 'call_fictional_revision';
  monitoredCalls.set(callId, { callId, observationRevision: 1, reconciledRevision: 0, flagCodes: ['tool_failure'] });
  callIncidentHook = async () => {
    const current = monitoredCalls.get(callId);
    current.observationRevision = 2; current.flagCodes.push('call_failed');
    callIncidentHook = null;
  };
  clock += 1000;
  let cached = await monitoring.runMonitoring('runner');
  assert.equal(cached.id, run.id); assert.equal(providerReads, 1);
  assert.deepEqual(callMarks, [{ callId, revision: 1 }], 'CAS must receive the revision originally read');
  assert.equal(monitoredCalls.get(callId).reconciledRevision, 0, 'new observation is not marked by old reconciliation');
  events = []; clock += 1000;
  cached = await monitoring.runMonitoring('runner');
  assert.equal(cached.id, run.id); assert.equal(providerReads, 1);
  assert.deepEqual(callMarks, [{ callId, revision: 1 }, { callId, revision: 2 }]);
  assert.equal(monitoredCalls.get(callId).reconciledRevision, 2);
  assert.ok(events.indexOf('call-incident:' + callId + ':call_failed') < events.indexOf('mark-call:' + callId + ':2'));
  const reads = callReads; clock += 1000;
  await monitoring.runMonitoring('runner');
  assert.equal(callReads, reads, 'completed observation is not fetched again');
  assert.equal(connectWrites, 0); assert.equal(networkAttempts, 0);
});

(async () => {
  let passed = 0;
  for (const { name, body } of tests) {
    reset();
    try { await body(); await Promise.all(background); passed++; console.log('PASS ' + name); }
    catch (error) { process.exitCode = 1; console.error('FAIL ' + name); console.error(error); }
  }
  console.log(`${passed}/${tests.length} monitoring core groups passed (synthetic SQLite; no network).`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sql.close());
