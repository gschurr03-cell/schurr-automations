import { RequestError, validateInquiry } from './inquiries';
import { validTimezone } from './booking-policy';
import { isInquirySource } from './inquiry-attribution';

export const FIT_CALL_MINUTES = 15;
export const PUBLIC_BOOKING_MODE = 'request' as const;
const FIELDS = new Set(['action', 'bookingMode', 'name', 'business', 'email', 'phone', 'message', 'preferredWindow', 'timezone', 'source', 'consent', 'website', 'submissionKey', 'token']);

// A preferred window is an inquiry detail, never a reservation. The native
// appointment table is not a verified view of Gavin's other calendars.
export function fitCallInput(data: Record<string, unknown>) {
  if (data.bookingMode !== PUBLIC_BOOKING_MODE) throw new RequestError(409, 'Please refresh this page to request a fit call. Gavin will confirm a time with you.');
  if (Object.keys(data).some(key => !FIELDS.has(key))) throw new RequestError(400, 'This form contains unsupported fields. Refresh the page and try again.');
  if (data.action !== 'request' && data.action !== 'lookup') throw new RequestError(400, 'Choose a valid request action.');
  const problem = typeof data.message === 'string' ? data.message.trim() : '';
  if (problem.length < 10 || problem.length > 3000) throw new RequestError(400, 'Please check the highlighted fields.', { message: 'Describe the bottleneck in 10–3,000 characters.' });
  const preferredWindow = data.preferredWindow === undefined ? '' : data.preferredWindow;
  if (typeof preferredWindow !== 'string' || preferredWindow.length > 200 || /[\u0000-\u001f\u007f]/.test(preferredWindow)) throw new RequestError(400, 'Please check the highlighted fields.', { preferredWindow: 'Use a short preferred day or time window.' });
  let timezone: string;
  try { timezone = validTimezone(data.timezone); }
  catch { throw new RequestError(400, 'Please check the highlighted fields.', { timezone: 'Use a timezone such as America/Denver or America/New_York.' }); }
  const source = data.source === undefined ? 'website' : data.source;
  if (!isInquirySource(source)) throw new RequestError(400, 'Refresh the page to use a valid request source.');
  return validateInquiry({
    name: data.name, business: data.business, email: data.email, phone: data.phone,
    website: data.website, submissionKey: data.submissionKey, token: data.token,
    consent: data.consent, preferredContact: 'phone', requestKind: 'booking', service: 'general', source,
    automaticEmailConsent: false, automaticCallConsent: false,
    message: [
      'Request: 15-minute fit call with Gavin. A time has not been confirmed.',
      `Preferred window: ${preferredWindow.trim() || 'Please arrange a time with me.'}`,
      `Customer timezone: ${timezone}`,
      `Source: ${source}`,
      '', problem,
    ].join('\n'),
  });
}
