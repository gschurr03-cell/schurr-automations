# Schurr Automations: implementation handoff

Prepared for Gavin Schurr from the locked October 14, 2026 handoff. Candidate label: `schurr-handoff-2026-10-14-r2`.

**Later release update, October 14:** Gavin approved version 105 and then requested all identified fixes. The approved build is now observable on both public hostnames. The original candidate review below is retained as historical evidence; its unpublished status no longer describes production. See [RELEASE-REPAIR.md](RELEASE-REPAIR.md) for the deployment diagnosis, follow-up repairs, current verification and remaining limits.

## Release status and review location

The locked commercial decisions are implemented in source. This candidate is **not published and not ready for production approval**: browser/device acceptance, live delivery/provider verification and rollback rehearsal remain open. Those missing results are explicit in the acceptance report. No staging URL is claimed. The managed Sites environment lacks its supported browser-control capability; a Sites deployment would be production.

The review branch is `main` in the existing Site repository for `appgprj_6abd3e1333308191928b1d9102e7b093`, prepared in `/workspace/scratch/35c1926b0923/site`. The immutable saved Site version and commit in the delivery message identify this source snapshot; the repository branch alone is not a frozen reference. Pushing source does not publish this Site.

- Prior production: **version 103**, commit `ad38b90e90f37baed2f0b61b4668951bf40b23fc`.
- Previous unpublished implementation: **version 104**, commit `762e8b5ce9209939fe0d453246348dfd64d0b49c`.
- [FILE-MAP.md](FILE-MAP.md): every changed file, route and WEB ticket, including the delta from version 104.
- [manifest.json](manifest.json): SHA-256 hashes for the frozen changed source and tests.
- [COPY.md](COPY.md) and [COPY-DYNAMIC.md](COPY-DYNAMIC.md): exact applied HTML, metadata, form, error, scripted-demo and prompt wording.
- [DECISIONS.md](DECISIONS.md): locked decisions, copy deviations, claim register and data-flow verification.
- [WQA.md](WQA.md): all 32 acceptance cases, actual results, inputs, environments and evidence.
- [ROLLBACK.md](ROLLBACK.md): exact prior release, restoration steps and record reconciliation.

## What changed since version 104

The homepage now contains the complete locked delivery commitment and exact support line. Receptionist, dealer, Approach and booking copy clarify separate setup fees without amounts, per-service scope and solo weekday support. About now says Gavin designs and builds the work himself. The local receptionist sales prompt uses the same decisions, with live provider synchronization still pending.

Dealer and printed-QR source codes now persist in the existing `crm_leads.source` field in the intake transaction. CRM read, filter and export paths expose the saved field. Manual lead creation keeps its original source choices. Source codes are allowlisted; ordinary inquiries default to `website`; existing ordinary receipt hashes are preserved. Privacy copy explains this attribution. There is no database migration, new tracking vendor or new URL parameter.

The broader version 104 work remains: seven-section home, four separate services, dealer page, labelled scripted demonstration, ungated printable worksheet, compact inquiry, and durable request-only fit calls. The homepage has approximately 560 words including controls and CTAs, excluding navigation/footer and SVG text. Dealer main copy including FAQs and CTAs is approximately 762 words. These are source text counts, not rendered page-length measurements.

## Ticket results and effort record

Original implementation time was not recorded per ticket. It would be misleading to convert the handoff estimates into actual effort. The table reports actual work scope and timing limitations. This continuation's total elapsed preparation time is recorded in `manifest.json`; individual ticket minutes remain untracked.

