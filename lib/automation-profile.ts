import {emptyProfile,type ClientProfile} from './client-templates';
/** Public business facts are separate from private prices, knowledge and credentials. */
export function schurrProfile():ClientProfile{return {...emptyProfile(),businessName:'Schurr Automations',contactName:'Gavin Schurr',industry:'Business automation',website:'https://schurrautomations.com',publicPhone:'+19852328337',alertEmail:'gavin@schurrautomations.com',replyEmail:'gavin@schurrautomations.com',timezone:'America/Denver',
 serviceArea:'Based in Boulder, Colorado. In-person client visits within about a five-hour drive of Boulder, plus virtual service.',
 services:'Services are available in person and virtually. AI receptionists and lead response; websites and website assistants; local SEO and Google reviews; custom software and workflow automation.',
 handoffInstructions:'Use the website contact form to request a personal reply from Gavin. Prices need his confirmation. The receptionist can reserve a phone appointment only when its booking tools confirm the time.',
 qualificationQuestions:'What does your business do? Which task or missed opportunity needs the most help?',
 bookingRules:'Use the enabled native calendar and confirm the returned time, timezone and callback number. External calendar sync is not connected. When booking is unavailable, save a preference for Gavin to review.',
 reviewRules:'One honest review invitation for a completed service with explicit email permission. Apply the same rules regardless of expected rating.',
 faqs:[
 'Where do you work? | We are based in Boulder, Colorado. We visit clients within about a five-hour drive of Boulder and also work virtually. Contact Gavin to arrange an in-person visit. | Owner-confirmed service area',
 'What services do you offer? | We build AI receptionists and lead response, websites and website assistants, local SEO and Google review workflows, and custom business software. | Schurr service guides',
 'Can I try the receptionist? | Yes. Call the Schurr AI receptionist at (985) 771-0552. It can explain our services and save a callback request with your permission. | Schurr live demo',
 'How much does it cost? | Gavin prepares a quote after understanding your business, workload and the tools that need connecting. Use the contact form to discuss your project. | Schurr project process',
 'Can it book appointments? | When native booking is enabled, the phone receptionist can reserve a returned available time after confirming your details. If unavailable, it passes your preference to Gavin. External calendar sync is not connected. | Schurr demo capabilities',
 'Can you work with my existing tools? | We check the integrations and access your applications support, then agree on the connections in your project scope. | Schurr service guides',
 'How do I get started? | Tell Gavin what your business does and which task you want to improve through the website contact form. He will review the request personally. | Schurr contact process'
 ].join('\n')};}
export type AutomationSettings={profile:ClientProfile;revision:number;chatEnabled:boolean;googleEligibility:'unconfirmed'|'online_only'|'visits_customers'|'receives_customers';searchConsoleProperty:string};
export function defaultAutomationSettings():AutomationSettings{return {profile:schurrProfile(),revision:0,chatEnabled:true,googleEligibility:'visits_customers',searchConsoleProperty:''};}
