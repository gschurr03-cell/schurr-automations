const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');
const dependencyRequire = createRequire(process.env.SCHURR_PACKAGE_JSON || path.join(process.cwd(), 'package.json'));
const ts = dependencyRequire('typescript');
const root = process.env.SCHURR_ROOT || path.resolve(__dirname, '..');
const runtime = { INQUIRY_SIGNING_SECRET: 'test-only-'.repeat(8), OWNER_EMAIL: 'owner@example.com' };
let currentUser = { userId: 'owner-id', email: 'owner@example.com' };
const modules = new Map();
const sql = new DatabaseSync(':memory:');
for (const filename of fs.readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(path.join(root, 'drizzle', filename), 'utf8'));
class Statement {
  constructor(query, values = []) { this.query = query; this.values = values; }
  bind(...values) { return new Statement(this.query, values); }
  async first() { return sql.prepare(this.query).get(...this.values) || null; }
  async all() { return { results: sql.prepare(this.query).all(...this.values) }; }
  async run() { return sql.prepare(this.query).run(...this.values); }
}
runtime.DB = {
  prepare(query) { return new Statement(query); },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const output = statements.map(statement => ({ results: sql.prepare(statement.query).all(...statement.values) }));
      sql.exec('COMMIT');
      return output;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};

function load(relative) {
  if (modules.has(relative)) return modules.get(relative);
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  const customRequire = name => {
    if (name === 'cloudflare:workers') return { env: runtime };
    if (name === '@/app/chatgpt-auth') return {
      getChatGPTUser: async () => currentUser && currentUser.userId && currentUser.email ? currentUser : null,
      requireChatGPTUser: async () => { if (!currentUser?.userId || !currentUser?.email) throw new Error('SIGN_IN_REDIRECT'); return currentUser; },
    };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), `${name}.ts`));
    return require(name);
  };
  const context = vm.createContext({ exports: module.exports, module, require: customRequire, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, Request, Response, URL, URLSearchParams, Uint8Array, Date, console: { error() {} } });
  new vm.Script(compiled.outputText, { filename: relative }).runInContext(context);
  modules.set(relative, module.exports);
  return module.exports;
}

