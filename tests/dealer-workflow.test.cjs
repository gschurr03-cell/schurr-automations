// Exercises the shipped animation controller with a deterministic frame clock.
// No browser, network, storage, provider calls or customer records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/dealer-workflow.js'), 'utf8');

function element(dataset = {}) {
  const node = {
    dataset, attrs: {}, handlers: {}, hidden: true, textContent: '',
    style: { setProperty(name, value) { this[name] = value; } },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); },
    emit(name, event = {}) { for (const handler of this.handlers[name] || []) handler(event); },
    contains(target) { return target === this || target?.parent === this; },
  };
  return node;
}

function harness({ reduce = false, observer = true, missingPlay = false } = {}) {
  const root = element({ dealerStage: '3' });
  const controls = element(), play = element(), announcement = element();
  const steps = ['Buyer inquiry', 'Capture details', 'Assign salesperson', 'Record outcome'].map((label, i) => {
    const button = element({ dealerStep: String(i) }); button.textContent = label; return button;
  });
  const nodes = { '[data-dealer-controls]': controls, '[data-dealer-play]': missingPlay ? null : play, '[data-dealer-announcement]': announcement };
  root.querySelector = selector => nodes[selector] ?? null;
  root.querySelectorAll = () => steps;
  const document = element(); document.hidden = false; document.querySelectorAll = () => [root];
  const reduced = element(); reduced.matches = reduce;
  reduced.change = value => { reduced.matches = value; reduced.emit('change', { matches: value }); };
  const frames = new Map(); let frameId = 0, now = 0, intersection;
  const forbidden = () => { throw new Error('Animation must not use network or storage'); };
  const context = {
    document, matchMedia: () => reduced,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    fetch: forbidden, localStorage: { getItem: forbidden, setItem: forbidden }, sessionStorage: { getItem: forbidden, setItem: forbidden },
  };
  if (observer) context.IntersectionObserver = class {
    constructor(callback) { intersection = callback; }
    observe(target) { assert.equal(target, root); }
  };
  vm.runInNewContext(source, context);
  function advance(milliseconds = 0) {
    now += milliseconds;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(now));
    assert.ok(frames.size <= 1, 'One component owns at most one scheduled frame');
  }
  return {
    root, controls, play, announcement, steps, frames, reduced, advance,
    visible(value) { intersection([{ target: root, isIntersecting: value }]); },
    hidden(value) { document.hidden = value; document.emit('visibilitychange'); },
    focus(target) { root.emit('focusin', { target }); },
    elapse(milliseconds) { now += milliseconds; },
    progress: () => Number(root.dataset.dealerProgress),
  };
}

const tests = [];
const test = (name, callback) => tests.push([name, callback]);

test('waits until visible, advances four stages over 9600 ms, and stops once', () => {
  const h = harness();
  assert.equal(h.controls.hidden, false); assert.equal(h.frames.size, 0);
  assert.equal(h.root.dataset.dealerPlaying, 'false');
  h.visible(true); h.advance();
  for (let stage = 1; stage <= 3; stage++) {
    h.advance(2399); assert.equal(h.root.dataset.dealerStage, String(stage - 1));
    h.advance(1); assert.equal(h.root.dataset.dealerStage, String(stage));
    assert.equal(h.steps[stage].attrs['aria-pressed'], 'true');
  }
  h.advance(2399); assert.equal(h.root.dataset.dealerPlaying, 'true');
  h.advance(1);
  assert.equal(h.progress(), 1); assert.equal(h.root.style['--dealer-progress'], '1');
  assert.equal(h.root.dataset.dealerStage, '3'); assert.equal(h.root.dataset.dealerPlaying, 'false');
  assert.equal(h.frames.size, 0); assert.equal(h.play.textContent, 'Replay animation');
  assert.equal(h.announcement.textContent, '', 'Autoplay must not speak every stage');
  h.visible(false); h.elapse(60000); h.visible(true); assert.equal(h.frames.size, 0);
  h.play.emit('click'); assert.equal(h.progress(), 0); assert.equal(h.frames.size, 1);
  assert.equal(h.announcement.textContent, 'Animation restarted.');
});

