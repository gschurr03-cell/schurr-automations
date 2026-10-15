import { checkOrigin, readJson, privateJson, routeError, existingInquiryReceipt, saveInquiry, verifyInquiryToken } from '@/lib/inquiries';
import { FIT_CALL_MINUTES, PUBLIC_BOOKING_MODE, fitCallInput } from '@/lib/booking-request';
import { enforceRequestLimit } from '@/lib/rate-limit';
import { scheduleOwnerAlert } from '@/lib/owner-alerts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await enforceRequestLimit(request, 'availability');
    return privateJson({ ok: true, mode: PUBLIC_BOOKING_MODE, enabled: false, duration: FIT_CALL_MINUTES, timezone: 'America/Denver', slots: [], message: 'Request a 15-minute fit call. Gavin will confirm the time with you.' });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const origin = checkOrigin(request), data = await readJson(request), input = fitCallInput(data);
    await verifyInquiryToken(input.token, origin, input.submissionKey);
    const existing = await existingInquiryReceipt(input);
    // Retry recovery is read-only and checks the exact signed request body. No
    // names/contact details travel in a status URL, and a missing receipt never
    // becomes a confirmation. The eventual save still has atomic deduplication.
    if (data.action === 'lookup') return privateJson({ ok: true, found: !!existing, ...(existing ? { receipt: existing, status: 'requested', duration: FIT_CALL_MINUTES } : {}) });
    if (existing) {
      try { scheduleOwnerAlert(existing); } catch { console.error('Fit-call request saved; owner notification remains queued.'); }
      return privateJson({ ok: true, receipt: existing, status: 'requested', duration: FIT_CALL_MINUTES, duplicate: true });
    }
    await enforceRequestLimit(request, 'inquiry');
    const result = await saveInquiry(input);
    // The alert is durably queued in the intake transaction. Dispatch failure
    // must not turn a committed request into a false form failure.
    try { scheduleOwnerAlert(result.receipt); } catch { console.error('Fit-call request saved; owner notification remains queued.'); }
    return privateJson({ ok: true, receipt: result.receipt, status: 'requested', duration: FIT_CALL_MINUTES, duplicate: result.duplicate }, result.duplicate ? 200 : 201);
  } catch (error) { return routeError(error); }
}
