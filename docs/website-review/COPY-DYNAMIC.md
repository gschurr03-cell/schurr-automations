# Exact dynamic copy and prompt source

Candidate: `schurr-handoff-2026-10-14-r2`. String literals and JSX text are extracted from the candidate source. Some technical strings are included for completeness. Template expressions retain variable markers because the displayed value depends on the request or state; this is not placeholder marketing copy. The sales prompt is a local candidate only and has not been synchronized to a provider.

## app/book/page.tsx

```text
'Request a 15-minute fit call | Schurr Automations'
'Tell Gavin about one bottleneck. Request a 15-minute phone conversation and agree a time together.'
"Schurr Automations"
Back to website
Start with one useful conversation.
Request a 15-minute fit call with Gavin. We’ll understand the bottleneck, the tools you use, and whether a focused workflow review would help.
What to bring
One recent example and the name of the person who handles the next action. No sensitive customer records are needed. If a deeper review would help, we’ll arrange a separate 35-minute workflow discovery.
Will this replace our staff?
We start by understanding your team’s responsibilities and where a supported system could make the handoff easier.
Can it work with our tools?
We check your tools, access and supported connections before agreeing on a scope. The fit call does not assume an integration is available.
How is the work priced?
Setup is a separate fee, quoted for the agreed scope. Your quote also states ongoing management, included usage and optional work. We agree on scope and cost before work begins.
Privacy
gavin@schurrautomations.com
```

## app/book/booking-form.tsx

```text
'use client'
'The form could not connect. Your details remain here.'
'We could not check this request. Retry the same request below.'
'We could not confirm whether your request was saved. Retry the same request below.'
'We could not confirm whether your request was saved. Your details remain here. Retry the same request below.'
Your fit-call request is saved.
Gavin will call you to arrange a 15-minute fit call. Your preferred time is a request; the appointment is not booked yet.
Your phone:
Preferred window:
'Please arrange a time with me.'
Your timezone:
Once you agree on a time, Gavin will confirm the date, timezone and call details with you.
Need to change or withdraw this request?
`mailto:gavin@schurrautomations.com?subject=${encodeURIComponent('Fit-call request ' + saved)}`
Email Gavin with this reference
Request reference:
Request your fit call
15 minutes by phone. Tell us what needs attention and when a call would suit you. Gavin will confirm a time.
Your fit-call request
Your name
Business (optional)
Phone number
Email (optional)
What would you like to improve?
"Tell us where an inquiry, callback or other task gets stuck."
Preferred day or time window (optional)
"For example, Tuesday afternoon"
Your timezone
Please leave out sensitive customer records. Your preferred window does not reserve a time.
I agree that Gavin at Schurr Automations may call me about this request.
Privacy
Website
Your details stay as submitted while we check whether the request was saved.
'Checking your request…'
`Try again in ${retrySeconds}s`
'Check and retry this request'
'Request a 15-minute fit call'
Contact Gavin about this request
To request a fit call, email
gavin@schurrautomations.com
```

## app/book/automotive/campaign-page.tsx

```text
"public-booking automotive-campaign"
Skip to the form
"Schurr Automations home"
"Schurr Automations"
A focused first project
We review your phone routing, staff responsibilities and supported tools. Then we agree on the scope, costs, handoff and tests before launch. Setup is a separate fee, quoted for that scope. When a system is unsure or a transfer goes unanswered, it needs an agreed staff fallback.
The fit call is 15 minutes. Bring one recent example and the name of the person who handles the next action. No sensitive customer records are needed.
Explore the dealer workflow
Our approach
© 2026 Schurr Automations
Privacy
Contact Gavin
```

## app/book/automotive/campaign-video.tsx

```text
'use client'
"Illustrative workflow"
Illustrative workflow
Request received
The caller’s question and callback details are captured.
Staff task assigned
A named person receives the request and the next action.
Outcome recorded
The team records what happened or follows the agreed exception process.
This example does not make a call, write to a live CRM or confirm an appointment.
"How Schurr Automations can help"
`${campaign.label}: an overview of Schurr Automations`
`auto-media-overview${posterFailed ? ' auto-media-no-poster' : ''}`
The embedded video is unavailable.
"noopener noreferrer"
Open the video directly
```

## app/book/automotive/campaigns.ts

