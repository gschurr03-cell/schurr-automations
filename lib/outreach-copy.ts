import type {Step} from './outreach-shared';

// Reviewed 2026-10-03. Industry surveys and named third-party customer reports. Never Schurr results.
const callrail='https://www.callrail.com/blog/missed-calls-cost-businesses-more-than-ever';
const intuit='https://erp.intuit.com/blog/research/business-solutions-survey-2024/';
const tradify='https://www.tradifyhq.com/blog/fast-quotes-perfect-fit-for-fitted-joinery-installationnz';
const brainworks='https://www.callrail.com/blog/brainworks-50-percent-more-cases-without-adding-front-desk-staff';
const brightlocal='https://www.brightlocal.com/research/local-consumer-review-survey/';
export const COPY_SOURCES=[
 {url:'https://www.servicetitan.com/press/bill-joplins-air-conditioning-and-heating-books-over-90-of-calls-with-servicetitan-ai-voice-agent',match:'$74,000',title:'ServiceTitan · Bill Joplin’s Air Conditioning and Heating · June 2026',context:'Provider-published case: HVAC business estimated over $74,000 incremental booked revenue since January deployment, reported June 9, 2026. Booked revenue is not collected revenue or profit. No controlled comparison; not a Schurr result or typical-business projection.'},
 {url:'https://www.joinblvd.com/customer-stories/willow-and-birch',match:'$127,000',title:'Boulevard · Willow & Birch',context:'Provider-published case of a large salon, spa and boutique with 24 styling stations and eight spa rooms. Reported over $127,000 sales attributed to automated campaigns in one year, 900 campaign bookings and 20% retail-sales increase. No publication date or attribution methodology shown. Not incremental profit, a Schurr result, or a promise for a small practice.'},
 {url:'https://birdeye.com/resources/case-studies/h2pro-plumbing/',match:'87 additional jobs over 12 months',title:'Birdeye · H2Pro Plumbing',context:'Published customer case reports 87 additional jobs over 12 months while the business used webchat, review requests and customer texting. Vendor-published reported outcome, not a Schurr result or proof of one isolated feature causing all growth.'},
 {url:'https://www.joinblvd.com/customer-stories/case-study-ruma-aesthetics',match:'payroll processing took 75% less time',title:'Boulevard · RUMA Aesthetics',context:'Utah med spa reported 75% less payroll processing time after improving reporting and commission tracking. The figure covers payroll processing, not all admin; baseline hours and a publication date are not given. Official linked PDF contains the metric. Vendor-published case, not a Schurr result.'},
 {url:'https://karbonhq.com/customer-stories/gsa/',match:'10 hours per employee',title:'Karbon · GSA CPAs',context:'Eight-person accounting firm reported 10 hours saved per employee each week across workflow and communication improvements. 80 staff hours per week is the arithmetic extension of eight employees multiplied by 10 reported hours each, not a separate measurement. No publication date is displayed. Vendor-published case, not an independently measured or Schurr result.'},
 {url:tradify,match:'90 minutes to 10',title:'Tradify · Fitted Joinery Installation · June 2025',context:'Named owner reported quote preparation falling from 90 to 10 minutes using preset pricing kits and saving over 10 hours weekly. The copy’s roughly 89% reduction is our rounded calculation: (90−10)/90; not a separate measured metric. One vendor-published customer account, not a Schurr result or a promised saving.'},
 {url:brainworks,match:'50–75%',title:'CallRail · BrainWorks Behavioral Health · September 2026',context:'Eight-location practice reported 50–75% less intake/scheduling phone time with Voice Assist and about 50% more cases January–August without added administrative staff. Scheduling still required people. This describes capacity to absorb growth, not proof the tool caused demand growth. One vendor-published case, not a Schurr result.'},
 {url:intuit,match:'Intuit’s 2024 survey',title:'Intuit QuickBooks Business Solutions Survey · 2024',context:'August 2024 online survey of 630 U.S. owners and executives at businesses with 10–99 employees. 54% reported too many manual/repetitive tasks as an app challenge. This is self-reported context, not evidence about a recipient or a Schurr customer result.'},
 {url:callrail,match:'1,000 U.S. consumers',title:'CallRail consumer survey · September 2025',context:'Survey of 1,000 U.S. consumers: 21% said they immediately call another business when a call is unanswered. Self-reported behavior; vendor-sponsored research, not the recipient’s missed-call rate.'},
 {url:brightlocal,match:'1,002 U.S. adults',title:'BrightLocal Local Consumer Review Survey · 2026',context:'Representative SurveyMonkey panel of 1,002 U.S. adults: 97% said they read reviews for local businesses. This does not measure sales lift or promise more reviews.'},
];
type Starter={name:string;service:string;audience:string;steps:Step[]};
const email=(subject:string,body:string,delay=0):Step=>({subject,body,delay});
export const STARTERS:Starter[]=[
 {name:'Calls: turn inquiries into next steps',service:'calls',audience:'Local service businesses handling calls for appointments or estimates',steps:[
  email('Calls at {{company}}',`Hi {{contact}},

{{evidence}}

In a 2025 survey of 1,000 U.S. consumers, 21% said they immediately call another business when a call goes unanswered.

I build AI receptionists that answer approved questions, capture job details, and give your team a clear callback request, including after hours.

Would a short example of what the caller hears and your team receives be useful for {{company}}?

{{sender}}`),
  email('From a call to a clear request',`Hi {{contact}},

One practical example: a customer calls about a job, the receptionist gathers the service needed and callback details, and your team gets a summary. Questions outside its instructions go to a person.

Would you like to see that process for {{company}}?

{{sender}}`,3),
  email('A quick receptionist walkthrough',`Hi {{contact}},

If call coverage is a priority, I can show the receptionist, the customer details it captures, and the handoff in 10 minutes.

Would that be worth a look for {{company}}?

{{sender}}`,7),
 ]},
 {name:'Reviews: make the request part of the job',service:'reviews',audience:'Service businesses that want consistent requests for honest customer reviews',steps:[
  email('Review requests at {{company}}',`Hi {{contact}},

{{evidence}}

A 2026 survey of 1,002 U.S. adults found that 97% read reviews for local businesses.

I help make asking for an honest Google review part of finishing a job: the right link, a timely request, and a record of who has already been contacted.

Would you like to see how that could fit {{company}}’s process?

{{sender}}`),
  email('One less task to remember',`Hi {{contact}},

A completed job can prompt a review request, so asking for feedback does not depend on someone remembering at the end of a busy day. The request invites honest feedback and tracks who was contacted.

Would a simple example be useful for {{company}}?

{{sender}}`,4),
  email('A short review-request walkthrough',`Hi {{contact}},

If review requests are on your list, I can show the path from a completed job to a customer request in 10 minutes.

Would you be open to a quick walkthrough?

{{sender}}`,7),
 ]},
 // Keep workflow third to preserve the historical starter index.
 {name:'Business automation: more customers, hours back',service:'coding',audience:'Local businesses that want more customer follow-through and less repetitive work',steps:[
  email('{{sales_subject}}',`{{greeting}}

{{sales_hook}}

{{evidence}}

I'm {{sender}}, owner of Schurr Automations in Boulder. We design and build custom AI and automation systems specifically for each business, around its services, customers, existing tools, and goals.

For {{company}}, that could mean:

{{sales_actions}}

{{sales_support}}

These are reported results from external industry cases. We build your custom system around the time and revenue opportunities your own numbers support.

Would you be open to a 15-minute call? We can help you identify where you’d benefit most, give estimates around the potential time and/or revenue benefit, and give you a clear starting point.

Explore our services and request your call here:
https://schurrautomations.com/

{{sender}}
Owner, Schurr Automations`),
  email('What would one more customer each week be worth?',`{{greeting}}

If a typical sale is worth $1,000, four additional customers over four weeks represent $4,000 in revenue before costs. That is an illustration, not a projection for your business. We would use your average sale, margins, and available capacity to work out what an improvement could actually be worth.

For {{company}}, I would start with people who already show interest. When someone asks a question, requests a quote, or considers booking, a useful response and consistent follow-up can help them take the next step.

In a September 2025 survey of 1,000 U.S. consumers, 21% said they immediately call another business when a call goes unanswered. That puts a real cost behind making interested people wait.

Schurr Automations builds custom automations around both sides of the opportunity: help more inquiries become customers, and reduce the repetitive work needed to serve them. The goal is profitable growth with more room in your week.

For your business, success would mean {{sales_value}}. We would use your current numbers to set a practical target and compare the benefit with setup and running costs.

On a 15-minute call, we can estimate what one additional customer would be worth and which improvement would give you the strongest reason to invest.

See examples and request your call here:
https://schurrautomations.com/solutions/custom-automation/

{{sender}}`,4),
  email('What would 20 hours back over four weeks make possible?',`{{greeting}}

If repetitive work shrank by one hour each working day, you would recover 20 hours over four five-day weeks. That is two and a half eight-hour days for customer work, growing the business, or time away from it.

That is an illustration, but the question is practical: which recurring tasks could give {{company}} the most useful time back?

The value is not limited to the payroll cost of those hours. A faster estimate may give you another opportunity to win work. A timely response may keep an interested customer engaged. Finishing routine admin during the working day may mean an evening that belongs to you again.

Schurr Automations builds custom automations to help create those outcomes. We would focus on {{task}}, looking for repeated work that could be reduced without losing the personal attention your customers value.

You do not need to arrive with a technical plan. Bring a rough idea of how often the work happens, how long it takes, and what another customer is worth. On a 15-minute call, we can turn that into a starting estimate of the opportunity and decide what deserves a closer look.

The investment should make sense after setup and ongoing costs. That is what I want to help you evaluate.

See examples and request your call here:
https://schurrautomations.com/solutions/custom-automation/

{{sender}}`,7),
 ]},
 {name:'Website: make the next step clear',service:'website',audience:'Service businesses with a website and a customer inquiry process',steps:[
  email('Website inquiries at {{company}}',`Hi {{contact}},

{{evidence}}

Customers looking for a service need to know three things quickly: do you cover their area, can you help with their job, and what happens next?

I build websites and inquiry forms that make those answers clear and collect the details your team needs for a useful response.

Would you like a short outline of the inquiry path I’d focus on for {{company}}?

{{sender}}`),
  email('From service page to inquiry',`Hi {{contact}},

One useful check: can a visitor get from your service page to a clear request without wondering what happens after they submit it?

Would you like me to outline that path for {{company}}?

{{sender}}`,4),
  email('A quick website walkthrough',`Hi {{contact}},

If improving website inquiries is a priority, I can walk through the customer’s path and a few specific changes in 10 minutes.

Would that be worth a look?

{{sender}}`,7),
 ]},
 {name:'Assistant audit: check the answers and handoff',service:'audit',audience:'Businesses evaluating a chatbot or AI receptionist, or reviewing one already in use',steps:[
  email('Customer questions at {{company}}',`Hi {{contact}},

{{evidence}}

If you’re using or considering a customer assistant, a useful test is what happens when it cannot answer a question or someone asks for a person.

I review the answers, contact capture, and handoff, then provide a clear list of what works and what needs attention.

Would the short checklist I’d use for {{company}} be useful?

{{sender}}`),
  email('Checking where the request goes',`Hi {{contact}},

One check comes after an assistant says it has taken a customer’s details: does the request reach the right person with enough information to act?

Would you like a sample checklist for that handoff?

{{sender}}`,4),
  email('A short assistant review',`Hi {{contact}},

If you’re evaluating a customer assistant, I can explain the checks and show what a findings report covers in 10 minutes.

Would you like a quick walkthrough?

{{sender}}`,7),
 ]},
];
