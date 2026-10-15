# Automation Desk

The owner-only CRM entry `/manage/automations` combines operational tools, incoming requests, client setup briefs and guided demonstrations. Existing lead, pipeline, follow-up, outreach and settings records keep their existing routes and behavior. Migration 0016 adds settings, operation receipts and review invitation delivery records; it does not alter previous records.

## Confirmed business model

Gavin confirmed on October 1, 2026 (America/Denver) that Schurr is based in Boulder, Colorado, visits clients in every city within about a five-hour drive, and also provides virtual service. Use a service-area business setup with no public street address. The starter brief and public default FAQ reflect the actual travel policy. Existing saved owner settings are not overwritten by these defaults.

Google generally recommends an overall listed service area within about two hours of the base, entered as up to 20 named cities/postal areas rather than a radius; its broader guidelines acknowledge that larger areas may suit some businesses. The CRM suggests nearby starting cities separately from Schurr’s five-hour operating policy. No Google profile, verification or service-area edit is performed by publishing the application. Source: https://support.google.com/business/answer/9157481 and https://support.google.com/business/answer/3038177 .

## Working in this deployment

| Workflow | Actual behavior | Remaining input or connection |
| --- | --- | --- |
| Receptionist and lead response | Existing Retell intake, CRM handoff, owner alerts and requested first customer email | Native calendar is implemented; external calendar sync, SMS and transfer remain disconnected |
| Review invitations | Completed-project and permission checks, saved immutable invitation, explicit owner send approval, verified Resend sender, signed delivery events | Complete the service-area Google profile setup and add the real Google review link |
| Review responses | Saves a neutral draft from pasted actual feedback; owner reviews and posts manually | Google retrieval and publishing are not connected |
| Quotes | Saves multiple approved service-code/quantity lines using integer cents and a frozen profile revision | Supply the actual approved price book; no tax, discount, signature or customer sending |
| Staff answers | Saves an exact answer and source from private approved questions | Supply the actual staff knowledge |
| Website assistant | Public question lookup, filtered locally, approved answers and contact-form handoff | Owner can edit approved public questions or pause answers; no generative model or conversation storage |
| SEO check | Saves 56 source checks across seven actual sales pages, with a scope statement | Google Search Console access for indexing/search data; no ranking guarantees or external live crawl |

Public FAQ data is an explicit allowlist. It excludes private prices, staff knowledge, connection notes and provider secrets. All private routes authorize the owner before reading data; writes also check origin. Business facts, private price rules and FAQs save together with optimistic revision checks. Schurr identity and provider sender remain pinned to this deployment.

## Delivery and recovery

Review preparation commits its operation receipt and outbox row atomically. A stable project reference deduplicates an identical request; changed payloads conflict. Reviews never use rating or predicted sentiment as eligibility criteria. The sender checks completion, recorded permission, suppression, current setup revision, recipient frequency, daily limits and a lease before delivery. An owner approval sends one real email; draft preparation does not send.

Retries retain the frozen payload, recipient, sender, provider fingerprint and idempotency key. They stop after five attempts or the conservative 23-hour retry window. A changed account or uncertain expired attempt requires personal review. Provider Retry-After is honored. Cancellation blocks further attempts but cannot retract a request already in flight or accepted by the provider. Accepted means provider acceptance; signed webhook events report later delivery/failure and bounce or complaint suppression. Drafts and delivery records are distinct.

No unattended recovery scheduler is installed. The owner can inspect and retry eligible review invitations in the desk. Existing inquiry first-email and owner-alert recovery behavior is unchanged. An installation needs an appropriately authenticated recovery runner before claiming unattended retry operation.

## Drafts and history (v53 integration)

Automation Desk actions refresh server data without a full reload. Success resets only the submitted form; errors preserve entries. Dirty business settings retain their original revision when saved data refreshes. Draft operations retain the approved setup and prices they started with; a newer setup requires explicit review before preparation continues.

Saved work can be filtered by workflow and status and paged beyond the first 50 records. Review filters use invitation delivery state, and the visible page retrieves the matching invitation details. Direct links open review history or failed invitations. Same-page filter and page navigation preserves surrounding tool drafts. Review-event reconciliation remains bounded and global rather than limited to the displayed page; it does not send another email. The separate latest-50 Search Console report window is unchanged.

Appointments & follow-up has paginated Open, Completed and Stopped reminder views. Its due count covers every eligible open reminder. Eligibility cleanup still runs across the queue before filtering. No messaging policy or unattended scheduler was added.

## Client reuse