test('offscreen and hidden-document time does not advance or override a user pause', () => {
  const h = harness(); h.visible(true); h.advance(); h.advance(1800);
  const progress = h.progress(); h.visible(false);
  assert.equal(h.frames.size, 0); assert.equal(h.root.dataset.dealerPlaying, 'false');
  h.elapse(60000); h.visible(true); h.advance(); assert.equal(h.progress(), progress);
  h.advance(600); assert.equal(h.root.dataset.dealerStage, '1');
  h.hidden(true); h.elapse(60000); h.hidden(false); h.advance(); assert.equal(h.progress(), .25);
  h.advance(1200); assert.equal(h.progress(), .375);
  h.play.emit('click'); assert.equal(h.play.textContent, 'Resume animation');
  h.visible(false); h.hidden(true); h.elapse(60000); h.visible(true); h.hidden(false);
  assert.equal(h.frames.size, 0); assert.equal(h.progress(), .375);
  h.play.emit('click'); h.advance(); h.advance(1200); assert.equal(h.progress(), .5);
});

test('focus pauses inspection, play focus preserves its action, and manual steps remain selected', () => {
  const h = harness(); h.visible(true); h.advance(); h.advance(1000);
  h.focus(h.play); assert.equal(h.root.dataset.dealerPlaying, 'true');
  h.play.emit('click'); assert.equal(h.root.dataset.dealerPlaying, 'false');
  h.focus(h.play); h.play.emit('click'); assert.equal(h.root.dataset.dealerPlaying, 'true');
  h.focus(h.steps[2]); assert.equal(h.frames.size, 0); assert.match(h.announcement.textContent, /paused/);
  h.steps[2].emit('click'); assert.equal(h.root.dataset.dealerStage, '2'); assert.equal(h.progress(), .5);
  assert.equal(h.announcement.textContent, 'Step 3 of 4: Assign salesperson');
  h.visible(false); h.visible(true); assert.equal(h.frames.size, 0);
  h.focus(h.play); h.play.emit('click'); h.advance(); h.advance(2400);
  assert.equal(h.root.dataset.dealerStage, '3'); assert.equal(h.progress(), .75);
});

test('reduced motion starts static, supports manual steps, and changes never auto-resume', () => {
  const h = harness({ reduce: true });
  h.visible(true); assert.equal(h.root.dataset.dealerStage, '3'); assert.equal(h.progress(), 1);
  assert.equal(h.frames.size, 0); assert.equal(h.play.hidden, true);
  h.play.emit('click'); assert.equal(h.frames.size, 0);
  h.steps[1].emit('click'); assert.equal(h.root.dataset.dealerStage, '1'); assert.equal(h.frames.size, 0);
  h.reduced.change(false); assert.equal(h.progress(), 1); assert.equal(h.frames.size, 0); assert.equal(h.play.hidden, false);
  h.play.emit('click'); h.advance(); h.advance(2400); assert.equal(h.root.dataset.dealerStage, '1');
  const announcement = h.announcement.textContent;
  h.reduced.change(true); assert.equal(h.frames.size, 0); assert.equal(h.progress(), 1);
  assert.equal(h.root.dataset.dealerStage, '3'); assert.equal(h.announcement.textContent, announcement);
  h.reduced.change(false); h.visible(false); h.visible(true); assert.equal(h.frames.size, 0);
});

test('incomplete markup stays untouched and missing visibility support requires explicit playback', () => {
  const missing = harness({ missingPlay: true });
  assert.equal(missing.root.dataset.dealerStage, '3'); assert.equal(missing.controls.hidden, true); assert.equal(missing.frames.size, 0);
  const fallback = harness({ observer: false });
  assert.equal(fallback.frames.size, 0); assert.equal(fallback.play.textContent, 'Resume animation');
  fallback.play.emit('click'); assert.equal(fallback.frames.size, 1);
});

for (const [name, callback] of tests) { callback(); console.log('PASS ' + name); }
console.log(`All ${tests.length} dealer workflow behavior checks passed. No network or storage used.`);
