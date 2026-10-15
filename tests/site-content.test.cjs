const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Source-level release checks. These do not establish browser accessibility,
// live integrations, customer outcomes, or production release approval.
const root = path.resolve(__dirname, '..');
const origin = 'https://schurrautomations.com';
const pages = [
  ['/', 'index.html'],
  ['/privacy/', 'privacy/index.html'],
  ['/demo/', 'demo.html'],
  ['/how-it-works/', 'how-it-works/index.html'],
  ['/meet-gavin/', 'meet-gavin/index.html'],
  ['/why-automation/', 'why-automation/index.html'],
  ['/solutions/ai-receptionist/', 'solutions/ai-receptionist/index.html'],
  ['/solutions/custom-automation/', 'solutions/custom-automation/index.html'],
  ['/solutions/websites-chatbots/', 'solutions/websites-chatbots/index.html'],
  ['/solutions/local-seo-reviews/', 'solutions/local-seo-reviews/index.html'],
  ['/industries/used-car-dealers/', 'industries/used-car-dealers/index.html'],
  ['/resources/inquiry-checklist/', 'resources/inquiry-checklist/index.html'],
];
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const publicDocuments = [...pages, ['/inquire/', 'inquire.html']];
const documents = new Map(publicDocuments.map(([route, file]) => [route, read('site-html/' + file)]));
const visibleText = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const openEndedPromise = /keep working for free|work(?:ing)? for free until|90[- ]day guarantee|pay for itself in 90 days/i;
const titles = [];

