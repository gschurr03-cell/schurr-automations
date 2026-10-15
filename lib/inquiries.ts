import {WEBSITE_CALLBACK_CONSENT,WEBSITE_CALLBACK_TEXT,callbackPhone} from './website-callback-policy';
import { isInquirySource, type InquirySource } from './inquiry-attribution';
import { env } from 'cloudflare:workers';
import { responsePlan } from './response-policy';
import { websiteOwnerAlertPayload } from './owner-alert-content';
import { CUSTOMER_EMAIL_CONSENT,CUSTOMER_EMAIL_CONSENT_TEXT,customerEmailPayload,INFORMATION_EMAIL_CONSENT,INFORMATION_EMAIL_CONSENT_TEXT,informationEmailPayload } from './customer-email-content';

export const SERVICES = ['calls', 'leads', 'website', 'reviews', 'marketing', 'brain', 'audit', 'coding', 'time', 'growth', 'general'] as const;
// Saved inquiries and fit-call requests are counted only by the durable write below.
export const METRIC_EVENTS = ['page_view', 'service_open', 'brief_view', 'brief_download', 'call_click', 'text_click', 'inquiry_start', 'fit_cta_clicked', 'dealer_demo_started', 'dealer_demo_completed', 'booking_failed', 'demo_phone_clicked', 'worksheet_opened'] as const;
export const METRIC_ROUTES = ['/', '/how-it-works/', '/why-automation/', '/meet-gavin/', '/privacy/', '/inquire/', '/demo/', '/book/', '/industries/used-car-dealers/', '/resources/inquiry-checklist/', '/solutions/ai-receptionist/', '/solutions/custom-automation/', '/solutions/websites-chatbots/', '/solutions/local-seo-reviews/'] as const;
export const MAX_INQUIRY_BYTES = 12 * 1024;
const TOKEN_TTL_SECONDS = 20 * 60;
const MAX_DAILY_INQUIRIES = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

type Statement = {
  bind(...values: (string | number | null)[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<{ results?: Record<string, unknown>[] }[]> };
type Runtime = { DB?: Database; INQUIRY_SIGNING_SECRET?: string };
export type Service = (typeof SERVICES)[number];
export type InquiryRecord = {
  id: string; name: string; business: string; email: string; phone: string;
  service: Service; message: string; preferredContact: 'email' | 'phone' | 'text'; consentAt: string; createdAt: string;
};
export type MetricRecord = { day: string; event: string; route: string; service: string; count: number };
type InquiryInput = Omit<InquiryRecord, 'id' | 'createdAt' | 'consentAt'> & { consent: true; automaticEmailConsent:boolean; emailConsentScope?:string; requestKind?:string; automaticCallConsent?:boolean; source: InquirySource; submissionKey: string; token: string };

export class RequestError extends Error {
  constructor(public status: number, message: string, public fieldErrors?: Record<string, string>, public retryAfter?: number) { super(message); }
}

export function database(): Database {
  const db = (env as unknown as Runtime).DB;
  if (!db) throw new RequestError(503, 'The inquiry service is temporarily unavailable. Please call Gavin.');
  return db;
}

export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
}

export function routeError(error: unknown): Response {
  if (error instanceof RequestError) {
    const response = privateJson({ ok: false, error: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) }, error.status);
    if (error.status === 429) response.headers.set('Retry-After', String(error.retryAfter || 60));
    return response;
  }
  // Deliberately do not log request bodies, contact information, or database error strings.
  console.error('Inquiry service operation failed.');
  return privateJson({ ok: false, error: 'The service is temporarily unavailable. Please try again or call Gavin.' }, 503);
}

export function checkOrigin(request: Request, requireOrigin = true): string {
  const origin = new URL(request.url).origin;
  const supplied = request.headers.get('origin');
  if ((requireOrigin && !supplied) || (supplied && supplied !== origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new RequestError(403, 'Please submit this request from the Schurr Automations website.');
  }
  return origin;
}

export async function readBoundedText(request: Pick<Request, 'headers' | 'body'>, maxBytes = MAX_INQUIRY_BYTES): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (declaredLength > maxBytes) throw new RequestError(413, 'This request is too large. Please shorten your message.');
  if (!request.body) throw new RequestError(400, 'The request is empty.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new RequestError(413, 'This request is too large. Please shorten your message.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new RequestError(400, 'The request could not be read. Please try again.'); }
}

