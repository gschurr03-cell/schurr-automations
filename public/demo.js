(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let mode = 'receptionist', situation = 'new', sequence = 0, controller;
  const questions = {new:'What can you help with?',pricing:'How much does it cost?',booking:'Can I book a meeting?',handoff:'Can I speak to Gavin?'};
  async function render() {
    const current = ++sequence;
    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(), 8000);
    const selected = mode === 'lead' ? $('permission').value : situation;
    document.querySelector('.demo-output').setAttribute('aria-busy','true');
    $('sample-content').hidden = true;
    for (const id of ['greeting','customer-question','assistant-reply','reply-draft','next-action']) $(id).textContent = '';
    $('event-list').replaceChildren();
    $('demo-status').textContent = 'Loading sample…';
    $('retry').hidden = true;
    try {
      const response = await fetch('/api/demo?' + new URLSearchParams({service:mode === 'lead' ? 'leads' : 'calls',situation:selected}), {signal:requestController.signal});
      const result = await response.json();
      if (current !== sequence) return;
      if (!response.ok || !result.ok) throw new Error();
      $('greeting').textContent = result.profile.greeting;
      $('customer-question').textContent = questions[situation];
      $('assistant-reply').textContent = result.reply;
      $('need').textContent = result.topic;
      $('reply-draft').textContent = result.plan.draft || result.plan.reason;
      $('draft-heading').textContent = result.plan.status === 'paused' ? 'Contact paused' : 'A reply for staff to review';
      $('event-list').replaceChildren(...result.steps.map(step => {
        const li=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('p');
        title.textContent=step.title; detail.textContent=step.detail; li.append(title,detail); return li;
      }));
      $('next-action').textContent = mode === 'lead' ? result.plan.reason : "Confirm the customer's details and permission, then arrange the next conversation.";
      $('sample-content').hidden = false;
      $('demo-status').textContent = mode === 'lead' ? (result.plan.status === 'paused' ? 'Sample updated: contact is paused. No reply is prepared.' : 'Sample updated: a reply is prepared for staff review.') : 'Sample updated: ' + questions[situation];
    } catch {
      if (current !== sequence) return;
      $('sample-content').hidden = true;
      $('demo-status').textContent = 'This sample could not load. Try again, or use the phone demo above.';
      $('retry').hidden = false;
    } finally {
      clearTimeout(timeout);
      if (current === sequence) document.querySelector('.demo-output').setAttribute('aria-busy','false');
    }
  }
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    mode=button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    $('receptionist-options').hidden=mode!=='receptionist'; $('lead-options').hidden=mode!=='lead';
    $('conversation').hidden=mode!=='receptionist'; $('lead-flow').hidden=mode!=='lead';
    $('output-type').textContent=mode==='lead'?'Lead-response sample':'Receptionist sample';
    $('output-title').textContent=mode==='lead'?'A clear next step for your team.':'A useful first conversation.';
    render();
  }));
  document.querySelectorAll('[data-situation]').forEach(button=>button.addEventListener('click',()=>{
    situation=button.dataset.situation;
    document.querySelectorAll('[data-situation]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    render();
  }));
  $('permission').addEventListener('change',render);
  $('retry').addEventListener('click',render);
  let loaded=false;
  $('sample-disclosure').addEventListener('toggle',()=>{if($('sample-disclosure').open&&!loaded){loaded=true;render();}});
})();
