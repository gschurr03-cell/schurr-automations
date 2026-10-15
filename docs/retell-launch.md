# Schurr Retell launch

The private setup page is `/manage/receptionist`, linked from the response desk. It connects a Retell account, provisions a Schurr LLM and voice agent, verifies the custom-function connection, and enables inbound CRM capture for one dedicated number. The public `/demo/` remains a scripted preview until a real voice has passed auditions.

## Owner setup

1. Open receptionist setup while signed in as the Schurr owner.
2. Enter the Retell API key with the webhook badge. Keep the key out of chat. The key needs access to voices, calls, phone numbers, LLMs and agents. The app verifies it and encrypts it before storage.
3. Load voices, choose a platform voice, and create the receptionist. This creates a new Schurr-specific LLM and agent. It does not buy a number, assign an existing phone number, place a call or send a message. Billing and account access are managed in Retell.
4. Open that agent in the Retell dashboard. Run a browser conversation using fictional details and explicit email/phone/text permission. The capture tool should return `dry_run`, and the Schurr setup page should show the verified connection after refresh. No real lead is created. In text simulations, use non-empty mocks for mutating tools when testing failure responses.
5. Purchase or connect a dedicated number in Retell and assign the agent version for inbound calls. Retell allows draft versions on a number for auditions; publish a stable version after acceptance. Keep Gavin's existing direct line unchanged. Keep Schurr intake in test mode for phone auditions.
6. Run the ten checks on the setup page, then 30–50 real phone conversations across speakers, noise conditions and platform/ElevenLabs voices. Voice/model settings are initial choices, not proven winners. Score naturalness, interruption recovery and pacing from 1–5. Require correct contact capture, permission, tool results, opt-outs and no invented bookings/prices on every applicable call. Retell usage is billed even when the Schurr CRM intake is in test mode.
7. After passing, enter the dedicated number and enable phone lead capture. The backend checks that the number is assigned to the configured agent. Make one controlled inbound call, confirm the request in `/manage/response`, and test withdrawal. Actual inbound rehearsals in live mode create real CRM records; return to test mode for further auditions.

## Conversation and tools

`lib/retell-profile.ts` is the source for the prepared greeting, prompt, function schemas and call checks. It uses short turns, one question at a time, confirmed contact details, explicit permission for the selected method and honest tool confirmations. Prices remain scoped quotes. No calendar, live transfer, customer SMS/email delivery or outbound dialer is connected. Owner alert delivery is prepared separately and remains inactive until its email sender is connected.

The initial GPT-4.1 single-prompt agent uses adaptive speech speed/response timing, moderate interruption sensitivity, ordinary noise cancellation and no canned backchannels or background ambience. These settings require real phone tuning. No user-specific pronunciation has been invented.

### Voice auditions, September 30, 2026

Gavin confirmed that inbound calling works on `+19857710552`, then reported that Sloane sounded slightly robotic and requested a sweet Louisiana accent. Retell's community search returned ElevenLabs `Miranda - Motherly, Tender and Warm`, described by its creator as a middle-aged woman from south Louisiana. It was imported as `Miranda - Schurr Louisiana`, voice ID `custom_voice_ed4c08afd3716bbc8ceb91cbc9`. This is an existing public library voice, not a new voice clone.

The first Miranda audition used `eleven_flash_v2_5` at speed 1. Gavin reported speech was too fast and broken up. A follow-up configuration used `eleven_multilingual_v2`, speed `0.9`, fixed speed and `voice_temperature:0.7`. Before accepting that version, Gavin chose clean neutral English instead of a Southern accent.

The September 30 audition used Retell platform voice `retell-Chloe` (listed as female, American), speed `0.9603` after tuning and a relative 1% slowdown, `enable_dynamic_voice_speed:false`, `voice_temperature:1`, and automatic platform model selection/fallback. Restrained Expressive Mode allows happy, empathetic and curious delivery, with instructions to leave most sentences untagged and avoid sighs, laughter, throat clearing and theatrical delivery. The greeting and prompt use clear neutral American English, short smoothly connected responses and no regional sayings. Gavin reports that browser audio is clearer than telephone audio and has chosen to continue building while phone quality remains unresolved. The implementing agent verified saved settings and call metadata, not recorded audio.

These changes target the existing draft agent `agent_392d73b1d64b4ec905b3d41554`, version 0, and its LLM `llm_75539d70b7fa7788adecdca78b2b`, version 0. Retell holds the authoritative live voice settings. Editing this profile changes the displayed/prepared prompt and future provisioning; it does not automatically update an existing remote agent. Preserve the current remote language model and tools when patching delivery or wording. The initial factory model above is a provisioning default, not a claim about the current account selection.

