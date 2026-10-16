# Schurr Automations

For this GitHub checkout, start with [GITHUB_SETUP.md](GITHUB_SETUP.md). Large media is restored automatically before `pnpm dev` and `pnpm build`; the complete source and asset backup is described in [EXPORT_NOTES.md](EXPORT_NOTES.md).

Marketing website with public project inquiries and a protected owner workspace. The approved HTML design is served through Vinext route handlers, while D1 stores inquiries and aggregate site activity.

## Content

- `site-html/`: public page HTML, with corresponding `app/**/route.ts` handlers.
- `public/`: styles, client scripts, images, printable briefs, robots and sitemap.
- `public/project-briefs.js`: all 10 project scopes.
- `scripts/generate-brief-pdfs.py`: rebuilds the PDF set from the source. Requires ReportLab and DejaVu Sans. Visually inspect changed PDFs before publication.

The sample conversations are fictional, static illustrations. They do not call, message, book, or save customer information. The founder page does not list other projects.

## Inquiries and access

The `/api/inquiry-token` endpoint issues an origin-bound token and retry key. `/api/inquiries` validates the form and saves it in a transaction. `/manage/inquiries` displays inquiries with pagination and links to the CRM confirmation flow. `/manage/metrics` displays daily totals for the last 30 days.

Set `INQUIRY_SIGNING_SECRET` and `OWNER_EMAIL` as server-side runtime secrets. Owner access requires both platform-authenticated identity headers and an exact approved email match. Never expose these values in public files. The platform must strip untrusted identity headers before forwarding requests.

Inquiry text is escaped by React. SQL uses prepared statements. Duplicate retries reuse a submission key; changed payloads with the same committed key return a conflict. New inquiry intake is capped at 500 per UTC day, with per-source limits of 3 new inquiries per 15 minutes and 10 per UTC day. Valid committed retries return the original receipt. Token issuance and metrics have separate short-window and daily limits. Blocked source requests do not consume shared allowances. There is no automated deletion schedule. Delete records through the CRM lead confirmation flow when needed. Aggregate counts remain and contain no contact information.

New website inquiries and confirmed phone requests queue owner email alerts through the connected Resend sender. The inbox still requires manual review: customer emails and texts are not sent automatically. Public phone and text links open the visitor's own app.

## Measurement

The script records fixed event, page, and service categories. Analytics does not persist visitor identifiers, cookies, full URLs, referrers, or contact information. Separately, request limiting stores a daily rotating HMAC of the Cloudflare-forwarded connection address and expiring counters. It never stores the raw address. Expired counters are deleted in bounded batches during subsequent requests. Missing or invalid source headers share one fallback bucket; X-Forwarded-For is ignored. Counts include repeat actions and potentially automated traffic; they are not unique visitors or verified revenue. Saved-inquiry counts are recorded by the server only.

## Verification and publishing

Use the Sites workflow. The hosting manifest preserves this Site's project ID and logical D1 binding. Generate migrations after schema changes, inspect them, and keep applied history immutable.

Run the TypeScript compiler with `--noEmit`, `node tests/backend.test.cjs`, `node tests/intake-security.test.cjs`, `node tests/auth-security.test.cjs`, and `node tests/site-content.test.cjs`. Run the full dependency audit, including development dependencies, because the framework bundles some into the deployed Worker. Backend tests use real SQLite and mocked runtime/auth bindings, covering origin checks, tokens, field limits, duplicate retries, rollback, owner access, and metric categories. They do not replace verification of the platform identity boundary.

For a managed preview, use `sites-preview start "$PWD"`. Follow the bundled Sites starter guidance for applying migrations to the local preview database. Production runtime values are managed separately.

## External setup

The public domain is schurrautomations.com. The phone receptionist, CRM capture, and owner email alerts are connected. Native appointment booking and consented first-response email are implemented. External calendar sync, SMS and Google Workspace remain unfinished. Owner settings show the connection status. No live product recordings or client results are invented.

Owner pages cannot be framed. Public pages restrict scripts to same-origin resources. The Worker rejects unused server-action requests, unsupported mutation methods/content types, and unused image transformation endpoints before framework dispatch. All dynamic responses use private, no-store. Inbox pagination uses the existing compound database index and a bounded opaque cursor instead of an offset ceiling.


## Private CRM

Owner entry: `/crm` redirects an authorized session to `/manage`, otherwise to the explicit `/login` page. Public footers use a top-level CRM login link. The existing ChatGPT sign-in and server-only `OWNER_EMAIL` allowlist remain authoritative. Workspace profile edits cannot change authorization.

Views: overview, leads and contacts (search/source/stage filters), indexed cursor pagination, pipeline, individual lead records, notes and logged conversations, dated follow-ups (edit/complete/reopen/delete), website activity, and workspace settings. USD monthly/setup values are contract estimates, never claimed as payments. The default timezone is America/Denver.

Website inquiries are immutable. `lib/crm.ts` reads their union with manually added leads, so historical and future inquiries appear without an import. New website inquiries create their CRM overlay atomically with intake so owner alerts can reference the same contact. Historical inquiries still materialize their overlay during owner mutations. Foreign keys cascade linked notes and tasks on permanent deletion. Manual leads do not invent consent or affect website inquiry quotas.

All CRM mutations go through owner-authenticated, same-origin, bounded JSON `/api/manage/crm`. Atomic mutation receipts and per-attempt guards prevent duplicate effects and delayed retry resurrection. Revisions reject stale edits. The former deletion endpoint now directs users to the current confirmation flow rather than deleting records.

`/api/manage/export` streams all matching contact/opportunity rows, including subsequent pages, as formula-safe CSV. It is owner-only and non-cacheable. This export excludes notes/tasks and is not a database backup.

