type SalesProfile={sales_subject:string;sales_hook:string;sales_problem:string;sales_actions:string;sales_support:string;sales_value:string};
const timeSupport='The time adds up quickly. As an illustration, saving 30 minutes of repeated work per day across two team members would return five staff hours over a five-day week. That is capacity for clients, follow-up, or getting home earlier.';
const surveySupport='There is a wider business case for fixing this. In Intuit’s 2024 survey of 630 U.S. owners and executives at businesses with 10–99 employees, 54% reported too many manual and repetitive tasks among the problems with their current apps.';
// These are relevant scenarios and proposed services, not diagnoses or client results.
export function outreachSales(industry:string):SalesProfile{
 const kind=industry.toLowerCase();
 if(/dental|dentist|orthodont/.test(kind))return {
  sales_subject:'The front-desk work between interest and an appointment',
  sales_hook:'An interested patient is a growth opportunity. The calls, questions, and follow-up needed to get them into the chair can also become another job for an already busy front desk.',
  sales_problem:'When the same information has to be collected, entered, and explained repeatedly, your team spends valuable time coordinating care. And if an inquiry has no clear next step, that patient may keep looking elsewhere.',
  sales_actions:'• Give new patients a clearer path: organize consultation requests and prepare your standard first-visit information.\n• Reduce repeated admin: carry agreed contact details into supported workflows instead of entering them again.\n• Keep opportunities moving: make callbacks and unanswered questions visible, with patient-specific decisions handled by your team.',
  sales_support:timeSupport,
  sales_value:'more inquiries progressing toward appointments and more staff time available for patients',
 };
 if(/med\s*spa|medical spa|aesthetic|laser|skin\s*care|skincare|cosmetic surgery/.test(kind))return {
  sales_subject:'What happens after someone asks about a treatment?',
  sales_hook:'Interest in a treatment is valuable. The return comes when that interest becomes a consultation, an appointment, and a client who wants to come back.',
  sales_problem:'Between those steps sit service questions, contact details, consultation information, and follow-up. When every step depends on another manual message, growing the business can mean growing the administrative workload too.',
  sales_actions:'• Turn interest into a next step: organize service inquiries and prepare the right consultation information.\n• Give your team time back: connect routine responses and agreed contact fields across supported tools.\n• Keep follow-up consistent: surface requests still awaiting attention and prepare appropriate customer or review messages for approval.',
  sales_support:timeSupport,
  sales_value:'more interested clients reaching a consultation, with less repetitive work behind each appointment',
 };
 if(/massage|therap|physio|chiropr|acupunct|podiatr|optometr|counsel|wellness|clinic/.test(kind))return {
  sales_subject:'More clients should leave room for your own time',
  sales_hook:'Your expertise earns its value in the time you spend with clients. Every hour spent repeating booking instructions, organizing requests, and chasing the next response competes for that same time.',
  sales_problem:'A new inquiry can create a chain of small jobs before an appointment ever happens. Answer the usual questions. Collect the details. Work out who needs to respond. Repeat the process when the next person gets in touch.',
  sales_actions:'• Help inquiries become appointments: prepare routine first-visit answers and a clear next booking step.\n• Reduce inbox and data-entry work: organize new-client requests and keep agreed details together.\n• Keep follow-up visible: give staff a clear record of callbacks and outstanding questions around your existing booking process.',
  sales_support:timeSupport,
  sales_value:'more time for clients and fewer administrative loose ends at the end of the day',
 };
 if(/salon|cosmetolog|barber|hair|lash|nail|wax|esthetic|spa/.test(kind))return {
  sales_subject:'A fuller appointment book without a fuller inbox',
  sales_hook:'A full appointment book is good for business. Spending the gaps between clients answering the same questions and sorting booking requests can make that growth exhausting.',
  sales_problem:'Service details, booking links, follow-up messages, and review requests are small tasks individually. Repeated throughout the week, they take time that could go toward clients, promoting the business, or stepping away from work.',
  sales_actions:'• Make booking easier: prepare clear service information and the right booking link for routine inquiries.\n• Reduce repeated replies: organize requests and draft standard answers, with personal recommendations left to your team.\n• Build follow-through into the process: keep callbacks visible and prepare timely, honest review requests after completed services.',
  sales_support:timeSupport,
  sales_value:'more inquiries reaching a booking and more breathing room between appointments',
 };
 if(/engineer|architect|account|bookkeep|law|attorney|legal|tax/.test(kind))return {
  sales_subject:'How much expert time is being spent on admin?',
  sales_hook:'Your clients pay for expertise. Re-entering their details, sorting intake information, and preparing the same routine responses can consume the hours you need to deliver it.',
  sales_problem:'As inquiries grow, the administrative work grows with them. Information moves between forms, inboxes, documents, and staff, creating repeated handling before the work that earns revenue has even begun.',
  sales_actions:'• Move suitable inquiries forward: organize intake details and prepare the next response for review.\n• Reduce repeated handling: map agreed information between supported tools and flag missing details.\n• Keep work moving: organize document requests, staff handoffs, and follow-up so the next action stays attached to the client record.',
  sales_support:surveySupport,
  sales_value:'more capacity for valuable client work and less time spent managing the same information twice',
 };
 if(/hvac|heat|air condition|plumb|roof|electric|contract|remodel|renovat|restor|garage|foundation|landscap|pest|clean|tree|window|pool|construction/.test(kind))return {
  sales_subject:'More jobs. Fewer evenings catching up on paperwork.',
  sales_hook:'Winning another job should be a reason to celebrate. When every new inquiry brings more data entry, estimate preparation, and follow-up, a growing business can also mean a longer day.',
  sales_problem:'The work is bigger than the job itself: collect the customer’s details, organize the scope, prepare the estimate, and keep the next conversation moving. Repeating those steps manually takes time away from customers and the work that earns revenue.',
  sales_actions:'• Put the inquiry in one place: collect the requested service, property details, and callback information into a clear job record.\n• Reduce estimate preparation: carry approved information into consultation documents and quote drafts where your pricing rules allow.\n• Make the next action clear: keep the request, customer update, and next callback together so staff can see what needs attention.',
  sales_support:surveySupport,
  sales_value:'more inquiries progressing toward paid work and fewer hours spent catching up in the office',
 };
 if(/veterin|groom|fitness|pilates|yoga|auto|repair|detail/.test(kind))return {
  sales_subject:'Make the next booking easier on your team',
  sales_hook:'Every new customer creates an opportunity to grow. The repeat questions, contact details, and booking follow-up around that customer can also add several small jobs to your team’s day.',
  sales_problem:'Those jobs still need to happen when staff are serving someone else. If requests are scattered across messages and the next action depends on memory, staying on top of inquiries becomes work of its own.',
  sales_actions:'• Give inquiries a clear next step: collect the service request and prepare the usual booking information.\n• Cut repeated office work: organize customer details once and map them into supported workflows.\n• Keep follow-up consistent: show what needs a personal response and prepare routine customer messages for your team to approve.',
  sales_support:timeSupport,
  sales_value:'more opportunities reaching a booking and less repetitive work around each customer',
 };
 return {
  sales_subject:'Could your next stage of growth give you time back?',
  sales_hook:'More customers should create more opportunity. When each one also brings the same data entry, routine questions, and follow-up tasks, growth can start to consume the time you hoped it would give you.',
  sales_problem:'The cost of repetitive work is easy to overlook because it arrives a few minutes at a time. Across inquiries, customer records, documents, and staff handoffs, those minutes compete with sales, service, and running the business.',
  sales_actions:'• Help inquiries become customers: capture the right details and prepare a clear next step.\n• Buy back time: automate repeated information handling and draft routine responses or documents.\n• Keep the business moving: organize staff handoffs and follow-up around the tools and approval rules your team actually uses.',
  sales_support:surveySupport,
  sales_value:'more time for customers and growth, with fewer repetitive tasks depending on you',
 };
}
