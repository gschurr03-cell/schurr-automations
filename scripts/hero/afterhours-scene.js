import * as THREE from 'three';
import { createFlowSculpture } from './flow-sculpture.js';
const stage=document.querySelector('[data-afterhours-scene]');
if(stage && !matchMedia('(prefers-reduced-motion: reduce)').matches){
  let renderer;
  try { renderer=new THREE.WebGLRenderer({canvas:stage.querySelector('canvas'),alpha:false,antialias:true,powerPreference:'low-power'}); } catch {}
  if(renderer){
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x000000);
    const camera=new THREE.PerspectiveCamera(38,1,.1,100);
    const sculpture=createFlowSculpture(THREE);scene.add(sculpture.object);
    const room=new THREE.Scene();room.background=new THREE.Color(0x151515);
    const panels=[];
    for(const [x,y,z,w,h,power] of [[0,5,0,9,3,7],[-5,1,2,3,7,5],[5,0,-2,2,6,4],[0,-4,2,7,2,2]]){
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(power,power,power),side:THREE.DoubleSide}));
      panel.position.set(x,y,z);panel.lookAt(0,0,0);room.add(panel);panels.push(panel);
    }
    const pmrem=new THREE.PMREMGenerator(renderer);const environment=pmrem.fromScene(room,.025);scene.environment=environment.texture;
    pmrem.dispose();panels.forEach(p=>{p.geometry.dispose();p.material.dispose();});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    let current=0,target=0,frame=0,visible=true,paused=false,disposed=false;
    const scope=stage.closest('.hero-scroll');const button=stage.querySelector('[data-motion-toggle]');
    function render(){frame=0;if(disposed||!visible||document.hidden)return;
      current+= (target-current)*.095;if(Math.abs(current-target)<.0004)current=target;
      sculpture.update(current);camera.position.set(.25*Math.sin(current*Math.PI),.16+current*.32,9.7-current*.55);camera.lookAt(0,0,0);
      renderer.render(scene,camera);if(current!==target&&!paused)frame=requestAnimationFrame(render);
    }
    function queue(){if(!frame&&!disposed)frame=requestAnimationFrame(render);}
    function resize(){const {width,height}=stage.getBoundingClientRect();if(!width||!height)return;
      camera.aspect=width/height;camera.fov=camera.aspect<.9?47:38;camera.updateProjectionMatrix();renderer.setSize(width,height,false);queue();}
    function scroll(){if(paused)return;const r=scope.getBoundingClientRect();const range=Math.max(300,r.height-innerHeight*.7);target=THREE.MathUtils.clamp(-r.top/range,0,1);queue();}
    button.hidden=false;button.addEventListener('click',()=>{paused=!paused;button.textContent=paused?'Resume motion':'Pause motion';button.setAttribute('aria-pressed',String(paused));if(paused){target=current;}else scroll();});
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)queue();},{rootMargin:'150px'});observer.observe(stage);
    addEventListener('scroll',scroll,{passive:true});addEventListener('resize',scroll,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue();});
    stage.querySelector('canvas').addEventListener('webglcontextlost',e=>{e.preventDefault();stage.classList.remove('scene-ready');button.hidden=true;disposed=true;cancelAnimationFrame(frame);});
    resize();scroll();renderer.render(scene,camera);stage.classList.add('scene-ready');scope.classList.add('has-3d');
    addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();observer.disconnect();sculpture.dispose();environment.dispose();renderer.dispose();},{once:true});
  }
}
