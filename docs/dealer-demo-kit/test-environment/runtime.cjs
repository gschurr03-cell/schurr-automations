// Isolated demonstration adapters around the unchanged production intake/task code.
// Only fixed fictional fixtures are exposed by the CLI or optional loopback server.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto, createHash, createHmac, randomBytes } = require('node:crypto');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '../../..');
const SCENARIOS = ['normal', 'staff-unavailable', 'task-write-failure', 'notification-failure'];
const stableId = value => { const h = createHash('sha256').update(value).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const MARKER = 'schurr-fictional-dealer-test-v1';

function openSandbox(stateDirectory = path.join(__dirname, '.runtime')) {
  const directory = path.resolve(stateDirectory), marker = path.join(directory, 'test-environment.json');
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(marker)) {
    if (fs.readdirSync(directory).length) throw new Error('Use an empty directory reserved for this fictional demonstration.');
    fs.writeFileSync(marker, JSON.stringify({ kind: MARKER, productionData: false }, null, 2));
  }
  if (JSON.parse(fs.readFileSync(marker, 'utf8')).kind !== MARKER) throw new Error('This is not a marked fictional test environment.');
  const filename = path.join(directory, 'fictional-demo.sqlite');
  const fresh = !fs.existsSync(filename), sql = new DatabaseSync(filename);
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  if (fresh) {
    for (const file of fs.readdirSync(path.join(ROOT, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(ROOT, 'drizzle', file), 'utf8'));
    // Test-only metadata and local inbox; these are never added to app migrations.
    sql.exec(`CREATE TABLE demo_runs (event_key TEXT PRIMARY KEY, scenario TEXT NOT NULL, task_id TEXT NOT NULL, lead_id TEXT, details TEXT NOT NULL, result TEXT NOT NULL DEFAULT 'not_run', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE demo_inbox (message_key TEXT PRIMARY KEY, event_key TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);`);
  }
  let failTaskWrite = false;
  class Statement {
    constructor(query, values = []) { this.query = query; this.values = values; }
    bind(...values) { return new Statement(this.query, values); }
    execute(method) {
      if (failTaskWrite && /INSERT INTO crm_tasks\b/.test(this.query)) { failTaskWrite = false; throw new Error('Injected local task-destination failure.'); }
      return sql.prepare(this.query)[method](...this.values);
    }
    async first() { return this.execute('get') || null; }
    async all() { return { results: this.execute('all') }; }
    async run() { return this.execute('run'); }
  }
  const DB = {
    prepare(query) { return new Statement(query); },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = statements.map(statement => ({ results: statement.execute('all') })); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  // Fresh synthetic authentication material is not a production credential.
  const runtime = { DB, VOICE_INGEST_SECRET: randomBytes(32).toString('hex') };
  const modules = new Map();
  const alertAdapter = {
    OWNER_ALERT_FROM: 'Fictional demonstration <no-send@example.test>', OWNER_ALERT_EMAIL: 'test-inbox@example.test',
    ownerAlertPayload(leadId, lead) { return JSON.stringify({ from: 'Fictional demonstration <no-send@example.test>', to: ['test-inbox@example.test'], subject: 'Local fixture captured', text: lead.summary, leadId, transport: 'disabled-local-only' }); },
    websiteOwnerAlertPayload() { throw new Error('Website intake is outside this test kit.'); },
  };
  function load(relative) {
    if (relative === 'lib/owner-alert-content.ts') return alertAdapter;
    if (modules.has(relative)) return modules.get(relative);
    if (!relative.startsWith('lib/') || relative.includes('..')) throw new Error('Only repository library modules may be loaded.');
    const module = { exports: {} }; modules.set(relative, module.exports);
    const requireLocal = name => {
      if (name === 'cloudflare:workers') return { env: runtime, waitUntil() { throw new Error('Background provider work is disabled.'); } };
      if (name.startsWith('./')) return load(path.posix.join(path.posix.dirname(relative), name + '.ts'));
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      throw new Error('External module access is disabled in the test runtime: ' + name);
    };
    const compiled = ts.transpileModule(fs.readFileSync(path.join(ROOT, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    vm.runInNewContext(compiled.outputText, {
      module, exports: module.exports, require: requireLocal, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Date, URL, URLSearchParams, Request, Response, btoa, atob,
      fetch() { throw new Error('All network calls are disabled in this test environment.'); },
      console: { error() {} },
    }, { filename: relative });
    return module.exports;
  }
  const voice = load('lib/voice-intake.ts'), crm = load('lib/crm.ts');
  function notification(eventKey, kind, recipient, subject, body) {
    if (!['jordan.lee@example.test', 'taylor@example.test'].includes(recipient)) throw new Error('Only fictional inbox recipients are allowed.');
    sql.prepare('INSERT INTO demo_inbox(message_key,event_key,recipient,subject,body,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(message_key) DO NOTHING').run(eventKey + ':' + kind, eventKey, recipient, subject, body, new Date().toISOString());
  }
  function snapshot() {
    const runs = sql.prepare('SELECT * FROM demo_runs ORDER BY created_at,event_key').all().map(row => {
      const details = JSON.parse(row.details);
      const lead = row.lead_id ? sql.prepare('SELECT id,name,phone FROM crm_leads WHERE id=?').get(row.lead_id) || null : null;
      const task = sql.prepare('SELECT id,title,due_date,completed_at,created_at FROM crm_tasks WHERE id=?').get(row.task_id) || null;
      return { eventKey: row.event_key, scenario: row.scenario, result: row.result, error: row.error, details, lead, task, callbackStatus: task ? task.completed_at ? 'Completed by staff' : 'Callback pending' : 'Callback not secured', createdAt: row.created_at, updatedAt: row.updated_at };
    });
    return { mode: MARKER, readAt: new Date().toISOString(), fictional: true, persistedToDisk: true, actualPhoneCall: 'NOT TESTED', externalNotificationDelivery: 'NOT TESTED', notificationTransport: 'Local simulated inbox only', runs, notifications: sql.prepare('SELECT * FROM demo_inbox ORDER BY created_at,message_key').all() };
  }
  async function run(scenario, retry = false) {
    if (!SCENARIOS.includes(scenario)) throw new Error('Choose a fixed fictional scenario: ' + SCENARIOS.join(', '));
    const eventKey = 'fictional-dealer:' + scenario, now = new Date().toISOString();
    const assigned = scenario === 'staff-unavailable' ? 'Taylor Example · test duty manager' : 'Jordan Lee · test salesperson';
    const details = { buyer: 'Alex Morgan · fictional buyer', vehicle: 'Graphite sample crossover · Stock D214 · fictional inventory', question: 'Is it available, and can I arrange a visit?', requestedWindow: '3–4 p.m. dealership local time, requested only', assigned, nextAction: 'Confirm vehicle availability and final price with staff, then contact the buyer.', appointment: 'Not booked', transfer: scenario === 'staff-unavailable' ? 'Test salesperson unavailable; callback assigned to test duty manager. No live transfer.' : 'No live transfer attempted', phone: '+12025550146' };
    const taskId = stableId(eventKey + ':callback');
    sql.prepare('INSERT INTO demo_runs(event_key,scenario,task_id,details,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING').run(eventKey, scenario, taskId, JSON.stringify(details), now, now);
    const saved = sql.prepare('SELECT * FROM demo_runs WHERE event_key=?').get(eventKey);
    const input = { callSid: 'CA' + createHash('sha256').update(eventKey).digest('hex').slice(0, 32), name: details.buyer, business: 'Northline Demo Motors · fictional dealership', email: '', phone: details.phone, service: 'general', summary: `${details.vehicle}. ${details.question} Requested callback: ${details.requestedWindow}. Assigned: ${details.assigned}. ${details.nextAction}`, preferredContact: 'phone', callbackConsent: true, consentEvidence: 'Fictional fixture: Alex Morgan confirms this test number and permits one callback about the sample vehicle.' };
    try {
      const body = JSON.stringify(input), time = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', runtime.VOICE_INGEST_SECRET).update(time + '.' + body).digest('hex');
      const verified = await voice.readVoiceEvent(new Request('https://local-demo.invalid/api/voice', { method: 'POST', body, headers: { 'x-schurr-timestamp': time, 'x-schurr-signature': signature } }));
      const captured = await voice.captureVoiceLead(verified);
      sql.prepare('UPDATE demo_runs SET lead_id=? WHERE event_key=?').run(captured.leadId, eventKey);
      failTaskWrite = scenario === 'task-write-failure' && !retry;
      await crm.mutateCrm({ action: 'createTask', mutationId: taskId, leadId: captured.leadId, title: `${assigned}: confirm Stock D214 and call Alex Morgan; requested 3–4 p.m.`, dueDate: saved.created_at.slice(0, 10) });
      if (scenario === 'notification-failure' && !retry) throw new Error('Injected local inbox connection failure. Callback task remains saved; notification was not delivered.');
      const recipient = scenario === 'staff-unavailable' ? 'taylor@example.test' : 'jordan.lee@example.test';
      notification(eventKey, 'callback', recipient, 'Callback pending: Alex Morgan / Stock D214', `${assigned}\n${details.question}\nRequested window: ${details.requestedWindow}\n${details.nextAction}\nTask: ${taskId}\nNo appointment is booked. Local inbox simulation only.`);
      sql.prepare("UPDATE demo_runs SET result='callback_saved',error='',updated_at=? WHERE event_key=?").run(now, eventKey);
    } catch (error) {
      const hasTask = Boolean(sql.prepare('SELECT id FROM crm_tasks WHERE id=?').get(taskId));
      const fallback = hasTask ? 'The callback task is saved, but the local notification was not delivered. Review the staff task directly; do not mark the buyer reached.' : 'The callback task could not be saved. No callback or visit is secured. Ask the buyer to use the dealership’s verified main-desk number; the test duty manager must review the exception.';
      sql.prepare("UPDATE demo_runs SET result=?,error=?,updated_at=? WHERE event_key=?").run(hasTask ? 'notification_failed' : 'task_failed', fallback, now, eventKey);
      if (!hasTask) notification(eventKey, 'exception', 'taylor@example.test', 'Test exception: callback not secured', fallback);
      if (!/Injected local/.test(String(error.message))) throw error;
    } finally { failTaskWrite = false; }
    return snapshot();
  }
  return { run, snapshot, close: () => sql.close(), directory, filename };
}

module.exports = { openSandbox, SCENARIOS, ROOT };
