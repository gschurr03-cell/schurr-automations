const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const kit = path.join(root, 'docs/dealer-demo-kit/test-environment');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'schurr-fictional-dealer-'));
const cli = (command, scenario) => {
  const result = spawnSync(process.execPath, [path.join(kit, 'run.cjs'), command, ...(scenario ? [scenario] : []), '--state', directory], { encoding: 'utf8', timeout: 15000, env: { ...process.env, RESEND_API_KEY: 'must-never-be-used', RETELL_API_KEY: 'must-never-be-used' } });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
};
const reports = [];
const pass = message => { reports.push(message); console.log('PASS ' + message); };
try {
  let state = cli('run', 'normal');
  const normal = state.runs[0], identity = { lead: normal.lead.id, task: normal.task.id };
  assert.equal(normal.callbackStatus, 'Callback pending'); assert.equal(normal.details.appointment, 'Not booked');
  assert.match(normal.details.assigned, /Jordan Lee/); assert.match(normal.details.requestedWindow, /requested only/);
  assert.equal(state.notifications.length, 1); assert.equal(state.notifications[0].recipient, 'jordan.lee@example.test');
  state = cli('inspect'); assert.equal(state.runs[0].lead.id, identity.lead); assert.equal(state.runs[0].task.id, identity.task); assert.equal(state.notifications.length, 1);
  state = cli('run', 'normal'); assert.equal(state.runs.length, 1); assert.equal(state.notifications.length, 1); assert.equal(state.runs[0].task.id, identity.task);
  pass('real intake/task functions persist one callback and local notification across separate processes and duplicate submissions');

  state = cli('run', 'staff-unavailable');
  const fallback = state.runs.find(run => run.scenario === 'staff-unavailable');
  assert.match(fallback.details.assigned, /Taylor Example/); assert.equal(fallback.callbackStatus, 'Callback pending'); assert.match(fallback.details.transfer, /No live transfer/);
  assert.equal(state.notifications.find(item => item.event_key === fallback.eventKey).recipient, 'taylor@example.test');
  pass('unavailable fictional salesperson routes a pending callback to the fictional duty manager, without claiming a transfer');

  state = cli('run', 'task-write-failure');
  const failed = state.runs.find(run => run.scenario === 'task-write-failure');
  assert.equal(failed.task, null); assert.ok(failed.lead); assert.equal(failed.callbackStatus, 'Callback not secured'); assert.match(failed.error, /verified main-desk number/);
  const sql = new DatabaseSync(path.join(directory, 'fictional-demo.sqlite'), { readOnly: true });
  assert.equal(sql.prepare('SELECT count(*) n FROM crm_mutations WHERE id=(SELECT task_id FROM demo_runs WHERE scenario=?)').get('task-write-failure').n, 0, 'Task transaction receipt must roll back with its failed task write');
  sql.close();
  const failureNotices = state.notifications.filter(item => item.event_key === failed.eventKey);
  assert.equal(failureNotices.length, 1); assert.match(failureNotices[0].subject, /not secured/);
  state = cli('retry', 'task-write-failure'); assert.equal(state.runs.find(run => run.scenario === 'task-write-failure').callbackStatus, 'Callback pending');
  pass('injected task-write failure rolls back the task receipt, preserves captured inquiry, shows honest fallback, and retries safely');

  state = cli('run', 'notification-failure');
  const noNotice = state.runs.find(run => run.scenario === 'notification-failure');
  assert.ok(noNotice.task); assert.equal(noNotice.result, 'notification_failed'); assert.match(noNotice.error, /not delivered/);
  assert.equal(state.notifications.filter(item => item.event_key === noNotice.eventKey).length, 0);
  state = cli('retry', 'notification-failure'); state = cli('retry', 'notification-failure');
  assert.equal(state.notifications.filter(item => item.event_key === noNotice.eventKey).length, 1);
  pass('local inbox failure never claims delivery, preserves the callback, and duplicate retry creates only one local notice');

  const persisted = new DatabaseSync(path.join(directory, 'fictional-demo.sqlite'), { readOnly: true });
  for (const table of ['owner_alert_connection', 'retell_connection', 'booking_settings', 'appointments']) assert.equal(persisted.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0, table);
  assert.equal(persisted.prepare('SELECT count(*) n FROM crm_leads').get().n, 4); assert.equal(persisted.prepare('SELECT count(*) n FROM crm_tasks').get().n, 4);
  for (const row of persisted.prepare('SELECT payload,status FROM owner_alerts').all()) {
    assert.deepEqual(JSON.parse(row.payload).to, ['test-inbox@example.test']); assert.equal(row.status, 'pending');
  }
  persisted.close();
  assert.equal(state.actualPhoneCall, 'NOT TESTED'); assert.equal(state.externalNotificationDelivery, 'NOT TESTED');
  const exported = cli('export'); const html = fs.readFileSync(exported.output, 'utf8');
  assert.match(html, /Exported snapshot/); assert.match(html, /No email or text message was sent/); assert.match(html, /NOT TESTED|Not tested/);
  const { render } = require(path.join(kit, 'view.cjs'));
  const hostile = JSON.parse(JSON.stringify(state)); hostile.runs[0].details.vehicle = '<script>alert(1)</script>';
  assert.ok(!render(hostile).includes('<script>alert(1)</script>'));
  const invalid = spawnSync(process.execPath, [path.join(kit, 'run.cjs'), 'run', 'real-customer', '--state', directory], { encoding: 'utf8', timeout: 15000 });
  assert.equal(invalid.status, 1);
  pass('provider connections and appointments remain empty, runtime ignores ambient provider keys, fixed fixture guard and snapshot escaping hold');
  const evidence = { checkedAt: new Date().toISOString(), checks: reports, actualPhoneCall: 'NOT TESTED', externalNotificationDelivery: 'NOT TESTED', browserAndLocalServer: 'NOT TESTED; optional server was not started', productionDataAccessed: false, externalMessagesSent: 0, sourceHashes: Object.fromEntries(['lib/voice-intake.ts', 'lib/crm.ts', 'lib/inquiries.ts', 'docs/dealer-demo-kit/test-environment/runtime.cjs'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
  fs.writeFileSync(path.join(kit, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('All 5 isolated dealer demo groups passed. Test database removed after verification.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
