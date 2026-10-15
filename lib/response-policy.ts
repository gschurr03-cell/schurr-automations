/** Shared, deterministic first-response policy. No provider calls happen here. */
export const SCHURR_PROFILE = {
  business: 'Schurr Automations', owner: 'Gavin', timezone: 'America/Denver',
  greeting: "Thanks for calling Schurr Automations. I'm the AI assistant. I can help with receptionists, lead follow-up, and automation, or take a message for Gavin. What would you like to improve?",
  pricing: 'Gavin prepares a quote after reviewing your needs, call volume, and existing tools.',
  booking: 'Gavin will confirm a time with you. No appointment is booked until you receive confirmation.',
} as const;
export const DEMO_SERVICES = ['calls','leads'] as const;
export type DemoService = typeof DEMO_SERVICES[number];
export type ResponseInput = { name: string; service: string; preferredContact: string; consent: boolean; stopped?: boolean };
export function responsePlan(input: ResponseInput) {
  const subject = input.service === 'calls' ? 'handling calls and new inquiries' : input.service === 'leads' ? 'your lead follow-up' : 'your automation project';
  const question = input.service === 'calls' ? 'Where do calls or new inquiries get missed, and how does your team handle them today?' : input.service === 'leads' ? 'Where do new inquiries come from, and how quickly can your team respond today?' : 'Which part of your current process takes the most time?';
  const blocked = input.stopped || !input.consent;
  return {
    status: blocked ? 'paused' : 'needs_review',
    reason: input.stopped ? 'Contact stopped. No follow-up is scheduled.' : !input.consent ? 'No permission to contact. Keep the request for manual review.' : 'A response is prepared for Gavin to review. Delivery is not connected.',
    channel: ['email','phone','text'].includes(input.preferredContact) ? input.preferredContact : 'email',
    draft: blocked ? '' : `Hi ${input.name.split(/\s+/)[0]}, thanks for reaching out to Schurr Automations about ${subject}. ${question} I work with you directly to find the right setup and prepare a quote. Gavin`,
    question,
  };
}
export function demoScenario(service: DemoService, situation: string) {
  const topic=service==='calls'?'missed calls':'slow lead follow-up';
  const plan=responsePlan({name:'Alex',service,preferredContact:'text',consent:situation!=='no-consent',stopped:situation==='stop'});
  const reply=situation==='pricing'?SCHURR_PROFILE.pricing:situation==='booking'?SCHURR_PROFILE.booking:situation==='handoff'?'I can take a message for Gavin. Please share the best callback number and confirm that he may contact you about this request.':service==='calls'?'We can help answer calls, collect the right details, and route inquiries to your team. When do most of your calls go unanswered?':'We can help capture new inquiries and start the right follow-up. Where are your leads coming from today?';
  return {profile:SCHURR_PROFILE,plan,topic,reply,steps:[
    {title:'Inquiry received',detail:`Alex asks about ${topic}. This is a sample contact.`},
    {title:plan.status==='paused'?'Contact paused':'Reply prepared',detail:plan.reason},
    {title:'Owner handoff',detail:plan.status==='paused'?'No message is sent. Gavin can review the request.':'The request, contact preference, and next question are ready for Gavin.'},
  ]};
}
