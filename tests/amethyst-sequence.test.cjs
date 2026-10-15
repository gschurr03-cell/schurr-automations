const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/amethyst-sequence.js'),'utf8');
function harness({reduce=false}={}){
 const events={},documentEvents={},raf=new Map(),requests=[],draws=[];let id=0,io,mediaChange;
 const classes=()=>({values:new Set(),add(...a){a.forEach(x=>this.values.add(x));},remove(...a){a.forEach(x=>this.values.delete(x));}});
 const scope={classList:classes(),getBoundingClientRect:()=>({top:scope.top||0,height:1650})};
 const poster={naturalWidth:720,naturalHeight:720,complete:true,src:'poster'};
 const button={hidden:true,textContent:'Pause motion',listeners:{},addEventListener(n,fn){this.listeners[n]=fn;},setAttribute(n,v){this[n]=v;}};
 const canvas={getContext:()=>({fillRect(){},drawImage(img){draws.push(img.src);}})};
 const caption={textContent:''},track={style:{}},detail={textContent:''};const steps=[0,1,2].map(()=>({attrs:{},setAttribute(n,v){this.attrs[n]=v;},removeAttribute(n){delete this.attrs[n];}}));
 const stage={dataset:{},classList:classes(),closest:()=>scope,getBoundingClientRect:()=>({width:600,height:650,top:100}),querySelector:s=>s==='img'?poster:s==='canvas'?canvas:s==='figcaption'?caption:s==='.motion-track span'?track:button};
 const document={hidden:false,querySelector:s=>s==='.signal-track span'?track:s==='[data-signal-detail]'?detail:stage,querySelectorAll:()=>steps,addEventListener:(n,fn)=>documentEvents[n]=fn};
 const reduced={matches:reduce,addEventListener:(n,fn)=>mediaChange=fn};
 class FakeImage{constructor(){this.naturalWidth=720;this.naturalHeight=720;}set src(v){this._src=v;requests.push(this);}get src(){return this._src;}}
 const context={document,navigator:{},matchMedia:q=>q.includes('prefers')?reduced:{matches:false},Image:FakeImage,
  innerHeight:1000,devicePixelRatio:1,Map,Set,Math,Number,String,fetch:async()=>({ok:true,json:async()=>({count:48})}),
  requestAnimationFrame:fn=>{raf.set(++id,fn);return id;},cancelAnimationFrame:i=>raf.delete(i),addEventListener:(n,fn)=>events[n]=fn,
  IntersectionObserver:class{constructor(fn){io=fn;}observe(){}disconnect(){}},ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){this.fn();}disconnect(){}}};
 vm.runInNewContext(source,context);
 const flush=()=>{let guard=0;while(raf.size&&guard++<100){const [key,fn]=raf.entries().next().value;raf.delete(key);fn();}assert.ok(guard<100,'animation settles');};
 const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();flush();};
 const complete=img=>{if(!img.done){img.done=true;img.onload();}};
 return {steps,detail,events,documentEvents,document,requests,draws,stage,scope,button,flush,settle,complete,visibility:value=>io([{isIntersecting:value}]),reduce:()=>mediaChange({matches:true})};
}
(async()=>{
 const still=harness({reduce:true});await still.settle();assert.equal(still.requests.length,0);assert.equal(still.button.hidden,true);
 const h=harness();await h.settle();assert.equal(h.button.hidden,false);assert.ok(h.requests.length<=3);assert.ok(h.scope.classList.values.has('has-signal'));
 h.scope.top=-650;h.events.scroll();h.flush();assert.ok(h.requests.length<=3,'at most three frame downloads in flight');
 const current=h.stage.dataset.frame;h.button.listeners.click();const requestCount=h.requests.length;h.requests.slice().forEach(h.complete);h.flush();assert.equal(h.stage.dataset.frame,current,'pause freezes the displayed frame');assert.equal(h.requests.length,requestCount,'pause launches no queued downloads');
 h.button.listeners.click();h.flush();h.visibility(false);const offscreenCount=h.requests.length;h.requests.slice().filter(x=>!x.done).forEach(h.complete);h.flush();assert.equal(h.requests.length,offscreenCount,'offscreen launches no queued downloads');
 h.visibility(true);h.flush();h.document.hidden=true;const hiddenCount=h.requests.length;h.requests.slice().filter(x=>!x.done).forEach(h.complete);h.flush();assert.equal(h.requests.length,hiddenCount,'background tab launches no queued downloads');h.document.hidden=false;h.documentEvents.visibilitychange();h.flush();
 h.events.pagehide({persisted:true});h.events.pageshow({persisted:true});h.flush();assert.ok(h.scope.classList.values.has('has-signal'));assert.equal(h.button.hidden,false,'bfcache restore keeps sequence usable');
 const last=h.requests.find(i=>i.src.endsWith('frame-047.webp'));assert.ok(last,'last frame must be requested');h.complete(last);h.flush();assert.ok(h.detail.textContent.includes('booking'));assert.equal(h.steps[2].attrs['aria-current'],'step');
 h.reduce();assert.equal(h.button.hidden,true);assert.ok(!h.scope.classList.values.has('has-signal'));assert.ok(!h.stage.classList.values.has('sequence-ready'));
 const failed=harness();await failed.settle();failed.scope.top=-450;failed.events.scroll();failed.flush();const image=failed.requests.find(i=>i.src.includes('frame-'));image.onerror();failed.flush();failed.events.scroll();failed.flush();assert.equal(failed.requests.filter(i=>i.src===image.src).length,1,'failed frames are not repeatedly requested');
 console.log('PASS reduced motion, bounded loading, paused frame stability, offscreen/background loading, bfcache restoration and failed-frame suppression.');
})().catch(error=>{console.error(error);process.exitCode=1;});
