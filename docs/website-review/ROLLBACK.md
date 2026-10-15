# Rollback plan

Candidate: `schurr-handoff-2026-10-14-r2`. This is a prepared procedure, not a completed rehearsal or authorization to deploy.

## Exact prior production release

| Field | Prior release |
|---|---|
| Site | `appgprj_6abd3e1333308191928b1d9102e7b093` |
| Public URL | `https://schurrautomations.com` |
| Version | 103 |
| Version ID | `appgprj_6abd3e1333308191928b1d9102e7b093~appgver_6c71d9c5fcec8191a5ce9e4343ad522f` |
| Source commit | `ad38b90e90f37baed2f0b61b4668951bf40b23fc` |
| Deployment | `appgdep_6aca5addbeb881919fdd9c40790eb4b0` |
| Stored artifact hash | `sha256:c43a67dcf997f563e89786b682469f2d8a7edaf3dc9881bdada29d939ee8b37a` |

The Sites version record was inspected and this release has a stored archive. Reusing its saved artifact is preferable to rebuilding old source with changed dependencies. This candidate adds no schema migration and does not change hosting identity or bindings.

## Restoration steps for the authorized operator

1. Record the incident, current deployment/version, exact UTC cutover time and affected path. Get Gavin's explicit approval for this production restoration. Do not collect customer contents in a chat or release report.
2. In Sites, inspect the version record above and confirm the selected Site, saved artifact and current audience/domain. Use **Deploy existing version** (the connector operation is `deploy_site_version`) to deploy that exact saved version to the same Site. Do not create a replacement Site or switch domains, bindings, phone numbers, QR paths or provider settings.
3. Confirm deployment completion and the expected source/artifact identity. Record the new rollback deployment ID. A successful deploy response alone is not a smoke-test pass.
4. With an authorized synthetic test channel, verify Home, the four service routes, `/book`, `/inquire`, all four printed QR query variants and the protected login boundaries. Check saved intake and the owner queue. Do not make a real booking or send a test message without the separately authorized channel.
5. Reconcile records as below, then have Gavin confirm operational ownership. Keep the incident and test evidence with the release record. Do not retry ambiguous outward actions automatically.

**Known rollback consequence:** Version 103 restores its older marketing promise and public scheduling behavior. It does not meet this handoff's new commercial or global-calendar requirements. Gavin must weigh that consequence before using it; it is not an approved long-term replacement. If restoring it would create a false-booking or promise risk, an explicitly approved forward fix using the request-only implementation is preferable. Version 104 is an unpublished source reference, not a previously proven production fallback.

## Pending-record reconciliation

- Preserve D1 and all submission receipts, inquiry rows, CRM overlays, response jobs, appointment records, suppression/withdrawal state and notification outboxes. This is a code/artifact rollback, not a database restore, deletion or import.
- An authorized owner reviews records spanning the cutover time and identifies each by durable receipt/record ID. Compare saved inquiry, CRM/response job and alert status. Reconcile IDs and status in the protected workspace; do not copy contact payloads into a public document.
- Requests created by this candidate remain **requests**. The message explicitly says no time is confirmed. A preferred window must never be converted into an appointment during rollback. Gavin arranges the time through the agreed manual process.
- The separate campaign source remains in the existing CRM column. Version 103's older read query may display those inquiries generically as Website. Do not rewrite stored source values to compensate. Recover detailed attribution from the saved records when the corrected reader returns.
- Preserve submission keys and hashes. Ordinary website hashes are unchanged. An old page cannot safely reinterpret a new request's payload; an error should lead to owner review, not a new key or replay that risks duplicate contact.
- For failed/uncertain alerts, check existing provider status and the outbox's saved sender, recipient, payload and idempotency key before any authorized retry. Provider acceptance is not delivery/read proof. Leave expired/ambiguous attempts for owner review. A rollback must not resend accepted messages or recreate deleted/withdrawn requests.
- Existing appointments retain their IDs, UTC instants, timezone, cancellation state and notices. Review any authorized test records without erasing real appointments. Do not reset reminder or cancellation receipts.

## Rehearsal still required

WQA-32 is FAIL / not verified. No production rollback, database inspection, provider action or synthetic production submission was performed. The supported browser and an authorized test environment are unavailable in this session. A staging rehearsal must demonstrate the saved artifact restore, request preservation, notification-state preservation and correct owner follow-through before this plan can be called tested.
