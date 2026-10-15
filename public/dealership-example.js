(() => {
  'use strict';

  // This example is intentionally a page-only simulation. No network or storage.
  const fieldset = document.getElementById('nx-inquiry-fields');
  if (!fieldset) return;

  const buyers = {
    alex: { name: 'Alex Morgan', phone: '202-555-0146', email: 'alex.morgan@example.com' },
    casey: { name: 'Casey Reed', phone: '202-555-0179', email: 'casey.reed@example.com' }
  };
  const questions = {
    availability: 'Please confirm vehicle availability and the current details.',
    visit: 'I would like to discuss arranging a visit to see this vehicle.',
    history: 'I would like staff to explain the vehicle history information.'
  };
  const windows = {
    afternoon: 'Weekday afternoon, 3–4 p.m. dealership local time. Requested only.',
    morning: 'Weekday morning, 9 a.m.–noon dealership local time. Requested only.',
    flexible: 'Flexible. Staff must confirm a suitable follow-up time.'
  };
  const $ = id => document.getElementById(id);
  const buyerChoice = $('nx-buyer');
  const questionChoice = $('nx-question');
  const methodChoice = $('nx-method');
  const windowChoice = $('nx-window');
  const simulateButton = $('nx-simulate');
  const resetButton = $('nx-reset');
  const controls = [buyerChoice, questionChoice, methodChoice, windowChoice];
  const targets = ['nx-record-buyer', 'nx-record-contact', 'nx-record-question', 'nx-record-window', 'nx-record-status', 'nx-record-action', 'nx-inquiry-status'];
  if (controls.some(control => !control) || !simulateButton || !resetButton || targets.some(id => !$(id))) return;

  const preset = (choices, value, fallback) => Object.hasOwn(choices, value) ? choices[value] : choices[fallback];

  function render(simulated, announcement) {
    // Only known presets are rendered, even if a select value is changed externally.
    const buyer = preset(buyers, buyerChoice.value, 'alex');
    const method = methodChoice.value === 'email' ? 'email' : 'phone';
    $('nx-record-buyer').textContent = buyer.name + ' · fictional';
    $('nx-record-contact').textContent = (method === 'email' ? 'Email · ' : 'Phone · ') + buyer[method] + ' · fictional';
    $('nx-record-question').textContent = preset(questions, questionChoice.value, 'availability');
    $('nx-record-window').textContent = preset(windows, windowChoice.value, 'afternoon');
    $('nx-record-status').textContent = simulated ? 'Simulated request · callback pending' : 'Preview · not submitted';
    $('nx-record-action').textContent = 'Confirm vehicle information and contact the buyer by ' + method + '. Staff must agree the follow-up time.';
    $('nx-inquiry-status').textContent = announcement;
  }

  for (const control of controls) {
    control.addEventListener('change', () => {
      render(false, 'Preview updated. Choose “Simulate inquiry” to see the handoff state. Nothing has been sent or saved.');
    });
  }

  simulateButton.addEventListener('click', () => {
    render(true, 'Inquiry simulated. The fictional callback is pending with Jordan. No request was sent or saved, and no visit is booked.');
    $('nx-preview-heading')?.focus?.();
  });

  resetButton.addEventListener('click', () => {
    buyerChoice.value = 'alex';
    questionChoice.value = 'availability';
    methodChoice.value = 'phone';
    windowChoice.value = 'afternoon';
    render(false, 'Example reset. Choose the sample details, then simulate the inquiry to see the handoff state.');
  });

  // Native controls only activate after all page elements and handlers are ready.
  fieldset.disabled = false;
  simulateButton.disabled = false;
  resetButton.disabled = false;
})();
