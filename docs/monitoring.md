# Client Health monitoring

The owner-only Client Health workspace lives at `/manage/monitoring` inside the Automation Desk. This deployment monitors Schurr. Client briefs remain preparation records; they are not connected remote deployments.

## Evidence and checks

A manual or authenticated runner check reads the configured inbound number, its exact routed Retell agent and LLM version, lifecycle webhook, installed tool endpoints, privacy setting, approved configuration fingerprint, local database, saved booking settings, sender-verification evidence, unresolved delivery records, runner heartbeat and recent owner-reported phone audition. Provider failures or unsupported routing stay unknown or failed. Missing or stale evidence never becomes a passing health claim. A passing configuration check does not prove telephone audio quality, inbox delivery, booking success or uninterrupted service.

A baseline requires a fresh observation and explicit owner review. The server re-reads provider configuration and guards against a newer run or changed settings before saving approval. Baseline approval does not change the agent. No automatic rollback or provider routing change is implemented.

Signed inbound lifecycle events for the configured agent and number record scalar call facts only. Transcripts, recordings, caller contact fields, arbitrary metadata and model summaries are excluded. Call history joins saved CRM receipts and voice appointment records; an AI-reported successful call is shown separately. Tool results are observed only after provider identity verification. Dry runs are excluded. Instrumentation failures cannot repeat or invalidate the underlying customer action.

## Incidents and alerts

Failures open one active incident for that condition. Repeated events and exact check retries are idempotent. A later passing check can resolve that check incident; unknown cannot. Acknowledgement leaves it open. Owner closure is recorded as manual closure, never verified recovery. Call incidents are individual historical events and are not cleared by unrelated successful calls.

Alert email uses the existing verified sender and fixed owner recipient. The outbox records provider acceptance, not inbox delivery. It freezes payload and connection identity, fences concurrent sends, and limits retries to five attempts within the provider-safe 23-hour window. Ambiguous exhausted attempts require provider review. Events created with alerts disabled stay cancelled after enablement. No customer message is authorized by a monitoring event.

Call observations carry durable reconciliation revisions. A failed incident update remains pending for a later check; compare-and-set completion cannot hide a newer observation. Check receipts similarly recover saved observations after a partial bookkeeping failure. Database checks retain approximately 30 days, cleaned in bounded batches. Call and incident history is paginated; an automatic call-history retention policy is not yet configured.

## Connect background checks

1. From owner Client Health, download the private monitor configuration. It contains a dedicated runner credential; keep it private and enter it only in the monitoring provider's protected request headers.
2. In an independent uptime provider, add a public `GET https://schurrautomations.com/api/health` check expecting HTTP 200. It reveals only application/database availability. This independent service must send its own outage alerts because an unavailable website cannot reliably report its own outage.
3. Add an HTTPS POST check to `https://schurrautomations.com/api/monitoring/run`, with the protected Authorization and Content-Type headers from the file, body `{}`, and a five-minute interval where supported. This credential can run bounded checks and recovery to the fixed owner recipient; it cannot retrieve customer records, change the agent or approve a baseline. HTTP 503 includes failed or unconfirmed critical configuration, not just a proven provider outage.
4. Confirm an authenticated runner heartbeat appears. A single invocation is not evidence of a recurring schedule. Enable expected checks only after the external account is configured. Background evidence becomes overdue after 15 minutes.
5. Connect lifecycle events using the explicit owner action. It only updates a confirmed current draft with no conflicting webhook, preserves existing voice/model/tools/routing, and verifies readback. Published/ambiguous routes are refused. An agent-level webhook supersedes account-level routing for that agent; review existing integrations. Retell does not expose an atomic conditional-update contract, so avoid concurrent dashboard editing during this action.
6. Configure Retell's own error/latency/cost alert rules in its dashboard for the intended agent and owner recipient. These dashboard rules are separate; this application cannot activate them through a documented public API.
7. Make the permissioned live phone audition, verify actual CRM/booking outcomes, then approve the observed baseline. Record greeting continuity, intelligibility and interruption handling in the audition log.

The Site's hourly automation facility is not used to misrepresent a five-minute uptime service. No external monitor account or schedule is provisioned by downloading its configuration. Provider-native alert rules and the actual phone test require separate confirmation.

## Client rollout

Reuse this implementation only after adapting the deployment identity, canonical/native origins, number/agent/LLM, fixed recipient/sender and secrets for an isolated client. Provision a separate database and runner credential, verify webhook signatures and exact routing, test duplicate/failure/recovery paths, configure independent alerts, and record acceptance evidence. Never connect a client by replacing one shared Schurr credential. Central multi-client account enrollment and fleet polling are future work; the UI labels saved briefs as unconnected.

## Recovery and backup

The operational archive includes reviewed monitoring history but excludes runtime secrets, alert payload/sender material and delivery leases. Its isolated restore disables alert sending and runner expectations, clears baseline/heartbeat evidence, invalidates current health and neutralizes notification retries. The restored database is for offline inspection only. It is not a production recovery system or permission to resend historical work.

## Release verification

The integrated v54 checks cover owner/runner authorization, required-check completeness, baseline races, leases, stale evidence, signature/scope validation, duplicate/out-of-order call events, durable call reconciliation, incident deduplication, alert retry/disable boundaries, owner UI state, server rendering and inactive offline restoration. All use synthetic records and mocked providers. The real Worker receptionist regression also passed against a local-only fixture server. TypeScript passed. Build and publication are recorded by the Sites release result; no authenticated desktop/mobile CRM browser review or live phone audition was performed during this work.
