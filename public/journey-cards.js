/* Scroll-driven content cards. Every stage also has a keyboard/tap control. */
(()=>{'use strict';
 const stage=document.querySelector('[data-card-deck]');if(!stage)return;
 const scope=stage.closest('.hero-scroll'),cards=[...stage.querySelectorAll('[data-journey-card]')],buttons=[...document.querySelectorAll('[data-card-step]')],pause=stage.querySelector('[data-card-pause]');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width:760px)');
 let progress=0,target=0,raf=0,paused=false,visible=true,manual=false;
 const clamp=n=>Math.max(0,Math.min(1,n));
 const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
 function paint(){
  const active=Math.min(2,Math.floor(progress*3));stage.dataset.active=String(active);
  cards.forEach((card,i)=>{
   const departure=i<2?smooth((progress*3-i-.56)/.44):0;
   const depth=Math.max(0,i-progress*3),isActive=i===active;
   card.style.zIndex=String(3-i);
   card.setAttribute('aria-hidden',String(!isActive));
   if(reduce.matches){card.style.transform='none';card.style.opacity=isActive?'1':'0';return;}
   const narrow=mobile.matches, x=depth*(narrow?13:45)-departure*(narrow?285:640),y=depth*(narrow?9:18)-departure*55,z=depth*-75+departure*60;
   card.style.transform=`translate3d(${x}px,${y}px,${z}px) rotateY(${-4+departure*-20}deg) rotateX(${3+departure*8}deg) rotateZ(${-1+depth*3-departure*12}deg)`;
   card.style.opacity=String(1-smooth((departure-.72)/.28));
  });
  buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===active)));
  const label=document.querySelector('[data-journey-label]'),caption=document.querySelector('[data-journey-caption]');
  if(label)label.textContent=['Answer.','Follow through.','Book.'][active];
  if(caption)caption.textContent=['Be there when interest is fresh.','Make the next step an easy one.','Turn a conversation into a customer.'][active];
 }
 function tick(){raf=0;if(!visible||document.hidden)return;progress=reduce.matches?target:progress+(target-progress)*.17;if(Math.abs(progress-target)<.0005)progress=target;paint();if(progress!==target)queue();}
 function queue(){if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
 function scroll(){if(paused||reduce.matches)return;manual=false;const r=(mobile.matches?stage:scope).getBoundingClientRect();target=mobile.matches?clamp((innerHeight*.50-r.top)/(innerHeight*.60)):clamp(-r.top/Math.max(300,r.height-innerHeight));queue();}
 buttons.forEach((button,i)=>button.addEventListener('click',()=>{manual=true;target=(i+.2)/3;queue();}));
 pause.addEventListener('click',()=>{paused=!paused;pause.textContent=paused?'Resume motion':'Pause motion';pause.setAttribute('aria-pressed',String(paused));if(paused){target=progress;}else scroll();});
 function mode(){scope.classList.toggle('has-cards',!reduce.matches);pause.hidden=reduce.matches;if(reduce.matches){target=progress=(Math.min(2,Math.floor(progress*3))+.2)/3;paint();}else scroll();}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){if(manual)queue();else scroll();}else{cancelAnimationFrame(raf);raf=0;}},{rootMargin:'150px'});observer.observe(stage);
 addEventListener('scroll',scroll,{passive:true});addEventListener('resize',()=>{if(!manual)scroll();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue();});reduce.addEventListener('change',mode);
 addEventListener('pagehide',()=>{cancelAnimationFrame(raf);raf=0;});addEventListener('pageshow',()=>{if(manual)queue();else scroll();});
 stage.classList.add('cards-ready');mode();paint();
})();
