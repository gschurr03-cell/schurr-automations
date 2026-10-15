/* Exercise the founder assembly's real controller with a deterministic animation clock. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/about-studio.js'), 'utf8');

function element(dataset = {}) {
  return { dataset, attrs: {}, style: {}, hidden: true, textContent: '', handlers: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(name, callback) { this.handlers[name] = callback; },
    click() { this.handlers.click?.(); } };
}

function harness({ reduced = false, observer = true } = {}) {
  const root = element(), playback = element(), title = element(), description = element();
  const count = element(), announcement = element(), complete = element(), controls = element();
  const layers = [2, 1, 0].map(index => element({ aboutLayer: String(index) }));
  const labels = [0, 1, 2].map(index => element({ aboutLabel: String(index) }));
  const buttons = [0, 1, 2].map(index => element({ aboutStep: String(index) }));
  const one = { '[data-about-playback]': playback, '[data-about-title]': title,
    '[data-about-description]': description, '[data-about-count]': count,
    '[data-about-announcement]': announcement, '[data-about-complete]': complete,
    '[data-about-controls]': controls };
  const many = { '[data-about-layer]': layers, '[data-about-label]': labels, '[data-about-step]': buttons };
  root.querySelector = selector => one[selector] ?? null;
  root.querySelectorAll = selector => many[selector] ?? [];
  const frames = new Map(), documentEvents = {}, windowEvents = {};
  let now = 0, frameId = 0, intersect, mediaChange;
  const media = { matches: reduced, addEventListener(_, callback) { mediaChange = callback; } };
  const document = { hidden: false, querySelector: () => root,
    addEventListener(name, callback) { documentEvents[name] = callback; } };
  const window = { matchMedia: () => media, addEventListener(name, callback) { windowEvents[name] = callback; } };
  const context = { document, window,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); } };
  if (observer) {
    context.IntersectionObserver = window.IntersectionObserver = class {
      constructor(callback) { intersect = callback; }
      observe() {}
    };
  }
  vm.runInNewContext(source, context);
  function advance(steps = 1) {
    for (let i = 0; i < steps; i++) {
      now += 16;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(callback => callback(now));
      assert.ok(frames.size <= 1, 'The assembly must have at most one queued frame');
    }
  }
  function settle() {
    let attempts = 0;
    while (frames.size) {
      assert.ok(attempts++ < 1000, 'The assembly must finish rather than loop');
      advance();
    }
  }
  return { root, playback, title, description, count, announcement, complete, controls,
    layers, labels, buttons, frames, advance, settle, windowEvents,
    value: () => Number(root.dataset.aboutProgress),
    visible(value) { intersect([{ isIntersecting: value, intersectionRatio: value ? .5 : 0 }]); },
    hidden(value) { document.hidden = value; documentEvents.visibilitychange(); },
    reduce(value) { media.matches = value; mediaChange(); },
    elapse(milliseconds) { now += milliseconds; } };
}

const tests = [];
function test(name, callback) { tests.push([name, callback]); }

test('assembly starts on entry, completes once, and explicitly replays from its opening', () => {
  const h = harness();
  assert.equal(h.frames.size, 0);
  assert.equal(h.controls.hidden, false);
  assert.equal(h.title.textContent, 'Start with the business.');
  assert.equal(h.playback.textContent, 'Pause');
  h.visible(true); h.advance(150);
  assert.ok(h.value() > 0 && h.value() < .33);
  h.settle();
  assert.equal(h.value(), 1);
  assert.equal(h.playback.textContent, 'Replay');
  assert.equal(h.count.textContent, '03 / 03');
  assert.equal(h.title.textContent, 'Build it to work together.');
  assert.equal(h.complete.style.opacity, '1');
  for (const layer of h.layers) {
    assert.equal(layer.attrs.transform, `translate(302.00 ${[151,222,293][Number(layer.dataset.aboutLayer)]}.00)`);
    assert.equal(layer.style.opacity, '1');
  }
  h.visible(false); h.elapse(180000); h.visible(true);
  assert.equal(h.frames.size, 0, 'Reentry does not start another loop');
  h.playback.click(); assert.equal(h.value(), 0);
  h.advance(20); assert.ok(h.value() > 0);
});

test('pause and manual chapters preserve timing and accessible descriptions', () => {
  const h = harness(); h.visible(true); h.advance(120); h.playback.click();
  const before = h.value(), transforms = h.layers.map(layer => layer.attrs.transform);
  assert.equal(h.playback.textContent, 'Play');
  assert.equal(h.frames.size, 0);
  h.elapse(90000); h.advance(20);
  assert.equal(h.value(), before);
  assert.deepEqual(h.layers.map(layer => layer.attrs.transform), transforms);
  h.playback.click(); h.advance(); assert.equal(h.value(), before);
  h.advance(4); assert.ok(h.value() > before && h.value() - before < .01);
  h.buttons[1].click();
  assert.equal(h.value(), .65);
  assert.equal(h.frames.size, 0);
  assert.equal(h.title.textContent, 'Consider every interaction.');
  assert.equal(h.buttons[1].attrs['aria-pressed'], 'true');
  assert.equal(h.buttons[0].attrs['aria-pressed'], 'false');
  assert.equal(h.announcement.textContent, 'Consider every interaction. Make the next step clear for your customers and practical for your team.');
  h.playback.click(); h.advance(); assert.equal(h.value(), .65);
  h.advance(5); assert.ok(h.value() > .65);
});

for (const state of ['offscreen', 'hidden tab', 'pagehide']) {
  test(`${state} cancels frames and resumes with a fresh clock`, () => {
    const h = harness(); h.visible(true); h.advance(180);
    const before = h.value();
    if (state === 'offscreen') h.visible(false);
    else if (state === 'hidden tab') h.hidden(true);
    else h.windowEvents.pagehide();
    assert.equal(h.frames.size, 0);
    h.elapse(180000); h.advance(4); assert.equal(h.value(), before);
    if (state === 'offscreen') h.visible(true);
    else if (state === 'hidden tab') h.hidden(false);
    else {
      h.visible(true);
      assert.equal(h.frames.size, 0, 'Intersection updates cannot restart a suspended page');
      h.windowEvents.pageshow();
    }
    h.advance(); assert.equal(h.value(), before);
    h.advance(4); assert.ok(h.value() > before && h.value() - before < .01);
  });
}

test('reduced motion is static, preserves chapter access, and safely resolves mid-play', () => {
  const h = harness({ reduced: true }); h.visible(true);
  assert.equal(h.value(), 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.complete.style.opacity, '1');
  const finalTransforms = h.layers.map(layer => layer.attrs.transform);
  h.buttons[0].click();
  assert.equal(h.title.textContent, 'Start with the business.');
  assert.equal(h.buttons[0].attrs['aria-pressed'], 'true');
  assert.equal(h.layers.find(layer => layer.dataset.aboutLayer === '0').attrs.transform, finalTransforms[2]);
  assert.notDeepEqual(h.layers.map(layer => layer.attrs.transform), finalTransforms, 'Manual reduced-motion chapters match the caption with an immediate static composition');
  assert.equal(h.complete.style.opacity, '0', 'The opening chapter does not display the completed marker');
  assert.equal(h.frames.size, 0);
  h.reduce(false); assert.equal(h.frames.size, 0);
  h.playback.click(); h.advance(40); assert.ok(h.value() > .32);
  h.reduce(true);
  assert.equal(h.value(), 1);
  assert.equal(h.frames.size, 0);
  assert.deepEqual(h.layers.map(layer => layer.attrs.transform), finalTransforms);
  assert.equal(h.complete.style.opacity, '1');
});

test('browsers without intersection observation still complete a finite animation', () => {
  const h = harness({ observer: false });
  assert.equal(h.frames.size, 1);
  h.settle();
  assert.equal(h.value(), 1);
  assert.equal(h.frames.size, 0);
});

let failed = 0;
for (const [name, callback] of tests) {
  try { callback(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
}
if (failed) process.exitCode = 1;
else console.log(`PASS all ${tests.length} About assembly checks`);