export async function readJson(request: Request, maxBytes = MAX_INQUIRY_BYTES): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RequestError(415, 'Send this request as JSON.');
  let payload: unknown;
  try { payload = JSON.parse(await readBoundedText(request, maxBytes)); }
  catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(400, 'The request could not be read. Please try again.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new RequestError(400, 'The request must contain form fields.');
  return payload as Record<string, unknown>;
}

export function validateInquiry(payload: Record<string, unknown>): InquiryInput {
  const allowed = new Set(['name', 'business', 'email', 'phone', 'service', 'message', 'preferredContact', 'website', 'submissionKey', 'token', 'consent', 'automaticEmailConsent', 'automaticEmailConsentVersion', 'automaticCallConsent', 'automaticCallConsentVersion', 'requestKind', 'source']);
  if (Object.keys(payload).some(key => !allowed.has(key))) throw new RequestError(400, 'This form contains unsupported fields. Refresh the page and try again.');
  const errors: Record<string, string> = {};
  function field(key: string, max: number, required = false): string {
    const raw = payload[key];
    if (raw === undefined && !required) return '';
    if (typeof raw !== 'string') { errors[key] = 'Enter text in this field.'; return ''; }
    const value = raw.trim().replace(/\r\n?/g, '\n');
    if (required && !value) errors[key] = 'Complete this field.';
    if (value.length > max) errors[key] = `Use ${max} characters or fewer.`;
    if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value) || (key !== 'message' && /[\n\t]/.test(value))) errors[key] = 'Remove unsupported characters.';
    return value;
  }
  const name = field('name', 100, true);
  const business = field('business', 160);
  const email = field('email', 254).toLowerCase();
  const phone = field('phone', 40);
  const service = field('service', 24, true);
  const message = field('message', 4000, true);
  const preferredContact = field('preferredContact', 10, true);
  const website = field('website', 300);
  const submissionKey = field('submissionKey', 36, true).toLowerCase();
  const token = field('token', 1200, true);
  const source = payload.source === undefined ? 'website' : payload.source;
  if (!isInquirySource(source)) errors.source = 'Refresh the page to use a valid request source.';
  if (website) throw new RequestError(400, 'This request could not be accepted. Please call Gavin if the problem continues.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (phone && (!/^[+()\d\s.\-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) errors.phone = 'Enter a valid phone number.';
  if (!SERVICES.includes(service as Service)) errors.service = 'Choose a service from the list.';
  if (preferredContact !== 'email' && preferredContact !== 'phone') errors.preferredContact = 'Choose email or a phone call. Text messaging is not available.';
  if (preferredContact === 'email' && !email) errors.email = 'Enter an email address so Gavin can reply.';
  if (preferredContact === 'phone' && !phone) errors.phone = 'Enter a phone number so Gavin can reply.';
  if (message && message.length < 10) errors.message = 'Please add a little detail about your project.';
  if (payload.consent !== true) errors.consent = 'Confirm that Gavin may contact you about this inquiry.';
  if(payload.automaticEmailConsent!==undefined&&typeof payload.automaticEmailConsent!=='boolean')errors.automaticEmailConsent='Choose whether to receive the automatic confirmation.';
  const automaticEmailConsent=payload.automaticEmailConsent===true;
  if(automaticEmailConsent&&/[<>,;"\\]/.test(email))errors.email='Enter one plain email address for the confirmation.';
  const emailConsentScope=payload.automaticEmailConsentVersion===INFORMATION_EMAIL_CONSENT?INFORMATION_EMAIL_CONSENT:CUSTOMER_EMAIL_CONSENT;
  if(automaticEmailConsent&&(!email||![CUSTOMER_EMAIL_CONSENT,INFORMATION_EMAIL_CONSENT].includes(String(payload.automaticEmailConsentVersion))||(emailConsentScope===CUSTOMER_EMAIL_CONSENT&&preferredContact!=='email')))errors.automaticEmailConsent='Enter your email and use the current optional email checkbox.';
  const requestKind=field('requestKind',24);
  const automaticCallConsent=payload.automaticCallConsent===true;
  if(payload.automaticCallConsent!==undefined&&typeof payload.automaticCallConsent!=='boolean')errors.automaticCallConsent='Choose whether to request an AI callback.';
  if(automaticCallConsent&&(payload.automaticCallConsentVersion!==WEBSITE_CALLBACK_CONSENT||preferredContact!=='phone'||requestKind!=='call'||!callbackPhone(phone)))errors.automaticCallConsent='Choose Request a call, phone contact, and a US or Canada phone number for the optional AI callback.';
  if(requestKind&&!['quote','information','call','booking'].includes(requestKind))errors.requestKind='Choose a request type.';
  if (!UUID.test(submissionKey)) errors.submissionKey = 'Refresh the form and try again.';
  if (Object.keys(errors).length) throw new RequestError(400, 'Please check the highlighted fields.', errors);
  return { name, business, email, phone, service: service as Service, message, preferredContact: preferredContact as InquiryRecord['preferredContact'], consent: true, automaticEmailConsent, emailConsentScope, requestKind, automaticCallConsent, source: source as InquirySource, submissionKey, token };
}

function encodeBase64Url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token encoding');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), character => character.charCodeAt(0));
}
async function signingKey(): Promise<CryptoKey> {
  const secret = (env as unknown as Runtime).INQUIRY_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new RequestError(503, 'The inquiry form is temporarily unavailable. Please call Gavin.');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function issueInquiryToken(origin: string, existingKey?: string | null) {
  if (existingKey && !UUID.test(existingKey)) throw new RequestError(400, 'Refresh the form and try again.');
  const submissionKey = existingKey?.toLowerCase() || crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({ v: 1, purpose: 'inquiry', origin, key: submissionKey, issued: now, expires: now + TOKEN_TTL_SECONDS })));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(payload));
  return { token: `${payload}.${encodeBase64Url(new Uint8Array(signature))}`, submissionKey, expiresAt: new Date((now + TOKEN_TTL_SECONDS) * 1000).toISOString() };
}

