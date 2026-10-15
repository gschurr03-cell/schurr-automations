(() => {
  'use strict';

  // Local, scripted UI only. There are deliberately no network or storage writes.
  const scenarios = {
    normal: {
      title: 'Normal callback handoff · scripted',
      reply: '“A salesperson will need to confirm availability and the final price. May I take your first name and callback number, and note your preferred time?”',
      next: '“I have your callback request for the sales team. Your preferred window is 3 to 4 today. A salesperson needs to confirm that window and any visit.”',
      owner: 'Jordan · fictional salesperson',
      status: 'Mock task created · staff action pending',
      action: 'Confirm vehicle information and contact Alex. Staff must agree the callback window and any visit.',
      outcome: 'Not contacted yet. No visit or sale recorded.',
      exception: 'Mock event: callback task prepared for Jordan. Staff must accept the handoff and record the outcome. This page does not create a durable task.'
    },
    transfer: {
      title: 'Unanswered transfer · scripted',
      reply: '“I can try to connect you with sales. If no one answers, may I take your details for a callback instead? Staff will need to confirm availability and price.”',
      next: '“No salesperson answered the transfer. With your permission, I have your callback request for the sales team. Your requested window and any visit still need staff confirmation.”',
      owner: 'Jordan · fictional salesperson',
      status: 'Mock fallback task created · staff action pending',
      action: 'Jordan reviews the unanswered transfer and follows up with Alex through the agreed callback path.',
      outcome: 'Transfer unanswered. Buyer has not spoken to sales.',
      exception: 'Mock exception: transfer unanswered. The agreed fallback prepares a callback task for Jordan. It does not mark the buyer connected or an appointment confirmed. No task or alert is sent by this page.'
    },
    write: {
      title: 'Task write fails · scripted',
      reply: '“A salesperson will need to confirm availability and price. May I take your details for a callback request? I will tell you if I cannot pass the request through.”',
      next: '“I could not save your callback request, so I cannot confirm that the team has received it. You can call the dealership’s main desk using the number on its website. No callback or visit has been secured.”',
      owner: 'Taylor · fictional duty manager for exceptions',
      status: 'Mock save failed · callback task not created',
      action: 'Taylor checks the failed task save and uses the agreed main-desk fallback. No callback task is secured.',
      outcome: 'No callback confirmed. No visit or sale recorded.',
      exception: 'Mock exception displayed here only: task destination did not confirm a save. A real installation needs a separately tested exception route to Taylor and an agreed main-desk fallback. If notification also fails, the workflow must not mark the request delivered.'
    }
  };

  const controls = document.getElementById('dealer-demo-controls');
  if (controls) {
    const ids = {
      title: 'dealer-scenario-title',
      reply: 'dealer-assistant-reply',
      next: 'dealer-assistant-next',
      owner: 'dealer-task-owner',
      status: 'dealer-task-status',
      action: 'dealer-task-action',
      outcome: 'dealer-task-outcome',
      exception: 'dealer-exception'
    };
    const buttons = Array.from(controls.querySelectorAll('[data-dealer-scenario]'));
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const scenario = scenarios[button.dataset.dealerScenario];
        if (!scenario) return;
        for (const [key, id] of Object.entries(ids)) {
          const element = document.getElementById(id);
          if (element) element.textContent = scenario[key];
        }
        for (const option of buttons) {
          option.setAttribute('aria-pressed', String(option === button));
        }
      });
    }
    controls.hidden = false;
  }

  const printButton = document.getElementById('print-inquiry-checklist');
  if (printButton) {
    printButton.addEventListener('click', () => window.print());
    printButton.hidden = false;
  }
})();
