# Dealer workflow animation

Prepared October 14, 2026 for Gavin Schurr. Baseline: published version 107, source `136ba2c48d2adbd9e1bbe0c9db6f0ec814ec81bc`.

## Change

The dealer page now has a custom four-stage animation directly after its opening. It replaces the existing numbered process section and follows one fictional vehicle inquiry through captured callback details, a named salesperson and a recorded callback outcome. A visit remains a request requiring staff confirmation.

The component uses the approved typography, dark surface, metallic border and purple accent. On desktop, a moving signal connects the stages. On narrow screens, the stages form a vertical connected sequence. The full story remains readable at every stage and without JavaScript.

Playback runs once over 9.6 seconds. Visitors can pause, resume, replay or select a stage. Motion stops offscreen and while the document is hidden. Keyboard focus pauses inspection. Reduced motion starts with a static overview and never starts playback automatically.

No customer messages, network requests, record writes, tracking or live integrations are added.

## Review

Open [Dealer_Workflow_Preview.html](Dealer_Workflow_Preview.html) for the standalone animation. It embeds the exact component, page styles, fonts and controller. This is a review artifact, not a published site URL.

Application files:

- `site-html/industries/used-car-dealers/index.html`
- `public/dealer-workflow.css`
- `public/dealer-workflow.js`
- `tests/dealer-workflow.test.cjs`

Only `/industries/used-car-dealers/` loads the new component assets. Existing routes, QR destinations, forms, phone numbers, provider settings and other page source remain unchanged.

## Verification

- Five behavior groups pass: run-once playback, pause/suspension, focus and manual controls, reduced-motion changes, and missing-markup/observer fallback.
- Existing public-content checks pass, including routes, asset references, labels and scope distinctions.
- JavaScript syntax, CSS parsing, contrast calculations and diff checks pass.
- Standard Sites production build passes.
- Independent code review found and resolved a rail endpoint mismatch; no remaining blocking defects.

Evidence is in `evidence/`. Browser preview is unavailable under the Sites workflow in this environment. Actual rendering, mobile/device layout, assistive technology and browser keyboard operation remain unverified. Source and simulated controller checks do not replace those checks.

## Release

Save this candidate for Gavin's exact-version approval under `Website_Agent_Handoff_ChatGPT.md`, section 1. Do not publish automatically. The saved version number and source commit are provided in the delivery receipt.

Rollback: published version 107, saved version `appgprj_6abd3e1333308191928b1d9102e7b093~appgver_181ecd3becbc819199ff0d9005fd22ab`. No database migration or configuration reversal is needed.