### Pickup around the second ring

The number-level inbound webhook is `/api/retell/inbound`. Retell keeps the call in the ringing state until the endpoint replies. After signature and destination validation, the endpoint aims for a six-second delay measured from the first request's arrival, then returns `{call_inbound:{}}` to preserve the number's configured agent. This is an approximate second-ring pickup, not an exact ring-count guarantee; carrier timing needs an owner audition. The post-answer greeting delay is unchanged.

`retell_inbound_delays` stores only the provider call ID and first release deadline, so concurrent deliveries and retries do not restart the wait. Expired deadlines are removed on later valid requests after 24 hours. No caller number, transcript or lead is stored by this endpoint. There is no Get Call lookup before answering because Retell has not created the call object yet. Authenticated, correctly addressed calls continue immediately if the timing store fails. Retell's webhook has a 10-second timeout per attempt and up to three attempts; retaining the existing inbound agent assignment lets Retell fall back to that agent if the webhook fails. To remove the added delay, clear only this number's `inbound_webhook_url`.

`POST /api/retell/tools` accepts `capture_lead` and `stop_contact`. Tools have a 10-second timeout and one retry. Requests use the Retell envelope with `args_at_root: false`. The application verifies `X-Retell-Signature` against the exact bounded raw body and the webhook-designated key, with a five-minute timestamp window, before interpreting the request. Call identity comes from the signed envelope, never model arguments.

Test mode does not create contacts, response jobs or new call-level suppression records. Validated test capture updates only the setup verification timestamp. A withdrawal for an already saved live call still pauses that request after an owner switches to test mode.

Live intake retrieves the canonical call from Retell, requiring the configured agent, phone transport, inbound direction, dedicated destination, connected/ended status and a start timestamp. Unknown calls, `registered` calls, other agents, outbound calls and browser calls cannot create live leads. Browser calls remain dry runs. Text simulation `playground` is accepted only for test mode and blocked in live mode. A real inbound phone audition to the live number is deliberately treated as a real call.

One call creates one CRM lead, permission note and reviewable response draft in a transaction. Idempotency is keyed by a server-derived provider/call ID, with a hash of confirmed details. Changed retries conflict instead of overwriting. Stop tombstones dominate capture, retries and deletion. A final SQL admission check prevents new writes if intake changes to test while provider verification is in flight. Existing website inquiries continue to create their own response drafts. Once the durable receipt exists, a failure updating connection timestamps does not turn the saved result into an error. An existing verified request can still be paused if Retell later reports the call as `error`; every canonical identity check remains required and this exception never permits a new capture.

Only the confirmed summary, contact details and permission evidence enter the CRM. The signed Retell request may contain transcript context, which is neither persisted nor logged by this application. The generated agent uses `data_storage_setting: basic_attributes_only`; Retell's provider-side processing and the configured account still need review before live launch. This configuration does not store call audio/transcripts for later quality review. Use consented owner auditions if a separate recording setup is wanted.

## Credentials and recovery

The API key is AES-256-GCM encrypted with a fresh random nonce. The encryption key is derived from the Site's existing high-entropy signing secret through HKDF with a separate purpose. The database contains ciphertext, not a plaintext key. Decryption only occurs server-side for fixed Retell API endpoints and signature verification. No key, provider error payload, transcript or call body is exposed in client responses or logs.

Rotating `INQUIRY_SIGNING_SECRET` requires reconnecting the Retell key; old ciphertext fails closed. The owner-only API requires an approved signed-in identity and same-origin JSON requests. Replacing keys verifies existing agent and LLM access. An uncertain pending LLM creation must be recovered with the original key before replacement.

An owner-supplied key can also be stored as the Site secret `RETELL_API_KEY`. The signed-in receptionist page verifies it and initializes the encrypted connection only when none exists. An existing connection is never overwritten by this bootstrap secret. Update or remove the bootstrap secret when rotating keys. Failed initialization leaves the manual reconnect form available.

`RETELL_INBOUND_NUMBER` supplies the owner's dedicated number in setup when the connection has no saved number yet. Saving this value does not enable live CRM capture or replace the existing public direct-contact number. Activation still verifies the Retell assignment and successful tool test, then persists the number with the live-mode change.

