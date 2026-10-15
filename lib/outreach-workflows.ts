// Industry suggests a relevant workflow. It is not evidence of a broken process
// or a claim that this business lacks software. Never mine imported notes for claims.
type Workflow={angle:string;opportunity:string;workflow:string;outcome:string;example:string;task:string};
export function outreachWorkflow(industry:string):Workflow{
 const kind=industry.toLowerCase();
 if(/dental|dentist|orthodont/.test(kind))return {
  angle:'More patient inquiries reaching an appointment',
  opportunity:'A new-patient inquiry should move toward an appointment without adding another round of phone tag for your front desk.',
  workflow:'organize consultation requests, prepare your standard first-visit information, and keep the next staff follow-up in one place',
  outcome:'help more interested patients take the next step while cutting repeated admin',
  example:'A consultation request comes in. The contact details and standard next-step response are prepared, and the front desk gets one clear follow-up task. Patient-specific questions stay with your team.',
  task:'the steps between a new-patient inquiry and an appointment',
 };
 if(/med\s*spa|medical spa|aesthetic|laser|skin\s*care|skincare|cosmetic surgery/.test(kind))return {
  angle:'From interested client to consultation',
  opportunity:'Getting interest in a treatment is only the first step. Turning that interest into a consultation takes follow-through.',
  workflow:'organize service inquiries, prepare the right consultation information, and track which requests still need a personal response',
  outcome:'help more inquiries reach a consultation while giving your team time back',
  example:'Someone asks about a service. Their contact details and standard consultation information are ready for your team, with a clear next action. Treatment recommendations stay with your staff.',
  task:'the follow-up between a service inquiry and a consultation',
 };
 if(/massage|therap|physio|chiropr|acupunct|podiatr|optometr|counsel|wellness|clinic/.test(kind))return {
  angle:'More time with clients, less follow-up admin',
  opportunity:'Helping someone become a client should not take a string of back-and-forth messages between appointments.',
  workflow:'organize new-client requests, prepare routine first-visit answers, and give staff one clear list of callbacks and next steps',
  outcome:'help more inquiries reach an appointment without adding repetitive work between sessions',
  example:'A first-visit question arrives. The routine response and next booking step are prepared, while questions needing personal attention go to your team. Your existing booking process stays central.',
  task:'new-client questions and the follow-up around your booking process',
 };
 if(/salon|cosmetolog|barber|hair|lash|nail|wax|esthetic|spa/.test(kind))return {
  angle:'Less inbox work between appointments',
  opportunity:'Time spent repeating service details and chasing booking questions is time you cannot spend with clients.',
  workflow:'organize service inquiries, prepare your usual answers and booking links, and flag requests that need a personal response',
  outcome:'help interested clients take the next booking step with less inbox work for your team',
  example:'A client asks which service to book. Your standard service information and booking link are ready, with anything requiring a stylist’s advice kept for a personal reply.',
  task:'service questions and the follow-up before a booking',
 };
 if(/engineer|architect|account|bookkeep|law|attorney|legal|tax/.test(kind))return {
  angle:'Less admin before the work begins',
  opportunity:'Every new client brings another round of collecting information, sorting documents, and preparing the next step.',
  workflow:'collect inquiry details once, organize the information your team needs, and prepare the next response or follow-up for review',
  outcome:'move suitable inquiries toward paid work with less repeated data entry',
  example:'A new request arrives. The key details are organized into one intake record, the next response is drafted, and your team can see what is still missing before work begins.',
  task:'the repeated intake and follow-up steps before a new project',
 };
 if(/hvac|heat|air condition|plumb|roof|electric|contract|remodel|renovat|restor|garage|foundation|landscap|pest|clean|tree|window|pool|construction/.test(kind))return {
  angle:'More estimates moving, less office work',
  opportunity:'Winning the job takes more than answering the first inquiry. The estimate and follow-up still have to get done.',
  workflow:'collect job details once, prepare quote drafts for jobs with defined pricing, and organize the next follow-up for your team',
  outcome:'help more inquiries reach a customer decision while cutting repeated office work',
  example:'A customer sends job details. Where your pricing rules allow, those details feed a quote draft ready for approval, with the follow-up kept alongside it. Your team controls the final price and what gets sent.',
  task:'the office work between a job inquiry, an estimate, and the next follow-up',
 };
 if(/veterin|groom|fitness|pilates|yoga|auto|repair|detail/.test(kind))return {
  angle:'From service inquiry to the next booking',
  opportunity:'A service inquiry creates several small tasks before it becomes a booking. Repeating those steps takes time away from customers.',
  workflow:'collect request details, prepare your standard service response, and keep the next booking or callback step visible to your team',
  outcome:'help more inquiries become customers with less manual follow-up',
  example:'An inquiry comes in. The customer details, routine response and next action are organized together, so your team can handle the request without piecing it together across messages.',
  task:'the repeated steps between an inquiry and a booking',
 };
 return {
  angle:'More customers, fewer repetitive tasks',
  opportunity:'Bringing in a new customer should not mean repeating the same data entry, answers, and follow-up tasks every time.',
  workflow:'capture inquiry details once, prepare routine responses, and keep the next action organized for your team',
  outcome:'help more inquiries become customers while buying back time spent on repetitive work',
  example:'A customer request arrives. The details are organized, the usual response is prepared, and your team has one clear next action instead of another task to reconstruct.',
  task:'the repeated admin between a customer inquiry and the next step',
 };
}
