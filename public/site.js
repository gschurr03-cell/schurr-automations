(() => {
  'use strict';
  const knownServices = new Set(['general','calls','leads','website','reviews','marketing','brain','audit','coding','time','growth']);
  // Keep source labels aligned with lib/inquiry-attribution.ts. Never send arbitrary query text.
  const knownSources = new Set(['website','dealer','dealer-card','dealer-hanger','repair','repair-card','repair-hanger']);
  const route = location.pathname === '/' ? '/' : location.pathname.replace(/\/$/, '') + '/';
  window.schurrTrack = (event, service = 'general') => {
    if (!knownServices.has(service)) service = 'general';
    fetch('/api/metrics', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({event,route,service}), keepalive:true}).catch(() => {});
  };
  window.schurrTrack('page_view');
  document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (link?.getAttribute('href')?.startsWith('tel:')) window.schurrTrack(link.getAttribute('href')==='tel:+19857710552'?'demo_phone_clicked':'call_click');
    if (link?.pathname?.replace(/\/$/,'')==='/book') window.schurrTrack('fit_cta_clicked');
    if (link?.pathname?.startsWith('/resources/inquiry-checklist')) window.schurrTrack('worksheet_opened');
    if (link?.pathname?.startsWith('/briefs/')) window.schurrTrack('brief_download', link.pathname.split('/').pop().replace('.pdf',''));
    const serviceButton = e.target.closest('[data-service]');
    if (serviceButton) window.schurrTrack('service_open', ({receptionist:'calls',lead:'leads'})[serviceButton.dataset.service] || serviceButton.dataset.service);
  });
  const form = document.querySelector('#inquiry-form');
  if (!form) return;
  const field = name => form.elements.namedItem(name);
  const status = document.querySelector('#inquiry-status');
  const submit = document.querySelector('#inquiry-submit');
  const compact = form.classList.contains('compact-inquiry');
  const errorSummary = document.querySelector('#inquiry-errors');
  let callbacksEnabled = false;
  let emailEnabled = false;
  const requestLabels = {quote:'Request a quote',information:'Request automation information',call:'Request a call'};
  const updateSubmitLabel = () => { submit.textContent = compact || form.hasAttribute('data-guided-form') ? 'Send inquiry' : requestLabels[field('requestType').value] || requestLabels.quote; };
  field('requestType').addEventListener('change', () => {if(field('requestType').value==='call')field('preferredContact').value='phone';requiredContact();updateSubmitLabel();});
  updateSubmitLabel();
  let submissionKey = '';
  let pending = false;
  let submitted = null;
  let submittedControls = null;
  let uncertain = false;
  let terminal = false;
  let started = false;
  const serviceAliases = {"leads": "calls", "time": "coding", "growth": "reviews", "marketing": "reviews", "brain": "coding", "audit": "website"};
  const selectService = value => {
    const current = serviceAliases[value] || value;
    if ([...field('service').options].some(option => option.value === current)) {field('service').value = current;form.dispatchEvent(new Event('inquiry:sync'));}
  };
  const selectRequest = value => { if (Object.hasOwn(requestLabels, value)) { field('requestType').value = value; if(value==='call'){field('preferredContact').value='phone';requiredContact();} updateSubmitLabel(); } };
  const query = new URLSearchParams(location.search);
  selectService(query.get('service'));
  selectRequest(query.get('request'));
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-inquiry-service]');
    if (link && !pending && !uncertain) {selectService(link.dataset.inquiryService); selectRequest(link.dataset.inquiryRequest || 'quote'); if(form.hasAttribute('data-guided-form'))form.dispatchEvent(new Event('inquiry:prefill'));else setTimeout(() => field('name').focus({preventScroll:true}), 200);}
  });
  form.addEventListener('focusin', e => {if(!started&&e.target.matches('input:not([name=website]),select,textarea')){started=true;window.schurrTrack('inquiry_start',field('service').value);}});
  function requiredContact() {
    if(pending || uncertain)return;
    field('email').required = field('preferredContact').value === 'email';
    field('phone').required = field('preferredContact').value !== 'email';
    const emailChosen=field('preferredContact').value === 'email';
    if(compact){
      for(const channel of ['email','phone']){
        const selected=field('preferredContact').value===channel;
        form.querySelector(`[data-contact-field="${channel}"]`).hidden=!selected;
        field(channel).disabled=!selected;
      }
      field('requestType').value=emailChosen?'quote':'call';
    }
    const emailLabel=document.querySelector('#email-field-label');
    const phoneLabel=document.querySelector('#phone-field-label');
    if(emailLabel)emailLabel.textContent=emailChosen?'Email address *':'Email address';
    if(phoneLabel)phoneLabel.textContent=emailChosen?'Phone number':'Phone number *';
    const canEmail=emailEnabled&&(emailChosen||(!compact&&Boolean(field('email').value.trim())));
    document.querySelector('#automatic-email-option').hidden=!canEmail;
    field('automaticEmailConsent').disabled=!canEmail;
    if(!canEmail)field('automaticEmailConsent').checked=false;
    const canCall=callbacksEnabled&&field('preferredContact').value==='phone'&&field('requestType').value==='call';
    document.querySelector('#automatic-call-option').hidden=!canCall;
    field('automaticCallConsent').disabled=!canCall;
    if(!canCall)field('automaticCallConsent').checked=false;
  }
  field('preferredContact').addEventListener('change', requiredContact);
  field('email').addEventListener('input', requiredContact);
  fetch('/api/website-followup',{cache:'no-store'}).then(r=>r.json()).then(value=>{callbacksEnabled=value.callbacksEnabled===true;emailEnabled=value.emailEnabled===true;requiredContact();}).catch(()=>{});
  requiredContact();
  function clearErrors(){
    if(errorSummary){errorSummary.hidden=true;errorSummary.querySelector('ul').replaceChildren();}
    form.querySelectorAll('[data-inquiry-field-error]').forEach(node=>node.remove());
    form.querySelectorAll('[aria-invalid]').forEach(control=>{
      control.removeAttribute('aria-invalid');
      const ids=(control.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&!id.endsWith('-error'));
      if(ids.length)control.setAttribute('aria-describedby',ids.join(' '));else control.removeAttribute('aria-describedby');
    });
  }
  function showErrors(errors){
    clearErrors();
    for(const [name,message] of Object.entries(errors)){
      const control=field(name);
      if(!control||control.disabled||typeof message!=='string')continue;
      control.id ||= `inquiry-${name}`;
      const id=`${control.id}-error`;
      const inline=document.createElement('span');inline.id=id;inline.className='inquiry-field-error';inline.dataset.inquiryFieldError='';inline.textContent=message;
      control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',`${control.getAttribute('aria-describedby')||''} ${id}`.trim());
      const label=control.closest('label');
      if(label?.classList.contains('form-consent'))label.insertAdjacentElement('afterend',inline);else label?.append(inline);
      if(errorSummary){const item=document.createElement('li'),link=document.createElement('a');link.href=`#${control.id}`;link.textContent=message;link.addEventListener('click',()=>control.focus());item.append(link);errorSummary.querySelector('ul').append(item);}
    }
    if(errorSummary&&errorSummary.querySelector('li')){errorSummary.hidden=false;errorSummary.focus();return true;}
    return false;
  }
  function validForm(){
    if(!compact)return form.reportValidity();
    const errors={};
    for(const control of form.querySelectorAll('input,select,textarea')){
      if(!control.disabled&&!control.checkValidity())errors[control.name]=control.validationMessage;
    }
    if(field('message').value.trim().length<10)errors.message='Please describe the problem in at least 10 characters.';
    if(!field('name').value.trim())errors.name='Enter your name.';
    if(Object.keys(errors).length){showErrors(errors);return false;}
    clearErrors();return true;
  }
  async function request(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
      // Keep the deadline active until the body arrives, not just its headers.
      let body;
      try { body = await response.json(); }
      catch (error) { if (error.name === 'AbortError') throw error; throw new TypeError('Unreadable inquiry response'); }
      return { response, body };
    }
    finally { clearTimeout(timeout); }
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (pending || terminal) return;
    if (!submitted) {
      if (!validForm()) return;
      const values = Object.fromEntries(new FormData(form).entries());
      const sources = new URLSearchParams(location.search).getAll('source');
      values.source = sources.length === 1 && knownSources.has(sources[0]) ? sources[0] : 'website';
      values.message = 'Request: ' + (requestLabels[values.requestType] || requestLabels.quote) + '\n\n' + values.message;
      values.requestKind=values.requestType;delete values.requestType;
      values.consent = field('consent').checked;
      values.automaticEmailConsent=!field('automaticEmailConsent').disabled&&field('automaticEmailConsent').checked;
      values.automaticCallConsent=!field('automaticCallConsent').disabled&&field('automaticCallConsent').checked;
      values.automaticCallConsentVersion='website_ai_callback_v1';
      values.automaticEmailConsentVersion='website_information_v1';
      // Disabled, unchosen contact inputs are absent from FormData. Keep the API
      // contract explicit without submitting a previously typed alternative channel.
      values.email ||= '';values.phone ||= '';
      submitted = values;
      submittedControls = [...form.querySelectorAll('input,select,textarea,button')].map(control => [control,control.disabled]);
    }
    // Keep the exact request in memory across an uncertain save. The API checks
    // the signed key and original body before its atomic, duplicate-safe save.
    const values = { ...submitted };
    const controlStates = submittedControls;
    const wasUncertain = uncertain;
    pending = true;
    controlStates.forEach(([control]) => {control.disabled=true;});
    form.setAttribute('aria-busy','true');
    submit.textContent = 'Saving your inquiry…';
    status.textContent = 'Please keep this page open while your inquiry is saved.';
    status.classList.remove('is-error','is-success');
    let fieldFailure=false;
    try {
      const { response: tokenResponse, body: credentials } = await request('/api/inquiry-token' + (submissionKey ? '?key='+encodeURIComponent(submissionKey) : ''), {});
      if (!tokenResponse.ok || typeof credentials?.token !== 'string' || typeof credentials?.submissionKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(credentials.submissionKey)) throw new Error('The inquiry form is temporarily unavailable. Your details remain here. Please try again or email gavin@schurrautomations.com or call Gavin at (985) 232-8337.');
      submissionKey = credentials.submissionKey;
      values.submissionKey = submissionKey;
      values.token = credentials.token;
      uncertain = true;
      const { response, body: result } = await request('/api/inquiries', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
      if (!response.ok || result?.ok !== true) {
        // These explicit rejections precede a write. A prior uncertain attempt
        // still retains its original payload until its receipt is recovered.
        const callbacksPaused = response.status === 409 && result?.error === 'AI callbacks are currently paused. Uncheck the optional AI callback to send your request to Gavin.';
        if (!wasUncertain && ([400,403,413,415,429].includes(response.status) || callbacksPaused)) uncertain = false;
        if ((response.status === 409 && !callbacksPaused) || response.status === 410) terminal = true;
        if (!uncertain) controlStates.forEach(([control,disabled])=>{control.disabled=disabled;});
        if(result?.fieldErrors)fieldFailure=showErrors(result.fieldErrors);
        const errors = result?.fieldErrors ? Object.values(result.fieldErrors).flat().join(' ') : '';
        throw new Error(errors || result?.error || 'We could not confirm whether your inquiry was saved. Check and retry this inquiry, or contact Gavin.');
      }
      if(typeof result.receipt!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.receipt))throw new TypeError('Missing durable receipt');
      uncertain = false;
      status.classList.add('is-success');
      const emailUpdate=!values.automaticEmailConsent?'':['accepted','delivered','delayed'].includes(result.emailStatus)?' Your information email has been submitted.':['pending','sending'].includes(result.emailStatus)?' Your information email is queued.':' Gavin will review your information request personally.';
      const callUpdate=!values.automaticCallConsent?' Gavin will review your request.':result.callbackStatus==='accepted'?' Your AI callback has been requested.':['pending','dispatching'].includes(result.callbackStatus)?' Your AI callback is queued.':' The automatic callback was not confirmed. Gavin will review your request.';
      const alertUpdate=['failed','uncertain'].includes(result.ownerAlertStatus)?' The owner email alert has not been confirmed; your request is still saved for Gavin.':'';
      status.textContent = 'Your inquiry is saved.'+emailUpdate+callUpdate+alertUpdate+' No appointment has been booked. Reference: '+result.receipt;
      form.reset();requiredContact();submissionKey='';started=false;form.dispatchEvent(new Event('inquiry:saved'));
    } catch (error) {
      status.classList.add('is-error');
      status.textContent = error.name === 'AbortError' || error instanceof TypeError ? 'We could not confirm whether your inquiry was saved. Your details remain here. Try again to check the same reference, or email gavin@schurrautomations.com or call Gavin at (985) 232-8337.' : error.message;
    } finally {
      pending = false;
      controlStates.forEach(([control,disabled]) => {control.disabled=uncertain || disabled;});
      submit.disabled = terminal;
      if (!uncertain) { submitted = null; submittedControls = null; }
      form.removeAttribute('aria-busy');requiredContact();updateSubmitLabel();
      if (uncertain) submit.textContent = terminal ? 'Contact Gavin about this inquiry' : 'Check and retry this inquiry';
      if(!fieldFailure){status.tabIndex = -1;status.focus({preventScroll:true});}
    }
  });
})();
