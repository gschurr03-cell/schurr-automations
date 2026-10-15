/* Behavioral checks for the actual workflow controller; no browser or timers required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/workflow-stories.js'), 'utf8');

function element(dataset = {}) {
  return {
    dataset, style: {}, attrs: {}, handlers: {}, hidden: true, textContent: '',
    classList: { add() {} },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    click() { this.handlers.click?.(); }
  };
}
function media(matches) {
  const listeners = [];
  return { matches, addEventListener(_, callback) { listeners.push(callback); },
    change(value) { this.matches = value; listeners.forEach(callback => callback({ matches: value })); } };
}

function harness({ reduce = false, narrow = false, withNumber = false, withOverview = true, fixed = false, withStages = false } = {}) {
  const root = element(fixed ? { storyFixed: 'true' } : {}), viewport = element(), pause = element(), overview = element();
  const headline = element(), summary = element(), announcement = element(), number = element();
  const buttons = ['Receive', 'Connect', 'Book'].map((title, i) => element({
    title, description: `Description for ${title}`, progress: String([.28, .65, 1][i])
  }));
  const nodes = [0, .4, .935, .735].map((from, i) => {
    const node = element({ from: String(from), x: String([70,490,910,700][i]), extent: '100', labelExtent: '72' });
    node.light = element(); node.check = element();
    node.querySelector = selector => selector === '.workflow-node-active' ? node.light : node.check;
    return node;
  });
  const trace = element({ from: '.1', to: '.4' });
  const geometryRequests = [];
  // SVG pathLength=1 normalizes the stroke, not getTotalLength()/getPointAtLength().
  trace.getTotalLength = () => 200;
  trace.getPointAtLength = distance => {
    geometryRequests.push(distance);
    return { x: 30 + distance, y: 110 + distance / 2 };
  };
  const packet = element({ path: 'incoming-path', from: '.1', to: '.4' });
  const brokenPacket = element({ path: 'missing-path', from: '.1', to: '.4' });
  const reveal = element({ from: '.6', to: '.8' });
  const stageWindow = element({ from: '.1', to: '.3', until: '.6', end: '.8' });
  const lastingWindow = element({ from: '.1', to: '.3' });
  const motion = element({ from: '.2', to: '.6', fromX: '-40', toX: '60', fromY: '12', toY: '-20', fromScale: '.8', toScale: '1.2' });
  const defaultMotion = element({ from: '.2', to: '.6' });
  const one = {
    '[data-story-viewport]': viewport, '[data-story-pause]': pause,
    '[data-story-overview]': withOverview ? overview : null,
    '[data-story-headline]': headline, '[data-story-summary]': summary,
    '[data-story-number]': withNumber ? number : null,
    '[data-story-announcement]': announcement, '[id="incoming-path"]': trace
  };
  const many = {
    '[data-story-step]': buttons, '[data-story-trace]': [trace],
    '[data-story-reveal]': [reveal], '[data-workflow-node]': nodes,
    '[data-story-packet]': [packet, brokenPacket],
    '[data-story-window]': withStages ? [stageWindow, lastingWindow] : [],
    '[data-story-motion]': withStages ? [motion, defaultMotion] : []
  };
  root.querySelector = selector => one[selector] ?? null;
  root.querySelectorAll = selector => many[selector] ?? [];
  const windowEvents = {}, documentEvents = {}, frames = new Map();
  let frameId = 0, now = 0, intersection;
  const reduced = media(reduce), mobile = media(narrow);
  const document = { hidden: false, querySelectorAll: () => [root],
    addEventListener: (name, handler) => { documentEvents[name] = handler; } };
  const context = {
    document, matchMedia: query => query.includes('reduced') ? reduced : mobile,
    requestAnimationFrame: handler => { frames.set(++frameId, handler); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, handler) => { windowEvents[name] = handler; },
    IntersectionObserver: class { constructor(handler) { intersection = handler; } observe() {} }
  };
  vm.runInNewContext(source, context);
  function advance(count = 1, milliseconds = 16) {
    for (let i = 0; i < count; i++) {
      now += milliseconds;
      const callbacks = [...frames.entries()];
      frames.clear();
      callbacks.forEach(([, callback]) => callback(now));
      assert.ok(frames.size <= 1, 'One story should schedule at most one frame');
    }
  }
  function settle() {
    let count = 0;
    while (frames.size) {
      assert.ok(count++ < 1600, 'The story must eventually release animation frames');
      advance();
    }
  }
  function until(progress) {
    let count = 0;
    while (value() < progress) {
      assert.ok(frames.size > 0 && count++ < 1600, 'Story must reach requested progress');
      advance();
    }
  }
  function value() { return Number(root.dataset.storyProgress); }
  function visible(isIntersecting) { intersection([{ isIntersecting }]); }
  function hidden(value) { document.hidden = value; documentEvents.visibilitychange(); }
  return { root, viewport, pause, overview, headline, summary, announcement, number, buttons,
    nodes, trace, packet, brokenPacket, reveal, stageWindow, lastingWindow, motion, defaultMotion, geometryRequests, reduced, mobile,
    document, frames, windowEvents, advance, settle, until, value, visible, hidden,
    elapse: milliseconds => { now += milliseconds; },
    box: () => viewport.attrs.viewBox.split(' ').map(Number) };
}

const tests = [];
function test(name, callback) { tests.push([name, callback]); }
function close(actual, expected, epsilon = .0001) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be near ${expected}`);
}

test('initialization matches markup with no number element or optional overview', () => {
  const h = harness({ withOverview: false });
  assert.equal(h.headline.textContent, 'Receive');
  assert.equal(h.summary.textContent, 'Description for Receive');
  assert.equal(h.frames.size, 0, 'Offscreen stories wait for intersection');
  assert.equal(h.pause.hidden, false);
  assert.ok(h.buttons.every(button => !button.hidden));
  assert.equal(h.brokenPacket.style.opacity, '0', 'A missing geometry path cannot break the workflow');
});

test('autoplay advances one persistent workflow, lights nodes in order, and completes once', () => {
  const h = harness({ withNumber: true }); h.visible(true); h.until(.25);
  assert.equal(h.nodes[0].dataset.state, 'complete');
  assert.equal(h.nodes[1].dataset.state, 'waiting');
  assert.equal(h.nodes[2].dataset.state, 'waiting');
  assert.ok(Number(h.nodes[0].light.style.opacity) > 0);
  assert.equal(h.nodes[0].check.style.opacity, '1');
  h.until(.415);
  assert.equal(h.nodes[1].dataset.state, 'active', 'Destination lights after its incoming signal arrives');
  assert.ok(Number(h.nodes[1].light.style.opacity) > 0);
  assert.equal(h.nodes[2].dataset.state, 'waiting');
  assert.equal(h.headline.textContent, 'Connect');
  h.settle();
  assert.equal(h.value(), 1);
  assert.ok(h.nodes.every(node => node.dataset.state === 'complete'));
  assert.equal(h.headline.textContent, 'Book');
  assert.equal(h.number.textContent, '03 / 03');
  assert.equal(h.pause.textContent, 'Replay workflow');
  h.visible(false); h.elapse(60000); h.visible(true);
  assert.equal(h.frames.size, 0, 'Completed workflows do not start another loop');
  h.pause.click(); assert.equal(h.value(), 0); h.advance(80);
  assert.ok(h.value() > 0 && h.value() < .15, 'Replay restarts the complete journey');
});

test('packet follows native path geometry and disappears at the destination', () => {
  const h = harness();
  assert.equal(h.packet.style.opacity, '0');
  h.visible(true); h.until(.25);
  const p = (h.value() - .1) / .3;
  const coordinates = h.packet.attrs.transform.match(/-?[\d.]+/g).map(Number);
  close(coordinates[0], 30 + 200 * p, .02);
  close(coordinates[1], 110 + 100 * p, .02);
  assert.ok(h.geometryRequests.some(length => length > 90), 'Uses native path length rather than normalized stroke length');
  assert.ok(Number(h.packet.style.opacity) > .9);
  close(Number(h.trace.style.strokeDashoffset), 1 - p, .0001);
  h.until(.41);
  assert.equal(h.packet.style.opacity, '0');
  assert.equal(h.trace.style.strokeDashoffset, '0');
  h.settle();
  assert.equal(h.reveal.style.opacity, '1.0000');
});

test('camera frames the opening and final outcome on desktop and mobile', () => {
  const desktop = harness();
  assert.deepEqual(desktop.box(), [-30, 0, 680, 460]);
  desktop.visible(true); desktop.until(.5);
  const middleX = desktop.box()[0];
  assert.ok(middleX > 80 && middleX < 270, 'Camera travels through intermediate workflow positions');
  desktop.settle();
  assert.deepEqual(desktop.box(), [440, 0, 680, 460]);
  desktop.mobile.change(true);
  assert.deepEqual(desktop.box(), [600, 0, 430, 460], 'Resizing refocuses the current chapter');
  assert.equal(desktop.nodes[2].style.opacity, '1', 'The final team label fits inside the mobile camera');
  assert.equal(desktop.nodes[3].style.opacity, '1', 'The booked appointment remains visible beside the team');
  assert.equal(desktop.frames.size, 0, 'Responsive camera updates do not start playback');
  const mobile = harness({ narrow: true });
  assert.deepEqual(mobile.box(), [-30, 0, 430, 460]);
  mobile.visible(true); mobile.settle();
  assert.deepEqual(mobile.box(), [600, 0, 430, 460]);
});

test('chapters interpolate, update accessible state, and settle without autoplay', () => {
  const h = harness(); h.visible(true); h.buttons[1].click(); h.advance(4);
  assert.ok(h.value() > 0 && h.value() < .65, 'Chapter selection interpolates');
  h.settle(); close(h.value(), .65);
  assert.equal(h.buttons[1].attrs['aria-pressed'], 'true');
  assert.equal(h.buttons[0].attrs['aria-pressed'], 'false');
  assert.equal(h.announcement.textContent, 'Connect Description for Connect');
  assert.equal(h.pause.textContent, 'Replay workflow');
  h.buttons[2].click(); h.settle(); assert.equal(h.value(), 1);
  h.buttons[0].click(); h.settle(); close(h.value(), .28);
  assert.equal(h.headline.textContent, 'Receive');
});

test('pause and resume keep the exact narrative position', () => {
  const h = harness(); h.visible(true); h.until(.2); h.pause.click();
  const before = h.value();
  assert.equal(h.pause.textContent, 'Resume motion');
  assert.equal(h.pause.attrs['aria-pressed'], 'true');
  assert.equal(h.frames.size, 0);
  h.elapse(120000); h.advance(20); assert.equal(h.value(), before);
  h.pause.click(); h.advance(); assert.equal(h.value(), before, 'Resume starts a fresh clock');
  h.advance(4); assert.ok(h.value() > before && h.value() - before < .01);
  assert.equal(h.pause.attrs['aria-pressed'], 'false');
});

test('overview freezes progress, shows the complete route, and returns to the same camera', () => {
  const h = harness(); h.visible(true); h.until(.25);
  const before = h.value(), box = h.box(); h.overview.click();
  assert.deepEqual(h.box(), [-25, 0, 1060, 460]);
  assert.equal(h.overview.attrs['aria-pressed'], 'true');
  assert.equal(h.overview.textContent, 'View current step');
  assert.equal(h.packet.style.opacity, '0');
  assert.equal(h.frames.size, 0);
  h.elapse(60000); h.advance(5); assert.equal(h.value(), before);
  h.overview.click(); assert.deepEqual(h.box(), box);
  assert.equal(h.value(), before); assert.equal(h.frames.size, 0);
  assert.equal(h.overview.attrs['aria-pressed'], 'false');
  h.pause.click(); assert.equal(h.value(), 0); h.advance(20); assert.ok(h.value() > 0);
});

test('reduced motion presents a completed overview and honors manual chapter changes', () => {
  const h = harness({ reduce: true }); h.visible(true);
  assert.equal(h.value(), 1); assert.equal(h.frames.size, 0);
  assert.equal(h.pause.hidden, true);
  assert.deepEqual(h.box(), [-25, 0, 1060, 460]);
  assert.equal(h.packet.style.opacity, '0');
  h.buttons[1].click(); close(h.value(), .65);
  assert.equal(h.headline.textContent, 'Connect');
  assert.equal(h.frames.size, 0, 'Reduced-motion chapter changes are immediate');
  assert.equal(h.box()[2], 680);
  h.pause.click(); close(h.value(), .65);
});

test('enabling reduced motion mid-play cancels animation and safely resolves the story', () => {
  const h = harness(); h.visible(true); h.until(.25); h.reduced.change(true);
  assert.equal(h.frames.size, 0); assert.equal(h.value(), 1);
  assert.equal(h.pause.hidden, true); assert.equal(h.packet.style.opacity, '0');
  assert.deepEqual(h.box(), [-25, 0, 1060, 460]);
  h.elapse(30000); h.reduced.change(false);
  assert.equal(h.pause.hidden, false); assert.equal(h.frames.size, 0);
  h.pause.click(); assert.equal(h.value(), 0); h.advance(15); assert.ok(h.value() > 0);
});

test('fixed-stage stories retain the whole composition during playback, resizing, and completion', () => {
  const h = harness({ fixed: true, withStages: true });
  const frame = [0, 0, 680, 460];
  assert.deepEqual(h.box(), frame);
  assert.equal(h.overview.hidden, true, 'Fixed compositions have no redundant camera control');
  assert.ok(h.nodes.every(node => node.style.opacity === '1'), 'Fixed-stage content is not faded by the graph camera');
  h.visible(true); h.until(.5);
  assert.deepEqual(h.box(), frame);
  h.mobile.change(true);
  assert.deepEqual(h.box(), frame, 'Narrow layouts must not crop a fixed-stage scene');
  h.settle();
  assert.deepEqual(h.box(), frame);
  assert.equal(h.frames.size, 0);
  h.mobile.change(false);
  assert.deepEqual(h.box(), frame);
  assert.equal(h.frames.size, 0, 'Resizing a completed scene does not restart it');
  assert.equal(h.overview.hidden, true);
  assert.deepEqual(harness({ fixed: true, narrow: true }).box(), frame);
});

test('fixed-stage stories preserve pause, resume, manual selection, and replay behavior', () => {
  const h = harness({ fixed: true, withStages: true, withOverview: false });
  h.visible(true); h.until(.4); h.pause.click();
  const before = h.value(), transform = h.motion.attrs.transform, opacity = h.stageWindow.style.opacity;
  assert.equal(h.frames.size, 0);
  assert.equal(h.pause.textContent, 'Resume motion');
  h.elapse(90000); h.advance(3);
  assert.equal(h.value(), before);
  assert.equal(h.motion.attrs.transform, transform);
  assert.equal(h.stageWindow.style.opacity, opacity);
  h.pause.click(); h.advance(); assert.equal(h.value(), before);
  h.advance(5); assert.ok(h.value() > before && h.value() - before < .01);
  h.buttons[2].click(); h.advance(4);
  assert.ok(h.value() > before && h.value() < 1, 'Manual chapter changes still interpolate');
  h.settle();
  assert.equal(h.value(), 1);
  assert.equal(h.buttons[2].attrs['aria-pressed'], 'true');
  assert.equal(h.announcement.textContent, 'Book Description for Book');
  assert.equal(h.stageWindow.style.opacity, '0');
  assert.equal(h.motion.attrs.transform, 'translate(60.000 -20.000) scale(1.2000)');
  assert.deepEqual(h.box(), [0, 0, 680, 460]);
  h.pause.click();
  assert.equal(h.value(), 0);
  assert.equal(h.motion.attrs.transform, 'translate(-40.000 12.000) scale(0.8000)');
  h.advance(10); assert.ok(h.value() > 0);
});

test('opacity windows enter, hold, and leave at their authored timeline boundaries', () => {
  const h = harness({ fixed: true, withStages: true, reduce: true });
  h.visible(true);
  const samples = [[0,0], [.1,0], [.2,.5], [.3,1], [.5,1], [.6,1], [.7,.5], [.8,0], [1,0]];
  for (const [progress, expected] of samples) {
    h.buttons[0].dataset.progress = String(progress); h.buttons[0].click();
    close(Number(h.stageWindow.style.opacity), expected);
    if (progress >= .3) assert.equal(h.lastingWindow.style.opacity, '1', 'A window without an exit remains visible');
    assert.equal(h.frames.size, 0);
  }
});

test('scene transforms ease translation and scale together, clamp endpoints, and default to identity', () => {
  const h = harness({ fixed: true, withStages: true, reduce: true });
  h.visible(true);
  const samples = [
    [0, [-40, 12, .8]], [.2, [-40, 12, .8]],
    [.3, [-24.375, 7, .8625]], [.4, [10, -4, 1]],
    [.6, [60, -20, 1.2]], [1, [60, -20, 1.2]]
  ];
  for (const [progress, expected] of samples) {
    h.buttons[0].dataset.progress = String(progress); h.buttons[0].click();
    const actual = h.motion.attrs.transform.match(/-?[\d.]+/g).map(Number);
    actual.forEach((value, index) => close(value, expected[index]));
    assert.equal(h.defaultMotion.attrs.transform, 'translate(0.000 0.000) scale(1.0000)');
    assert.ok(actual.every(Number.isFinite));
  }
});

test('fixed-stage reduced motion resolves to a static outcome and keeps manual chapters accessible', () => {
  const h = harness({ fixed: true, withStages: true, reduce: true, narrow: true });
  h.visible(true);
  assert.equal(h.value(), 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.pause.hidden, true);
  assert.equal(h.overview.hidden, true);
  assert.deepEqual(h.box(), [0, 0, 680, 460]);
  assert.equal(h.stageWindow.style.opacity, '0');
  assert.equal(h.lastingWindow.style.opacity, '1');
  assert.equal(h.packet.style.opacity, '0');
  assert.equal(h.motion.attrs.transform, 'translate(60.000 -20.000) scale(1.2000)');
  h.buttons[0].click(); close(h.value(), .28);
  assert.equal(h.headline.textContent, 'Receive');
  assert.equal(h.buttons[0].attrs['aria-pressed'], 'true');
  assert.equal(h.frames.size, 0);
  assert.ok(Number(h.stageWindow.style.opacity) > 0);
  h.mobile.change(false); assert.deepEqual(h.box(), [0, 0, 680, 460]);
  h.reduced.change(false); assert.equal(h.frames.size, 0);
  h.pause.click(); h.advance(100);
  assert.ok(h.value() > 0 && h.value() < 1);
  h.reduced.change(true);
  assert.equal(h.value(), 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.stageWindow.style.opacity, '0');
  assert.equal(h.motion.attrs.transform, 'translate(60.000 -20.000) scale(1.2000)');
  assert.deepEqual(h.box(), [0, 0, 680, 460]);
});

for (const kind of ['offscreen', 'hidden tab', 'pagehide']) {
  test(`${kind} suspends rendering and resumes without skipped wall time`, () => {
    const h = harness(); h.visible(true); h.until(.2); const before = h.value();
    if (kind === 'offscreen') h.visible(false);
    else if (kind === 'hidden tab') h.hidden(true);
    else h.windowEvents.pagehide();
    assert.equal(h.frames.size, 0);
    h.elapse(180000); h.advance(5); assert.equal(h.value(), before);
    if (kind === 'offscreen') h.visible(true);
    else if (kind === 'hidden tab') h.hidden(false);
    else h.windowEvents.pageshow();
    h.advance(); assert.equal(h.value(), before, 'First resumed frame resets elapsed time');
    h.advance(5); assert.ok(h.value() > before && h.value() - before < .01);
  });
}

let failed = 0;
for (const [name, callback] of tests) {
  try { callback(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
}
if (failed) process.exitCode = 1;
else console.log(`PASS all ${tests.length} workflow behavior checks`);
