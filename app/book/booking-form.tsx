'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Payload = Record<string, string | boolean>;
type Reply = { ok?: boolean; found?: boolean; receipt?: string; status?: string; token?: string; submissionKey?: string; error?: string; fieldErrors?: Record<string, string> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function send(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    let body: Reply | null = null;
    try { body = await response.json() as Reply; } catch { /* An unreadable response is not a save receipt. */ }
    const delay = response.headers.get('Retry-After');
    const retryAt = delay ? /^\d+$/.test(delay) ? Date.now() + Number(delay) * 1000 : Date.parse(delay) : 0;
    return { response, body, retryAt: Number.isFinite(retryAt) ? retryAt : 0 };
  } finally { clearTimeout(timeout); }
}

export default function BookingForm({ source = 'website' }: { source?: string }) {
  const dealer = ['dealer', 'dealer-card', 'dealer-hanger'].includes(source);
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [terminal, setTerminal] = useState(false);
  const [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}), [saved, setSaved] = useState('');
  const [timezone, setTimezone] = useState('America/Denver'), [retryAt, setRetryAt] = useState(0), [retrySeconds, setRetrySeconds] = useState(0);
  const key = useRef(''), pending = useRef<Payload | null>(null), inFlight = useRef(false), uncertain = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null), savedRef = useRef<HTMLElement>(null);
  useEffect(() => { try { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver'); } catch { /* The business timezone stays explicit. */ } }, []);
  useEffect(() => { if (saved) savedRef.current?.focus(); }, [saved]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => { const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)); setRetrySeconds(seconds); if (!seconds) setRetryAt(0); };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [retryAt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || saved || terminal || Date.now() < retryAt) return;
    if (!pending.current) {
      if (!event.currentTarget.reportValidity()) return;
      const values = new FormData(event.currentTarget);
      pending.current = { ...Object.fromEntries([...values].map(([name, value]) => [name, String(value)])), consent: values.get('consent') === 'on', bookingMode: 'request', source };
    }
    inFlight.current = true; setBusy(true); setError(''); setFieldErrors({});
    const wasUncertain = uncertain.current;
    let postIssued = false;
    try {
      const credentials = await send('/api/inquiry-token' + (key.current ? '?key=' + encodeURIComponent(key.current) : ''));
      if (credentials.retryAt) setRetryAt(credentials.retryAt);
      if (!credentials.response.ok || !credentials.body?.submissionKey || !UUID.test(credentials.body.submissionKey) || typeof credentials.body.token !== 'string') throw new Error(credentials.body?.error || 'The form could not connect. Your details remain here.');
      key.current = credentials.body.submissionKey;
      const payload = { ...pending.current, token: credentials.body.token, submissionKey: key.current };
      const accept = (reply: Reply | null) => {
        if (reply?.ok === true && reply.status === 'requested' && typeof reply.receipt === 'string' && UUID.test(reply.receipt)) { setSaved(reply.receipt); uncertain.current = false; setLocked(false); return true; }
        return false;
      };
      if (wasUncertain) {
        const lookup = await send('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, action: 'lookup' }) });
        if (lookup.retryAt) setRetryAt(lookup.retryAt);
        if (lookup.response.ok && accept(lookup.body)) return;
        if (lookup.response.status === 409 || lookup.response.status === 410) setTerminal(true);
        if (!lookup.response.ok || lookup.body?.ok !== true || lookup.body.found !== false) throw new Error(lookup.body?.error || 'We could not check this request. Retry the same request below.');
      }
      postIssued = true; uncertain.current = true; setLocked(true);
      const result = await send('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, action: 'request' }) });
      if (result.retryAt) setRetryAt(result.retryAt);
      if (result.response.ok && accept(result.body)) return;
      if (result.response.status === 409 || result.response.status === 410) setTerminal(true);
      if (result.response.status === 400 && !wasUncertain) {
        uncertain.current = false; postIssued = false; pending.current = null; setLocked(false);
        setFieldErrors(result.body?.fieldErrors || {});
      }
      throw new Error(result.body?.error || 'We could not confirm whether your request was saved. Retry the same request below.');
    } catch (cause) {
      if (!postIssued && !uncertain.current) { pending.current = null; setLocked(false); }
      setError(cause instanceof Error && cause.name !== 'AbortError' && !(cause instanceof TypeError) ? cause.message : 'We could not confirm whether your request was saved. Your details remain here. Retry the same request below.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  const errorFor = (field: string) => fieldErrors[field] ? <span className="booking-field-error" id={`fit-${field}-error`}>{fieldErrors[field]}</span> : null;
  const accessibility = (field: string) => ({ 'aria-invalid': !!fieldErrors[field], 'aria-describedby': fieldErrors[field] ? `fit-${field}-error` : undefined });
  if (saved) return <section ref={savedRef} tabIndex={-1} className="booking-success" role="status" aria-labelledby="fit-saved-title">
    <h2 id="fit-saved-title">Your fit-call request is saved.</h2>
    <p>Gavin will call you to arrange a 15-minute fit call. Your preferred time is a request; the appointment is not booked yet.</p>
    <p><strong>Your phone:</strong> {String(pending.current?.phone || '')}<br /><strong>Preferred window:</strong> {String(pending.current?.preferredWindow || 'Please arrange a time with me.')}<br /><strong>Your timezone:</strong> {String(pending.current?.timezone || timezone)}</p>
    <p>Once you agree on a time, Gavin will confirm the date, timezone and call details with you.</p>
    <p>Need to change or withdraw this request? <a href={`mailto:gavin@schurrautomations.com?subject=${encodeURIComponent('Fit-call request ' + saved)}`}>Email Gavin with this reference</a>.</p>
    <p className="booking-receipt">Request reference: {saved}</p>
  </section>;
  return <section className="booking-surface" aria-labelledby="fit-form-title"><form onSubmit={submit} aria-busy={busy}>
    <h2 id="fit-form-title">Request your fit call</h2>
    <p>15 minutes by phone. Tell us what needs attention and when a call would suit you. Gavin will confirm a time.</p>
    {error && <div ref={errorRef} tabIndex={-1} className="booking-error" role="alert"><p>{error}</p>{Object.entries(fieldErrors).length > 0 && <ul>{Object.entries(fieldErrors).map(([field, message]) => <li key={field}><a href={`#fit-${field}`}>{message}</a></li>)}</ul>}</div>}
    <fieldset disabled={busy || locked}><legend className="booking-sr-only">Your fit-call request</legend>
      <div className="booking-fields">
        <label htmlFor="fit-name">Your name<input id="fit-name" name="name" required maxLength={100} autoComplete="name" {...accessibility('name')} />{errorFor('name')}</label>
        <label htmlFor="fit-business">{dealer ? 'Dealership (optional)' : 'Business (optional)'}<input id="fit-business" name="business" maxLength={160} autoComplete="organization" {...accessibility('business')} />{errorFor('business')}</label>
        <label htmlFor="fit-phone">Phone number<input id="fit-phone" name="phone" type="tel" required maxLength={40} autoComplete="tel" {...accessibility('phone')} />{errorFor('phone')}</label>
        <label htmlFor="fit-email">Email (optional)<input id="fit-email" name="email" type="email" maxLength={254} autoComplete="email" {...accessibility('email')} />{errorFor('email')}</label>
      </div>
      <label htmlFor="fit-message">What would you like to improve?<textarea id="fit-message" name="message" required minLength={10} maxLength={3000} placeholder={dealer ? 'For example: Buyers call while our salespeople are busy, and callbacks are hard to keep track of.' : 'Tell us where an inquiry, callback or other task gets stuck.'} {...accessibility('message')} />{errorFor('message')}</label>
      <label htmlFor="fit-preferredWindow">Preferred day or time window (optional)<input id="fit-preferredWindow" name="preferredWindow" maxLength={200} placeholder="For example, Tuesday afternoon" {...accessibility('preferredWindow')} />{errorFor('preferredWindow')}</label>
      <label htmlFor="fit-timezone">Your timezone<input id="fit-timezone" name="timezone" required maxLength={80} value={timezone} onChange={event => setTimezone(event.target.value)} list="fit-timezones" {...accessibility('timezone')} />{errorFor('timezone')}</label>
      <datalist id="fit-timezones"><option value="America/Denver" /><option value="America/New_York" /><option value="America/Chicago" /><option value="America/Los_Angeles" /><option value="Europe/London" /></datalist>
      <p className="booking-note">Please leave out sensitive customer records. Your preferred window does not reserve a time.</p>
      <label className="booking-check" htmlFor="fit-consent"><input id="fit-consent" name="consent" type="checkbox" required {...accessibility('consent')} /><span>I agree that Gavin at Schurr Automations may call me about this request. <a href="/privacy/">Privacy</a>.</span></label>{errorFor('consent')}
      <div className="booking-trap" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    </fieldset>
    {locked && !busy && !terminal && <p>Your details stay as submitted while we check whether the request was saved.</p>}
    {!terminal && <button type="submit" disabled={busy || retrySeconds > 0}>{busy ? 'Checking your request…' : retrySeconds > 0 ? `Try again in ${retrySeconds}s` : locked ? 'Check and retry this request' : 'Request a 15-minute fit call'}</button>}
    {terminal && <a href="mailto:gavin@schurrautomations.com">Contact Gavin about this request</a>}
    <noscript><p>To request a fit call, email <a href="mailto:gavin@schurrautomations.com">gavin@schurrautomations.com</a>.</p></noscript>
  </form></section>;
}