Each client setup can download a workflow installation manifest, its saved business brief and a revision-bound implementation README. The manifest includes module selections, required facts, shared implementation references, connection requirements and launch checks. It intentionally contains no provider keys and sets enabled to false. The reusable implementation is the shared application source; the JSON manifest is not an executable infrastructure installer. The README identifies missing facts and the exact saved scope without serializing private brief values. Client identity guards, Search Console property restrictions, SEO references, calendar identity and provider wording still need deliberate adaptation; filling the manifest alone does not do this.

A client requires an isolated deployment/database, that client’s provider accounts or subaccounts, verified sender and webhook, approved facts and prices, and client-specific adapters. Do not load client credentials into Schurr’s active identity. The live Schurr tools cannot be retargeted by editing a client preparation brief. Google APIs, external calendar sync, SMS, transfer and arbitrary application writes still require their corresponding integrations. Native phone appointments are implemented in this CRM.

## Operational archive (v53 integration)

The owner-only `/manage/operational-backup` route exports a bounded archive of operational records, separately from the matching versioned offline restore kit. Save the matching kit with the private archive; manage account recovery separately. Provider connection tables, runtime secrets/configuration and active approvals are excluded; this is not a full production database backup.

The kit validates the archive and writes a new isolated SQLite file with sending/workflow actions inactive, booking/handoff/chat disabled and client approval evidence stale against the incremented brief revision. Historical receipts, suppressions and evidence remain. It loads no application, secrets or provider connection and has no production restoration endpoint. Never attach its output to a live environment. The data JSON is not signed. A matching kit is required for each schema version; regenerate schema and kit together after migrations.

## Validation

`tests/automation-desk.test.cjs` uses an in-memory SQLite database and mocked providers. It covers owner access, public/private separation, revisions, exact quote arithmetic, approval without sending, completion and permission, duplicate events, atomic rollback, concurrent claims, stop/suppression, credential changes, Retry-After, delivery event reconciliation and stale configuration during connection checks. Existing customer-email webhook and CRM render/access suites provide regression coverage. No test sends a customer email or changes an external account.

## Workflow tightening (October 2, 2026)

The private quote builder now selects approved services and whole-number quantities, shows each subtotal and the draft total, and supports adding/removing lines. Server validation and integer-cent calculations remain authoritative. No prices are added to the public website.

Connection status distinguishes an unconnected account, incomplete receptionist setup, test mode and enabled lead capture. Email sender, first-reply and delivery-report setup are separate. A failed optional status lookup no longer hides the operational tools. Saved phone configuration is not a live audio-health test.

Review responses require a named approval owner before a draft can be saved. An invitation rejected after acquiring its send lease is finalized without a provider call; first-attempt cleanup releases the contact-frequency reservation. Earlier ambiguous attempts retain their uncertainty and reservation. Owner refreshes reconcile a bounded set of persisted delivery reports across all invitation records, including older records outside the visible history page. This recovery never sends another email. Reconciliation failures remain retryable on refresh; there is still no unattended recovery scheduler.

Validation covers pre-send races, malformed saved payloads, prior ambiguous attempts and early bounce callbacks with transient reconciliation failures. All delivery tests use mocked providers.


## Imported search reports

The SEO section accepts bounded English Search Console daily Dates CSV files for Schurr’s property. Select the exact property, search type and date range and confirm no additional filters. The importer stores normalized daily metrics, computes CTR from total clicks/impressions, and weights exported average positions by impressions. Missing dates remain absent. Comparisons require full daily coverage, matching metadata and equal-length non-overlapping periods. The latest 50 noncancelled search imports have a separate history window and participate in comparisons independently of quote/review activity. Importing does not verify ownership or connect Google; no sample data is represented as live performance.

Official metric reference: https://support.google.com/webmasters/answer/7576553
Date/timezone and missing-date behavior: https://developers.google.com/webmaster-tools/v1/searchanalytics/query


The integrated v53 changes have targeted local tests and TypeScript checks; the production build has passed, with browser draft preservation still unverified. No live audition, customer message, real archive export or real-data restore was performed for this update.

Current operational status and the October 2 acceptance sequence: [readiness audit](website-crm-readiness-audit.md).

## Client Health

`/manage/monitoring` keeps Schurr connection checks, call evidence, incidents and alert results inside the Automation Desk. It distinguishes observed provider facts, saved CRM/appointment outcomes and owner-reported phone quality. External monitoring and Retell-native alerts require account configuration; client briefs remain unconnected. See [monitoring setup](monitoring.md).