for (const [route, filename] of publicDocuments) {
  const html = documents.get(route);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, filename + ': duplicate IDs');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, filename + ': one H1');
  assert.ok(html.includes('rel="canonical" href="' + origin + route + '"'), filename + ': exact canonical');
  assert.ok(html.includes('property="og:url" content="' + origin + route + '"'), filename + ': exact OG URL');
  assert.match(html, /<meta\s+name="description"\s+content="[^"]{40,}"/, filename + ': useful description');
  assert.ok(html.includes('og:image') && html.includes('name="viewport"'), filename + ': social image and viewport');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title && title.length > 10 && title.length < 100, filename + ': descriptive title');
  titles.push(title);
  assert.ok(!html.includes('—'), filename + ': no em dash');
  assert.ok(!openEndedPromise.test(html), filename + ': no open-ended commercial promise, including metadata');
  assert.ok(!/\$\s*\d/.test(html), filename + ': no public numeric price or internal offer anchor');
  assert.ok(!/<video\b[^>]*\bautoplay(?:\s|=|>)/i.test(html), filename + ': video playback is intentional');
  for (const match of html.matchAll(/<(?:script|link|img|source|track|video)\b[^>]*>/gi)) {
    for (const [, asset] of match[0].matchAll(/(?:src|href|poster)="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
      assert.ok(fs.existsSync(path.join(root, 'public', asset)), filename + ': missing asset ' + asset);
    }
  }
  for (const [, anchor] of html.matchAll(/href="#([^"#]+)"/g)) {
    assert.ok(ids.includes(anchor), filename + ': missing anchor ' + anchor);
  }
  for (const [, labelId] of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
    for (const id of labelId.split(/\s+/)) assert.ok(ids.includes(id), filename + ': missing heading label ' + id);
  }
  assert.ok(html.includes('/schurr-fusion-approved.png'), filename + ': approved brand remains');
}
assert.equal(new Set(titles).size, titles.length, 'Public page titles remain unique');

const home = documents.get('/');
const sections = [...home.matchAll(/<section[^>]*aria-labelledby="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(sections, ['hero-title', 'handoff-title', 'install-title', 'process-title', 'proof-title', 'faq-title', 'book-title']);
assert.match(home, /<h1[^>]*>Keep buyer inquiries moving while you work the lot\.<\/h1>/);
assert.match(visibleText(home), /Clear scope\. Tested launch\. Visible progress\./);
assert.match(visibleText(home), /Before work begins, we agree on what the system should do, how we will test it, and what ongoing management includes\. When something falls outside the agreed behavior, we handle it through the support and correction terms in your agreement\./);
assert.match(visibleText(home), /Support on extended weekdays, 7am to 7pm MT\./);
assert.match(visibleText(home), /Setup is a separate fee, quoted for the agreed scope\./);
assert.equal((home.match(/data-workflow-story(?:\s|>)/g) || []).length, 1, 'One homepage workflow illustration');
assert.match(visibleText(home), /Illustrative workflow/);
assert.match(visibleText(home), /scripted example does not contact customers, write to a CRM, or confirm an appointment/i);
assert.ok(!home.includes('id="inquiry-form"') && !home.includes('data-guided-form'), 'Homepage directs visitors to one compact inquiry page');
assert.ok(!home.includes('id="medical-title"'), 'Specialist healthcare FAQ is not on the general homepage');
assert.ok(!home.includes('src="/app.js"') && !home.includes('calendly.com/'));
assert.ok(!/\$\s*\d[\d,]*(?:\.\d+)?\s*(?:\/\s*(?:mo|month|yr|year)|per (?:month|year))|cutting-edge|leverage|seamless|unlock|supercharge|game-changer|sms:/i.test(home));
for (const id of ['ai-receptionist', 'custom-workflows', 'websites', 'seo-aeo', 'contact']) assert.ok(home.includes('id="' + id + '"'), 'Retained homepage anchor: ' + id);
for (const route of ['/solutions/ai-receptionist/', '/solutions/custom-automation/', '/solutions/websites-chatbots/', '/solutions/local-seo-reviews/']) {
  assert.ok(home.includes('href="' + route + '"'), 'Separate service entry: ' + route);
}
for (const label of ['Solutions', 'Dealer workflow', 'Our Approach', 'About']) assert.ok(home.includes('>' + label + '<'), label + ': navigation');
assert.ok(home.includes('href="/industries/used-car-dealers/"'), 'Dealer entry');
assert.ok(home.includes('href="/inquire/?source=dealer"'), 'Dealer contact alternative');
assert.ok(home.includes('href="tel:+19857710552"'), 'Existing live demonstration phone retained');
const primaryCalls = [...home.matchAll(/<a\b[^>]*class="button[^>]*href="\/book\?source=dealer"[^>]*>([^<]+)<\/a>/g)];
assert.ok(primaryCalls.length >= 2, 'Clear fit-call actions at entry and close');
assert.ok(primaryCalls.every(match => /(?:Book|Request) a 15-minute fit call/.test(match[1])), 'Fit-call actions use one clear duration and purpose');

for (const [route] of pages.filter(([route]) => route !== '/')) {
  const handler = read('app/' + route.slice(1) + 'route.ts');
  assert.ok(handler.includes('?raw') && /new Response\(html/.test(handler) && !handler.includes('status:308'), route + ': retained separate HTML route');
}
const demo = documents.get('/demo/');
const dealer = documents.get('/industries/used-car-dealers/');
assert.ok(demo.includes('href="/book"'), 'General business-card demo uses the neutral fit-call entry');
assert.ok(!demo.includes('href="/book?source=dealer"'), 'A featured dealer example does not force dealer booking context on every demo visitor');
assert.ok(!demo.includes('source=dealer-demo'), 'No unsupported dealer-demo source parameter');
assert.ok(demo.includes('id="dealer-walkthrough"'), 'Homepage dealer-demo anchor exists');
assert.match(visibleText(demo), /fictional|scripted/i, 'Demo is labelled as an example');
assert.match(visibleText(demo), /not (?:a )?(?:live|connected)|does not (?:contact|write|create)|no (?:live )?(?:CRM|customer)/i, 'Demo discloses its operational limits');
assert.match(visibleText(dealer), /callback/i, 'Dealer offer is about inquiry ownership');
assert.match(visibleText(dealer), /appointment request/i, 'Dealer page distinguishes requests from confirmed appointments');
assert.match(visibleText(dealer), /financ/i, 'Dealer scope leaves financial decisions with authorized staff');
assert.match(visibleText(dealer), /separate|verified|supported/i, 'Dealer connections are explicitly scoped');

const inquiry = documents.get('/inquire/');
assert.ok(inquiry.includes('method="post" action="/api/inquiries"'), 'Inquiry contract preserved');
assert.ok(inquiry.includes('mailto:gavin@schurrautomations.com'), 'Direct inquiry fallback');
assert.ok(!inquiry.includes('sms:') && !inquiry.includes('<option value="text">'), 'No unsupported SMS option');
assert.ok(!inquiry.includes('data-guided-form'), 'One-screen inquiry');
const businessInput = inquiry.match(/<input\b[^>]*name="business"[^>]*>/)?.[0];
assert.ok(businessInput && !/\brequired\b/.test(businessInput), 'Business name remains optional');
for (const name of ['automaticEmailConsent', 'automaticCallConsent']) {
  const input = inquiry.match(new RegExp('<input\\b[^>]*name="' + name + '"[^>]*>'))?.[0];
  assert.ok(input && !/\bchecked\b|\brequired\b/.test(input), name + ': separate unchecked optional choice');
}

const campaign = read('app/book/automotive/campaign-page.tsx');
assert.ok(!openEndedPromise.test(campaign), 'Existing QR page also excludes the open-ended promise');
const campaigns = read('app/book/automotive/campaigns.ts');
for (const name of ['dealer', 'repair']) {
  assert.ok(campaigns.includes('/videos/' + name + '-explainer.mp4'), name + ': QR video filename retained');
  assert.ok(fs.existsSync(path.join(root, 'public/videos', name + '-explainer.mp4')), name + ': QR media present');
}
assert.ok(fs.existsSync(path.join(root, 'public/videos/business-overview.mp4')), 'Existing overview URL is preserved even when not promoted');

const sitemap = read('public/sitemap.xml');
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]).sort(), pages.map(([route]) => origin + route).sort());
assert.ok(!sitemap.includes('/book/confirmed') && !sitemap.includes('/manage/'), 'Private and confirmation pages are not indexed in the sitemap');
const seo = read('lib/site-seo.ts');
assert.ok(seo.includes('/industries/used-car-dealers/'), 'Dealer page included in internal source SEO audit');
assert.ok(seo.includes('/resources/inquiry-checklist/'), 'Worksheet included in internal source SEO audit');
const worksheet = documents.get('/resources/inquiry-checklist/');
assert.ok(/<main\b[\s\S]*href="\/book\?source=dealer"/.test(worksheet), 'Dealer worksheet CTA preserves the supported dealer attribution');
assert.ok(!worksheet.includes('source=inquiry-checklist'), 'Worksheet uses only a supported source label');
assert.ok(!/<form\b/i.test(worksheet), 'Worksheet is available without submitting contact information');
assert.match(visibleText(worksheet), /named owner|one (?:person|salesperson) own/i, 'Worksheet checks staff ownership');
assert.match(visibleText(worksheet), /not a revenue-loss estimate/i, 'Worksheet avoids an unsupported revenue diagnosis');

for (const [route, html] of documents) {
  assert.ok(!html.includes('for service businesses'), route + ': organization positioning matches the dealer focus');
  assert.ok(html.includes('>Dealer workflow</a>'), route + ': shared dealer navigation');
  for (const [, href] of html.matchAll(/<a\b[^>]*href="(\/book(?:\?[^"#]*)?)"/g)) {
    if (route === '/demo/') assert.equal(href, '/book', 'General-card demo keeps neutral booking context');
    else assert.ok(href.includes('source=dealer'), route + ': public fit-call CTA preserves dealer context');
  }
  if (route !== '/privacy/') {
    const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] || '';
    assert.match(visibleText(main).slice(0, 1300), /dealer|dealership|vehicle|buyer/i, route + ': dealer context appears near the start');
  }
}
console.log('PASS dealer-first public content and navigation, seven-block homepage, separate services, scoped claims, labelled demos, inquiry choices, retained media/URLs, unique metadata, canonical/sitemap, assets, anchors and source semantics. Browser and production checks remain separate.');