export async function verifyInquiryToken(token: string, origin: string, submissionKey: string): Promise<void> {
  const key = await signingKey();
  try {
    if (token.length > 1200) throw new Error('Token too long');
    const parts = token.split('.');
    if (parts.length !== 2) throw new Error('Invalid token');
    const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(parts[1]), encoder.encode(parts[0]));
    if (!valid) throw new Error('Invalid signature');
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    if (payload.v !== 1 || payload.purpose !== 'inquiry' || payload.origin !== origin || payload.key !== submissionKey || !Number.isInteger(payload.issued) || !Number.isInteger(payload.expires) || payload.issued > now + 30 || payload.expires <= now || payload.expires - payload.issued !== TOKEN_TTL_SECONDS) throw new Error('Invalid claims');
  } catch { throw new RequestError(403, 'Your form session has expired. Refresh the form session and try again.'); }
}

export async function inquiryDigest(input: InquiryInput): Promise<string> {
  // Omit the default source to preserve receipt hashes for existing website forms.
  const fields = { name: input.name, business: input.business, email: input.email, phone: input.phone, service: input.service, message: input.message, preferredContact: input.preferredContact, consent: true, ...(input.requestKind?{requestKind:input.requestKind}:{}), ...(input.automaticCallConsent?{automaticCallConsent:WEBSITE_CALLBACK_CONSENT}:{}), ...(input.automaticEmailConsent?{automaticEmailConsent:input.emailConsentScope||CUSTOMER_EMAIL_CONSENT}:{}), ...(input.source && input.source !== 'website' ? { source: input.source } : {}) };
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(fields)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function existingInquiryReceipt(input: InquiryInput): Promise<string | null> {
  const existing = await database().prepare('SELECT id, body_hash FROM inquiries WHERE submission_key = ?').bind(input.submissionKey).first<{ id: string; body_hash: string }>();
  if (!existing) {
    if(await database().prepare('SELECT receipt_id FROM inquiry_receipts WHERE submission_key=?').bind(input.submissionKey).first())throw new RequestError(410,'This inquiry was removed. It will not be recreated or emailed again from this form reference.');
    return null;
  }
  if (existing.body_hash !== await inquiryDigest(input)) throw new RequestError(409, 'This inquiry was already saved with different details. Contact Gavin to make a correction.');
  return existing.id;
}

export async function saveInquiry(input: InquiryInput): Promise<{ receipt: string; duplicate: boolean }> {
  const db = database();
  const hash = await inquiryDigest(input);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const dayStart = `${day}T00:00:00.000Z`;
  const nextDay = new Date(Date.parse(dayStart) + 86400000).toISOString();
  // Intake, its editable CRM overlay, response draft and owner alert commit together.
  // Every dependent insert uses this fresh attempt ID, so retries cannot recreate
  // an alert or replace an existing overlay with the original form details.
  const insert = db.prepare(`INSERT INTO inquiries
    (id, submission_key, body_hash, name, business, email, phone, service, message, preferred_contact, consent_at, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE (SELECT count(*) FROM inquiries WHERE created_at >= ? AND created_at < ?) < ? AND NOT EXISTS(SELECT 1 FROM inquiry_receipts WHERE submission_key=?)
    ON CONFLICT(submission_key) DO NOTHING RETURNING id`).bind(id, input.submissionKey, hash, input.name, input.business, input.email, input.phone, input.service, input.message, input.preferredContact, now, now, dayStart, nextDay, MAX_DAILY_INQUIRIES,input.submissionKey);
  const receipt=db.prepare('INSERT INTO inquiry_receipts(submission_key,receipt_id,created_at) SELECT submission_key,id,created_at FROM inquiries WHERE id=? ON CONFLICT(submission_key) DO NOTHING').bind(id);
  const metric = db.prepare(`INSERT INTO daily_metrics (day, event, route, service, count)
    SELECT ?, 'inquiry_received', '/', ?, 1 WHERE EXISTS (SELECT 1 FROM inquiries WHERE id = ?)
    ON CONFLICT(day, event, route, service) DO UPDATE SET count = daily_metrics.count + 1`).bind(day, input.service, id);
  const savedMetric = db.prepare(`INSERT INTO daily_metrics (day, event, route, service, count)
    SELECT ?, ?, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM inquiries WHERE id = ?)
    ON CONFLICT(day, event, route, service) DO UPDATE SET count = daily_metrics.count + 1`)
    .bind(day, input.requestKind === 'booking' ? 'fit_call_requested' : 'inquiry_saved', input.requestKind === 'booking' ? '/book/' : '/inquire/', input.service, id);
  const lead = db.prepare(`INSERT INTO crm_leads (id,inquiry_id,name,business,email,phone,service,preferred_contact,source,created_at,updated_at)
    SELECT id,id,name,business,email,phone,service,preferred_contact,?,created_at,created_at
    FROM inquiries WHERE id=? ON CONFLICT(id) DO NOTHING`).bind(input.source || 'website', id);
  const plan = responsePlan({ ...input, consent: true });
  const responseJob = db.prepare(`INSERT INTO response_jobs (id,inquiry_id,source_key,body_hash,channel,status,draft,consent_scope,created_at,updated_at)
    SELECT ?,?,?,?,?,'needs_review',?,'inquiry_reply_v1',?,? WHERE EXISTS(SELECT 1 FROM inquiries WHERE id=?) ON CONFLICT(source_key) DO NOTHING`)
    .bind(id,id,`inquiry:${id}`,hash,input.preferredContact,plan.draft,now,now,id);
  const alert = db.prepare(`INSERT INTO owner_alerts (id,lead_id,payload,created_at)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM response_jobs WHERE id=? AND inquiry_id=?) ON CONFLICT(id) DO NOTHING`)
    .bind(id,id,websiteOwnerAlertPayload(id,input),now,id,id);
  const customerEmail=db.prepare(`INSERT INTO customer_first_emails(id,recipient,payload,consent_scope,consent_text,consent_at,created_at)
    SELECT id,email,?,?,?,?,? FROM inquiries WHERE id=? AND email!='' AND ?=1 ON CONFLICT(id) DO NOTHING`)
    .bind(input.emailConsentScope===INFORMATION_EMAIL_CONSENT?informationEmailPayload(input.email,id,input.service):customerEmailPayload(input.email,id),input.emailConsentScope||CUSTOMER_EMAIL_CONSENT,input.emailConsentScope===INFORMATION_EMAIL_CONSENT?INFORMATION_EMAIL_CONSENT_TEXT:CUSTOMER_EMAIL_CONSENT_TEXT,now,now,id,input.automaticEmailConsent?1:0);
  const callback=db.prepare(`INSERT INTO website_callbacks(id,recipient,consent_scope,consent_text,consent_at,created_at,status,last_error) SELECT id,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM website_callback_settings WHERE id='main' AND enabled=1) THEN 'pending' ELSE 'cancelled' END,CASE WHEN EXISTS(SELECT 1 FROM website_callback_settings WHERE id='main' AND enabled=1) THEN '' ELSE 'Callbacks were paused before this request was saved. No call was made; follow up personally.' END FROM inquiries WHERE id=? AND preferred_contact='phone' AND ?=1 ON CONFLICT(id) DO NOTHING`).bind(callbackPhone(input.phone),WEBSITE_CALLBACK_CONSENT,WEBSITE_CALLBACK_TEXT,now,now,id,input.automaticCallConsent?1:0);
  if(input.automaticCallConsent&&!await db.prepare("SELECT id FROM website_callback_settings WHERE id='main' AND enabled=1").first())throw new RequestError(409,'AI callbacks are currently paused. Uncheck the optional AI callback to send your request to Gavin.');
  const results = await db.batch([insert, receipt, metric, savedMetric, lead, responseJob, alert,customerEmail,callback]);
  if (results[0]?.results?.length) return { receipt: id, duplicate: false };
  const existing = await db.prepare('SELECT id, body_hash FROM inquiries WHERE submission_key = ?').bind(input.submissionKey).first<{ id: string; body_hash: string }>();
  if (existing) {
    if (existing.body_hash !== hash) throw new RequestError(409, 'This form was already submitted with different details. Start a new inquiry to send a different message.');
    return { receipt: existing.id, duplicate: true };
  }
  if(await db.prepare('SELECT receipt_id FROM inquiry_receipts WHERE submission_key=?').bind(input.submissionKey).first())throw new RequestError(410,'This inquiry was removed. Start a new form only if you want to make a new request.');
  throw new RequestError(429, 'The inquiry form has reached its daily limit. Please call Gavin directly.', undefined, Math.ceil((Date.parse(nextDay) - Date.now()) / 1000));
}

export function validateMetric(payload: Record<string, unknown>): { event: string; route: string; service: string } {
  const { event, route } = payload;
  const service = payload.service ?? 'general';
  if (typeof event !== 'string' || !METRIC_EVENTS.includes(event as (typeof METRIC_EVENTS)[number]) || typeof route !== 'string' || !METRIC_ROUTES.includes(route as (typeof METRIC_ROUTES)[number]) || typeof service !== 'string' || !SERVICES.includes(service as Service)) throw new RequestError(400, 'Unknown measurement event.');
  return { event, route, service };
}

export async function recordMetric(payload: Record<string, unknown>): Promise<void> {
  const { event, route, service } = validateMetric(payload);
  const day = new Date().toISOString().slice(0, 10);
  await database().prepare(`INSERT INTO daily_metrics (day, event, route, service, count) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(day, event, route, service) DO UPDATE SET count = daily_metrics.count + 1`).bind(day, event, route, service).run();
}

export type InquiryPage = { items: InquiryRecord[]; nextCursor: string | null };
export async function listInquiries(cursor?: string): Promise<InquiryPage> {
  let boundary: [string, string] | null = null;
  if (cursor) {
    try {
      if (cursor.length > 200) throw new Error('Long cursor');
      const value = JSON.parse(new TextDecoder().decode(decodeBase64Url(cursor)));
      if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[0]) || !Number.isFinite(Date.parse(value[0])) || typeof value[1] !== 'string' || !UUID.test(value[1])) throw new Error('Invalid cursor');
      boundary = value as [string, string];
    } catch { throw new RequestError(400, 'Choose a valid inbox page.'); }
  }
  const query = `SELECT id, name, business, email, phone, service, message,
    preferred_contact AS preferredContact, consent_at AS consentAt, created_at AS createdAt
    FROM inquiries ${boundary ? 'WHERE (created_at, id) < (?, ?)' : ''} ORDER BY created_at DESC, id DESC LIMIT 101`;
  const statement = database().prepare(query);
  const rows = (await (boundary ? statement.bind(...boundary) : statement).all<InquiryRecord>()).results;
  const items = rows.slice(0, 100);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > 100 ? encodeBase64Url(encoder.encode(JSON.stringify([last.createdAt, last.id]))) : null };
}

export async function listMetrics(): Promise<MetricRecord[]> {
  const firstDay = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  return (await database().prepare('SELECT day, event, route, service, count FROM daily_metrics WHERE day >= ? ORDER BY day DESC, event, route, service').bind(firstDay).all<MetricRecord>()).results;
}

export async function deleteInquiry(id: string): Promise<void> {
  if (!UUID.test(id)) throw new RequestError(400, 'Choose a valid inquiry.');
  await database().prepare('DELETE FROM inquiries WHERE id = ?').bind(id).run();
}
