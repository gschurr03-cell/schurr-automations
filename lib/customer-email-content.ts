import {OWNER_ALERT_FROM,OWNER_ALERT_EMAIL} from './owner-alert-content';

export const CUSTOMER_EMAIL_CONSENT='website_confirmation_v1';
export const CUSTOMER_EMAIL_CONSENT_TEXT='Email me one automatic confirmation of this inquiry. (Optional)';
export const CUSTOMER_EMAIL_SUBJECT='We received your Schurr Automations inquiry';
export const CUSTOMER_EMAIL_STATUSES:Record<string,string>={pending:'Queued',sending:'Sending or awaiting confirmation',accepted:'Accepted by email provider',delivered:'Accepted by recipient mail server',delayed:'Delivery delayed',failed:'Needs attention',uncertain:'Delivery uncertain; review in Resend',cancelled:'Further sending stopped',bounced:'Bounced',complained:'Spam complaint',suppressed:'Suppressed'};
export function customerEmailPayload(recipient:string,id:string){
  return JSON.stringify({from:OWNER_ALERT_FROM,to:[recipient],reply_to:OWNER_ALERT_EMAIL,subject:CUSTOMER_EMAIL_SUBJECT,
    text:`Thanks for reaching out to Schurr Automations. Your inquiry is saved for Gavin to review.\n\nIf you have a deadline or anything else to add, reply to this email and it will go directly to Gavin.\n\nSchurr Automations\n(985) 232-8337\nhttps://schurrautomations.com\n\nAutomatic inquiry confirmation\nReference: ${id}`,
    tags:[{name:'purpose',value:'inquiry_confirmation'},{name:'inquiry_id',value:id}]});
}

export const INFORMATION_EMAIL_CONSENT='website_information_v1';
export const INFORMATION_EMAIL_CONSENT_TEXT='Email me a confirmation, information about the services I selected, and a link to book a call. One email, no mailing list. (Optional)';
const SERVICE_INFORMATION:Record<string,string>={
 calls:'AI receptionists and fast lead response: help more inquiries become booked conversations by answering routine questions, capturing the right details, following up with permission, and offering appointments.',
 website:'Websites and chatbots: give visitors a clear reason to get in touch, answer common questions, capture qualified inquiries, and make booking the next step easier.',
 reviews:'Local visibility and reviews: improve your Google Business Profile and relevant service pages, and make it easier for eligible customers to leave genuine reviews.',
 coding:'Custom software and workflow automation: organize your CRM, improve sales follow-up and customer retention, speed up quoting, and connect the tools you use. Custom AI tools, dashboards, and portals are built around the work your team needs to do.'
};
export function informationEmailPayload(recipient:string,id:string,service:string){
 const selected=SERVICE_INFORMATION[service];
 return JSON.stringify({from:OWNER_ALERT_FROM,to:[recipient],reply_to:OWNER_ALERT_EMAIL,subject:'Your next step with Schurr Automations',text:[
  'Thanks for reaching out to Schurr Automations. Gavin has your inquiry and will review what you want to improve.',
  selected||'We build custom systems for each business to help turn more inquiries into customers, reduce repetitive work, and make daily operations easier to manage.',
  'Depending on your needs, that can include AI receptionists and lead recovery, CRM setup, outreach and appointment workflows, customer retention emails, specialized websites and chatbots, Google Business Profile and local SEO work, or custom software. SMS retention can be scoped with a configured sender and opted-in contacts.',
  'The starting point is the outcome: hours you could save each week, inquiries you could recover, or extra capacity you could create. We estimate the opportunity from your current workload and numbers before recommending a system.',
  'We can help you identify where you’d benefit most, give estimates around the potential time and/or revenue benefit, and give you a clear starting point.',
  'Choose a time for a discovery call: https://schurrautomations.com/book',
  'Explore what we offer: https://schurrautomations.com',
  'Or reply with the task that takes the most time, the number of inquiries you receive, or where customers tend to drop off. Your reply goes directly to Gavin.',
  'Gavin Schurr\nSchurr Automations\n(985) 232-8337',
  'You requested this one-time email when submitting your inquiry. You have not been added to a mailing list.\nReference: '+id
 ].join('\n\n'),tags:[{name:'purpose',value:'inquiry_information'},{name:'inquiry_id',value:id}]});
}