const app = load('lib/inquiries.ts');
const owner = load('lib/owner.ts');
const inquiries = load('app/api/inquiries/route.ts');
const metrics = load('app/api/metrics/route.ts');
const deletion = load('app/api/manage/inquiries/route.ts');
const origin = 'https://example.chatgpt.site';
let requestSequence = 0;
function request(route, payload, extra = {}) {
  requestSequence += 1;
  return new Request(`${origin}${route}`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': `198.51.${Math.floor(requestSequence / 250)}.${requestSequence % 250 + 1}`, ...extra }, body: JSON.stringify(payload) });
}
async function submission(overrides = {}) {
  const token = await app.issueInquiryToken(origin);
  return { name: 'Ada Example', business: 'Example Co', email: 'ada@example.com', phone: '', service: 'audit', message: 'Please assess our existing chatbot.', preferredContact: 'email', consent: true, website: '', submissionKey: token.submissionKey, token: token.token, ...overrides };
}
function count(table) { return Number(sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n); }


const limits = load('lib/rate-limit.ts');
const tokenRoute = load('app/api/inquiry-token/route.ts');
const sourceA = '203.0.113.10';
const sourceB = '203.0.113.11';
const actualNow = Date.now;
let clockSeconds = Math.floor(actualNow()/86400000)*86400 + 12*3600 + 15;
Date.now = () => clockSeconds*1000;
function sourceRequest(route,payload,ip=sourceA,extra={}) {return request(route,payload,{'cf-connecting-ip':ip,...extra});}
function tokenRequest(ip=sourceA) {return new Request(`${origin}/api/inquiry-token`,{headers:{'cf-connecting-ip':ip}});}
function clearAll() {sql.exec('DELETE FROM inquiries; DELETE FROM daily_metrics; DELETE FROM request_limits;');}
let passed=0,failed=0;
async function check(description, run) {
  clearAll();
  try { await run();passed++;process.stdout.write(`PASS ${description}\n`); }
  catch(error) {failed++;process.stdout.write(`FAIL ${description}: ${error.message}\n`);}
}
(async () => {
  await check('one source receives 3 inquiries/15min; fourth rejects; second source admitted; saved retry remains 200', async()=>{
    const payloads=await Promise.all(Array.from({length:4},()=>submission()));
    for(let i=0;i<3;i++) assert.equal((await inquiries.POST(sourceRequest('/api/inquiries',payloads[i]))).status,201);
    const fourth=await inquiries.POST(sourceRequest('/api/inquiries',payloads[3]));
    assert.equal(fourth.status,429);assert.equal(fourth.headers.get('retry-after'),String(900-clockSeconds%900));
    assert.equal((await inquiries.POST(sourceRequest('/api/inquiries',payloads[3],sourceB))).status,201);
    assert.equal((await inquiries.POST(sourceRequest('/api/inquiries',payloads[0]))).status,200);
    assert.equal(count('inquiries'),4);
    assert.equal((await inquiries.POST(sourceRequest('/api/inquiries',{...payloads[0],message:'An altered payload must never reuse the prior receipt.'}))).status,409);
  });
  await check('concurrent requests cannot exceed source inquiry admission limit', async()=>{
    const payloads=await Promise.all(Array.from({length:6},()=>submission()));
    const responses=await Promise.all(payloads.map(payload=>inquiries.POST(sourceRequest('/api/inquiries',payload))));
    assert.equal(responses.filter(response=>response.status===201).length,3);
    assert.equal(responses.filter(response=>response.status===429).length,3);
    assert.equal(count('inquiries'),3);
  });
  await check('metric 61 rejects without increment; another source remains available', async()=>{
    const metric={event:'page_view',route:'/',service:'general'};
    for(let i=0;i<60;i++) assert.equal((await metrics.POST(sourceRequest('/api/metrics',metric))).status,204);
    assert.equal((await metrics.POST(sourceRequest('/api/metrics',metric))).status,429);
    assert.equal(sql.prepare("SELECT count FROM daily_metrics WHERE event='page_view'").get().count,60);
    assert.equal((await metrics.POST(sourceRequest('/api/metrics',metric,sourceB))).status,204);
  });
  await check('ninth token request rejects and second source retains its allowance', async()=>{
    for(let i=0;i<8;i++) assert.equal((await tokenRoute.GET(tokenRequest())).status,200);
    assert.equal((await tokenRoute.GET(tokenRequest())).status,429);
    assert.equal((await tokenRoute.GET(tokenRequest(sourceB))).status,200);
  });
  await check('rejected token flood cannot consume shared allowance', async()=>{
    for(let i=0;i<8;i++) assert.equal((await tokenRoute.GET(tokenRequest())).status,200);
    const sharedBefore=sql.prepare("SELECT hits FROM request_limits WHERE bucket LIKE 'token:shared:%'").get().hits;
    for(let i=0;i<300;i++) assert.equal((await tokenRoute.GET(tokenRequest())).status,429);
    assert.equal(sql.prepare("SELECT hits FROM request_limits WHERE bucket LIKE 'token:shared:%'").get().hits,sharedBefore);
    assert.equal(sharedBefore,8);
    const response=await tokenRoute.GET(tokenRequest(sourceB));
    assert.equal(response.status,200,'one rejected source depleted shared token counter');
  });
  await check('rejected metric flood cannot consume shared allowance', async()=>{
    const metric={event:'page_view',route:'/',service:'general'};
    for(let i=0;i<60;i++) assert.equal((await metrics.POST(sourceRequest('/api/metrics',metric))).status,204);
    const sharedBefore=sql.prepare("SELECT hits FROM request_limits WHERE bucket LIKE 'metric:shared:60:%'").get().hits;
    for(let i=0;i<1001;i++) assert.equal((await metrics.POST(sourceRequest('/api/metrics',metric))).status,429);
    assert.equal(sql.prepare("SELECT hits FROM request_limits WHERE bucket LIKE 'metric:shared:60:%'").get().hits,sharedBefore);
    assert.equal(sharedBefore,60);
    const response=await metrics.POST(sourceRequest('/api/metrics',metric,sourceB));
    assert.equal(response.status,204,'one rejected source depleted shared metrics counter');
  });
  await check('fingerprint ignores X-Forwarded-For/X-Real-IP, rotates daily, and source headers are not stored', async()=>{
    const base=sourceRequest('/api/metrics',{},sourceA);
    const changed=sourceRequest('/api/metrics',{},sourceA,{'x-forwarded-for':sourceB,'x-real-ip':sourceB});
    const fingerprint=await limits.sourceFingerprint(base,clockSeconds);
    assert.equal(await limits.sourceFingerprint(changed,clockSeconds),fingerprint);
    assert.notEqual(await limits.sourceFingerprint(base,clockSeconds+86400),fingerprint);
    assert.notEqual(await limits.sourceFingerprint(sourceRequest('/api/metrics',{},sourceB),clockSeconds),fingerprint);
    const noCF1=new Request(`${origin}/api/metrics`,{headers:{'x-forwarded-for':sourceA}});
    const noCF2=new Request(`${origin}/api/metrics`,{headers:{'x-forwarded-for':sourceB,'cf-connecting-ip':'invalid'}});
    assert.equal(await limits.sourceFingerprint(noCF1,clockSeconds),await limits.sourceFingerprint(noCF2,clockSeconds));
    await limits.enforceRequestLimit(base,'metric');
    const stored=JSON.stringify(sql.prepare('SELECT * FROM request_limits').all());
    assert.equal(stored.includes(sourceA),false);assert.equal(stored.includes(sourceB),false);
    assert.deepEqual(sql.prepare('PRAGMA table_info(request_limits)').all().map(r=>r.name),['bucket','hits','expires_at']);
  });
  await check('expiry cleanup is bounded to 500 rows per call and removes remaining expiry on next request', async()=>{
    const insert=sql.prepare('INSERT INTO request_limits (bucket,hits,expires_at) VALUES (?,1,?)');
    for(let i=0;i<501;i++)insert.run(`expired-${i}`,clockSeconds-1);
    insert.run('still-live',clockSeconds+3600);
    await limits.enforceRequestLimit(tokenRequest(),'token');
    assert.equal(sql.prepare('SELECT count(*) n FROM request_limits WHERE expires_at <= ?').get(clockSeconds).n,1);
    assert.ok(sql.prepare("SELECT bucket FROM request_limits WHERE bucket='still-live'").get());
    await limits.enforceRequestLimit(tokenRequest(),'token');
    assert.equal(sql.prepare('SELECT count(*) n FROM request_limits WHERE expires_at <= ?').get(clockSeconds).n,0);
  });
  await check('15-minute inquiry window resets and daily 10 limit remains enforced', async()=>{
    const start=clockSeconds;
    try {
      for(let i=0;i<10;i++) {
        clockSeconds=start+Math.floor(i/3)*900;
        assert.equal((await inquiries.POST(sourceRequest('/api/inquiries',await submission()))).status,201);
      }
      clockSeconds=start+4*900;
      assert.equal((await inquiries.POST(sourceRequest('/api/inquiries',await submission()))).status,429);
      assert.equal(count('inquiries'),10);
    } finally {clockSeconds=start;}
  });
  await check('cursor pagination returns all 10,251 records with duplicate timestamps and at most 100/page', async()=>{
    const insert=sql.prepare('INSERT INTO inquiries (id,submission_key,body_hash,name,business,email,phone,service,message,preferred_contact,consent_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    sql.exec('BEGIN');
    for(let i=0;i<10251;i++) {
      const id=`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`;
      const date=`2026-09-${String(10+Math.floor(i/4000)).padStart(2,'0')}T12:00:00.000Z`;
      insert.run(id,webcrypto.randomUUID(),'test-hash','Test','','test@example.com','','general','Pagination proof','email',date,date);
    }
    sql.exec('COMMIT');
    const ids=[];let cursor, pages=0;
    do {
      const page=await app.listInquiries(cursor);
      assert.ok(page.items.length<=100);
      ids.push(...page.items.map(item=>item.id));pages++;
      cursor=page.nextCursor;
      assert.ok(pages<=103);
    }while(cursor);
    assert.equal(pages,103);assert.equal(ids.length,10251);assert.equal(new Set(ids).size,10251);
    const expected=sql.prepare('SELECT id FROM inquiries ORDER BY created_at DESC,id DESC').all().map(row=>row.id);
    assert.deepEqual(ids,expected);
  });
  await check('malformed, oversized, and injection-shaped cursors reject', async()=>{
    const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    for(const cursor of ['x'.repeat(201),'!notbase64',encode(['2026-09-30T12:00:00.000Z',"x' OR 1=1 --"]),encode(['9999-99-99T99:99:99.999Z','00000000-0000-4000-8000-000000000001']),encode({page:1})]) {
      await assert.rejects(()=>app.listInquiries(cursor), error=>error.status===400);
    }
  });
  await check('exhausted shared cap rejects new sources without creating rate-limit rows', async()=>{
    const start=Math.floor(clockSeconds/86400)*86400;
    sql.prepare('INSERT INTO request_limits (bucket,hits,expires_at) VALUES (?,?,?)').run(`metric:shared:86400:${start}`,20000,start+86400);
    const before=count('request_limits');
    for(let i=1;i<=100;i++) {
      const response=await metrics.POST(sourceRequest('/api/metrics',{event:'page_view',route:'/',service:'general'},`203.0.113.${i}`));
      assert.equal(response.status,429);
    }
    assert.equal(count('request_limits'),before);
    assert.equal(count('daily_metrics'),0);
  });
  Date.now=actualNow;
  sql.close();
  process.stdout.write(`\n${passed} independent checks passed; ${failed} failed.\n`);
  if(failed)process.exitCode=1;
})().catch(error=>{Date.now=actualNow;console.error(error);process.exitCode=1;});
