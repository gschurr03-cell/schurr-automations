# Automotive QR landing pages: review candidate

Existing destinations are retained:

- Repair card: `/book?for=repair&via=card`
- Repair hanger: `/book?for=repair&via=hanger`
- Dealer card: `/book?for=dealer&via=card`
- Dealer hanger: `/book?for=dealer&via=hanger`

Only a single `for=repair|dealer` selects a campaign page. Unknown, missing or repeated values use the ordinary request page. `via=card|hanger` selects fixed source labels; other values become `direct`. The `#revenue-review` anchor remains.

All versions use the shared 15-minute fit-call request form. A requested window is not a reservation. A separate 35-minute workflow discovery follows only when useful. Name, phone, a short problem description and permission for Gavin to call are required. Business, email and a preferred window are optional. Automated customer email and AI callback permissions are always false on this form.

The API validates source codes against a fixed allowlist. The original inquiry text includes the code and the existing `crm_leads.source` field stores it separately in the same transaction. CRM lists, filters and exports use that field. It is source-linked attribution, not proof of a unique visitor or the buyer's original discovery channel. No migration is required. Legacy ordinary inquiries retain their default source and receipt hashes.

## Media and proof

The source paths `/videos/repair-explainer.mp4`, `/videos/dealer-explainer.mp4`, and their `public/automotive/` posters are unchanged. Both embeds are disabled until Gavin reviews their claims and captions. The files remain reachable at their original URLs. A static, visibly illustrative workflow is rendered instead. No new recording is claimed.

Historical external outcome figures and the old commercial promise have been removed from the rendered campaign pages. Their earlier wording remains in Git history, not in the current offer. Existing collateral and agreements need their own owner review.

## Verification

Local synthetic fixtures establish saved-request persistence, signed lookup, exact-payload retry, deduplication, separate source persistence and filtering, and retained selectors/media paths. A failed or uncertain response never renders a confirmed appointment. The form locks an uncertain payload and looks up its receipt before any new write.

Real-device QR scanning, browser rendering, video playback review and live notification delivery remain unverified. See `docs/website-review/WQA.md` and its evidence logs. No production deploy or test message was made.