Outbound requests use `redirect: manual` and reject all 3xx responses. Cloudflare workerd does not implement `redirect: error`; using that value fails before the API call. Setup requests have a 20-second timeout; in-call lookup retains a 7-second bound. A workerd regression test exercises the actual helper against success, redirect and unauthorized responses without using a real key.

Provisioning uses a database lease and a unique marker. Confirmed LLM/agent IDs are persisted before progressing. A rejected creation can be retried; a timed-out creation is recovered from the corresponding Retell list before any new create. Recovery currently inspects at most 1,000 LLMs and fails closed if it cannot identify exactly one result. It never guesses an existing customer agent or silently deletes provider resources. Setup credentials and markers are not shared with future client businesses; initial buyer deployments need isolated accounts/storage.

## Validation and remaining work

Verified locally: TypeScript, thirteen Retell integration groups with real SQLite/WebCrypto and simulated provider responses, and fourteen response integration groups. Coverage includes raw-body signatures, encryption/tampering, wrong identity/origin, partial-create recovery, test isolation, canonical phone checks, exact-once capture, changed retries, withdrawal races and intake-mode changes during a request. Failure injection confirms that committed saves stay successful when connection timestamps fail and previously captured calls can withdraw after a provider error. The inbound-delay group checks signature/destination authorization, bounded waits, concurrent retry deadlines, elapsed retry handling, expiry cleanup and graceful continuation if timing storage fails. Actual Retell inbound requests also returned HTTP 200 with approximately 6,001 ms Worker wall time.

The owner connected the real Retell account and created the receptionist. Retell API reads verified the dedicated number's assignment to agent version 0, and the owner confirmed a working inbound call. On September 30 at 10:20 PM Mountain Time, a real Retell Agent Playground Completion rehearsal invoked the deployed `capture_lead` URL with fictional Alex Example / Example Plumbing details, explicit email permission and no tool mock. The tool returned `dry_run`, the database's `last_verified_at` became `2026-10-01T04:20:44.836Z`, and the response table remained empty. This verifies the signed provider-to-CRM connection, not speech recognition or a live CRM save. On October 1, the owner enabled live intake and a real call saved exactly one lead, response draft and permission note. The owner confirmed the captured SV Performance details. Live lead capture is verified.

Speed-to-lead currently creates an immediate response draft for Gavin to review. Automatic delivery still requires a chosen messaging service, explicit channel/automation permission, a durable send queue, delivery/reply handling, suppression and measured time to first response. Calendar booking and transfer also require real tools and account setup. Do not advertise these as active from this release.

## Official references checked

- https://docs.retellai.com/api-references/create-retell-llm
- https://docs.retellai.com/api-references/create-agent
- https://docs.retellai.com/api-references/list-voices
- https://docs.retellai.com/api-references/search-voice
- https://docs.retellai.com/api-references/add-voice
- https://docs.retellai.com/api-references/update-agent
- https://docs.retellai.com/api-references/update-retell-llm
- https://docs.retellai.com/build/tts-provider-comparison
- https://docs.retellai.com/agent/version
- https://docs.retellai.com/features/inbound-call-webhook
- https://docs.retellai.com/build/single-multi-prompt/custom-function
- https://docs.retellai.com/features/secure-webhook
- https://docs.retellai.com/api-references/get-call
- https://docs.retellai.com/api-references/get-phone-number
- https://docs.retellai.com/test/llm-simulation-testing

## October 1: repeated greeting and owner alerts

A fresh API read found the remote agent using `11labs-Julia`, speed `1.14`. Preserve those current account selections; do not overwrite them with the earlier Chloe audition. The caller reported two or three interrupted/restarted greetings. Recent phone calls ended with user hangup and the inbound webhook returned 200 in about six seconds. No stored audio/transcript is available to establish the cause. A targeted PATCH lowered only `interruption_sensitivity` from 0.8 to 0.7, verified by a fresh read; voice, pace, denoising, response timing, greeting delay, privacy setting and response engine remained unchanged. This is a false-interruption trial, not a confirmed fix. Next audition: mute the calling microphone until the greeting ends. Persistent restarting while muted weakens the echo/noise hypothesis.

Owner alerts are fixed to `gschurr@gmail.com`, separately from the ChatGPT owner/login email. The owner-only setup page now accepts a Resend Sending access key, encrypts it with a distinct HKDF/AES-GCM purpose and sends a fixed connection test before activating the connection. No key has been supplied and no real email has been sent at this release. Register Resend with the exact recipient email: `onboarding@resend.dev` is a test-only sender restricted to that account email, requiring no domain for this owner demo. Buyer/customer delivery requires a verified owned sending domain later.

