# Frozen files and routes

Candidate: `schurr-handoff-2026-10-14-r2`. Source/test content fingerprint: `ef834747f16acc151365eff1190b84ef2c973701710cbb8caf1f3b623a45e37b`. Use the exact saved Sites version and commit from the delivery message, not a mutable branch tip.

Baseline is production v103 (`ad38b90e90f37baed2f0b61b4668951bf40b23fc`). The last column isolates this continuation from unpublished v104 (`762e8b5ce9209939fe0d453246348dfd64d0b49c`). No source route is removed; no schema migration is added. Documentation/evidence files are included in the saved source, with no public route. The manifest hashes source/tests and preserved dependencies; documentation is not self-hashed.

## Every changed file

| File | Change vs v103 | WEB tickets | Route or responsibility | Changed since v104 |
|---|---|---|---|---|
| `app/api/booking/route.ts` | Modified | WEB-03, WEB-10 | /api/booking | No |
| `app/api/inquiries/route.ts` | Modified | WEB-04 | /api/inquiries | No |
| `app/book/automotive/README.md` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | Yes |
| `app/book/automotive/automotive.css` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | No |
| `app/book/automotive/campaign-page.tsx` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | Yes |
| `app/book/automotive/campaign-video.tsx` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | No |
| `app/book/automotive/campaigns.ts` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | Yes |
| `app/book/automotive/revenue-review-form.tsx` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | No |
| `app/book/booking-form.tsx` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | No |
| `app/book/booking.css` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | No |
| `app/book/page.tsx` | Modified | WEB-02, WEB-03, WEB-09, WEB-10, WEB-13 | /book and existing dealer/repair QR variants | Yes |
| `app/industries/used-car-dealers/route.ts` | Added | WEB-07, WEB-12 | /industries/used-car-dealers/ | No |
| `app/manage/crm-ui.tsx` | Modified | WEB-12 | /manage/leads; /manage/leads/new; /manage/leads/[id] (shared rendering; original manual choices retained) | Yes |
| `app/resources/inquiry-checklist/route.ts` | Added | WEB-09, WEB-12 | /resources/inquiry-checklist/ | No |
| `docs/website-review/COPY-DYNAMIC.md` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/COPY.md` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/DECISIONS.md` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/FILE-MAP.md` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/README.md` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/ROLLBACK.md` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/WQA.md` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/auth-security.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/backend.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/build.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/crm-render.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/crm.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/customer-email.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/diff-check.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/environment.json` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/intake-security.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/monitoring-retell.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/public-booking-request.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/retell-owner-alerts.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/scheduling.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/site-content.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/typecheck.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/evidence/workflow-stories.log` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `docs/website-review/manifest.json` | Added | WEB-01, WEB-02, WEB-05, WEB-14 | Review-only artifact; no public route | Yes |
| `lib/booking-request.ts` | Added | WEB-03, WEB-10, WEB-12 | /api/booking | Yes |
| `lib/crm.ts` | Modified | WEB-12 | /manage/leads; /manage/leads/[id]; /manage/leads/new; /api/manage/export | Yes |
| `lib/inquiries.ts` | Modified | WEB-04, WEB-05, WEB-12 | /api/inquiries; /api/booking; /api/metrics (shared validation/persistence) | Yes |
| `lib/inquiry-attribution.ts` | Added | WEB-04, WEB-12 | /api/inquiries; /api/booking; CRM source labels | Yes |
| `lib/receptionist-sales.ts` | Modified | WEB-02, WEB-08 | Local prompt candidate for owner-authorized receptionist operations; no sync | Yes |
| `lib/site-seo.ts` | Modified | WEB-12 | Internal SEO inventory | No |
| `public/agency.js` | Modified | WEB-06, WEB-12, WEB-13 | Shared public navigation/CTA counting | No |
| `public/brief-release.css` | Added | WEB-06, WEB-07, WEB-13 | Shared public layout and responsive styles | No |
| `public/dealer-demo.css` | Added | WEB-09, WEB-13 | /demo/; /resources/inquiry-checklist/ | No |
| `public/dealer-demo.js` | Added | WEB-09, WEB-13 | /demo/; /resources/inquiry-checklist/ | No |
| `public/inquiry-compact.css` | Added | WEB-04, WEB-13 | /inquire/ | No |
| `public/site.js` | Modified | WEB-04, WEB-12, WEB-13 | /inquire/; legacy scripted demo support | No |
| `public/sitemap.xml` | Modified | WEB-12 | /sitemap.xml | No |
| `public/workflow-stories.js` | Modified | WEB-06, WEB-13 | Shared motion behavior; Home timing | No |
| `site-html/demo.html` | Modified | WEB-02, WEB-09, WEB-13 | /demo/ | No |
| `site-html/how-it-works/index.html` | Modified | WEB-02, WEB-11 | /how-it-works/ | Yes |
| `site-html/index.html` | Modified | WEB-02, WEB-06, WEB-12, WEB-13 | / | Yes |
| `site-html/industries/used-car-dealers/index.html` | Added | WEB-07, WEB-12, WEB-13 | /industries/used-car-dealers/ | Yes |
| `site-html/inquire.html` | Modified | WEB-04, WEB-05, WEB-13 | /inquire/ | No |
| `site-html/meet-gavin/index.html` | Modified | WEB-02, WEB-11 | /meet-gavin/ | Yes |
| `site-html/privacy/index.html` | Modified | WEB-05, WEB-12 | /privacy/ | Yes |
| `site-html/resources/inquiry-checklist/index.html` | Added | WEB-09, WEB-12, WEB-13 | /resources/inquiry-checklist/ | No |
| `site-html/solutions/ai-receptionist/index.html` | Modified | WEB-02, WEB-08, WEB-11, WEB-12 | /solutions/ai-receptionist/ | Yes |
| `site-html/solutions/custom-automation/index.html` | Modified | WEB-02, WEB-08, WEB-11, WEB-12 | /solutions/custom-automation/ | No |
| `site-html/solutions/local-seo-reviews/index.html` | Modified | WEB-02, WEB-08, WEB-11, WEB-12 | /solutions/local-seo-reviews/ | No |
| `site-html/solutions/websites-chatbots/index.html` | Modified | WEB-02, WEB-08, WEB-11, WEB-12 | /solutions/websites-chatbots/ | No |
| `site-html/why-automation/index.html` | Modified | WEB-02, WEB-11 | /why-automation/ | No |
| `tests/auth-security.test.cjs` | Modified | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | No |
| `tests/backend.test.cjs` | Modified | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | No |
| `tests/crm-render.test.cjs` | Modified | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | Yes |
| `tests/customer-email.test.cjs` | Modified | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | No |
| `tests/monitoring-retell.test.cjs` | Modified | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | No |
| `tests/public-booking-request.test.cjs` | Added | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | Yes |
| `tests/retell.test.cjs` | Modified | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | Yes |
| `tests/site-content.test.cjs` | Modified | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | Yes |
| `tests/website-flow.test.cjs` | Modified | WEB-03, WEB-04, WEB-05, WEB-12, WEB-13, WEB-14 | Local regression evidence; see WQA.md for scope | No |

