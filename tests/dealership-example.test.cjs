const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'site-html/examples/dealership/inquire/index.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'public/dealership-example.js'), 'utf8');
const selectIds = ['nx-buyer', 'nx-question', 'nx-method', 'nx-window'];
const recordIds = ['nx-record-buyer', 'nx-record-contact', 'nx-record-question', 'nx-record-window', 'nx-record-status', 'nx-record-action', 'nx-inquiry-status'];
const selectOptions = Object.fromEntries(selectIds.map(id => {
  const select = html.match(new RegExp(`<select\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(select, `Missing select ${id}`);
  return [id, Array.from(select[1].matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>/g), match => match[1])];
}));

function elementText(id) {
  const match = html.match(new RegExp(`<([a-z0-9]+)\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/\\1>`));
  assert.ok(match, `Missing source element ${id}`);
  return match[2].replace(/<[^>]+>/g, '').trim();
}

function harness(missingId) {
  const nodes = {};
  for (const id of [...selectIds, ...recordIds, 'nx-inquiry-fields', 'nx-simulate', 'nx-reset', 'nx-preview-heading']) {
    if (id === missingId) continue;
    nodes[id] = {
      value: selectOptions[id]?.[0],
      textContent: recordIds.includes(id) ? elementText(id) : '',
      disabled: ['nx-inquiry-fields', 'nx-simulate', 'nx-reset'].includes(id),
      listeners: new Map(),
      focused: false,
      addEventListener(event, handler) { this.listeners.set(event, handler); },
      focus() { this.focused = true; }
    };
  }
  const external = [];
  const block = name => (...args) => {
    external.push({ name, args });
    throw new Error(`Public demo attempted forbidden external operation: ${name}`);
  };
  const storage = name => new Proxy({}, {
    get() { return block(name)(); },
    set() { return block(name)(); }
  });
  const document = { getElementById: id => nodes[id] || null };
  Object.defineProperty(document, 'cookie', { get: block('cookie read'), set: block('cookie write') });
  const sandbox = {
    document,
    fetch: block('fetch'),
    XMLHttpRequest: block('XMLHttpRequest'),
    WebSocket: block('WebSocket'),
    EventSource: block('EventSource'),
    localStorage: storage('localStorage'),
    sessionStorage: storage('sessionStorage'),
    indexedDB: storage('indexedDB'),
    navigator: { sendBeacon: block('sendBeacon') },
    location: { assign: block('navigation'), replace: block('navigation') },
    open: block('window.open')
  };
  sandbox.window = sandbox;
  vm.runInNewContext(controller, sandbox, { filename: 'dealership-example.js' });
  return {
    nodes,
    external,
    trigger(id, event) {
      const listener = nodes[id]?.listeners.get(event);
      assert.equal(typeof listener, 'function', `Missing ${event} handler on ${id}`);
      listener();
    }
  };
}

test('HTML is an honest readable no-JavaScript fallback with no submission path', () => {
  for (const id of ['nx-inquiry-fields', 'nx-simulate', 'nx-reset']) {
    const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0];
    assert.ok(tag && /\bdisabled\b/.test(tag), `${id} must start disabled`);
  }
  for (const button of html.matchAll(/<button\b[^>]*>/g)) assert.match(button[0], /type="button"/);
  assert.doesNotMatch(html, /<(form|input|textarea)\b/i);
  assert.match(html, /<noscript>[\s\S]*Controls are disabled, and nothing can be submitted\.[\s\S]*<\/noscript>/);
  assert.equal(elementText('nx-record-status'), 'Preview · not submitted');
  assert.equal(elementText('nx-record-buyer'), 'Alex Morgan · fictional');
  assert.match(elementText('nx-record-window'), /3–4 p\.m\..*Requested only\./);
  assert.match(html, /Not booked\. Any visit needs staff confirmation\./);
});

test('all 36 supplied choices render a useful pending handoff without any network or storage operation', () => {
  const h = harness();
  for (const id of ['nx-inquiry-fields', 'nx-simulate', 'nx-reset']) assert.equal(h.nodes[id].disabled, false);
  const expectedQuestions = {
    availability: 'Please confirm vehicle availability and the current details.',
    visit: 'I would like to discuss arranging a visit to see this vehicle.',
    history: 'I would like staff to explain the vehicle history information.'
  };
  const expectedWindows = { afternoon: /3–4 p\.m\..*Requested only\./, morning: /9 a\.m\.–noon.*Requested only\./, flexible: /Staff must confirm/ };
  let combinations = 0;
  for (const buyer of selectOptions['nx-buyer']) {
    for (const question of selectOptions['nx-question']) {
      for (const method of selectOptions['nx-method']) {
        for (const window of selectOptions['nx-window']) {
          for (const [id, value] of Object.entries({ 'nx-buyer': buyer, 'nx-question': question, 'nx-method': method, 'nx-window': window })) h.nodes[id].value = value;
          h.trigger('nx-buyer', 'change');
          assert.equal(h.nodes['nx-record-status'].textContent, 'Preview · not submitted');
          h.trigger('nx-simulate', 'click');
          const identity = buyer === 'alex' ? { name: 'Alex Morgan', phone: '202-555-0146', email: 'alex.morgan@example.com' } : { name: 'Casey Reed', phone: '202-555-0179', email: 'casey.reed@example.com' };
          assert.equal(h.nodes['nx-record-buyer'].textContent, identity.name + ' · fictional');
          assert.equal(h.nodes['nx-record-contact'].textContent, (method === 'email' ? 'Email · ' : 'Phone · ') + identity[method] + ' · fictional');
          assert.equal(h.nodes['nx-record-question'].textContent, expectedQuestions[question]);
          assert.match(h.nodes['nx-record-window'].textContent, expectedWindows[window]);
          assert.equal(h.nodes['nx-record-status'].textContent, 'Simulated request · callback pending');
          assert.match(h.nodes['nx-record-action'].textContent, new RegExp(`contact the buyer by ${method}`));
          assert.match(h.nodes['nx-inquiry-status'].textContent, /No request was sent or saved, and no visit is booked\./);
          assert.equal(h.nodes['nx-preview-heading'].focused, true);
          combinations++;
        }
      }
    }
  }
  assert.equal(combinations, 36);
  assert.deepEqual(h.external, []);
});

test('editing after simulation returns to preview; reset restores the original fictional request', () => {
  const h = harness();
  h.trigger('nx-simulate', 'click');
  h.nodes['nx-buyer'].value = 'casey';
  h.nodes['nx-question'].value = 'visit';
  h.nodes['nx-method'].value = 'email';
  h.nodes['nx-window'].value = 'morning';
  h.trigger('nx-question', 'change');
  assert.equal(h.nodes['nx-record-status'].textContent, 'Preview · not submitted');
  assert.match(h.nodes['nx-record-buyer'].textContent, /Casey Reed/);
  assert.match(h.nodes['nx-inquiry-status'].textContent, /Nothing has been sent or saved/);
  h.trigger('nx-simulate', 'click');
  h.trigger('nx-reset', 'click');
  for (const id of selectIds) assert.equal(h.nodes[id].value, selectOptions[id][0]);
  for (const id of recordIds.filter(id => id !== 'nx-inquiry-status')) assert.equal(h.nodes[id].textContent, elementText(id), `${id} should restore source preview`);
  assert.match(h.nodes['nx-inquiry-status'].textContent, /Example reset/);
  assert.deepEqual(h.external, []);
});

test('unknown and inherited property keys fall back to known presets rather than rendering prototype values', () => {
  const h = harness();
  for (const unexpected of ['unknown', '', '__proto__', 'constructor', 'toString', '<script>alert(1)</script>']) {
    for (const id of selectIds) h.nodes[id].value = unexpected;
    h.trigger('nx-buyer', 'change');
    assert.equal(h.nodes['nx-record-buyer'].textContent, 'Alex Morgan · fictional');
    assert.equal(h.nodes['nx-record-contact'].textContent, 'Phone · 202-555-0146 · fictional');
    assert.equal(h.nodes['nx-record-question'].textContent, elementText('nx-record-question'));
    assert.equal(h.nodes['nx-record-window'].textContent, elementText('nx-record-window'));
    for (const id of recordIds) assert.doesNotMatch(h.nodes[id].textContent, /undefined|\[object Object\]|function |<script>/);
  }
  assert.deepEqual(h.external, []);
});

test('a missing preview element fails closed and keeps the native controls disabled', () => {
  const h = harness('nx-record-action');
  for (const id of ['nx-inquiry-fields', 'nx-simulate', 'nx-reset']) assert.equal(h.nodes[id].disabled, true);
  assert.equal(h.nodes['nx-simulate'].listeners.size, 0);
  assert.equal(h.nodes['nx-reset'].listeners.size, 0);
  assert.deepEqual(h.external, []);
});