A new confirmed live voice request commits an immutable owner-email payload with the CRM lead in the same D1 transaction. Browser/test calls do not enqueue. Background delivery uses Cloudflare `waitUntil`, a fixed Resend HTTPS endpoint, manual redirects, a 6.5-second timeout, a lease and the same stable idempotency key for retries. One short automatic retry is allowed; provider Retry-After is honored. Failure cannot change the caller's successful capture result. Persistent failures are visible and manually retryable in paginated alert history. There is no scheduled perpetual retry worker. A later webhook retry can also resume the same saved alert. After 23 hours from the first send attempt, ambiguous delivery requires checking Resend instead of resending beyond its 24-hour deduplication window. Acceptance by Resend is explicitly distinct from inbox delivery.

Paused requests are cancelled before a pending send; already accepted messages cannot be recalled and instruct Gavin to check the current request status. Deleting a lead cascades its queued alert. No customer message is sent by this feature. Existing leads are not backfilled automatically. A connection-test email and a fresh controlled captured request are still required before calling owner alerts live and tested.

Validation: 18 Retell integration groups and 14 response groups use real SQLite/WebCrypto with simulated providers. New coverage includes fixed recipient, owner/origin checks, encrypted purpose isolation, activation only after accepted test, lost-response deduplication, outage isolation, concurrent retry leasing, quota delays, expired-window refusal, paused cancellation, redirect rejection and access to older unresolved alerts through pagination.

References:
- https://docs.retellai.com/build/handle-background-noise
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://developers.cloudflare.com/changelog/post/2025-08-08-add-waituntil-cloudflare-workers/

## October 1: approved Berkeley alert address

The owner confirmed alerts should go to `gschurr03@berkeley.edu` for now, matching the existing Resend account. A real generic connection test to Gmail had been rejected with Resend's account-email restriction; a real test to Berkeley was accepted with email ID `01a0f863-17c8-7487-aa92-a0c07a6d3ab0`. Provider acceptance is not an inbox-delivery confirmation. There were no existing alert rows or saved DB connection when this destination change began.

The native Site owner environment can supply `RESEND_API_KEY` as a secret, `RESEND_VERIFIED_AT`, and `RESEND_VERIFIED_FINGERPRINT` after successful direct verification. The fingerprint is SHA-256 of key + newline + exact recipient. Changing the key or recipient invalidates fallback activation until verified again. At that release, a connection stored through the authenticated setup form took precedence; the later Gmail cutover below updates this rule. No owner authentication check is bypassed and no new public configuration endpoint is added.

Before a pending delivery, an untouched, unleased payload may adopt the newly approved destination. Previously attempted messages with a different recipient require review and are never automatically retargeted or sent to the old address. Sending also enforces the current fixed recipient and sender. The connection-test idempotency key now includes the recipient through the fingerprint, preventing a changed test payload from reusing a prior reference.

## October 1: approved Gmail Resend connection

The owner replaced the Resend account/key and explicitly selected `gschurr03@gmail.com` for website and receptionist alerts, superseding both the earlier Berkeley destination and the older `gschurr@gmail.com` preference. The replacement key stays in the native Site secret store. A real connection test was accepted by Resend with email ID `01a0f917-6871-78bd-ade8-08fcc4d0c463`; inbox arrival still requires the owner to check.

The selector uses the newer verification timestamp when both a valid recipient-bound runtime key and an encrypted dashboard connection exist. This lets the newly verified native replacement override an old dashboard key, while a later successful owner dashboard connection can take precedence again. The runtime fingerprint must still match the key plus the exact current recipient.

Recipient-change protections remain: untouched pending payloads may adopt the approved Gmail address, while prior attempts for another recipient require review without resending. Already accepted history is preserved. The CRM login identity and voice configuration are unchanged.


## October 1: branded sender prepared, activation blocked

Prepared the owner-alert sender `Schurr Automations <alerts@notify.schurrautomations.com>` after the owner added the DKIM TXT and both return-path CNAME records. The screenshot displayed green checks, but an actual branded connection-test POST returned HTTP 403: the sending domain is not verified. No verified runtime tuple was created and this change must remain undeployed until that exact sender test is accepted. Production v35 continues using the existing working test sender and Gmail recipient. Complete verification in the Resend dashboard, repeat the same connection-test payload/idempotency reference, then store its successful sender-bound proof and timestamp before deployment.

