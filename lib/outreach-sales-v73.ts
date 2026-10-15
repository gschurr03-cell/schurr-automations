type SalesProfile={sales_subject:string;sales_hook:string;sales_problem:string;sales_actions:string;sales_support:string;sales_value:string};
const capacityHook='If automation removed 30 minutes of admin per person each workday for a two-person team, your business would recover five staff hours each week. That is 20 hours over four five-day working weeks for customers, growth, or getting your evenings back.';
const contractorProof='In a June 2025 Tradify customer case, Fitted Joinery Installation reported cutting quote preparation from 90 minutes to 10 using reusable pricing kits. That is 80 minutes recovered per quote in that business; the owner also reported saving over 10 hours a week.';
const clinicProof='A September 2026 CallRail customer case shows the capacity opportunity: BrainWorks Behavioral Health reported cutting phone time for intake and scheduling by 50–75% with Voice Assist. It handled about 50% more cases from January through August without adding administrative staff. Staff still handled scheduling.';
const beautyProof='In a Boulevard customer case, RUMA Aesthetics, a Utah med spa, reported reducing payroll processing time by 75% after consolidating reporting and commission tracking. The saving was in payroll processing, freeing time for other work.';
const professionalProof='In a Karbon customer case, GSA CPAs, an eight-person accounting firm, reported saving 10 hours per employee each week after improving workflows and client communication. The firm used that capacity to protect personal time as well as support client work.';
const responseProof='The cost of an unanswered inquiry is real. In CallRail’s September 2025 survey of 1,000 U.S. consumers, 21% said they immediately call another business when a call goes unanswered. A faster response gives you a chance to win business that might otherwise go elsewhere.';
// Industry outcomes describe what a project would target. Case-study results are
// named, attributed third-party reports; capacity calculations are conditional.
export function outreachSales(industry:string):SalesProfile{
 const kind=industry.toLowerCase();
 if(/dental|dentist|orthodont/.test(kind))return {
  sales_subject:'More booked appointments. More time for patients.',
  sales_hook:'What would two additional completed appointments a week be worth to your practice? Across four weeks, that is eight more visits. The opportunity starts with helping more of the people already asking about your services take the next step.',
  sales_problem:'Interest alone does not fill a chair. Unanswered questions and delayed follow-up can leave a potential patient undecided, while the front desk spends time repeating information instead of helping the people in front of them.',
  sales_actions:'• More inquiries becoming appointments: make it easier for interested patients to get answers and take the next booking step.\n• More capacity from your existing team: reduce routine replies and repeated administration so staff have time for patients.\n• A workday that ends with less unfinished admin: keep routine follow-up moving without another evening spent clearing the backlog.',
  sales_support:clinicProof,
  sales_value:'more completed appointments and staff hours recovered',
 };
 if(/med\s*spa|medical spa|aesthetic|laser|skin\s*care|skincare|cosmetic surgery/.test(kind))return {
  sales_subject:'More consultations from the interest you already earn',
  sales_hook:'What would two more completed consultations a week mean for your business? Across four weeks, that is eight additional opportunities to earn a client, from people who are already interested in your services.',
  sales_problem:'You invest in getting people interested. That investment has a better chance of paying off when questions get answered, consultations are easy to request, and follow-up continues while your team is with clients.',
  sales_actions:'• More interest turning into booked consultations: help prospective clients move from asking about a service to taking the next step.\n• More time delivering services: reduce repeat questions, routine reporting, and office work around each appointment.\n• More room to grow without longer days: make customer follow-up consistent without putting every message on the owner’s to-do list.',
  sales_support:beautyProof,
  sales_value:'more completed consultations and fewer staff hours spent on repetitive work',
 };
 if(/massage|therap|physio|chiropr|acupunct|podiatr|optometr|counsel|wellness|clinic/.test(kind))return {
  sales_subject:'A fuller calendar without a longer working day',
  sales_hook:capacityHook,
  sales_problem:'Time spent repeating booking instructions and chasing the next response is time unavailable for clients. And an interested person still deciding whether to book needs a useful next step while your team is busy delivering care.',
  sales_actions:'• More inquiries becoming appointments: help interested clients get the answers and next booking step they need.\n• More time with clients: reduce repeated replies and the admin around new-client requests.\n• More of your own time back: keep routine follow-up moving without making the end of every day an inbox catch-up session.',
  sales_support:clinicProof,
  sales_value:'more completed appointments and more time available for clients',
 };
 if(/salon|cosmetolog|barber|hair|lash|nail|wax|esthetic|spa/.test(kind))return {
  sales_subject:'More booked clients. Fewer evenings answering messages.',
  sales_hook:'Two additional completed bookings a week would mean eight more appointments over four weeks. What would those appointments be worth, and how much easier would growth feel if it came with fewer hours answering routine messages?',
  sales_problem:'You work hard to earn interest in your services. When that interest arrives while you are with a client, the opportunity is to keep it moving toward a booking without making you choose between the customer in your chair and the next one.',
  sales_actions:'• More inquiries becoming bookings: help interested clients get a useful answer and take the next step while you work.\n• More time earning from your expertise: reduce routine messages that eat into the gaps between clients.\n• More evenings back: make customer follow-up and honest review requests part of the day without adding another list of messages to send at home.',
  sales_support:beautyProof,
  sales_value:'more completed bookings and fewer hours spent managing routine messages',
 };
 if(/engineer|architect|account|bookkeep|law|attorney|legal|tax/.test(kind))return {
  sales_subject:'What would five hours of expert time back be worth?',
  sales_hook:capacityHook,
  sales_problem:'Your expertise is what clients pay for. Time lost to repeated data entry, routine questions, and document chasing limits the time available to deliver it, earn new work, and respond to promising inquiries.',
  sales_actions:'• More capacity for valuable client work: reduce repeat administration around each engagement.\n• More inquiries reaching a useful conversation: keep interested prospects moving while your team is occupied with existing clients.\n• More control over the working week: reduce the routine backlog that competes with deadlines and personal time.',
  sales_support:professionalProof,
  sales_value:'hours recovered for client work and more suitable inquiries progressing into engagements',
 };
 if(/hvac|heat|air condition|plumb|roof|electric|contract|remodel|renovat|restor|garage|foundation|landscap|pest|clean|tree|window|pool|construction/.test(kind))return {
  sales_subject:'More booked work. More of your week back.',
  sales_hook:capacityHook,
  sales_problem:'The cost of paperwork goes beyond the time spent doing it. An estimate waiting to go out or an inquiry waiting for a callback can mean a customer keeps shopping while your team is busy on the job.',
  sales_actions:'• More booked work from the inquiries you already receive: give interested customers a clearer path to a consultation and keep follow-up moving while your team is on the job.\n• More capacity from the team you already have: cut repeated admin so staff can spend more time serving customers and advancing estimates.\n• More evenings back: reduce the recurring office work that can become a second shift after the site work ends.',
  sales_support:contractorProof,
  sales_value:'more booked jobs, faster estimates, and fewer hours of after-work admin',
 };
 if(/veterin|groom|fitness|pilates|yoga|auto|repair|detail/.test(kind))return {
  sales_subject:'More bookings without more work after closing',
  sales_hook:'What would two additional completed bookings a week be worth? That is eight more over four weeks, alongside the possibility of fewer staff hours spent handling the same questions and follow-up.',
  sales_problem:'When your team is serving customers, the next inquiry still needs attention. Making it easier to respond and book gives that interest a better chance of becoming paid work without stretching the working day.',
  sales_actions:'• More interest becoming paid bookings: help customers get an answer and take the next step while your team is busy.\n• More capacity for the work that earns revenue: reduce repetitive replies and office tasks around each booking.\n• More time back after closing: keep routine follow-up moving without leaving it all for the end of the day.',
  sales_support:responseProof,
  sales_value:'more completed bookings and fewer staff hours of repetitive admin',
 };
 return {
  sales_subject:'More customers. More of your working week back.',
  sales_hook:capacityHook,
  sales_problem:'Growth is harder when every new customer brings another round of repeated work. And while your team is catching up, the next interested prospect still needs a response and a reason to choose your business.',
  sales_actions:'• More inquiries becoming customers: keep interested people moving toward a useful conversation or booking.\n• More capacity from the team you have: cut repeated admin so staff can spend their time on service and sales.\n• More of your own time back: reduce the recurring tasks that keep the business dependent on your constant attention.',
  sales_support:professionalProof,
  sales_value:'more customers won and hours recovered each week',
 };
}
