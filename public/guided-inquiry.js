(()=>{'use strict';const form=document.querySelector('[data-guided-form]');if(!form)return;
const steps=[...form.querySelectorAll('[data-form-step]')],progress=[...form.querySelectorAll('.form-progress li')],next=form.querySelector('[data-form-next]'),back=form.querySelector('[data-form-back]'),submit=form.querySelector('[type=submit]'),service=form.elements.namedItem('service');let current=0;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const visual=form.querySelector('[data-inquiry-visual]'),choices=[...form.querySelectorAll('[data-service-choice]')],nodes=[...form.querySelectorAll('[data-map-node]')];
const serviceCopy={general:['Your starting point','Choose what you want to improve.'],calls:['AI receptionist','More calls with a useful answer.'],website:['Website design','More visitors taking the next step.'],reviews:['SEO & AI search','Help the right customers find you.'],coding:['Custom automation','Connect the work behind the sale.']};
function animate(el){if(reduce.matches||!el)return;el.getAnimations().forEach(a=>a.cancel());el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:230,easing:'ease-out'});}
function sync(){
 const chosen=serviceCopy[service.value]||serviceCopy.general;
 choices.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.serviceChoice===service.value)));
 if(!visual)return;
 visual.dataset.step=String(current);
 visual.querySelector('[data-inquiry-kicker]').textContent=chosen[0];
 visual.querySelector('[data-inquiry-title]').textContent=[chosen[1],'What would success look like?','Let’s talk about your next step.'][current];
 visual.querySelector('[data-inquiry-caption]').textContent=['Choose a focus. We’ll build around your business.','Your goal helps us find the right starting point.','Gavin will review your inquiry and reply as requested.'][current];
 visual.querySelector('.inquiry-progress-line span').style.transform=`scaleX(${(current+1)/3})`;
 nodes.forEach((node,i)=>{node.classList.toggle('is-current',i===current);node.classList.toggle('is-complete',i<current);});
 const selectedIcon=choices.find(b=>b.dataset.serviceChoice===service.value)?.querySelector('svg');
 if(selectedIcon&&nodes[0])nodes[0].replaceChildren(selectedIcon.cloneNode(true));
}
const invalid=scope=>[...scope.querySelectorAll('input,select,textarea')].find(el=>!el.checkValidity());
function show(index,focus=true){current=index;steps.forEach((step,i)=>step.hidden=i!==index);progress.forEach((p,i)=>{if(i===index)p.setAttribute('aria-current','step');else p.removeAttribute('aria-current');});back.hidden=index===0;next.hidden=index===steps.length-1;submit.hidden=index!==steps.length-1;next.textContent=index===0?'Describe your goal':'Add your details';sync();animate(steps[index]);animate(visual?.querySelector('.inquiry-visual-copy'));if(focus){const legend=steps[index].querySelector('legend');legend.tabIndex=-1;legend.focus();}}
function validate(scope){const el=invalid(scope);let error=scope.querySelector('[data-step-error]');if(error)error.remove();if(!el)return true;error=document.createElement('p');error.dataset.stepError='';error.className='form-help form-step-error';error.setAttribute('role','alert');error.textContent=el.validationMessage;el.insertAdjacentElement('afterend',error);el.reportValidity();return false;}
function advance(){if(validate(steps[current]))show(Math.min(current+1,steps.length-1));}
form.noValidate=true;
if(visual)visual.hidden=false;
if(choices.length){form.querySelector('[data-service-select-label]').hidden=true;form.querySelector('[data-service-choices]').hidden=false;choices.forEach(b=>b.addEventListener('click',()=>{service.value=b.dataset.serviceChoice;service.dispatchEvent(new Event('change',{bubbles:true}));sync();animate(visual.querySelector('.inquiry-visual-copy'));}));}
show(0,false);next.addEventListener('click',advance);back.addEventListener('click',()=>show(Math.max(current-1,0)));service.addEventListener('change',sync);
form.addEventListener('submit',e=>{if(current<steps.length-1){e.preventDefault();e.stopImmediatePropagation();advance();return;}const el=invalid(form);if(el){e.preventDefault();e.stopImmediatePropagation();const step=el.closest('[data-form-step]');if(step)show(steps.indexOf(step),false);validate(step||form);}},true);
form.addEventListener('inquiry:prefill',()=>show(0));form.addEventListener('inquiry:sync',sync);form.addEventListener('inquiry:saved',()=>show(0,false));
})();
