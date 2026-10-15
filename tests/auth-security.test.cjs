const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { webcrypto } = require('node:crypto');

// Tests the real auth helpers, owner pages and Worker policy. The hosting
// gateway, framework renderer and persistence boundary are explicitly mocked.
const root = process.env.SCHURR_ROOT || path.resolve(__dirname, '..');
const dependencyRequire = createRequire(path.join(root, 'package.json'));
const ts = dependencyRequire('typescript');
const { renderToStaticMarkup } = dependencyRequire('react-dom/server');
const runtime = { OWNER_EMAIL: 'owner@example.com' };
let requestHeaders = new Headers();
let inquiryReads = 0;
let metricReads = 0;
let frameworkCalls = 0;
let connectorCalls = 0;
let frameworkContentType = 'text/html; charset=utf-8';
let forwardedCursor;
const origin = 'https://example.chatgpt.site';
const modules = new Map();
const hostileInquiry = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '<img src=x onerror=alert(1)>',
  business: '</script><script>alert(2)</script>',
  message: '<script>alert(3)</script>',
  service: 'audit',
  createdAt: '2026-09-30T00:00:00.000Z',
  consentAt: '2026-09-30T00:00:00.000Z',
  preferredContact: 'email',
  email: 'private@example.com',
  phone: '+19855550101',
};

function load(relative) {
  if (!fs.existsSync(path.join(root,relative)) && fs.existsSync(path.join(root,relative+'x'))) relative += 'x';
  if (modules.has(relative)) return modules.get(relative);
  let source = fs.readFileSync(path.join(root, relative), 'utf8');
  // Reproduce the production-only branch selection performed by Vite.
  if (relative === 'build/sites-worker.ts') source = source.replaceAll('import.meta.env.DEV', 'false');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  const customRequire = name => {
    if (name.endsWith('.css')) return {};
    if (name === 'cloudflare:workers') return { env: runtime };
    if (name === 'next/headers') return { headers: async () => requestHeaders };
    if (name === 'next/navigation') return {useRouter:()=>({refresh(){}}), redirect: location => { throw new Error(`SIGN_IN_REDIRECT:${location}`); } };
    if (name === '@/lib/crm') return {getSettings:async()=>({businessName:'Schurr Automations',ownerName:'Owner',timezone:'America/Denver'}),STAGES:{},SOURCES:{},SERVICE_NAMES:{}};
    if (name === '@/lib/inquiries') return {
      listInquiries: async cursor => {
        inquiryReads += 1;
        forwardedCursor = cursor;
        return { items: [hostileInquiry], nextCursor: 'next-opaque-cursor' };
      },
      listMetrics: async () => {
        metricReads += 1;
        return [{ day: '2026-09-30', event: '<script>alert(4)</script>', route: '<img src=x onerror=alert(5)>', service: 'general', count: 1 }];
      },
    };
    if (name === 'vinext/server/fetch-handler') return { default: {
      fetch: async () => {
        frameworkCalls += 1;
        return new Response('framework response', { headers: { 'Content-Type': frameworkContentType, 'Cache-Control': 'public, max-age=3600', 'X-Powered-By': 'test-framework' } });
      },
    } };
    if (name === '../lib/connector-context') return {
      runWithConnectorBinding: async (_binding, callback) => { connectorCalls += 1; return callback(); },
    };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), `${name}.ts`)));
    return dependencyRequire(name);
  };
  const context = vm.createContext({ module, exports: module.exports, require: customRequire, Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, btoa, atob, crypto: webcrypto, Date, Intl, Map, Set, console });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

function identity(email = 'owner@example.com', userId = 'owner-id', extra = {}) {
  requestHeaders = new Headers({ 'oai-authenticated-user-id': userId, 'oai-authenticated-user-email': email, ...extra });
}
function request(route, method = 'GET', headers = {}, body) {
  return new Request(`${origin}${route}`, { method, headers, ...(body === undefined ? {} : { body }) });
}

