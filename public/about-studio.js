/* Three disciplines assemble once. The final composition remains useful without JS. */
(() => {
  'use strict';
  const root = document.querySelector('[data-about-instrument]');
  if (!root) return;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const layers = [...root.querySelectorAll('[data-about-layer]')];
  const labels = [...root.querySelectorAll('[data-about-label]')];
  const buttons = [...root.querySelectorAll('[data-about-step]')];
  const playback = root.querySelector('[data-about-playback]');
  const title = root.querySelector('[data-about-title]');
  const description = root.querySelector('[data-about-description]');
  const count = root.querySelector('[data-about-count]');
  const announcement = root.querySelector('[data-about-announcement]');
  const complete = root.querySelector('[data-about-complete]');
  const chapters = [
    ['Start with the business.', 'Define the job this system needs to do, and what a useful result looks like.'],
    ['Consider every interaction.', 'Make the next step clear for your customers and practical for your team.'],
    ['Build it to work together.', 'Connect the details, test the experience, and review it with you.']
  ];
  const targets = [.32, .65, 1];
  const duration = 8000;
  const bases = [151, 222, 293];
  const drifts = [[28, -32], [-33, 21], [31, 28]];
  let progress = media.matches ? 1 : 0;
  let paused = media.matches;
  let visible = !('IntersectionObserver' in window);
  let suspended = false;
  let frame = null;
  let last = null;
  let active = -1;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };

  function render() {
    layers.forEach(layer => {
      const index = Number(layer.dataset.aboutLayer);
      const settled = smooth((progress - index / 3) / .29);
      const x = 302 + drifts[index][0] * (1 - settled);
      const y = bases[index] + drifts[index][1] * (1 - settled);
      layer.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      layer.style.opacity = String(.46 + .54 * settled);
    });
    labels.forEach(label => {
      const index = Number(label.dataset.aboutLabel);
      label.style.opacity = String(.35 + .65 * smooth((progress - index / 3) / .29));
    });
    complete.style.opacity = String(smooth((progress - .86) / .12));
    const next = Math.min(2, Math.floor(progress * 3));
    if (active !== next) {
      active = next;
      title.textContent = chapters[active][0];
      description.textContent = chapters[active][1];
      count.textContent = `0${active + 1} / 03`;
      buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === active)));
    }
    playback.textContent = progress >= 1 ? 'Replay' : paused ? 'Play' : 'Pause';
    root.dataset.aboutProgress = progress.toFixed(3);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    last = null;
  }

  function tick(time) {
    frame = null;
    if (paused || !visible || suspended || document.hidden || media.matches || progress >= 1) { last = null; return; }
    if (last !== null) progress = Math.min(1, progress + Math.min(100, Math.max(0, time - last)) / duration);
    last = time;
    render();
    if (progress < 1) frame = requestAnimationFrame(tick);
    else last = null;
  }

  function resumeIfVisible() {
    if (!paused && visible && !suspended && !document.hidden && !media.matches && progress < 1 && frame === null) {
      last = null;
      frame = requestAnimationFrame(tick);
    }
  }

  buttons.forEach((button, index) => button.addEventListener('click', () => {
    stop();
    paused = true;
    progress = targets[index];
    render();
    announcement.textContent = `${chapters[index][0]} ${chapters[index][1]}`;
  }));
  playback.addEventListener('click', () => {
    stop();
    if (progress >= 1) { progress = 0; paused = false; }
    else paused = !paused;
    render();
    resumeIfVisible();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else resumeIfVisible(); });
  window.addEventListener('pagehide', () => { suspended = true; stop(); });
  window.addEventListener('pageshow', () => { suspended = false; resumeIfVisible(); });
  media.addEventListener('change', () => {
    stop();
    if (media.matches) { progress = 1; paused = true; }
    render();
    resumeIfVisible();
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .15;
      if (visible) resumeIfVisible(); else stop();
    }, { threshold: [0, .15] });
    observer.observe(root);
  }
  root.querySelector('[data-about-controls]').hidden = false;
  render();
  resumeIfVisible();
})();