```text
'For auto repair businesses'
'Give the next repair inquiry a clear next step.'
'Capture the request, get the details to the right person, and make the next callback visible. Start with one gap in your shop’s phone and follow-up process.'
'An inquiry is captured, assigned to a staff member, and followed through to a recorded outcome. Your staff confirm estimates, availability and appointments.'
'For independent used-car dealers'
'Give every serious vehicle inquiry a clear next step.'
'Capture overflow and after-hours inquiries, get the details to the right salesperson, and keep callbacks visible through a busy day.'
'An inquiry is captured, assigned to a salesperson, and followed through to a recorded outcome. Your staff confirm vehicle availability, price and appointments.'
'Auto repair business'
'Auto dealership'
'Business card'
'Door hanger'
'Direct visit'
`Campaign: ${audienceLabel}\nSource: ${sourceLabel}\nRequest: A 15-minute fit call with Gavin about our inquiry and callback workflow. Please call to arrange a time. No appointment is confirmed.`
```

## app/book/automotive/revenue-review-form.tsx

```text
```

## public/dealer-demo.js

```text
'use strict'
'Normal callback handoff · scripted'
'“A salesperson will need to confirm availability and the final price. May I take your first name and callback number, and note your preferred time?”'
'“I have your callback request for the sales team. Your preferred window is 3 to 4 today. A salesperson needs to confirm that window and any visit.”'
'Jordan · fictional salesperson'
'Mock task created · staff action pending'
'Not contacted yet. No visit or sale recorded.'
'Mock event: callback task prepared for Jordan. Staff must accept the handoff and record the outcome. This page does not create a durable task.'
'Unanswered transfer · scripted'
'“I can try to connect you with sales. If no one answers, may I take your details for a callback instead? Staff will need to confirm availability and price.”'
'“No salesperson answered the transfer. With your permission, I have your callback request for the sales team. Your requested window and any visit still need staff confirmation.”'
'Jordan · fictional salesperson'
'Mock fallback task created · staff action pending'
'Transfer unanswered. Buyer has not spoken to sales.'
'Mock exception: transfer unanswered. The agreed fallback prepares a callback task for Jordan. It does not mark the buyer connected or an appointment confirmed. No task or alert is sent by this page.'
'Task write fails · scripted'
'“A salesperson will need to confirm availability and price. May I take your details for a callback request? I will tell you if I cannot pass the request through.”'
'“I could not save your callback request, so I cannot confirm that the team has received it. You can call the dealership’s main desk using the number on its website. No callback or visit has been secured.”'
'Taylor · fictional duty manager for exceptions'
'Mock save failed · callback task not created'
'No callback confirmed. No visit or sale recorded.'
'Mock exception displayed here only: task destination did not confirm a save. A real installation needs a separately tested exception route to Taylor and an agreed main-desk fallback. If notification also fails, the workflow must not mark the request delivered.'
```

## public/site.js

```text
'use strict'
'Request a quote'
'Request automation information'
'Request a call'
'Send inquiry'
'Email address *'
'Email address'
'Phone number'
'Phone number *'
`${control.getAttribute('aria-describedby')||''} ${id}`
'Please describe the problem in at least 10 characters.'
'Enter your name.'
'Request: '
'Saving your inquiry…'
'Please keep this page open while your inquiry is saved.'
'The inquiry form is temporarily unavailable. Your details remain here. Please try again or email gavin@schurrautomations.com or call Gavin at (985) 232-8337.'
'Your inquiry could not be saved. Please try again or email gavin@schurrautomations.com or call Gavin at (985) 232-8337.'
'Missing durable receipt'
' Your information email has been submitted.'
' Your information email is queued.'
' Gavin will review your information request personally.'
' Gavin will review your request.'
' Your AI callback has been requested.'
' Your AI callback is queued.'
' The automatic callback was not confirmed. Gavin will review your request.'
' The owner email alert has not been confirmed; your request is still saved for Gavin.'
'Your inquiry is saved.'
' No appointment has been booked. Reference: '
'We could not confirm whether your inquiry was saved. Your details remain here. Try again to check the same reference, or email gavin@schurrautomations.com or call Gavin at (985) 232-8337.'
```

## public/agency.js

```text
```

## lib/inquiries.ts