## Public routes

| Route | Disposition | WEB tickets |
|---|---|---|
| `/` | Changed: seven sections and shared navigation | WEB-02, WEB-06, WEB-12, WEB-13 |
| `/inquire/` | Changed: compact permitted-contact form | WEB-04, WEB-05, WEB-13 |
| `/book` | Changed: request-only fit call and preparation | WEB-03, WEB-10, WEB-13 |
| `/book?for=dealer&via=card` and `via=hanger` | Existing destinations retained; request copy/flow revised | WEB-03, WEB-07, WEB-09, WEB-10 |
| `/book?for=repair&via=card` and `via=hanger` | Existing destinations retained; no new repair industry page | WEB-03, WEB-09, WEB-10 |
| `/demo/` | Changed: visibly fictional dealer scenarios and limitations | WEB-02, WEB-09, WEB-13 |
| `/solutions/ai-receptionist/` | Existing URL; scoped handling and base limits | WEB-02, WEB-08 |
| `/solutions/custom-automation/` | Existing URL; supported workflow examples | WEB-02, WEB-08 |
| `/solutions/websites-chatbots/` | Existing legacy URL; separately scoped website offer | WEB-02, WEB-11 |
| `/solutions/local-seo-reviews/` | Existing URL; SEO/AEO and genuine-review scope | WEB-02, WEB-11 |
| `/how-it-works/` | Existing URL; four stages and locked commitment | WEB-02, WEB-11 |
| `/meet-gavin/` | Existing URL; accurate founder role and development context | WEB-02, WEB-11 |
| `/why-automation/` | Existing URL; buyer baseline and measurement | WEB-02, WEB-11 |
| `/privacy/` | Existing URL; request, permission, notification, analytics and source notice | WEB-05, WEB-12 |
| `/industries/used-car-dealers/` | Added single dealer page | WEB-07, WEB-12 |
| `/resources/inquiry-checklist/` | Added ungated printable worksheet | WEB-09, WEB-12 |
| `/sitemap.xml` | Added dealer/worksheet entries; retained public entries | WEB-12 |

## API and protected-path effects

| Path | Change | Boundary |
|---|---|---|
| `/api/booking` | Request-only GET/POST with signed lookup and atomic intake | Creates requests, not appointments |
| `/api/inquiries` | Saved-record/notification distinction; strict validation and source persistence | Existing token/origin/rate/permission controls retained |
| `/api/metrics` | Uses updated shared event/route allowlists | Browser events cannot claim durable saved outcomes |
| `/manage/leads`, `/manage/leads/[id]`, `/api/manage/export` | Existing source field is read, labelled, filtered and exported | Existing auth and private responses retained |
| `/manage/leads/new` | Original five manual-source choices explicitly separated from automatic campaign labels | No new manual source capability or UI flow |
| Owner receptionist operations | Local sales-prompt content prepared for separately approved sync | No provider action or routing/config change performed |

No `/book/confirmed` route was created because this version cannot confirm an instant booking. Protected owner/client routes, login, phone/email values, media paths and printed query parameters remain. A list of unchanged dependency hashes is in `manifest.json`.
