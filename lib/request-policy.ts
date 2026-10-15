// Keep the unused framework mutation surface outside the application router.
const applicationMethods: Record<string, string[]> = {
  '/api/health': ['GET', 'HEAD'],
  '/api/monitoring/run': ['POST'],
  '/api/manage/monitoring': ['POST'],
  '/api/manage/monitoring-connection': ['GET', 'HEAD'],
  '/api/retell/events': ['POST'],
  '/api/inquiry-token': ['GET', 'HEAD'],
  '/api/inquiries': ['POST'],
  '/api/booking': ['GET','HEAD','POST'],
  '/api/website-followup': ['GET','HEAD'],
  '/api/manage/website-followup': ['POST'],
  '/api/website-callback/tools': ['POST'],
  '/api/demo': ['GET', 'HEAD'],
  '/api/manage/response': ['POST'],
  '/api/manage/scheduling': ['GET', 'HEAD', 'POST'],
  '/api/manage/customer-email': ['POST'],
  '/api/manage/client-installations': ['GET', 'HEAD', 'POST'],
  '/api/manage/client-setups': ['GET', 'HEAD', 'POST'],
  '/api/manage/automations': ['GET', 'HEAD', 'POST'],
  '/api/resend/events': ['POST'],
  '/api/voice/intake': ['POST'],
  '/api/retell/tools': ['POST'],
  '/api/retell/inbound': ['POST'],
  '/api/manage/receptionist': ['POST'],
  '/api/manage/receptionist-auditions': ['POST'],
  '/api/manage/owner-alerts': ['POST'],
  '/api/manage/gmail': ['GET', 'HEAD', 'POST'],
  '/api/manage/gmail/callback': ['GET'],
  '/api/gmail/sync': ['POST'],
  '/api/gmail/queue': ['POST'],
  '/api/manage/gmail/queue': ['GET','HEAD','POST'],
  '/api/metrics': ['POST'],
  '/api/manage/inquiries': ['POST'],
  '/api/manage/crm': ['POST'],
  '/api/manage/contact-import': ['POST'],
  '/api/manage/outreach': ['GET', 'HEAD', 'POST'],
  '/api/manage/export': ['GET', 'HEAD'],
  '/api/manage/operational-backup': ['GET', 'HEAD'],
};

export function canonicalRequestPath(request: Request): string | null {
  try {
    const raw = new URL(request.url).pathname;
    const decoded = decodeURIComponent(raw);
    // Encoded separators and repeat-decoding aliases can disagree with routers.
    if (/%|\\|[\u0000-\u001f\u007f]/.test(decoded) || /%2f|%5c/i.test(raw)) return null;
    return decoded.replace(/\/+$/, '') || '/';
  } catch { return null; }
}

export function rejectUnsupportedRequest(request: Request): Response | null {
  const path = canonicalRequestPath(request);
  if (path === null) return new Response('Invalid request path.', { status: 400 });
  if (request.headers.has('next-action') || request.headers.has('x-rsc-action')) {
    return new Response('Server actions are not available.', { status: 403 });
  }
  if (path === '/_next/image' || path === '/_vinext/image') return new Response('Not found.', { status: 404 });
  const allowed = applicationMethods[path] || ['GET', 'HEAD'];
  if (!allowed.includes(request.method)) return new Response('Method not allowed.', { status: 405, headers: { Allow: allowed.join(', ') } });
  if (request.method === 'POST') {
    const expected = path === '/api/manage/inquiries' ? 'application/x-www-form-urlencoded' : 'application/json';
    const actual = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (actual !== expected) return new Response('Unsupported content type.', { status: 415 });
  }
  return null;
}

export function secureResponse(request: Request, response: Response): Response {
  const result = new Response(response.body, response);
  const path = canonicalRequestPath(request) || '';
  const owner = path === '/crm' || path === '/login' || path === '/manage' || path.startsWith('/manage/') || path.startsWith('/api/manage/');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', owner ? 'no-referrer' : 'strict-origin-when-cross-origin');
  result.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (new URL(request.url).protocol === 'https:') result.headers.set('Strict-Transport-Security', 'max-age=31536000');
  // Every dynamic response is non-cacheable, including encoded paths and RSC responses.
  result.headers.set('Cache-Control', 'private, no-store');
  result.headers.delete('X-Powered-By');
  if (owner) {
    result.headers.set('X-Frame-Options', 'DENY');
    result.headers.set('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  } else if(path==='/book'){
    // This public React form needs the framework's inline hydration scripts.
    result.headers.set('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; form-action 'self'");
  } else if (result.headers.get('Content-Type')?.includes('text/html')) {
    // Public pages use self-hosted scripts. React owner pages require inline RSC
    // bootstrap scripts, so their policy deliberately does not claim strict CSP.
    result.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com");
  }
  if (owner || path.startsWith('/api/')) result.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return result;
}