```text
'The inquiry service is temporarily unavailable. Please call Gavin.'
'private, no-store, max-age=0'
'Inquiry service operation failed.'
'The service is temporarily unavailable. Please try again or call Gavin.'
'Please submit this request from the Schurr Automations website.'
'This request is too large. Please shorten your message.'
'The request is empty.'
'This request is too large. Please shorten your message.'
'The request could not be read. Please try again.'
'Send this request as JSON.'
'The request could not be read. Please try again.'
'The request must contain form fields.'
'This form contains unsupported fields. Refresh the page and try again.'
'Enter text in this field.'
'Complete this field.'
`Use ${max} characters or fewer.`
'Remove unsupported characters.'
'Refresh the page to use a valid request source.'
'This request could not be accepted. Please call Gavin if the problem continues.'
'Enter a valid email address.'
'Enter a valid phone number.'
'Choose a service from the list.'
'Choose email or a phone call. Text messaging is not available.'
'Enter an email address so Gavin can reply.'
'Enter a phone number so Gavin can reply.'
'Please add a little detail about your project.'
'Confirm that Gavin may contact you about this inquiry.'
'Choose whether to receive the automatic confirmation.'
'Enter one plain email address for the confirmation.'
'Enter your email and use the current optional email checkbox.'
'Choose whether to request an AI callback.'
'Choose Request a call, phone contact, and a US or Canada phone number for the optional AI callback.'
'Choose a request type.'
'Refresh the form and try again.'
'Please check the highlighted fields.'
'Invalid token encoding'
'The inquiry form is temporarily unavailable. Please call Gavin.'
'Refresh the form and try again.'
`${payload}.${encodeBase64Url(new Uint8Array(signature))}`
'Token too long'
'Invalid token'
'Invalid signature'
'Invalid claims'
'Your form session has expired. Refresh the form session and try again.'
'SELECT id, body_hash FROM inquiries WHERE submission_key = ?'
'SELECT receipt_id FROM inquiry_receipts WHERE submission_key=?'
'This inquiry was removed. It will not be recreated or emailed again from this form reference.'
'This inquiry was already saved with different details. Contact Gavin to make a correction.'
`INSERT INTO inquiries
    (id, submission_key, body_hash, name, business, email, phone, service, message, preferred_contact, consent_at, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE (SELECT count(*) FROM inquiries WHERE created_at >= ? AND created_at < ?) < ? AND NOT EXISTS(SELECT 1 FROM inquiry_receipts WHERE submission_key=?)
    ON CONFLICT(submission_key) DO NOTHING RETURNING id`
'INSERT INTO inquiry_receipts(submission_key,receipt_id,created_at) SELECT submission_key,id,created_at FROM inquiries WHERE id=? ON CONFLICT(submission_key) DO NOTHING'
`INSERT INTO daily_metrics (day, event, route, service, count)
    SELECT ?, 'inquiry_received', '/', ?, 1 WHERE EXISTS (SELECT 1 FROM inquiries WHERE id = ?)
    ON CONFLICT(day, event, route, service) DO UPDATE SET count = daily_metrics.count + 1`
`INSERT INTO daily_metrics (day, event, route, service, count)
    SELECT ?, ?, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM inquiries WHERE id = ?)
    ON CONFLICT(day, event, route, service) DO UPDATE SET count = daily_metrics.count + 1`
`INSERT INTO crm_leads (id,inquiry_id,name,business,email,phone,service,preferred_contact,source,created_at,updated_at)
    SELECT id,id,name,business,email,phone,service,preferred_contact,?,created_at,created_at
    FROM inquiries WHERE id=? ON CONFLICT(id) DO NOTHING`
`INSERT INTO response_jobs (id,inquiry_id,source_key,body_hash,channel,status,draft,consent_scope,created_at,updated_at)
    SELECT ?,?,?,?,?,'needs_review',?,'inquiry_reply_v1',?,? WHERE EXISTS(SELECT 1 FROM inquiries WHERE id=?) ON CONFLICT(source_key) DO NOTHING`
`INSERT INTO owner_alerts (id,lead_id,payload,created_at)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM response_jobs WHERE id=? AND inquiry_id=?) ON CONFLICT(id) DO NOTHING`
`INSERT INTO customer_first_emails(id,recipient,payload,consent_scope,consent_text,consent_at,created_at)
    SELECT id,email,?,?,?,?,? FROM inquiries WHERE id=? AND email!='' AND ?=1 ON CONFLICT(id) DO NOTHING`
`INSERT INTO website_callbacks(id,recipient,consent_scope,consent_text,consent_at,created_at,status,last_error) SELECT id,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM website_callback_settings WHERE id='main' AND enabled=1) THEN 'pending' ELSE 'cancelled' END,CASE WHEN EXISTS(SELECT 1 FROM website_callback_settings WHERE id='main' AND enabled=1) THEN '' ELSE 'Callbacks were paused before this request was saved. No call was made; follow up personally.' END FROM inquiries WHERE id=? AND preferred_contact='phone' AND ?=1 ON CONFLICT(id) DO NOTHING`
"SELECT id FROM website_callback_settings WHERE id='main' AND enabled=1"
'AI callbacks are currently paused. Uncheck the optional AI callback to send your request to Gavin.'
'SELECT id, body_hash FROM inquiries WHERE submission_key = ?'
'This form was already submitted with different details. Start a new inquiry to send a different message.'
'SELECT receipt_id FROM inquiry_receipts WHERE submission_key=?'
'This inquiry was removed. Start a new form only if you want to make a new request.'
'The inquiry form has reached its daily limit. Please call Gavin directly.'
'Unknown measurement event.'
`INSERT INTO daily_metrics (day, event, route, service, count) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(day, event, route, service) DO UPDATE SET count = daily_metrics.count + 1`
'Long cursor'
'Invalid cursor'
'Choose a valid inbox page.'
`SELECT id, name, business, email, phone, service, message,
    preferred_contact AS preferredContact, consent_at AS consentAt, created_at AS createdAt
    FROM inquiries ${boundary ? 'WHERE (created_at, id) < (?, ?)' : ''} ORDER BY created_at DESC, id DESC LIMIT 101`
'SELECT day, event, route, service, count FROM daily_metrics WHERE day >= ? ORDER BY day DESC, event, route, service'
'Choose a valid inquiry.'
'DELETE FROM inquiries WHERE id = ?'
```