(async () => {
  let checks = 0;
  function pass(description) { checks += 1; process.stdout.write(`PASS ${description}\n`); }
  const auth = load('app/chatgpt-auth.ts');
  const owner = load('lib/owner.ts');
  const inbox = load('app/manage/inquiries/page.tsx');
  const metrics = load('app/manage/metrics/page.tsx');
  const policy = load('lib/request-policy.ts');
  const worker = load('build/sites-worker.ts').default;

  for (const headers of [{}, { 'oai-authenticated-user-id': 'owner-id' }, { 'oai-authenticated-user-email': 'owner@example.com' }]) {
    requestHeaders = new Headers(headers);
    assert.equal(await auth.getChatGPTUser(), null);
    assert.equal(await owner.getOwnerAccess(), null);
    await assert.rejects(() => auth.requireChatGPTUser('/manage/inquiries'), /SIGN_IN_REDIRECT:\/signin-with-chatgpt\?return_to=%2Fmanage%2Finquiries/);
  }
  pass('actual authentication helper requires both forwarded identity headers');

  identity('stranger@example.com', 'stranger-id');
  assert.equal((await owner.getOwnerAccess()).allowed, false);
  identity('OWNER@EXAMPLE.COM');
  assert.equal((await owner.getOwnerAccess()).allowed, true);
  for (const value of ['', undefined, 'not-an-email']) {
    runtime.OWNER_EMAIL = value;
    assert.equal((await owner.getOwnerAccess()).allowed, false);
  }
  runtime.OWNER_EMAIL = 'owner@example.com';
  identity('owner@example.com', 'owner-id', { 'oai-authenticated-user-full-name': '%ZZ', 'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8' });
  assert.equal((await auth.getChatGPTUser()).fullName, null);
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/signin-with-chatgpt', '/callback', '/signout-with-chatgpt']) {
    assert.equal(auth.chatGPTSignInPath(value), '/signin-with-chatgpt?return_to=%2F');
    assert.equal(auth.chatGPTSignOutPath(value), '/signout-with-chatgpt?return_to=%2F');
  }
  assert.equal(auth.chatGPTSignInPath('/manage/inquiries?cursor=abc'), '/signin-with-chatgpt?return_to=%2Fmanage%2Finquiries%3Fcursor%3Dabc');
  pass('owner allowlist fails closed and sign-in return paths remain local');

  requestHeaders = new Headers();
  await assert.rejects(() => inbox.default({ searchParams: Promise.resolve({}) }), /SIGN_IN_REDIRECT:/);
  await assert.rejects(() => metrics.default(), /SIGN_IN_REDIRECT:/);
  identity('stranger@example.com', 'stranger-id');
  let html = renderToStaticMarkup(await inbox.default({ searchParams: Promise.resolve({ cursor: 'hostile' }) }));
  let metricsHtml = renderToStaticMarkup(await metrics.default());
  assert.equal(inquiryReads, 0);
  assert.equal(metricReads, 0);
  assert.ok(!html.includes('private@example.com'));
  assert.ok(!metricsHtml.includes('alert(4)'));
  runtime.OWNER_EMAIL = '';
  identity();
  renderToStaticMarkup(await inbox.default({ searchParams: Promise.resolve({}) }));
  renderToStaticMarkup(await metrics.default());
  assert.equal(inquiryReads, 0);
  assert.equal(metricReads, 0);
  runtime.OWNER_EMAIL = 'owner@example.com';
  pass('anonymous, non-owner and unconfigured owner pages never read private data');

  html = renderToStaticMarkup(await inbox.default({ searchParams: Promise.resolve({ cursor: 'opaque-page-cursor' }) }));
  metricsHtml = renderToStaticMarkup(await metrics.default());
  assert.equal(inquiryReads, 1);
  assert.equal(metricReads, 1);
  assert.equal(forwardedCursor, 'opaque-page-cursor');
  for (const literal of ['<img src=x onerror=alert(1)>', '<script>alert(2)</script>', '<script>alert(3)</script>']) assert.ok(!html.includes(literal));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(3)&lt;/script&gt;'));
  assert.ok(!metricsHtml.includes('<script>alert(4)</script>'));
  assert.ok(metricsHtml.includes('&lt;script&gt;alert(4)&lt;/script&gt;'));
  assert.ok(!metricsHtml.includes('<img src=x onerror=alert(5)>'));
  assert.ok(html.includes('/manage/inquiries?cursor=next-opaque-cursor'));
  pass('authorized owner pages escape hostile data and use cursor pagination');

  const denied = [
    [request('/', 'POST', { 'content-type': 'multipart/form-data; boundary=x' }, '--x--'), 405],
    [request('/manage/inquiries', 'POST'), 405],
    [request('/api/inquiry-token', 'POST'), 405],
    [request('/api/inquiries', 'GET'), 405],
    [request('/api/metrics', 'DELETE'), 405],
    [request('/api/manage/inquiries', 'PUT'), 405],
    [request('/_next/image?url=https://example.invalid/pixel'), 404],
    [request('/_vinext/image?url=https://example.invalid/pixel'), 404],
    [request('/%ZZ'), 400],
    [request('/manage%2finquiries'), 400],
    [request('/manage%5cinquiries'), 400],
    [request('/%256danage/inquiries'), 400],
  ];
  for (const [req, status] of denied) {
    const response = await worker.fetch(req, {}, { props: {} });
    assert.equal(response.status, status, `${req.method} ${req.url}`);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
  assert.equal(frameworkCalls, 0);
  assert.equal(connectorCalls, 0);
  pass('unused methods, image transforms and ambiguous paths stop before framework execution');

  for (const actionHeader of ['next-action', 'x-rsc-action']) {
    for (const route of ['/', '/manage/inquiries', '/api/inquiries', '/api/metrics', '/api/manage/inquiries']) {
      const response = await worker.fetch(request(route, 'POST', { [actionHeader]: 'untrusted-action-id', 'content-type': 'application/json' }, '{}'), {}, { props: {} });
      assert.equal(response.status, 403, `${route} ${actionHeader}`);
    }
  }
  for (const route of ['/api/inquiries', '/api/metrics', '/api/manage/inquiries']) {
    for (const contentType of ['multipart/form-data; boundary=attack', 'text/plain', 'application/octet-stream']) {
      const response = await worker.fetch(request(route, 'POST', { 'content-type': contentType }, 'test'), {}, { props: {} });
      assert.equal(response.status, 415, `${route} ${contentType}`);
    }
  }
  assert.equal(frameworkCalls, 0);
  assert.equal(connectorCalls, 0);
  pass('explicit and headerless multipart Server Actions stop before the framework decoder');

  for (const [route, method, contentType] of [
    ['/', 'GET'], ['/how-it-works/', 'HEAD'], ['/api/inquiry-token', 'GET'], ['/api/inquiry-token', 'HEAD'],
    ['/api/inquiries', 'POST', 'application/json'], ['/api/metrics', 'POST', 'application/json; charset=utf-8'],
    ['/api/manage/inquiries', 'POST', 'application/x-www-form-urlencoded'],
  ]) {
    const headers = contentType ? { 'content-type': contentType } : {};
    const response = await worker.fetch(request(route, method, headers), {}, { props: {} });
    assert.equal(response.status, 200, `${route} ${method}`);
  }
  assert.equal(frameworkCalls, 7);
  assert.equal(connectorCalls, 7);
  pass('documented page and API methods continue through the guarded Worker');

  for (const contentType of ['text/html; charset=utf-8', 'text/x-component']) {
    frameworkContentType = contentType;
    for (const route of ['/manage/inquiries', '/manage/metrics', '/%6danage/inquiries', '/manage%2Finquiries', '/manage/inquiries.rsc']) {
      if (route.includes('%2F')) continue; // Separator aliases are rejected above.
      const response = await worker.fetch(request(route), {}, { props: {} });
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
      assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
      assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
      assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(response.headers.get('X-Powered-By'), null);
    }
  }
  const deletionResponse = await worker.fetch(request('/%61pi/manage/inquiries', 'POST', { 'content-type': 'application/x-www-form-urlencoded' }, 'id=x'), {}, { props: {} });
  assert.equal(deletionResponse.headers.get('X-Frame-Options'), 'DENY');
  frameworkContentType = 'text/html; charset=utf-8';
  const publicResponse = await worker.fetch(request('/'), {}, { props: {} });
  assert.match(publicResponse.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.equal(publicResponse.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=(), payment=()');
  assert.equal(policy.canonicalRequestPath(request('/%6danage/inquiries/')), '/manage/inquiries');
  pass('final HTML and RSC responses keep private data uncached and owner pages unframeable');

  for (const relative of ['index.html', 'how-it-works/index.html', 'why-automation/index.html', 'meet-gavin/index.html', 'privacy/index.html']) {
    const document = fs.readFileSync(path.join(root, 'site-html', relative), 'utf8');
    const ownerLink = [...document.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find(([, attributes, contents]) =>
      /\bhref="\/(?:login|manage\/?|crm)"/.test(attributes) &&
      /^(?:CRM login|Client &amp; owner login)$/.test(contents.trim()));
    assert.ok(ownerLink, `${relative}: recognizable owner login link`);
    assert.match(ownerLink[1], /\btarget="_top"/, `${relative}: owner login exits preview frames`);
    for (const [, attributes, contents] of document.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const src = attributes.match(/\bsrc\s*=\s*"([^"]+)"/i)?.[1];
      if (src) {
        assert.equal(new URL(src, origin).origin, origin, `${relative}: off-origin executable script`);
        assert.equal(contents.trim(), '', `${relative}: inline script content`);
      } else {
        assert.match(attributes, /\btype\s*=\s*"application\/ld\+json"/i, `${relative}: executable inline script`);
        assert.doesNotThrow(() => JSON.parse(contents));
      }
    }
    assert.ok(!/\son\w+\s*=/i.test(document), `${relative}: inline event handler`);
  }
  pass('public pages use self-hosted executable scripts and owner links exit preview frames');

  process.stdout.write(`\n${checks} auth, rendering and Worker security regression groups passed. Hosting identity-header provenance remains a deployment check.\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
