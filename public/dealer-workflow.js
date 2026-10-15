/* Illustrative dealer workflow. No requests, saved data or customer actions. */
(() => {
  'use strict';
  const STEP_MS = 2400;
  const DURATION_MS = STEP_MS * 4;

  document.querySelectorAll('[data-dealer-workflow]').forEach(root => {
    const controls = root.querySelector('[data-dealer-controls]');
    const play = root.querySelector('[data-dealer-play]');
    const announcement = root.querySelector('[data-dealer-announcement]');
    const steps = [...root.querySelectorAll('[data-dealer-step]')];
    if (!controls || !play || steps.length !== 4) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let elapsed = reduced.matches ? DURATION_MS : 0;
    let wantsPlay = !reduced.matches;
    let visible = false;
    let frame = 0;
    let lastTime = null;

    const canPlay = () => wantsPlay && visible && !document.hidden && !reduced.matches && elapsed < DURATION_MS;
    function render() {
      const stage = Math.min(3, Math.floor(elapsed / STEP_MS));
      const progress = elapsed / DURATION_MS;
      root.dataset.dealerStage = String(stage);
      root.dataset.dealerPlaying = String(canPlay());
      root.dataset.dealerProgress = String(progress);
      root.style.setProperty('--dealer-progress', String(progress));
      steps.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.dealerStep) === stage)));
      play.hidden = reduced.matches;
      play.textContent = elapsed === DURATION_MS ? 'Replay animation' : wantsPlay ? 'Pause animation' : 'Resume animation';
    }
    function stopFrame() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = null;
    }
    function sync() {
      if (canPlay()) {
        if (!frame) frame = requestAnimationFrame(tick);
      } else stopFrame();
      render();
    }
    function tick(time) {
      frame = 0;
      if (!canPlay()) { sync(); return; }
      if (lastTime !== null) elapsed = Math.min(DURATION_MS, elapsed + Math.max(0, time - lastTime));
      lastTime = time;
      if (elapsed === DURATION_MS) wantsPlay = false;
      sync();
    }
    function announce(message) {
      if (announcement) announcement.textContent = message;
    }

    play.addEventListener('click', () => {
      if (reduced.matches) return;
      if (elapsed === DURATION_MS) {
        elapsed = 0;
        wantsPlay = true;
        announce('Animation restarted.');
      } else {
        wantsPlay = !wantsPlay;
        announce(wantsPlay ? 'Animation resumed.' : 'Animation paused.');
      }
      sync();
    });
    steps.forEach(button => button.addEventListener('click', () => {
      const stage = Number(button.dataset.dealerStep);
      if (!Number.isInteger(stage) || stage < 0 || stage > 3) return;
      wantsPlay = false;
      elapsed = stage * STEP_MS;
      sync();
      announce(`Step ${stage + 1} of 4: ${button.textContent.trim()}`);
    }));
    root.addEventListener('focusin', event => {
      // Focusing the play control must not flip its action before a click.
      if (!wantsPlay || play.contains(event.target)) return;
      wantsPlay = false;
      sync();
      announce('Animation paused. Use the steps to inspect the workflow.');
    });
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', () => {
      // A preference change never resumes motion without an explicit action.
      wantsPlay = false;
      elapsed = DURATION_MS;
      sync();
    });

    controls.hidden = false;
    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.target !== root) continue;
          visible = entry.isIntersecting;
          sync();
        }
      }, { threshold: 0 });
      observer.observe(root);
    } else {
      // Without visibility detection, leave playback to the visitor.
      visible = true;
      wantsPlay = false;
    }
    sync();
  });
})();
