/* An actual 3D assembly rendered from one scene. Scroll controls its pose and customer journey labels. */
(()=>{'use strict';
 const stage=document.querySelector('[data-signal-sequence]');if(!stage)return;
 const poster=stage.querySelector('img'),canvas=stage.querySelector('canvas'),scope=stage.closest('.hero-scroll'),button=stage.querySelector('[data-motion-toggle]'),track=document.querySelector('.signal-track span');
 const steps=[...document.querySelectorAll('[data-signal-step]')],detail=document.querySelector('[data-signal-detail]');
 const descriptions=['Answer the call and capture what the customer needs.','Keep the conversation moving with the right next step.','Check connected availability and turn interest into a booking.'];let activeStep=-1;
 function showStep(progress){const next=Math.min(2,Math.floor(progress*3));if(next===activeStep)return;activeStep=next;steps.forEach((step,i)=>{if(i===next)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});if(detail)detail.textContent=descriptions[next];}
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 if(reduced.matches||navigator.connection?.saveData)return;
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
 let count=0,current=0,target=0,frame=0,displayed=-1,visible=true,paused=false,destroyed=false,active=0,lastWidth=0,lastHeight=0;
 const cache=new Map(),loading=new Set(),failed=new Set();let pending=[];
 function draw(index,img){if(!img?.naturalWidth||!lastWidth||!lastHeight)return;
  const scale=Math.min(lastWidth/img.naturalWidth,lastHeight/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
  ctx.fillStyle='#140f1b';ctx.fillRect(0,0,lastWidth,lastHeight);ctx.drawImage(img,(lastWidth-w)/2,(lastHeight-h)/2,w,h);
  displayed=index;stage.dataset.frame=String(index);if(cache.size>1){stage.classList.add('sequence-ready');}
  const visualProgress=count>1?index/(count-1):0;if(track)track.style.width=(visualProgress*100).toFixed(2)+'%';showStep(visualProgress);
 }
 function prune(){if(cache.size<=14)return;const ideal=Math.round(current*(count-1));const removable=[...cache.keys()].filter(i=>i!==0&&i!==displayed).sort((a,b)=>Math.abs(b-ideal)-Math.abs(a-ideal));while(cache.size>14&&removable.length)cache.delete(removable.shift());}
 function pump(){while(active<3&&pending.length&&!destroyed&&!paused&&visible&&!document.hidden){const index=pending.shift();if(cache.has(index)||loading.has(index))continue;active++;loading.add(index);const img=new Image();img.decoding='async';
  img.onload=()=>{active--;loading.delete(index);if(destroyed)return;cache.set(index,img);prune();queue();pump();};
  img.onerror=()=>{active--;loading.delete(index);failed.add(index);if(failed.size>6&&cache.size<=1){stop();return;}pump();};img.src='/amethyst-signal/frame-'+String(index).padStart(3,'0')+'.webp';
 }}
 function requestFrames(){if(!count||!visible||paused)return;const near=Math.round(current*(count-1)),goal=Math.round(target*(count-1));const ordered=[near,goal,near+1,near-1,goal+1,goal-1,near+2,near-2,goal+2,goal-2];pending=[...new Set(ordered)].filter(i=>i>=0&&i<count&&!cache.has(i)&&!loading.has(i)&&!failed.has(i));pump();}
 function tick(){frame=0;if(destroyed||!visible||document.hidden||paused)return;
  if(!paused){current+=(target-current)*.12;if(Math.abs(current-target)<.0008)current=target;}
  requestFrames();const ideal=Math.round(current*(count-1));const nearest=cache.has(ideal)?ideal:[...cache.keys()].sort((a,b)=>Math.abs(a-ideal)-Math.abs(b-ideal))[0];
  if(nearest!==undefined)draw(nearest,cache.get(nearest));if(current!==target&&!paused)queue();
 }
 function queue(){if(!frame&&!destroyed&&visible&&!document.hidden)frame=requestAnimationFrame(tick);}
 function scroll(){if(paused||destroyed)return;const mobile=matchMedia('(max-width:760px)').matches;
  if(mobile){const r=stage.getBoundingClientRect();target=Math.max(0,Math.min(1,(innerHeight*.9-r.top)/(innerHeight*.7+r.height*.15)));}
  else{const r=scope.getBoundingClientRect();target=Math.max(0,Math.min(1,-r.top/Math.max(300,r.height-innerHeight)));}queue();
 }
 function resize(){const r=stage.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);lastWidth=Math.round(r.width*ratio);lastHeight=Math.round(r.height*ratio);canvas.width=lastWidth;canvas.height=lastHeight;if(displayed>=0&&cache.has(displayed))draw(displayed,cache.get(displayed));else if(poster.complete)draw(0,poster);scroll();}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){scroll();requestFrames();}else if(frame){cancelAnimationFrame(frame);frame=0;}},{rootMargin:'200px'});observer.observe(stage);
 const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(stage);
 button.addEventListener('click',()=>{paused=!paused;button.textContent=paused?'Resume motion':'Pause motion';button.setAttribute('aria-pressed',String(paused));if(paused){target=current;}else scroll();});
 addEventListener('scroll',scroll,{passive:true});addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue();});
 function start(){if(!poster.naturalWidth)return;cache.set(0,poster);resize();fetch('/amethyst-signal/manifest.json?v=1',{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).then(data=>{if(destroyed||!Number.isInteger(data.count)||data.count<2)return;count=data.count;stage.dataset.frameCount=String(count);scope.classList.add('has-signal');button.hidden=false;stage.querySelector('figcaption').textContent='Scroll to connect the steps.';scroll();requestFrames();}).catch(()=>{});}
 if(poster.complete)start();else poster.addEventListener('load',start,{once:true});
 function stop(){destroyed=true;cancelAnimationFrame(frame);observer.disconnect();sizeObserver.disconnect();pending=[];cache.clear();scope.classList.remove('has-signal');stage.classList.remove('sequence-ready');button.hidden=true;showStep(0);if(track)track.style.width='0%';stage.querySelector('figcaption').textContent='One connected customer journey.';}
 reduced.addEventListener('change',event=>{if(event.matches)stop();});addEventListener('pagehide',event=>{if(event.persisted){cancelAnimationFrame(frame);frame=0;}else stop();});addEventListener('pageshow',event=>{if(event.persisted&&!destroyed){resize();scroll();}});
})();
