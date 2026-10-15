import { RequestError } from './inquiries';

// Storage accepts existing HTTP listings. Website research still enforces publicUrl's HTTPS checks.
export function contactWebsite(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.includes('.') || !/^[a-z0-9.-]+$/i.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || /(^|\.)(localhost|local|internal|lan|test|invalid|example|onion)$/i.test(u.hostname)) throw Error();
    u.hash = '';
    return u.href;
  } catch { throw new RequestError(400, 'Use a public HTTP or HTTPS business website.'); }
}

export function contactRecordKey(v: {company:string; location:string; address:string; domain:string; phone:string; email:string}): string {
  const normalize = (s:string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return JSON.stringify([normalize(v.company), normalize(v.location), normalize(v.address), v.address ? v.domain : [v.domain,normalize(v.phone),v.email.toLowerCase()].join('|')]);
}
