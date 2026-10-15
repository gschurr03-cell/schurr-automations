# Dealer demonstration and outreach kit

Prepared for Gavin Schurr on October 14, 2026. Website baseline: published version 108, source `bee4c736b982ec8ba7f743f4a24b64ea97f0b2dd`. This folder accompanies a saved review candidate. It is not evidence that the candidate has been published.

## Ready for review

| Item | Result | Evidence / limits |
| --- | --- | --- |
| Fictional dealership website | Homepage, vehicle details and simulated inquiry with staff preview | Northline Demo Motors, Stock D214, preset fictional people; no customer data, requests or storage |
| Saved-task demonstration | Actual unchanged intake and CRM task functions write to an isolated local SQLite database | Signed synthetic event, not a spoken phone call; separate-process reload and failure/retry checks pass |
| Test notification | Local simulated inbox notice persists alongside the callback | Not email/SMS delivery or staff acceptance |
| Demo hub | `/demo/` introduces the three examples, existing phone experience, checklist and neutral fit-call request | Video is optional and deferred; no empty video player or email gate |
| Homepage entry | Opening now links to `/demo/#examples` | Supports homepage-based cards without redirecting normal homepage visitors |
| Future-card route | New `/go/card` returns a fixed, uncached 302 to `/demo/` | Existing printed/campaign URLs are unchanged; do not assume this is on the current card |
| Outreach materials | Public overview, private offer reference, conversation record, follow-up drafts and recording checklist | Private pricing stays outside public assets and pages |

## Later today with Claude

Read [the recording checklist](outreach/05_recording_checklist.md) and [the working test environment](test-environment/README.md). Reuse this one story:

- Fictional dealership: Northline Demo Motors.
- Sample vehicle: graphite crossover, Stock D214. The photo is AI-generated and does not depict available inventory.
- Buyer: Alex Morgan, fictional number 202-555-0146.
- Callback owner: Jordan Lee. Duty-manager fallback: Taylor Example.
- Requested callback: 3–4 p.m. dealership local time. No time or visit is promised.
- Next action: staff confirms vehicle information and contacts Alex.

The public website example intentionally remains a simulation. Use the isolated local test for the saved-record shot and identify its boundaries in the narration. Do not cut between them in a way that implies the public simulation sends a real lead.

The kit's optional localhost interface is prepared for the owner's recording environment. It was not launched here. A real call, actual provider delivery, current voice/routing/disclosure, and an approved test recipient still need verification before being shown as working.

## Finish before field use

1. Scan the actual business card and copy the encoded URL. Compare its actual route with the saved specification before changing it or printing another code.
2. Approve the exact saved website version before publication, as required by `Website_Agent_Handoff_ChatGPT.md`, section 1.
3. Test the released site on a phone using Wi-Fi and cellular data, including return navigation and fit-call request behavior. A request is not a confirmed appointment.
4. Record and review the video in Claude, including readable captions, audio and a fallback. Integrate the approved video without blocking the examples.
5. Save the reviewed video and useful screenshots on the phone for weak-signal visits.

Browser/mobile/keyboard/assistive-technology testing is unverified in this environment because the Sites browser capability is unavailable. Prior automated live checks were blocked by Cloudflare; that did not establish a site-code failure. No production call, form submission, message, customer-data access or provider configuration change was used for this candidate.

## Source and rollback

Public changes: `site-html/demo.html`, homepage example link, `public/dealer-demo.js`, `public/demo-hub.css`, the three `site-html/examples/dealership/` pages and their route handlers, example CSS/JS/photo, and `app/go/card/route.ts`.

Local-only source: this kit, its isolated test adapters and focused tests. No application library, database migration, hosting manifest, receptionist routing, existing QR campaign source or account area is changed.

Rollback target: version 108, saved ID `appgprj_6abd3e1333308191928b1d9102e7b093~appgver_f68ee8e048c881918d6dadb410d6ca00`. No database migration needs reversal.