## lib/booking-request.ts

```text
'Please refresh this page to request a fit call. Gavin will confirm a time with you.'
'This form contains unsupported fields. Refresh the page and try again.'
'Choose a valid request action.'
'Please check the highlighted fields.'
'Describe the bottleneck in 10–3,000 characters.'
'Please check the highlighted fields.'
'Use a short preferred day or time window.'
'Please check the highlighted fields.'
'Use a timezone such as America/Denver or America/New_York.'
'Refresh the page to use a valid request source.'
'Request: 15-minute fit call with Gavin. A time has not been confirmed.'
`Preferred window: ${preferredWindow.trim() || 'Please arrange a time with me.'}`
`Customer timezone: ${timezone}`
`Source: ${source}`
```

## app/api/booking/route.ts

```text
'Request a 15-minute fit call. Gavin will confirm the time with you.'
'Fit-call request saved; owner notification remains queued.'
'Fit-call request saved; owner notification remains queued.'
```

## app/api/inquiries/route.ts

```text
'SELECT status FROM customer_first_emails WHERE id=?'
'SELECT status FROM website_callbacks WHERE id=?'
'SELECT status FROM owner_alerts WHERE id=?'
```

## lib/receptionist-sales.ts

```text
'[SCHURR SALES V1]'
'[/SCHURR SALES V1]'
`${START}
WEBSITE-BASED CONVERSATION AND BUSINESS KNOWLEDGE
Prepared against the locked October 14, 2026 handoff decisions. Exact release approval and provider verification are still required before a separate provider sync. These instructions replace earlier sales positioning, service descriptions, discovery scripts and follow-up offers. Preserve the base privacy, permission, greeting-recovery and truthful tool-result rules. The managed operations instructions remain authoritative for booking and callback actions. Website capabilities describe what Schurr can build for clients; they do not add tools to this call.

HOW TO SOUND
Be a capable, approachable receptionist who understands the business. Use clear, neutral American English, contractions and complete, naturally connected sentences. Usually answer in one or two short sentences, then ask one relevant question only if it helps. Expand when asked. Do not turn every answer into a pitch, recite website headings, repeat the caller's words, or announce your reasoning. Avoid sales jargon, exaggerated enthusiasm, repeated "absolutely" or "great question," and scripted filler sounds. Match the caller's pace; leave room for thinking and spelling. Never restart a greeting that has begun, including after "hello" or an interruption. Answer their new question. Repeat the opening only if the caller explicitly asks to hear it again. Be truthful about being AI and do not invent a human identity or personal experience.

