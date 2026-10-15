// Exercise the actual outbound helper in workerd, not Node's different fetch.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const ts=require('typescript');
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const source=fs.readFileSync(path.join(__dirname,'../lib/retell.ts'),'utf8');
const helper=source.slice(source.indexOf('class RetellAPIError'),source.indexOf('function voicesFrom'));
const compiled=ts.transpileModule(helper,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
(async()=>{
  const requested=[];
  const outboundService=async request=>{
    const url=new URL(request.url);requested.push(url.href);
    assert.equal(url.origin,'https://api.retellai.com','bearer token must never follow a redirect');
    assert.equal(request.headers.get('authorization'),'Bearer fake-runtime-test-key');
    if(url.pathname==='/list-voices')return Response.json([{voice_id:'retell-example'}]);
    if(url.pathname==='/redirect')return new Response('',{status:302,headers:{location:'https://untrusted.example/credential-target'}});
    if(url.pathname==='/denied')return Response.json({error:'provider body must stay private'},{status:401});
    throw new Error('Unexpected outbound request');
  };
  const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',outboundService,script:`class RequestError extends Error {constructor(status,message){super(message);this.status=status;}}\n${compiled}\nexport default {async fetch(request){try{return Response.json(await api('fake-runtime-test-key',new URL(request.url).pathname));}catch(error){return Response.json({error:error.message},{status:error.status||500});}}}`});
  try{
    const ok=await mf.dispatchFetch('http://localhost/list-voices');assert.equal(ok.status,200);assert.equal((await ok.json())[0].voice_id,'retell-example');
    const redirect=await mf.dispatchFetch('http://localhost/redirect');assert.equal(redirect.status,502);assert.match((await redirect.json()).error,/redirect/);
    const denied=await mf.dispatchFetch('http://localhost/denied');assert.equal(denied.status,502);assert.equal((await denied.text()).includes('provider body'),false);
    assert.equal(requested.length,3);
    console.log('PASS real workerd accepts the Retell request, blocks credential redirects and hides provider error bodies');
  }finally{await mf.dispose();}
})().catch(error=>{console.error(error);process.exit(1);});
