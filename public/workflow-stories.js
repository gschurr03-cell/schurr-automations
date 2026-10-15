/* One connected workflow. The signal, node states and camera share one timeline. */
(() => {
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };
  const mix = (a, b, t) => a + (b - a) * t;
  // Short visual stories resolve while scrolling; denser journeys retain reading time.
  const storyDurations = {
    home: 4500, receptionist: 7500, website: 8500, automation: 7000,
    search: 9000, approach: 9500, evidence: 9000, demo: 11000
  };
  document.querySelectorAll('[data-workflow-story]').forEach(startStory);

  function startStory(root) {
    const viewport = root.querySelector('[data-story-viewport]');
    const buttons = [...root.querySelectorAll('[data-story-step]')];
    if (!viewport || !buttons.length) return;
    const traces = [...root.querySelectorAll('[data-story-trace]')];
    const reveals = [...root.querySelectorAll('[data-story-reveal]')];
    const windows = [...root.querySelectorAll('[data-story-window]')];
    const motions = [...root.querySelectorAll('[data-story-motion]')];
    const fixed = root.dataset.storyFixed === 'true';
    const nodes = [...root.querySelectorAll('[data-workflow-node]')].map(element => ({
      element, from: Number(element.dataset.from), x: Number(element.dataset.x), extent: Number(element.dataset.extent || 100), labelExtent: Number(element.dataset.labelExtent || 80),
      light: element.querySelector('.workflow-node-active'),
      check: element.querySelector('.workflow-node-check')
    }));
    const packets = [...root.querySelectorAll('[data-story-packet]')].map(element => {
      const path = root.querySelector(`[id="${element.dataset.path}"]`);
      try { return {element, path, length: path.getTotalLength()}; }
      catch (_) { element.style.opacity = '0'; return null; }
    }).filter(Boolean);
    const pause = root.querySelector('[data-story-pause]');
    const overviewButton = root.querySelector('[data-story-overview]');
    const headline = root.querySelector('[data-story-headline]');
    const summary = root.querySelector('[data-story-summary]');
    const number = root.querySelector('[data-story-number]');
    const announcement = root.querySelector('[data-story-announcement]');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 760px)');
    const duration = storyDurations[root.dataset.storyKind] || 10000;
    let progress = reduced.matches ? 1 : 0, target = progress;
    let frame = 0, lastTime = null, visible = false, suspended = false;
    let paused = false, manual = false, completed = reduced.matches, playing = false;
    let overview = reduced.matches, active = -1;

    function camera() {
      if (fixed) { viewport.setAttribute('viewBox', '0 0 680 460'); return null; }
      // A full overview remains available without JavaScript or through its button.
      if (overview) { viewport.setAttribute('viewBox', '-25 0 1060 460'); return null; }
      const stops = mobile.matches ? [-30, -30, 300, 350, 600] : [-30, -30, 180, 270, 440];
      const times = [0, .28, .43, .65, 1];
      const i = progress < .28 ? 0 : progress < .43 ? 1 : progress < .65 ? 2 : 3;
      const x = mix(stops[i], stops[i+1], smooth((progress-times[i])/(times[i+1]-times[i])));
      viewport.setAttribute('viewBox', `${x.toFixed(2)} 0 ${mobile.matches ? 430 : 680} 460`);
      return {left:x, right:x+(mobile.matches ? 430 : 680)};
    }
    function controls() {
      pause.hidden = reduced.matches;
      pause.textContent = completed || manual ? 'Replay workflow' : paused ? 'Resume motion' : 'Pause motion';
      pause.setAttribute('aria-pressed', String(paused && !completed && !manual));
      if (overviewButton) {
        overviewButton.hidden = fixed;
        overviewButton.textContent = overview ? 'View current step' : 'View full workflow';
        overviewButton.setAttribute('aria-pressed', String(overview));
      }
    }
    function draw() {
      const view = camera();
      traces.forEach(path => {
        const from = Number(path.dataset.from), to = Number(path.dataset.to);
        path.style.strokeDashoffset = String(1-clamp((progress-from)/Math.max(.001, to-from)));
      });
      packets.forEach(({element, path, length}) => {
        const from = Number(element.dataset.from), to = Number(element.dataset.to);
        const p = clamp((progress-from)/Math.max(.001, to-from));
        const point = path.getPointAtLength(p*length);
        element.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
        element.style.opacity = !reduced.matches && !overview && progress>from && progress<to ? String(Math.min(1, p*12, (1-p)*12)) : '0';
      });
      nodes.forEach(({element, from, x, extent, labelExtent, light, check}) => {
        // Fade complete plates before their text reaches the camera boundary.
        const edge = mobile.matches ? labelExtent : extent;
        element.style.opacity = !view || !Number.isFinite(x) ? '1' : String(smooth((x-edge-view.left)/28)*smooth((view.right-x-edge)/28));
        const activation = smooth((progress-from)/.028);
        const settled = smooth((progress-from-.028)/.035);
        if (light) light.style.opacity = String(activation*(1-settled*.57));
        if (check) check.style.opacity = String(settled);
        element.dataset.state = progress<from ? 'waiting' : settled===1 ? 'complete' : 'active';
      });
      reveals.forEach(element => {
        element.style.opacity = smooth((progress-Number(element.dataset.from))/Math.max(.001, Number(element.dataset.to)-Number(element.dataset.from))).toFixed(4);
      });
      windows.forEach(element => {
        const data=element.dataset;
        const enter=smooth((progress-Number(data.from))/Math.max(.001,Number(data.to)-Number(data.from)));
        const leave=data.until===undefined ? 0 : smooth((progress-Number(data.until))/Math.max(.001,Number(data.end)-Number(data.until)));
        element.style.opacity=String(enter*(1-leave));
      });
      motions.forEach(element => {
        const data=element.dataset;
        const amount=smooth((progress-Number(data.from))/Math.max(.001,Number(data.to)-Number(data.from)));
        const x=mix(Number(data.fromX||0),Number(data.toX||0),amount);
        const y=mix(Number(data.fromY||0),Number(data.toY||0),amount);
        const scale=mix(Number(data.fromScale||1),Number(data.toScale||1),amount);
        element.setAttribute('transform',`translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(4)})`);
      });
      const next = progress < .33 ? 0 : progress < .67 ? 1 : 2;
      root.dataset.storyProgress = progress.toFixed(5);
      root.dataset.storyActive = String(next);
      if (next !== active) {
        active = next;
        const button = buttons[active];
        headline.textContent = button.dataset.title;
        summary.textContent = button.dataset.description;
        if (number) number.textContent = `0${active+1} / 03`;
        buttons.forEach((button,i) => button.setAttribute('aria-pressed', String(i===active)));
      }
    }
    function stopFrame() { cancelAnimationFrame(frame); frame=0; lastTime=null; }
    function queue() {
      if (!frame && visible && !document.hidden && !suspended && (playing || progress!==target)) frame=requestAnimationFrame(tick);
    }
    function tick(time) {
      frame=0;
      if (!visible || document.hidden || suspended) { lastTime=null; return; }
      const delta = lastTime===null ? 0 : Math.min(64,time-lastTime); lastTime=time;
      if (playing && !paused && !reduced.matches) {
        progress=Math.min(1,progress+delta/duration); target=progress;
        if (progress===1) { playing=false; completed=true; controls(); }
      } else {
        progress=reduced.matches ? target : progress+(target-progress)*.105;
        if (Math.abs(target-progress)<.0003) progress=target;
      }
      draw();
      if (playing || progress!==target) queue(); else lastTime=null;
    }
    function configureMotion() {
      if (reduced.matches) {
        stopFrame(); playing=false; completed=true; paused=false; manual=false;
        overview=true; progress=target=1; draw();
      }
      controls();
    }
    buttons.forEach((button,index) => {
      button.hidden=false;
      button.addEventListener('click', () => {
        manual=true; playing=false; overview=false; paused=false;
        target=Number(button.dataset.progress || [.28,.65,1][index]);
        controls();
        if (reduced.matches) { progress=target; draw(); } else queue();
        announcement.textContent=`${button.dataset.title} ${button.dataset.description}`;
      });
    });
    pause.addEventListener('click', () => {
      if (reduced.matches) return;
      if (completed || manual) {
        progress=target=0; completed=false; manual=false; paused=false; overview=false;
        playing=true; lastTime=null; controls(); draw(); queue(); return;
      }
      paused=!paused; playing=!paused;
      if (paused) { target=progress; stopFrame(); } else { lastTime=null; queue(); }
      controls();
    });
    overviewButton?.addEventListener('click', () => {
      overview=!overview; manual=true; playing=false; target=progress;
      stopFrame(); controls(); draw();
    });
    const observer=new IntersectionObserver(entries => {
      visible=entries[0].isIntersecting;
      if (!visible) { stopFrame(); return; }
      if (!completed && !manual && !paused && !reduced.matches) playing=true;
      queue();
    }, {threshold:.18});
    observer.observe(root);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopFrame(); else { lastTime=null; queue(); } });
    addEventListener('pagehide', () => { suspended=true; stopFrame(); });
    addEventListener('pageshow', () => { suspended=false; lastTime=null; queue(); });
    mobile.addEventListener('change', draw);
    reduced.addEventListener('change', configureMotion);
    root.classList.add('is-story-ready'); configureMotion(); draw();
  }
})();