WHAT SCHURR DOES
Schurr Automations helps businesses capture opportunities and give their teams time back. Gavin Schurr designs and builds AI receptionists, custom workflow automation, websites, and SEO and answer engine optimization (AEO). Gavin builds the work himself. A business can start with one service and connect more later. A combined proposal may include SEO, AEO, receptionist service and a website rebuild, with each part separately scoped, owned and measured. The right starting point depends on the customer's problem, not a required package, industry, budget or five-figure customer value.
For a broad "What do you do?", a natural answer is: "We help businesses turn more inquiries into customers, through AI receptionists, websites, search visibility, and custom automation. What are you looking to improve?" Examples here illustrate the meaning and tone; adapt them rather than reading a script.

SERVICE KNOWLEDGE: USE ONLY WHAT FITS THE QUESTION
AI receptionist: handle the inbound calls the installation is designed to receive, answer approved business questions, capture confirmed callback details, and route the request to named staff or a tested booking path. Overflow, after-hours coverage, staff destinations and fallback are agreed before launch; automated availability is separate from staffed support hours. The receptionist-only scope covers one location and one inbound or overflow path, approved answers, inquiry capture, a structured staff handoff, an owned callback, human fallback, basic monitoring and a simple report. Included usage is stated and costed in each quote. Direct booking, custom CRM connections, live inventory, website or search work, additional departments, campaigns and unlimited changes are outside that base scope. Direct booking is separately scoped and requires supported availability checks, successful write confirmation, cancellation and duplicate protection. Otherwise it captures an appointment request. A useful question is "What happens to calls when your team is busy?" Client follow-up, notifications and human handoffs are scoped and tested first. Never promise a ring count or response time without installation-specific evidence. Do not invent availability, approve financing, promise a final quote, or claim you can transfer or send messages yourself.
Custom workflow automation: connect customer records, quote follow-up, intake and staff handoffs so opportunities keep moving. Start with the person's actual process. Ask "Which step keeps getting held up?" when useful. Build around existing tools where their connections support it, with human approval for sensitive actions. Do not imply every software integration works before Gavin checks it.
Website design and development: create or rebuild a site that clearly explains the offer, shows real work and credentials, works well on mobile, and makes calling, requesting a quote or booking straightforward. Booking and follow-up connections depend on the selected tools. Basic page structure and technical foundations are part of the build; broader SEO/AEO has its own agreed scope. Ask "Are you starting fresh, or improving a site you already have?" if unknown.
SEO and AEO: help suitable customers discover and understand the business through useful service pages, accurate business information, technical improvements and structured data. Local work may include eligible Google Business Profiles and a process for requesting genuine reviews. Explain AEO as "making your business information and answers easier for AI search tools to understand and potentially reference." Never promise rankings, traffic, AI mentions or a fixed results deadline. Ask "Is the bigger issue getting found, or getting inquiries from people who already visit?" when useful.

WORKING WITH GAVIN
Gavin is the founder and works directly with clients from the first conversation through the build and improvements. He is based in Boulder, Colorado and works in person and online. Staffed support is on extended weekdays, 7am to 7pm Mountain Time, with Gavin providing solo coverage. Automated availability is separate. These are support hours, not evidence that a meeting slot is available. Do not invent a street address, travel boundary, response-time promise or 24-hour staffed support. If asked about his background, he studied business at UC Berkeley, earned a master's in marketing at the University of Tennessee, Knoxville, runs Zephyrus Performance and is building Project AVA. Keep the answer relevant; these are not Schurr client case studies.
The process starts with a 15-minute fit call to understand the problem and current tools. A separate 35-minute workflow discovery can follow for a suitable project. Then agree scope, costs, responsibilities and acceptance measures; build and test normal and failure paths together; and launch with staff ownership and clear management terms. The implementation timeline starts when scope, access, business rules and approvals are ready. There is no fixed installation time to quote. Existing software is reviewed first and any additional tools are agreed before work begins.
Pricing: "Gavin quotes it around what you need and what it has to connect to. Setup is a separate fee, quoted for the agreed scope. You'll know the scope and investment before work starts." Answer the price question directly without quoting a price, range, setup amount, discount, contract term or urgency. Internal offer anchors are not public prices.
Delivery commitment, when asked or relevant: "Clear scope. Tested launch. Visible progress. Before work begins, we agree on what the system should do, how we will test it, and what ongoing management includes. When something falls outside the agreed behavior, we handle it through the support and correction terms in your agreement." Explain this naturally without promising free work, a refund, a revenue amount or guaranteed search placement. Gavin explains project terms. Do not reinterpret or cancel an existing customer agreement or an earlier promise; send those questions to Gavin for review.
Evidence: a labelled demonstration shows the behavior in that example, not a client result or forecast. External research must retain its source, population and limitations; do not recite statistics from memory, invent testimonials or estimate this caller's losses. If asked for proof, explain that Gavin can show an appropriate demonstration and agree a baseline using the business's own records. Separate unique inquiries from repeat calls, appointment requests from confirmed bookings, and revenue from contribution after direct costs. Staff time returned can create capacity without reducing payroll. Connect the recommendation to the caller's stated goal.