Communication shortcuts open the owner's email/phone app. Owner email alerts are connected; business mailbox, SMS, external calendar sync, invoicing and payments are not. Follow-ups are an in-app queue with no email task reminders; changing the business profile email does not change the alert recipient.

CRM checks: `node tests/crm.test.cjs`, `node tests/crm-race.test.cjs`, `node tests/crm-render.test.cjs`. These execute real SQLite and actual server components with mocked hosting identity/runtime boundaries. Run with a Node version supporting `node:sqlite`. Live provider authentication and browser hydration are separate verification steps.


## Outreach workspace

`/manage/outreach` is a private owner-only working surface with Prospects, Find & import, Campaigns, Review queue, Activity, Do not contact, and Setup. Data and mutations use `/api/manage/outreach`; there is no send API or scheduled dispatch. This is a usable preparation/manual-dispatch workflow, not a fully connected mailbox replacement.

Prospect Scrubber was reviewed through saved implementation reports, not its unavailable Mac source or live database. The September 30 report identifies local commit `9f62c71facd4c96aacdc1a3273e4246d168c088e`. Existing Gmail OAuth/Keychain credentials were not copied. No other project's campaigns, suppressions, replies, or approvals were migrated.

The private server import source `data/colorado-outreach.json` derives from `Colorado_AI_Receptionist_100_High_Value_Prospects.xlsx`, Library `libfile_cf4ce515a6d88191acc3dac54199d956`, reviewed September 28, 2026. Read-only workbook text was used after the original download returned 502. All 100 identities reconcile; 83 have published emails, 17 do not. All known ownership cautions and sources are retained in immutable import notes. The 80 home-service rows are initially selected in the preview, and the owner controls import. Contacts and templates are never seeded by migrations or public rendering. Named professionals are kept in notes, not assigned as mailbox recipients. Every imported prospect starts as needs_review.

CSV import accepts up to 200 rows/400 KB, preserving quoted research notes and rejecting invalid rows with identity context. Canonical website duplicates preserve prior records. Existing suppressions can be imported in batches of up to 200 addresses. Original import notes (`source_notes`) remain separate from fetched page snapshots (`research`).

Ready prospects require an owner-confirmed sourced observation, contact email, source URL and observation date within 90 days. Campaigns contain one to three editable steps. Draft generation is bounded at 50 selected prospects and preserves existing drafts and unique recipients. Follow-up delays start from the prior owner-reported send. There is no automatic scheduling. Edits invalidate approval; prepare/export recheck the current draft and related record revisions. Recipient responses are recorded against the original email independently of later contact edits. Bounces and opt-outs globally suppress the address; replies and meetings stop pending follow-ups. No delivery or response tracking is claimed without owner input.

Reviewed exports contain up to 1,000 currently eligible approved messages. They apply formula protection and exclude stale approvals, stopped prospects, suppressions, and responses. Export/open actions never mark a message sent. The owner must explicitly confirm an external send. This download is not a full backup.

Optional website research uses only `https://api.firecrawl.dev/v2/search` and `/v2/scrape` with a server-only `FIRECRAWL_API_KEY` secret. No key is currently configured. Search returns up to 10 public-web results without automatic scraping. Page research uses basic proxy mode, strict TLS, no cookies or scripted browser actions, a 40-second request limit, and a 600 KB response limit. Paid request attempts reserve a unique durable receipt and a daily budget (30 searches/100 page requests per UTC day), without automatic retries. Provider failures and redirects to another domain are surfaced. Extracted text is untrusted escaped evidence, and email candidates never overwrite the selected recipient. Provider-contract tests use mocks and do not establish live connectivity or provider robots-policy behavior.

New migrations are additive: 0004 creates outreach tables, 0005 adds immutable response-email and per-research operation markers, 0006 separates original source notes and indexes response lookup. Existing CRM/inquiry records remain unchanged. Atomic receipt attempt guards, exact revision checks, prepared statements, same-origin POST, private caching, and owner authentication apply throughout. Credentials never appear in browser data.

Checks: `node tests/outreach.test.cjs` (10 integration/security groups); `node tests/outreach-identity.test.cjs`, `node tests/outreach-research-race.test.cjs`, `node tests/outreach-export-race.test.cjs` cover discovered concurrency/identity regressions. The CRM rendering suite also covers the Outreach owner boundary and first screen. Live browser hydration, Gmail connection, and Firecrawl access remain unverified until configured and opened by the owner.

## October 1 operations setup

Public canonical/OG/schema links, robots/sitemap and all current project briefs use https://schurrautomations.com. Existing hosted API URLs and owner-alert links remain valid; no blanket redirect was added.

The response desk displays current CRM contact corrections and the original saved reply draft separately. Recorded contact permission and the submitted inquiry are immutable. A CRM correction does not authorize an automated send. Connected-tools status reads saved Retell and owner-alert configuration; a connected sender is not an inbox-delivery guarantee.

Native appointment tools use this CRM’s calendar. Approved weekly hours, buffers, notice and outside commitments determine availability. Retell only confirms a booking after the signed tool returns a successful reservation. Same-call rescheduling and cancellation use the saved appointment revision. External calendar sync still needs a separate connection. Business mailbox changes are deferred.

`BOOKING_INITIAL_CONFIG` is an optional runtime JSON value matching `BookingConfig`. It seeds `booking_settings` only when absent and never overrides owner edits. The Schurr deployment starts with the approved 8 a.m.–8 p.m. Mountain window, Monday–Friday, 30-minute appointments, 10-minute buffers, two hours’ notice and a 30-day horizon. Client installations do not inherit this approval; absent the variable, booking starts paused.
