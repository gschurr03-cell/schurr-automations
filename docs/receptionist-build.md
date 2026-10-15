# Schurr receptionist and speed-to-lead, first implementation

Update: Retell is now the selected first-launch path. See [Retell launch](retell-launch.md) and `/manage/receptionist` for the implemented account connection, agent provisioning and activation flow. The Pipecat gateway below remains an undeployed comparison option. Retell account connection and actual phone auditions are still required.

## Website review

The existing site already has clear business outcomes, request-a-quote positioning, direct owner contact, project briefs, an inquiry form, and an owner CRM. The missing buyer proof was an interaction connected to the offer. The initial response also stopped at lead storage. The existing direct phone number belongs to Gavin; it must not be relabeled as the AI demo number.

The homepage now links to `/demo/`. This is an explicitly scripted preview using fictional details. It explains the qualification conversation, pricing boundaries, owner handoff, and permission-sensitive first-response policy. It does not make calls, send messages, claim bookings, or create test leads in the production CRM.

## Implemented

- Every new website inquiry atomically creates one response job, alongside the existing inquiry and metric. A failed response-job insert rolls back the inquiry; retries create one receipt and one draft.
- `/manage/response` is owner-only. It lists pending, handled, and paused requests, links to real CRM contacts, and supports copying a reply draft. Marking handled is an owner action, not delivery evidence.
- Signed `/api/voice/intake` captures caller-confirmed details, permission evidence and a concise call summary into the same CRM and response desk. It verifies HMAC-SHA256 over timestamp plus exact body and accepts a five-minute clock window.
- A call-level stop record prevents capture/stop races and replay from restoring withdrawn permission. Deleting a voice lead preserves a call reference tombstone so a provider retry cannot recreate it.
- `services/voice` contains an inbound-only FastAPI + Pipecat + Gemini native-audio + Twilio gateway. HTTP and WebSocket signatures, configured account/number checks, a call-bound two-minute ticket, replay checks, four concurrent calls, and a ten-minute session cap protect the entry points. Backend tool calls are authenticated, bounded, and retried once with identical contents.
- No audio recordings or full transcripts are saved by the application. Gateway application logs omit caller details. External provider retention needs to be checked in the actual accounts before activation.

## Current boundaries

This is not a fully operating receptionist or automatic speed-to-lead product yet. Live voice is disabled by default and has not been deployed. No Twilio number, Google API credentials, shared intake secret, messaging provider, calendar, or live phone test is configured. Ordinary website consent permits a personal reply through the selected channel; it is not reused as permission for automated calls or marketing texts.

Response drafts are prepared automatically, but delivery remains manual. There is no automated outbound dialer, SMS/email sender, scheduled retry engine, provider delivery callback handler, live calendar booking, or immediate transfer in this release. The agent can save a callback request; it cannot book or transfer. Owner notifications are also not connected. These are implementation work as well as account-setup work.

The Python gateway starts as one container with one worker and one replica. Ephemeral call slots and ticket replay state are process-local. Do not scale horizontally until those controls are shared. Lead/permission records are durable in the website database. Business profile and voice instructions are Schurr-specific; buyer deployments should initially use isolated credentials and storage, not an unimplemented multi-tenant switch.

## Activation order

1. Provision a dedicated voice-capable Twilio number, keeping Gavin's direct number unchanged. Configure the gateway secrets from `services/voice/config.example`; choose a native-audio Gemini model available to the Google project.
2. Deploy the gateway container on a host that supports long-lived secure WebSockets. Set `PUBLIC_VOICE_ORIGIN` to its actual HTTPS origin. Add the same fresh random `VOICE_INGEST_SECRET` (32+ characters) to the Site and gateway secret settings. Never put credentials in source or browser code.
3. Set the Twilio inbound voice webhook to `https://<voice-host>/twilio/inbound`, POST. Keep `VOICE_ENABLED=false` until configured, then enable for an authorized test call. Publish the phone number only after call acceptance.
4. Verify a real inbound call: disclosure, speech latency, interruption, background noise, callback detail read-back, successful CRM save, failure recovery, stop request, and clean disconnect. Confirm no invented price, appointment, or transfer. Verify the actual public webhook/WS signatures behind the chosen host.
5. Build the consented speed-to-lead delivery slice: separate explicit automated-contact opt-in with wording version, E.164 validation, durable outbox with atomic claiming, delivery callbacks, reply/STOP suppression, ambiguous-send handling, bounded retries, and a real time-to-first-response measure. Connect one approved channel first. No cold outreach contacts are enrolled by this build.
6. Connect one real calendar and implement verified booking results. Add owner notification and controlled transfer. Then replace the scripted preview entry with the tested phone/opted-in callback demo while retaining the preview for explanation.

## Verification

Validated locally: TypeScript, existing intake/CRM/authentication regressions, 14 response integration groups against SQLite, installed Pipecat 1.12.0 imports, and four gateway protocol test groups. Tests use mocked identity/provider boundaries and fictional contacts. No customer was contacted.

Browser visual QA was unavailable because the required managed-preview browser skill was not available in this session. No live Gemini/Twilio call or real provider delivery has been verified. Production owner authentication is inherited from the existing app and still requires a signed-in check.

## Official integration references

- https://docs.pipecat.ai/pipecat/telephony/twilio-websockets
- https://github.com/pipecat-ai/pipecat/blob/main/examples/realtime/realtime-gemini-live-async-tool.py
- https://www.twilio.com/docs/usage/security
- https://www.twilio.com/docs/voice/media-streams/websocket-messages
- https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk
