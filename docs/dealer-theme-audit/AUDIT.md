# Dealer-first site audit and update

Prepared October 14, 2026 for Gavin Schurr. Baseline: published version 106, source `14e116f976b359c2be6c3d1fda03c36ffdcee0c0`.

**Result:** The dealer page and scripted demo already had a clear audience. The homepage, individual services, supporting pages and conversion journey needed the same focus. The candidate now follows one buyer journey: vehicle inquiry, salesperson-owned callback, staff-confirmed next step and recorded outcome.

This is a saved review candidate. It is not published. The exact saved version and source commit are in the delivery receipt. The handoff requires Gavin’s approval of that exact version before release.

## Audit findings and applied changes

| Area | Finding | Applied change |
|---|---|---|
| Home | General business-automation positioning hid the dealership focus | Independent used-car dealers are named in the opening; buyer inquiries, vehicle interest and salesperson callbacks run through the seven sections |
| Services | Four pages described generic business examples | Receptionist, workflow automation, websites and SEO/AEO/reviews each explain their separate role in the dealership buyer journey |
| Approach and business case | Generic processes obscured how a dealership would judge the work | Recent vehicle inquiries, callback ownership, failed handoffs and distinct visit/sale outcomes supply the examples |
| About | Founder story was disconnected from the audience | Dealer-focused introduction and closing; Gavin’s education, personal build ownership, coaching and AVA development facts retained |
| Workflow illustrations | Captions, SVG labels and animated chapter copy were generic | Buyer details, vehicle interest, salesperson tasks and callback outcomes now match the surrounding page |
| Navigation and contact | Dealer context was lost through shared booking/contact links | All 13 public HTML documents use the same dealer-workflow navigation and supported dealer source links |
| Inquiry attribution | The form ignored source parameters | Seven existing allowed source codes are captured with the original submitted payload; invalid or duplicate values fall back to `website` |
| Booking | Dealer links opened a generic introduction | Dealer-linked fit calls retain dealership wording and examples; requests still do not reserve an appointment |
| Repair QR journey | Repair visitors were directed toward dealer content | Original repair URLs and forms remain; the repair page now offers an explicit repair inquiry link |
| Worksheet | General examples did not match the dealer pitch | Vehicle inquiries, assigned salespeople and verified outcomes replace generic examples; ungated print access remains |
| Search and sharing | Titles, descriptions and organization text described a general agency | Dealer-specific titles/descriptions and consistent organization positioning, with original routes and canonicals retained |

The current request updates the earlier broad-homepage direction to dealer-first messaging. All four services remain available. The inquiry page explicitly welcomes repair shops and other businesses.

## What the candidate keeps

- Existing metallic-purple brand, logo, typography, visual components and page structure. No speculative redesign or invented dealership/client imagery.
- Seven homepage sections, approximately 591 main-content words excluding SVG text and navigation/footer.
- Exact delivery commitment and support hours, solo coverage qualification, separate setup fee and quote-based pricing.
- Receptionist-only boundaries. CRM writes, live inventory and direct booking require a separate verified scope. Financing, prices and trade values stay with authorized staff.
- Fictional demo disclosures, original phones/email, printed dealer and repair QR paths, videos and other retained assets.
- Existing inquiry consent, optional-action controls, owner access, schema and provider configuration.

## Evidence

- [Live baseline check](evidence/live-before.json): Home, Receptionist and Dealer returned 200 and exactly matched published version 106 before this edit.
- [Content checks](evidence/site-content.log): dealer context, navigation, scoped claims, unique metadata, source links, retained routes/assets, labels and anchors passed.
- [Inquiry recovery](evidence/inquiry-recovery.log): seven regression groups passed, including all allowed sources, invalid/duplicate query values, immutable uncertain retries, response-body timeout and original consent behavior.
- [Booking request tests](evidence/booking-request.log): request-only behavior, duplicate recovery and campaign paths passed.
- [TypeScript](evidence/typecheck.log), [production build](evidence/build.log) and diff checks passed.
- An independent review of booking, repair routing and inquiry attribution found no blocking defects.

The response-body timeout fixture previously used a fixed number of event-loop turns. A combined run exposed that scheduling assumption. It now waits for the actual body-start signal with a bounded watchdog; the timeout and saved-receipt assertions remain intact.

## Review and release

[COPY.md](COPY.md) contains the applied public page text, titles, descriptions and animated chapter text. [manifest.json](manifest.json) records changed source/test hashes and preserved asset verification.

The Sites-required browser-control capability is unavailable. Mobile/device rendering, keyboard and assistive-technology journeys, animation text fit, print pagination and measured browser performance remain unverified. No new production submission, notification, voice call, provider configuration change or customer-data access was used for this audit.

After exact-version approval, publish the saved candidate and check the changed public pages and source-carrying links. The previous working release is version 106, saved version ID `appgprj_6abd3e1333308191928b1d9102e7b093~appgver_a7cdba37aba8819187fb517879b37f1c`. It is the rollback target for this positioning update. No database migration needs reversal.
