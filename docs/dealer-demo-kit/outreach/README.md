# Schurr Automations outreach support kit

Prepared October 14, 2026 for Gavin's dealership conversations. **Prepared files, not a live release.** No message, call, booking, provider change or deployment was performed by this task.

## Files

| File | Audience / purpose |
|---|---|
| 01_public_overview.html + .txt; output/pdf/01_public_overview.pdf | Public one-page overview, quote-based, two service directions, contact and known demo URL. HTML styled for US Letter; TXT editable. |
| 02_private_offer_reference.html + .txt; output/pdf/02_private_offer_reference.pdf | **Gavin only.** $1,000 receptionist and $2,500 combined monthly anchors; separate setup, exclusions and support. Never put on a public route or QR destination. |
| 03_conversation_record.html + .txt; output/pdf/03_conversation_record.pdf | Printable record of the actual conversation and agreed next action. |
| 04_follow_up_templates.txt | Editable email/short-message drafts. Personalize; nothing is sent. |
| 05_recording_checklist.md | Brief for Gavin's later actual recording with Claude. No video created. |

Open HTML locally and use Print. Review US Letter, 100% scale, page count and clipping before copies. **The three PDF layouts have been rendered and visually checked. HTML browser print pagination has not been verified.** Do not print the private reference on the back of the public handout.

PDF verification details are in PRINT_VERIFICATION.json. The three PDFs are deliberately separate so the private offer sheet cannot be mistaken for a public handout.

## Established facts

- Repo-confirmed: **gavin@schurrautomations.com**, direct owner **(985) 232-8337**, demo line **(985) 771-0552**.
- Known existing destination: **https://schurrautomations.com/demo/**. Revised examples are in the pending candidate; do not call them already live.
- Existing automotive QR dependencies: /book?for=dealer&via=card, /book?for=dealer&via=hanger, /book?for=repair&via=card, /book?for=repair&via=hanger.
- The attachment says the saved general-card brief points to the homepage and says “See what we can do.” This verifies the specification, **not the physical card's encoded URL**.
- Public copy is quote-based; private anchors follow the attachment and locked handoff. Setup separately quoted. Support: extended weekdays **7am–7pm MT**, solo Gavin coverage. Historical **8am–8pm booking hours are not support hours**.
- A 15-minute fit-call submission is a request; Gavin confirms separately. Later 35-minute discovery is a distinct meeting.

## Open checks

| Check | Status / next action |
|---|---|
| Decode actual physical business card | **NOT DONE.** Scan it; record encoded URL and final destination. |
| Match QR to expected route | **NOT DONE.** Compare actual result with saved specification. Do not blanket-redirect the homepage. |
| /go/card forwarding | **PREPARED IN CANDIDATE.** Fixed 302/no-store redirect to /demo/ passes local route testing. Not published or verified live. Physical-card decode remains pending. |
| New website/handoff/video deployed | **NOT CONFIRMED.** Candidate work and live destination remain distinct. |
| Connected phone test and saved task | **ACTUAL PHONE TEST NOT DONE.** Local backend verification passed five groups using actual app SQLite save/reload and a synthesized signed event. This is not an actual phone call. See ../test-environment/README.md and its verification JSON. |
| Live voice/disclosure/fallback | **NOT VERIFIED.** Preserved number does not prove routed behavior. |
| Physical phone on Wi-Fi | **NOT DONE.** Scan → video → example website → handoff → request. |
| Physical phone on cellular | **NOT DONE.** Repeat; check readable screens, captions, navigation and fallback. |
| Request saved and received | **NOT DONE LIVE.** Local tests verify durable data and a persisted simulated inbox, not delivered email. Actual provider receipt remains open. |
| Offline copy on phone | **NOT DONE.** Save reviewed video and screenshots before field use. |
| Print | **PDF layouts rendered and visually checked.** All three PDFs are separate one-page files. Actual printer output and HTML browser pagination remain to check. |

Use the existing honestly labelled example for introductory conversations while the connected demo is unfinished. Do not present simulation as a verified integration.

## Sources and boundaries

Primary: uploaded Pasted text(20261014-181954).txt. Locked facts: docs/website-review/DECISIONS.md, COPY.md, COPY-DYNAMIC.md. Contacts/routes: repository public pages and automotive source.

Applied jaredrhod marketing core/copywriting guidance to concrete buyer benefits, clear next actions and honest limits. No statistics, testimonials, client counts or promises invented. **Keep private material out of public/ and public site links.**