| Ticket | Implemented or prepared | Remaining acceptance | Effort spent |
|---|---|---|---|
| WEB-01 | Existing source, current public text, routes, protected areas, media and Site identity inspected; production/source references frozen | Owner verifies printed QR distribution and historical collateral | Inspection completed; minutes not separately tracked |
| WEB-02 | Locked promise, support, setup and scope applied; unsupported headline research/healthcare claims excluded; claim register prepared | Old videos/PDFs/proposals and actual live prompt reviewed by Gavin | Original rewrite plus this commercial-copy pass; minutes untracked |
| WEB-03 | `/book` and `/api/booking` save truthful 15-minute requests; signed lookup and atomic retry; existing native scheduling retained | Real request/owner journey in authorized environment; global calendar verification before instant booking | Request implementation and focused fixture verification; minutes untracked |
| WEB-04 | One-screen inquiry; chosen-channel requirement; separate unchecked optional choices; server validation/dedupe/receipt | Browser field/error journey and live controlled notification | Form/backend implementation and local verification; minutes untracked |
| WEB-05 | Request, notification, attribution and event notices reconciled with source; provider facts isolated | Gavin confirms actual provider configuration; qualified review where needed | Source/data-flow review and copy pass; minutes untracked |
| WEB-06 | Seven sections; retained branding; dealer navigation; immediate main message; locked commitment/support | Browser layouts, keyboard and device checks | Original page consolidation plus locked-copy delta; minutes untracked |
| WEB-07 | One independent used-car page; callback ownership; bounded scope; separate source field | Two dealer-owner conversations when available; browser acceptance | Page and source-attribution implementation; minutes untracked |
| WEB-08 | Receptionist and workflow pages qualify capabilities; base exclusions and human fallback explicit | Actual inbound demo verified against offer | Copy and local prompt updates; minutes untracked |
| WEB-09 | Fictional normal/transfer-failure/write-failure walkthrough; original files preserved; embeds withheld | Gavin records/reviews captioned dealer video; existing media claims checked | Scripted fallback and media handling; no recording effort claimed |
| WEB-10 | Saved-request state and written preparation; receipt-only change/withdrawal contact; separate 35-minute discovery | Gavin confirms manual response process; confirmed meeting path deferred | Request state and preparation copy; minutes untracked |
| WEB-11 | Four-stage Approach, direct founder role, separate website/search scope, baseline-led Why Automation | Copy review of exact candidate | Original supporting-page pass plus founder/support delta; minutes untracked |
| WEB-12 | Titles/canonicals/sitemap; clicks separate from durable outcomes; separate allowlisted CRM attribution | Deployed redirects/crawl and real event reconciliation | Source/search/event work plus attribution gap fix; minutes untracked |
| WEB-13 | Responsive/focus/reduced-motion CSS and tested motion state machine | Full browser/mobile/zoom/accessibility/print/performance work | Implementation and local checks only; no browser-testing time claimed |
| WEB-14 | Frozen file map, copy, logs, candidate archive and rollback plan | Acceptance, exact Gavin approval, production smoke test and rehearsal | Release-package preparation only; no deployment time claimed |
| WEB-15 | Future learning work documented; Rocky coordinates | Post-release records and review dates | No post-release work, scheduling or campaign execution performed |

## Observations, requirements and verified results

**Observed on public pages:** A fresh text retrieval of Home, AI Receptionist, Privacy and Book still showed the earlier release: the old promise on Home/Receptionist, older patient-data wording, and the booking loading shell. The public observation is text-only and does not prove the booking widget is broken. URLs and evidence identifiers are in `DECISIONS.md`.

**Proposed requirement:** The locked handoff defines the intended offer, request fallback, privacy, accessibility and release gates. A requirement is not a test result.

**Verified locally:** Twelve synthetic/source suites, TypeScript and the production build have passing logs. Source and state-machine checks are not device screenshots, actual inbox delivery, global-calendar safety or a live voice test. Details and exact commands are in `WQA.md`.

## Open questions and owners

1. **Reviewer/Gavin: browser environment.** Which authorized environment can render this frozen candidate at 360, 390, 768 and 1280 CSS pixels and on an iPhone? This blocks navigation, forms, print, keyboard, motion, performance and deployed-route acceptance. No visual pass is assumed.
2. **Gavin: notification ownership and test destination.** Confirm who monitors requests, the backup/escalation arrangement for solo coverage, expected review delay and an authorized synthetic notification destination. This blocks live owner-receipt/recovery verification. The code's owner recipient and private queue remain unchanged; no response-time promise was added.
3. **Gavin: actual inbound demo.** Supply owner-controlled confirmation of the approved voice, number assignment, routed prompt, disclosure, usage budget, fallback and recording/transcript settings. This blocks publishing the revised demo description and synchronizing the local prompt. No provider setting was changed.
4. **Gavin: existing collateral and obligations.** Review the three retained videos, ten existing service PDFs and any active proposals/contracts for obsolete promises or unsupported claims. Original files and URLs remain intact; website edits do not alter prior agreements. New recordings need captions and claim review before embedding.
5. **Gavin/reviewer: rollback rehearsal.** Provide a controlled environment and approved procedure to rehearse restoration with synthetic pending requests. This blocks WQA-32. The exact prior release and reconciliation procedure are ready.
6. **Gavin: final release approval.** After the above acceptance gaps are resolved, approve the exact saved Site version and commit. No release is inferred from this handoff. If instant booking is later wanted, the actual availability source, 15-minute configuration, buffers, notice, horizon and notices require separate verification; request mode already satisfies the authorized fallback.

No clarification is needed for the locked prices, promise, separate setup, support hours, first segment or Thanksgiving policy. Those decisions are applied. No agency holiday blackout was added; work/launch eligibility on November 26–27 remains subject to client-approver availability.

## Approval request and action boundary

The delivery message identifies the exact saved version, commit and scope for Gavin's decision. The production request is **held pending the acceptance blockers above**; approval should follow their evidence, not replace it. Any subsequent implementation change creates a new version requiring its own exact review.

No live deployment, provider synchronization, paid service, outbound email/SMS/call/DM, customer-data access or agreement change occurred. All records used for verification were synthetic and local. No password, production credential or customer record is included in this package.
