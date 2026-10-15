# For Dealers opening layout

Requested October 14, 2026 from Gavin's screenshot of the empty right side of the For Dealers hero.

## Scope

- Route: `/industries/used-car-dealers/`.
- `site-html/industries/used-car-dealers/index.html`: place the existing illustrative workflow beside the opening copy, removing its former standalone section.
- `public/dealer-workflow.css`: scoped two-column opening, compact readable workflow and stacked layout for smaller screens.
- Keep the headline, service scope, contact actions, animation behavior and fictional-data disclosures. Preserve all other routes and the homepage QR destination.

## Verification

- Public content/navigation/assets check: passed.
- Existing dealer workflow behavior checks: all five passed (visibility, timing, controls, focus and reduced motion).
- CSS parse and whitespace checks: passed.
- HTML structure: one workflow inside the hero, four stages and controls, no duplicate IDs.
- Production build: passed.
- Independent source review: no blocking cascade, wrapping or structural issue found. The scoped hero layout switches to columns at 1100px and stacks below that width.

Browser rendering is unavailable in this managed Sites environment; no browser or physical-device pass is claimed. Content-driven height is not clipped or fixed. Homepage, QR route, provider behavior and production data are unchanged.

## Publication and rollback

Save a candidate for exact-version approval under `Website_Agent_Handoff_ChatGPT.md`, section 1. The approval of version 109 does not publish a new version.

Rollback: published version 109, saved ID `appgprj_6abd3e1333308191928b1d9102e7b093~appgver_18f4f964c7ec8191a02500db21749c29`, source `9770e049f9f7e4ea5a387fdb92ef750cfe1054a2`. No database or provider changes.
