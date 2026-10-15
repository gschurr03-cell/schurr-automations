type SalesProfile={sales_subject:string;sales_hook:string;sales_problem:string;sales_actions:string;sales_support:string;sales_value:string};
const revenueProof='In a published AI phone-answering and scheduling case, an HVAC business estimated over $74,000 in additional booked revenue between its January rollout and a June 2026 report.';
const contractorProof=revenueProof+' In a separate quoting-automation case, preset material and labor costs cut reported quote preparation from 90 minutes to 10, roughly 89% less time. The owner also reported saving over 10 hours a week.';
const clinicProof='In a published first-call intake automation case, an eight-location behavioral-health practice reported 50–75% less phone time for intake and scheduling. It handled about 50% more cases from January through August without adding administrative staff. That is more capacity to serve clients with the same administrative team; final scheduling still required a person.';
const beautyProof='In a published automated client-marketing case, a large salon and spa reported more than $127,000 in campaign-attributed sales in one year, 900 campaign-booked appointments, and a 20% increase in retail sales. In a separate med spa reporting-and-commission workflow case, payroll processing took 75% less time.';
const professionalProof='In a published client-workflow and reminder-automation case, an eight-person accounting firm reported saving 10 hours per employee each week. Across that team, that works out to 80 staff hours a week available for client work or time away from the desk.';
const generalProof=professionalProof+' '+revenueProof;
// Email copy describes the automation and reported result. Named sources and
// study limitations remain available in COPY_SOURCES for the owner's review.
function actions(people:string,step:string,admin:string,work:string){return `• Capture more opportunities while your team is working. AI receptionists and lead-response systems answer routine questions, capture inquiries, and help interested ${people} reach the next conversation, including after hours.\n• Turn more website visitors into potential customers. Custom websites and chatbots explain your services, answer common questions, and make ${step} straightforward.\n• Help more local customers find and choose you. Local SEO, Google Business Profile improvements, and consistent requests for genuine reviews strengthen your visibility and give ${people} more reasons to trust your business.\n• Buy back hours of repetitive work. Custom software and workflows reduce the time spent ${admin}, giving your team more capacity for ${work}.`;}
function profile(subject:string,hook:string,people:string,step:string,admin:string,work:string,support:string,value:string):SalesProfile{return {sales_subject:subject,sales_hook:hook,sales_problem:'',sales_actions:actions(people,step,admin,work),sales_support:support,sales_value:value};}
export function outreachSales(industry:string):SalesProfile{
 const kind=industry.toLowerCase();
 if(/dental|dentist|orthodont/.test(kind))return profile(
  'More booked appointments. More time for patients.',
  'A potential patient may be comparing practices while your team is helping someone in the office. If reaching you or getting answers takes too much effort, they can choose another practice before you ever have a conversation. Meanwhile, routine questions, follow-up, and paperwork continue to take more time from your team.',
  'patients','requesting an appointment','handling routine first-visit questions, entering contact details, following up, and finding company information','patients',clinicProof,'more completed appointments and staff hours recovered');
 if(/med\s*spa|medical spa|aesthetic|laser|skin\s*care|skincare|cosmetic surgery/.test(kind))return profile(
  'More consultations. Fewer hours of repetitive admin.',
  'A potential client may be comparing providers while your team is in a consultation. If reaching you or getting answers takes too much effort, the opportunity can disappear before you ever have a conversation. Meanwhile, routine messages, follow-up, and office work continue to take more time out of the day.',
  'clients','requesting a consultation','answering routine questions, preparing reports, entering information, and following up','clients',beautyProof,'more completed consultations and fewer staff hours spent on repetitive work');
 if(/massage|therap|physio|chiropr|acupunct|podiatr|optometr|counsel|wellness|clinic/.test(kind))return profile(
  'More booked appointments. Fewer hours behind a desk.',
  'A potential client may be comparing providers while your team is in a session. If reaching you or getting answers takes too much effort, they can choose another provider before you ever have a conversation. Meanwhile, routine messages, follow-up, and paperwork continue to take more time from clients and life outside work.',
  'clients','requesting an appointment','handling new-client requests, entering agreed contact information, following up, and finding company information','clients',clinicProof,'more completed appointments and more time available for clients');
 if(/salon|cosmetolog|barber|hair|lash|nail|wax|esthetic|spa/.test(kind))return profile(
  'More booked clients. Fewer evenings answering messages.',
  'A potential client may be comparing businesses while you are with someone in the chair. If reaching you or getting answers takes too much effort, they can book elsewhere before you ever have a conversation. Meanwhile, routine messages and follow-up continue to take more time between clients and after closing.',
  'clients','requesting a booking','answering routine questions, entering information, preparing reports, and following up','clients',beautyProof,'more completed bookings and fewer hours spent managing routine messages');
 if(/engineer|architect|account|bookkeep|law|attorney|legal|tax/.test(kind))return profile(
  'More client work. Fewer hours of repetitive admin.',
  'A potential client may be comparing firms while your team is focused on a deadline. If reaching you or getting answers takes too much effort, they can choose another firm before you ever have a conversation. Meanwhile, data entry, document chasing, and routine follow-up continue to take more time away from the work clients value.',
  'clients','requesting a consultation','preparing routine documents, entering information, following up, and finding company information','valuable client work',professionalProof,'hours recovered for client work and more suitable inquiries progressing into engagements');
 if(/hvac|heat|air condition|plumb|roof|electric|contract|remodel|renovat|restor|garage|foundation|landscap|pest|clean|tree|window|pool|construction/.test(kind))return profile(
  'More booked projects. Fewer hours behind a desk.',
  'A homeowner may be comparing contractors while your team is on a job. If reaching you or getting answers takes too much effort, you can lose the project before you ever have a conversation. Meanwhile, quoting, follow-up, and paperwork continue to take more time long after the workday ends.',
  'homeowners','requesting a consultation','preparing estimates, entering information, following up, and finding company information','paying work',contractorProof,'more booked jobs, faster estimates, and fewer hours of after-work admin');
 if(/veterin|groom|fitness|pilates|yoga|auto|repair|detail/.test(kind))return profile(
  'More bookings. Fewer hours of repetitive admin.',
  'A potential customer may be comparing businesses while your team is serving someone else. If reaching you or getting answers takes too much effort, they can book elsewhere before you ever have a conversation. Meanwhile, routine questions, follow-up, and paperwork continue to take more time after closing.',
  'customers','requesting a booking','answering routine questions, entering information, following up, and finding company information','paying work',generalProof,'more completed bookings and fewer staff hours of repetitive admin');
 return profile(
  'More customers. Fewer hours of repetitive admin.',
  'A potential customer may be comparing businesses while your team is busy with existing work. If reaching you or getting answers takes too much effort, the opportunity can disappear before you ever have a conversation. Meanwhile, routine questions, follow-up, and paperwork continue to take more time long after the workday ends.',
  'customers','requesting a consultation','preparing routine documents, entering information, following up, and finding company information','customers and growth',generalProof,'more customers won and hours recovered each week');
}
