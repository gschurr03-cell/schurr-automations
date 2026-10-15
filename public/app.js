'use strict';
if (location.hash === '#about') location.replace('/meet-gavin/');
if (location.hash === '#how-it-works' || location.hash === '#workflows') location.replace('/how-it-works/' + (location.hash === '#workflows' ? '#illustrative-examples' : ''));
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
$$('[data-filter]').forEach(button => button.addEventListener('click', () => { $$('[data-filter]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); }); $$('.service-card').forEach(card => { card.hidden = button.dataset.filter !== 'all' && !card.dataset.category.split(' ').includes(button.dataset.filter); }); }));
const services = {
  "receptionist": {
    "title": "AI receptionist & lead response",
    "description": "Answer calls, recover missed inquiries, and help qualified customers reach the next conversation through an agreed follow-up and booking workflow.",
    "features": [
      "AI call coverage using approved answers, qualification questions, and transfer rules.",
      "Lead recovery and follow-up for agreed missed-call, website, chat, and advertising inquiry sources.",
      "Qualification, appointment requests or supported booking, CRM handoff, and staff notifications.",
      "Agreed follow-up timing, contact permissions, stopping rules, testing, and support."
    ],
    "note": "Phone coverage, response channels, contact permissions, booking connections, and usage are agreed before implementation. Each project is quoted to fit your setup."
  },
  "website": {
    "title": "Websites & chatbots",
    "description": "Build a website for your service business that explains your offer and makes inquiries, quotes, and appointments easier.",
    "features": [
      "A specialized service-business website, an existing-site improvement, a chatbot, or a combination.",
      "Industry-specific service pages, responsive layouts, inquiry or booking actions, and search metadata.",
      "Website chat using approved information, with lead capture and staff handoff.",
      "Chatbot answer and handoff testing, content maintenance, and agreed connections to lead response."
    ],
    "note": "Website and chatbot work can be scoped separately or together. Pages, sources, integrations, hosting, and ongoing maintenance are agreed before development."
  },
  "reviews": {
    "title": "Local SEO & Google reviews",
    "description": "Help nearby customers find your business and build trust through accurate local information and a consistent review process.",
    "features": [
      "Improve Google Business Profile information, service areas, and relevant local service pages.",
      "Prioritize local search improvements and consistent business details.",
      "Request Google reviews after agreed service events using the same eligibility rules for all customers.",
      "Prepare review-response drafts for approval and track local inquiries alongside review activity."
    ],
    "note": "The service excludes purchased or incentivized reviews. Search rankings, review volume, ratings, and revenue are not guaranteed."
  },
  "coding": {
    "title": "Custom software & workflow automation",
    "description": "Organize sales, bring customers back, and reduce repetitive admin with CRM setup, follow-up workflows, and custom software.",
    "features": [
      "CRM setup or cleanup: contacts, pipeline stages, next actions, ownership, and agreed connections.",
      "B2B outreach and appointment workflows: reviewed messages, reply tracking, qualification, and supported booking.",
      "Customer retention: email reminders, rebooking, and reactivation; optional SMS with a configured sender and opt-in contacts.",
      "Quote drafts, onboarding, reporting, and data transfer between compatible business applications.",
      "Custom AI tools, internal dashboards, client portals, or knowledge assistants using approved sources.",
      "Workflow consulting, staff documentation, action approvals, exception handling, and launch checks."
    ],
    "note": "Start with the workflow that would make the biggest difference. We confirm the tools, permissions, messaging setup, and approvals before launch. Appointment-setting work covers systems and workflows; meeting volume is not guaranteed."
  }
};
const goals = window.SCHURR_PROJECT_BRIEFS;
let goal = 'calls';
let activeBrief = 'calls';
const serviceGoals = {receptionist:'calls', website:'website', reviews:'reviews', coding:'coding'};
let activeService = 'receptionist';
const dialog = $('#service-dialog');
const briefDialog = $('#brief-dialog');
$$('[data-service]').forEach(button => button.addEventListener('click', () => {
  activeService = button.dataset.service;
  const service = services[activeService];
  $('#dialog-title').textContent = service.title;
  $('#dialog-description').textContent = service.description;
  $('#dialog-note').textContent = service.note;
  $('#dialog-features').replaceChildren(...service.features.map(text => {
    const li = document.createElement('li'); li.textContent = text; return li;
  }));
  document.body.classList.add('modal-open');
  dialog.showModal();
}));
$('#service-dialog .dialog-close').addEventListener('click', () => dialog.close());
$('#close-brief').addEventListener('click', () => briefDialog.close());
[dialog, briefDialog].forEach(modal => {
  modal.addEventListener('click', event => {
    const r = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) modal.close();
  });
  modal.addEventListener('close', () => { document.body.classList.remove('modal-open'); });
});
function selectGoal(value) {
  value = window.SCHURR_SERVICE_ALIASES[value] || value;
  if (!Object.hasOwn(goals, value)) return;
  goal = value;
  $$('[data-goal]').forEach(item => {
    const active = item.dataset.goal === goal;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  $('#planner-pdf').href = `/briefs/${goal}.pdf`;
  $('#recommendation-title').textContent = goals[goal].title;
  $('#recommendation-text').textContent = goals[goal].text;
  $('#brief-status').textContent = '';
}
$$('[data-goal]').forEach(button => button.addEventListener('click', () => selectGoal(button.dataset.goal)));
$('#dialog-start').addEventListener('click', () => {
  dialog.close();
  renderBrief(serviceGoals[activeService]);
});
function renderBrief(key) {
  activeBrief = key;
  const brief = goals[key];
  $('#brief-pdf').href = `/briefs/${key}.pdf`;
  $('#brief-inquire').dataset.inquiryService = key;
  window.schurrTrack?.('brief_view', key);
  $('#brief-title').textContent = brief.title;
  $('#brief-objective').textContent = brief.objective;
  $('#brief-modal-status').textContent = '';
  $('#brief-sections').replaceChildren(...window.SCHURR_BRIEF_SECTIONS.map(([key, heading], index) => {
    const section = document.createElement('section');
    section.className = 'brief-section';
    const title = document.createElement('h3');
    title.id = `brief-section-${key}`;
    section.setAttribute('aria-labelledby', title.id);
    const number = document.createElement('span');
    number.className = 'brief-section-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1).padStart(2, '0');
    title.append(number, heading);
    const list = document.createElement(key === 'workflow' ? 'ol' : 'ul');
    list.append(...brief[key].map(text => {
      const item = document.createElement('li'); item.textContent = text; return item;
    }));
    section.append(title, list);
    return section;
  }));
  document.body.classList.add('modal-open');
  briefDialog.showModal();
  briefDialog.scrollTop = 0;
  $('#brief-title').focus({preventScroll:true});
}
$('#view-brief').addEventListener('click', () => renderBrief(goal));
function downloadBrief(key) {
  const text = window.formatSchurrProjectBrief(key);
  const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `Schurr-Automations-${key}-Project-Brief.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const status = `${goals[key].title}: your brief download has started.`;
  $('#brief-status').textContent = status;
  $('#brief-modal-status').textContent = status;
}
$('#download-brief').addEventListener('click', () => downloadBrief(goal));
$('#download-open-brief').addEventListener('click', () => downloadBrief(activeBrief));
$('#planner-pdf').addEventListener('click', e => { e.currentTarget.href = `/briefs/${goal}.pdf`; });
$('#brief-inquire').addEventListener('click', () => briefDialog.close());
if (document.modelContext?.registerTool) {
 const lifecycle = new AbortController();
 try { Promise.resolve(document.modelContext.registerTool({name:'select_automation_starting_point',title:'Choose an automation starting point',description:'Select a business bottleneck in the project planner and return the matching recommendation and scoping questions. Does not contact anyone or submit an inquiry.',inputSchema:{type:'object',properties:{goal:{type:'string',enum:['calls','website','reviews','coding']}},required:['goal'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!Object.hasOwn(goals,input.goal))throw new Error('Choose calls, website, reviews, or coding.');const selected=window.SCHURR_SERVICE_ALIASES[input.goal]||input.goal;const button=$$('[data-goal]').find(item=>item.dataset.goal===selected);button.click();$('#start').scrollIntoView({behavior:'instant'});return {goal:input.goal,...goals[input.goal],inquirySubmitted:false};}},{signal:lifecycle.signal})).catch(()=>{}); } catch (_) { /* The regular planner remains available if registration is unsupported. */ }
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
