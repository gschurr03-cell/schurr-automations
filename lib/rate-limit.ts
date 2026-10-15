import { env } from 'cloudflare:workers';
import { isIP } from 'node:net';
import { database, RequestError } from './inquiries';

type Kind = 'token' | 'inquiry' | 'metric' | 'availability';
type Window = { seconds: number; limit: number; shared?: boolean };
// Database-backed limits apply across Worker instances. They are not an edge DDoS control.
const windows: Record<Kind, Window[]> = {
  availability: [{seconds:60,limit:30},{seconds:3600,limit:200},{seconds:60,limit:1000,shared:true}],
  token: [{ seconds: 60, limit: 8 }, { seconds: 3600, limit: 40 }, { seconds: 86400, limit: 100 }, { seconds: 60, limit: 200, shared: true }, { seconds: 86400, limit: 2000, shared: true }],
  inquiry: [{ seconds: 900, limit: 3 }, { seconds: 86400, limit: 10 }, { seconds: 86400, limit: 500, shared: true }],
  metric: [{ seconds: 60, limit: 60 }, { seconds: 86400, limit: 500 }, { seconds: 60, limit: 1000, shared: true }, { seconds: 86400, limit: 20000, shared: true }],
};

export async function sourceFingerprint(request: Request, now: number): Promise<string> {
  // Cloudflare supplies this header at the trusted dispatch boundary. Never use
  // browser-chosen X-Forwarded-For or X-Real-IP to obtain additional allowances.
  const forwarded = request.headers.get('cf-connecting-ip')?.trim() || '';
  const address = isIP(forwarded) ? forwarded.toLowerCase() : 'unattributed';
  const secret = (env as unknown as { INQUIRY_SIGNING_SECRET?: string }).INQUIRY_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new RequestError(503, 'The inquiry service is temporarily unavailable. Please call Gavin.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const day = Math.floor(now / 86400);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`rate-limit-v1|${new URL(request.url).origin}|${day}|${address}`));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function enforceRequestLimit(request: Request, kind: Kind): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const fingerprint = await sourceFingerprint(request, now);
  const db = database();
  const counters = windows[kind].map(window => {
    const start = Math.floor(now / window.seconds) * window.seconds;
    const expiresAt = start + window.seconds;
    const bucket = `${kind}:${window.shared ? 'shared' : fingerprint}:${window.seconds}:${start}`;
    return { ...window, expiresAt, bucket };
  });
  const reject = (rejected: typeof counters) => {
    const retryAfter = Math.max(...rejected.map(counter => counter.expiresAt - now));
    throw new RequestError(429, kind === 'metric' ? 'Too many activity events.' : 'Too many requests from this connection. Please try again later or call (985) 232-8337.', undefined, retryAfter);
  };
  // Once a shared cap is full, new source addresses must not create more rows.
  // The later atomic increment still enforces the cap against concurrent arrivals.
  const sharedCounters = counters.filter(counter => counter.shared);
  const sharedState = await db.batch(sharedCounters.map(counter => db.prepare('SELECT hits FROM request_limits WHERE bucket = ? AND hits >= ?').bind(counter.bucket, counter.limit)));
  const alreadyFull = sharedCounters.filter((_, index) => sharedState[index]?.results?.length);
  if (alreadyFull.length) reject(alreadyFull);
  // Reject a throttled source before it can consume a shared allowance.
  for (const shared of [false, true]) {
    const phase = counters.filter(counter => Boolean(counter.shared) === shared);
    if (!phase.length) continue;
    const cleanup = shared ? [] : [db.prepare('DELETE FROM request_limits WHERE bucket IN (SELECT bucket FROM request_limits WHERE expires_at <= ? ORDER BY expires_at LIMIT 500)').bind(now)];
    const statements = phase.map(counter => db.prepare(`INSERT INTO request_limits (bucket, hits, expires_at)
      VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET hits = request_limits.hits + 1
      WHERE request_limits.hits < ? RETURNING hits`).bind(counter.bucket, counter.expiresAt, counter.limit));
    const results = await db.batch([...cleanup, ...statements]);
    const rejected = phase.filter((_, index) => !results[index + cleanup.length]?.results?.length);
    if (rejected.length) {
      reject(rejected);
    }
  }
}
