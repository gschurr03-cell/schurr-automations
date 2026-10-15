import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoftwareRenderer } from './kinetic-software-renderer.js';

// One same-origin scene. Scroll articulates the parts, with no idle render loop.
const stage = document.querySelector('[data-kinetic-core]');
if (stage) {
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const narrow = matchMedia('(max-width: 760px)');
 let renderer, observer, resizeObserver, frame=0, visible=true, current=0, target=0, ready=false;
 let canvas = stage.querySelector('canvas');
 const fail = () => { cancelAnimationFrame(frame);frame=0;ready=false;stage.classList.remove('is-rendered');stage.dataset.renderState='fallback'; };
 try {
  let software=false;
  try {
   const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
   if(!context)throw new Error('WebGL unavailable');
   renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});
  } catch {
   const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;
   renderer=new SoftwareRenderer({canvas});software=true;
  }
  stage.dataset.renderMode=software?'software':'webgl';
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.4;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(33,1,.1,50);
  camera.position.set(0,.25,9.5);camera.lookAt(0,0,0);
  let environmentMap;
  if(!software){
   const environment=new RoomEnvironment();
   const pmrem=new THREE.PMREMGenerator(renderer);
   environmentMap=pmrem.fromScene(environment,.035);
   scene.environment=environmentMap.texture;
   environment.dispose();pmrem.dispose();
  }
  const group=new THREE.Group();scene.add(group);
  const silver=new THREE.MeshStandardMaterial({color:0xd2d7db,metalness:1,roughness:.2,envMapIntensity:1.4});
  const edge=new THREE.MeshStandardMaterial({color:0x7d858d,metalness:1,roughness:.24,envMapIntensity:1.45});
  const accent=new THREE.MeshStandardMaterial({color:stage.dataset.accent||'#d3b58b',metalness:.85,roughness:.2,envMapIntensity:1.2});
  const dark=new THREE.MeshStandardMaterial({color:0x353b42,metalness:.93,roughness:.22,envMapIntensity:1.25});
  const light=new THREE.DirectionalLight(0xffffff,3.5);light.position.set(-3,4,5);scene.add(light);
  const fill=new THREE.DirectionalLight(0xc9d9eb,1.8);fill.position.set(4,-2,3);scene.add(fill);
  function outline(r) {const c=r*.28;return [[-r+c,-r],[r-c,-r],[r,-r+c],[r,r-c],[r-c,r],[-r+c,r],[-r,r-c],[-r,-r+c]];}
  function trace(path,points){points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();return path;}
  function ring(r,width,depth){
   const shape=trace(new THREE.Shape(),outline(r));
   shape.holes.push(trace(new THREE.Path(),outline(r-width).reverse()));
   const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.045,bevelThickness:.045,curveSegments:4});
   geometry.center();
   return new THREE.Mesh(geometry,[silver,edge]);
  }
  const outer=ring(1.9,.23,.2);group.add(outer);
  const middle=ring(1.4,.19,.24);group.add(middle);
  const inner=ring(.91,.18,.26);group.add(inner);
  // A small machined central element connects the three moving frames.
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.44,0),accent);group.add(core);
  const inset=ring(.48,.075,.13);inset.material=[dark,accent];group.add(inset);
  const geometries=[outer,middle,inner,core,inset].map(mesh=>mesh.geometry);
  function pose(p){
   const eased=p*p*(3-2*p);
   group.rotation.set(.18+eased*.22,-.24+eased*.68,-.2+eased*.1);
   outer.rotation.set(.18+eased*.65,.37+eased*1.55,.12+eased*.32);
   middle.rotation.set(-.45-eased*1.45,-.32+eased*.85,-.12-eased*.25);
   inner.rotation.set(.6+eased*1.75,.43-eased*1.05,.13+eased*.6);
   inset.rotation.set(.35+eased*1.8,-.4-eased*.8,Math.PI/4);
   core.rotation.set(.3+eased,.45-eased*1.2,.12+eased*.5);
   // Small separation reveals the independent construction, without drifting the stage.
   outer.position.z=-eased*.1;middle.position.z=eased*.18;inner.position.z=eased*.32;
  }
  function render(){
   frame=0;
   if(!visible||document.hidden||!ready)return;
   current=reduced.matches?0:current+(target-current)*.12;
   if(Math.abs(target-current)<.0003)current=target;
   pose(current);renderer.render(scene,camera);
   stage.dataset.scrollPose=current.toFixed(3);
   stage.classList.add('is-rendered');stage.dataset.renderState='ready';
   if(!reduced.matches&&Math.abs(target-current)>.0003)frame=requestAnimationFrame(render);
  }
  function schedule(){if(ready&&visible&&!document.hidden&&!frame)frame=requestAnimationFrame(render);}
  function measure(){
   const region=narrow.matches?stage:(stage.closest('[data-kinetic-scroll]')||stage);
   const b=region.getBoundingClientRect();
   if(reduced.matches)target=0;
   else if(narrow.matches||!region.classList.contains('hero-scroll'))target=THREE.MathUtils.clamp((innerHeight-b.top)/(innerHeight+b.height),0,1);
   else target=THREE.MathUtils.clamp(-b.top/Math.max(1,b.height-innerHeight),0,1);
   schedule();
  }
  function resize(){const {width,height}=stage.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.position.z=width/height<.8?11:9.5;camera.updateProjectionMatrix();measure();}
  ready=true;
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);
  observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){measure();}else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'80px'});observer.observe(stage);
  addEventListener('scroll',measure,{passive:true});addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',()=>document.hidden?(cancelAnimationFrame(frame),frame=0):measure());
  reduced.addEventListener('change',()=>{current=target=0;measure();});
  stage.addEventListener('kinetic-palette',event=>{accent.color.set(event.detail.accent);schedule();});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail();});
  canvas.addEventListener('webglcontextrestored',()=>{ready=true;resize();});
  addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(frame);observer.disconnect();resizeObserver.disconnect();geometries.forEach(g=>g.dispose());[silver,edge,accent,dark].forEach(m=>m.dispose());environmentMap?.dispose();renderer.dispose();},{once:true});
  resize();
 } catch(error){fail();console.warn('Kinetic artwork using its still-image fallback.');renderer?.dispose();}
}