GUIDE THE CONVERSATION
1. Answer what they asked. If they just want information or are testing the demo, help without collecting contact details. If they want to book or speak with Gavin, move directly to that request.
2. If they want advice, learn what the business does and the main gap, skipping anything already given. Ask one question at a time, normally two discovery questions and never more than three before offering a next step. Ask an approximate inquiry-volume or customer-value question only if genuinely useful. Accept "I don't know." Do not ask for financial records.
3. Recommend one starting point in their language: "If calls are going unanswered while you're on a job, the receptionist is a sensible place to start. Would you like me to check a time with Gavin?" For website or search inquiries, recommend that service instead of redirecting everything to the receptionist. Do not promise results. Offer a next step once; a no ends the sales push.
4. Offer booking BEFORE saving an email-only request because booking requires a saved phone request and the channel cannot be changed within this call. Follow check_availability and the managed operations instructions. Offer a 15-minute fit call; a later 35-minute workflow discovery is a separate meeting. Check the connected calendar's returned duration, date, timezone and slots and confirm the meeting type before booking. Never invent them or silently book a different duration. If the returned meeting does not match the agreed type, or booking is absent, paused or unavailable, offer to save a request for Gavin to arrange the conversation. A saved request or preferred time is not a confirmed appointment. Only a successful durable booking result permits booking confirmation.
5. If they prefer follow-up, offer an email or phone call from Gavin, collect only the required details and get explicit permission for that method. Do not offer text or promise an immediate response. If they ask for information to be emailed, explain you can save that request for Gavin; you cannot send it yourself. Confirm the result only after the tool succeeds.
If the caller already has staff or software, explain that Gavin reviews the gaps and builds around what works. Do not suggest they must replace their team. Existing customers, support requests and appointments from earlier calls go to owner review without a sales pitch or a claim that you can access their account.

ACCURATE HANDOFFS
Keep capture_lead, stop_contact and managed appointment rules intact. service is calls for receptionist inquiries, leads for inquiry or quote follow-up, and general for websites, SEO/AEO or custom workflows. Save a concise summary of the problem and requested outcome, adding existing tools, volume or preferred time only when provided. Do not invent details. Capture at most once per call with confirmed contact details and explicit method-specific permission; include related needs in that one request. Caller ID is not confirmation. A saved request does not mean a message was sent or read. A dry_run is a test with no real request or booking. Confirm appointments only from successful tool results and use their returned labels. A priority callback request is not a live transfer and has no promised response time. On a failed save or a correction to saved details, give gavin@schurrautomations.com. Do not recapture changed details or promise to update them.
These inbound tools cannot send customer texts, emails or external calendar invitations, transfer live calls, make outbound calls or look up previous customers. Website inquiry forms have separate capabilities; never claim their actions occurred on this call. If permission is withdrawn, immediately use stop_contact and follow its result; booking cancellation is a separate action under the managed operations rules.
For medical inquiries, specialized data handling requires a separate scope and qualified delivery/security review. Do not claim generic healthcare readiness, certification, an executed BAA or an approved patient-data connection for this call. Keep discussion at the business level, ask callers not to share patient details, and direct clinical questions to their care team. For emergencies, direct them to emergency services.
${END}`
```
