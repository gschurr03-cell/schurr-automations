# Release repair, October 14, 2026

Gavin approved saved version 105 and subsequently requested “fix it all.” This continuation repairs confirmed defects and verifies the existing public Site. Original review documents and their manifest describe the version 105 candidate; they are not overwritten as if their earlier checks had covered these repairs.

## Deployment diagnosis

Version 105 source is `227bc480503afdc68a4ab2d69b8063e4e6b88906`. Its saved artifact has 520 files, a canonical tar size of 39,475,200 bytes and SHA-256 `e8b7441c413dd576a80fa5e1e6cd635a4414e60f48932be5d94a600081e7a0f8`. Reconstructing the canonical tar from the local deployment archive reproduces that exact hash and size. Every archived file matches the local build. The saved artifact is correct.

Sites reported publication success at 17:24:46 UTC, and the same-version retry succeeded at 17:28:38 UTC. Fresh public checks at approximately 17:31 still showed the old booking API, missing dealer page and missing new stylesheet. No domain, provider, environment, access or database configuration was changed to address this discrepancy.

At 17:36:25–17:36:51 UTC, fresh HTTP requests to both `https://schurrautomations.com` and `https://schurr-automations.gavschurr.chatgpt.site` returned the new build. The dealer page and stylesheet returned 200. `/api/booking` returned `mode: request`, `enabled: false`, `duration: 15` and an empty slots array. This bounds the observed delay in serving the release; it does not establish the internal platform cause.

## Follow-up repairs

- Ordinary inquiries retain the exact submitted details after an uncertain save, preventing edited retries from conflicting with an already-saved request. A retry uses the same reference and original payload. Known validation failures remain editable.
- Inquiry timeouts cover reading the response body, not only receiving its headers, so a stalled body cannot keep the form indefinitely busy.
- Public phone-click analytics distinguish the demo number from Gavin’s direct number. A click remains only a click; it does not imply a connected call.
- The dealer demo CTA uses the existing `dealer` attribution code. The general inquiry worksheet uses the ordinary website route. Unsupported source parameters are removed without expanding the seven-code allowlist.

| File | Repair |
|---|---|
| `public/site.js` | Exact-payload inquiry recovery, body timeout, safe editing and terminal receipt handling |
| `public/agency.js` | Correct direct-phone versus demo-phone event |
| `site-html/demo.html` | Dealer CTA attribution |
| `site-html/resources/inquiry-checklist/index.html` | Ordinary website CTA attribution |
| `tests/public-inquiry-recovery.test.cjs` | Six synthetic recovery and analytics regression groups |
| `tests/site-content.test.cjs` | Approved content and CTA destination assertions |

The final saved version and source commit are reported in the delivery receipt. There is no schema migration or change to commercial scope, recipient, consent contract, provider configuration or access policy.

## Verification evidence

- [Public HTTP checks](evidence/live-release105-http.json): all 24 targets passed, comprising 13 HTML routes, four QR variants, three shared assets, sitemap, robots, anonymous owner-route access and the request-only booking configuration. Twelve normalizing redirects made 36 HTTP transactions. Owner sign-in was not followed.
- [Inquiry recovery regression](evidence/public-inquiry-recovery-repair.log): six groups passed against the actual inquiry API with synthetic SQLite records and a DOM contract harness. Lost responses, stalled bodies, duplicate clicks, validation correction, a paused optional callback, removed receipts and phone analytics were exercised.
- [Content regression](evidence/repair-site-content.log): existing content, route and asset assertions plus the corrected CTA destinations.
- [Production build](evidence/repair-build.log): the standard Sites production build for the repaired source.

For this narrow repair, the preceding working release is version 105, saved version ID `appgprj_6abd3e1333308191928b1d9102e7b093~appgver_07a85888f90c81918f7e05729463c3d3`. Restoring that saved version would revert these browser-script repairs while retaining the approved pages and request-only booking. The older `ROLLBACK.md` describes reverting the broader website revision to version 103. Neither rollback was performed or rehearsed here.

## Verification boundaries

Public HTTP checks establish route availability, response content and headers. Offline tests use synthetic fixtures and mocked transports. Neither is a rendered browser journey or proof of actual notification delivery.

The supported browser-control capability remains unavailable. Device layouts, keyboard/assistive-technology journeys, print pagination and measured browser performance remain unverified. Provider voice/routing/recording settings, actual owner notification delivery, existing collateral review and a rollback rehearsal also remain open. No production inquiry, email, call, provider change or customer-data access was used for these checks.

Instant public booking remains intentionally disabled. Fit-call requests do not reserve a slot; Gavin confirms a time separately.