The fingerprint now covers key, exact recipient and exact sender, separated by newlines. Dashboard credentials use an encrypted version-2 JSON proof inside the existing ciphertext column; legacy raw-key rows and mismatched proofs cannot activate the sender. The newest valid runtime or dashboard proof still wins. No database migration is needed.

Untouched unleased alerts may adopt the approved sender. Previously attempted mismatches require review, retaining their original payload and idempotency reference. Accepted history remains unchanged. Setup text describes the branded sender and keeps automatic customer messages explicitly disabled.

Validation: 28 Retell integration groups pass, including sender fingerprint binding, legacy/mismatched proof rejection, immutable attempted/accepted history and untouched-message cutover. No voice settings, customer delivery or Google Workspace records changed.

## October 1: branded sender activated (v36)

Resend subsequently verified all three records for `notify.schurrautomations.com`. A real connection test from `Schurr Automations <alerts@notify.schurrautomations.com>` to the approved `gschurr03@gmail.com` was accepted with email ID `01a0f96e-4f19-777a-bed7-37e4fccfbc1b`; the owner confirmed receipt. The sender-bound verification proof was saved and v36 deployed successfully. This supersedes the activation blocker above.

## October 1: website inquiry confirmation (v37)

New website inquiries can request one automatic receipt email using a separate, unchecked option when email is the preferred contact method. The saved consent version and wording, original recipient and immutable email payload enter `customer_first_emails` in the same transaction as the inquiry, response draft and owner alert. No existing inquiries or phone leads are enrolled. A contact-free `inquiry_receipts` record survives deletion to prevent replaying a deleted submission with a refreshed form token.

`CUSTOMER_EMAIL_ENABLED=true` and a valid verified Resend connection enable sending. The email uses the branded sender and replies go to `gschurr03@gmail.com`. It confirms receipt and asks the person to reply with additional context; it does not promise a booked appointment or a completed personal response. The CRM retains the personal response task for review and displays the automatic email separately. Gmail replies are not imported into the CRM.

Delivery uses a durable outbox, atomic lease, fixed payload and stable provider idempotency key. Retries remain bound to the original credential fingerprint and stop before the provider's deduplication window expires. There is one short immediate retry; unresolved retries are manual, not scheduled. Sending checks the original and current contact choice, response status and suppression before each attempt. Handling, pausing, correcting, deleting or suppressing a request stops further queued attempts. Already transmitted emails cannot be recalled. Initial sending is limited to one confirmation per address per 24 hours and 100 per UTC day.

The signed Resend event endpoint is `https://schurrautomations.com/api/resend/events`. Configure `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.failed`, `email.bounced`, `email.complained` and `email.suppressed` in Resend, then save the dashboard's signing secret as `RESEND_WEBHOOK_SECRET` and redeploy. Until then the CRM reports provider acceptance only; delivery reports are explicitly shown as disconnected. The current sending-only API key cannot configure webhooks. Raw-body HMAC verification, timestamp bounds, durable event IDs, monotonic status precedence and staging events received before the send response handle tampering, retries and ordering. Only event ID, email ID, type and time are retained. Bounces, complaints and suppressions also block later queued email to that address.

Validation: 12 customer-email integration groups, 28 Retell groups, 15 response groups, 6 CRM rendering/access groups, 12 backend checks, 12 intake-security checks, 11 outreach groups, site-content checks and TypeScript pass. Tests use real SQLite/WebCrypto with simulated provider responses and cover transaction rollback, explicit consent, browser checkbox behavior, concurrent submissions, deletion replay, contact changes, provider ambiguity, credential changes, limits, owner authorization, signed delivery events and out-of-order reconciliation. A live owner inquiry test follows deployment; do not infer inbox receipt from a saved inquiry or provider acceptance.

## October 1 evening: greeting-recovery trial and handoff audit (v48)

Fresh Retell API reads confirmed the dedicated number routes entirely to agent `agent_392d73b1d64b4ec905b3d41554`, version 0, using the `inbound_agents` array. It uses Julia (`11labs-Julia`) at speed 1.14, the current Claude response model, dynamic responsiveness, ordinary noise cancellation and a 250ms opening delay. The database's provisioning voice field is historical and is not the live Retell voice setting.

The live agent was patched only from interruption sensitivity 0.7 to 0.5. The live LLM prompt received a targeted recovery rule: once any part of the opening has played, answer interruptions directly; treat brief hello/connection checks as acknowledgments without another introduction or service list; repeat the opening only on explicit request. An initial shorter instruction failed the hello text rehearsal and was strengthened before handoff. Fresh reads verified these two changes and no other agent/LLM field changes apart from modification timestamps. Voice, pace, model, tools, number assignment, six-second pre-answer ringing delay, opening delay and provider retention remain unchanged. The prepared local prompt includes the same recovery instruction; future-provisioning sensitivity remains a separate default.

This is a false-interruption/recovery trial, not a confirmed acoustic fix. Lower sensitivity can make deliberate interruptions harder, so the next real audition must check both continuity and interruptibility. The inbound endpoint does not speak or recreate the agent, and its stable per-call deadline prevents retries from restarting the waiting period. Lead-tool retries and asynchronous owner alerts occur later and do not replay the opening greeting.

Read-only production evidence links the October 1 call `call_c7937b1a445516f65d6b25b1784` to one saved response/lead and one accepted owner alert. This confirms historical handoff and provider acceptance, not a new post-change audition or inbox receipt. Later calls have no stored audio/transcripts under `basic_attributes_only`, so their disconnect reason and latency metrics cannot prove why a greeting repeated.

The owner call checks now include a muted-microphone opening followed by a separate deliberate interruption. Start with the muted opening on the handset, then unmute and request a callback through the approved contact method if testing capture. A real live-mode callback test creates a real CRM request and owner alert. Do not describe scripted/text tests as proof of phone audio quality.

During the audit, the production request-method gate was found to omit `/api/manage/automations`. This blocked Automation Desk POST actions with 405 before their owner-authenticated handler. The gate now permits the intended GET/HEAD/POST methods, retaining origin, authentication and content-type checks. Regression coverage exercises the request gate as well as the route handlers.

Validation: 28 Retell integration groups, 13 automation groups, nine authentication/Worker groups and TypeScript pass. Provider responses in these integration suites are simulated. Live settings read-back and existing production records are separate evidence; the final phone audition remains pending.

References rechecked:
- https://docs.retellai.com/build/handle-background-noise
- https://docs.retellai.com/api-references/update-agent
- https://docs.retellai.com/api-references/update-retell-llm
- https://docs.retellai.com/api-references/agent-playground-completion

Three live Retell text-playground rehearsals used the current remote agent with all mutating tools mocked. After the recovery-rule refinement, a hello following a partial opening returned only a short connection check; a missed-calls question received a direct relevant answer; an explicit repeat request produced a concise repeat. No customer messages or CRM captures were performed by these rehearsals. They validate these text responses only, not acoustic interruptions or telephone transport.


## October 2: business-inbox preparation

The owner requested the business email connection one step at a time. The mailbox is gavin@schurrautomations.com. The owner-only Email alerts panel now offers **Test business inbox**, reusing the verified server-side sender key without displaying it or requiring another key. Its fixed-target, idempotent email has no customer information. Provider acceptance stores a separately encrypted `business-inbox` proof in `owner_alert_connection`; the active `owner` proof and runtime settings remain unchanged. Normal dispatch still verifies only the active recipient.

The preparation release does not switch routing. The agent could not run the authenticated action because automatic approval review blocked the CRM redirect to ChatGPT authentication. The owner must run the test from their CRM session and confirm receipt. After that, complete the cutover using the prepared proof, update business profile/reply settings and client-generation adaptation, and preserve attempted/accepted outbox records. Gmail OAuth sending and reply sync remain separate unfinished work.


## October 2: owner-confirmed business inbox cutover

The business-inbox test was accepted at 2026-10-02T23:59:10.744Z and Gavin confirmed receipt. Live D1 read before cutover showed the separately encrypted business-inbox proof; automation, CRM and outreach settings had no saved overrides. All three owner alerts and the single customer confirmation were already accepted, with no review or monitoring email queue.

New owner/monitoring alerts and new customer confirmation replies use gavin@schurrautomations.com. The sender remains alerts@notify.schurrautomations.com. Connection selection now considers owner and prepared business-inbox proofs, validates the exact active recipient and sender, and chooses the newest valid proof. The former personal-Gmail runtime proof remains stored but fails the new recipient check; it cannot override the verified business proof. Business-profile, CRM and outreach defaults use the business mailbox. No existing messages were replayed, no customer payloads were rewritten, and login identity/voice settings stay unchanged. Historical emails retain their original reply-to address.

Focused checks cover prepared-proof-only activation and rejection of newer invalid/legacy proofs; automated inquiry and reusable-client checks accompany publication. Gmail OAuth sending, incoming reply synchronization and scheduled outreach remain separate unfinished work.
