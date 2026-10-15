/* Low-profile titanium Fusion opening. The shared controller owns the story. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const stage=document.querySelector('.home-story');
if(stage) startMetal(stage);
function startMetal(stage){
  const host=stage.querySelector('[data-story-canvas]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mobile=matchMedia('(max-width: 760px)');
  let renderer,geometry,material,edgeGeometry,edgeMaterial,environment,observer;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
  try {
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile.matches?1.3:1.65));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.02;
    renderer.domElement.setAttribute('aria-hidden','true');
    renderer.domElement.tabIndex=-1;
    host.append(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.OrthographicCamera(-6.4,6.4,3.7,-3.7,.1,40);
    camera.position.set(.2,.4,15);camera.lookAt(0,0,0);
    const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
    environment=pmrem.fromScene(room,.06);scene.environment=environment.texture;
    room.dispose();pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xe5e5ee,0x18141d,.85));
    const key=new THREE.DirectionalLight(0xffffff,2.2);key.position.set(-4,7,6);scene.add(key);
    const rim=new THREE.DirectionalLight(0xc5b1df,.7);rim.position.set(6,0,5);scene.add(rim);
    const fusionShape = new THREE.Shape();
    fusionShape.moveTo(-5,2.45); fusionShape.lineTo(-1.75,2.45);
    fusionShape.bezierCurveTo(.1,2.45,.5,.55,2.35,.55);
    fusionShape.lineTo(5,.55); fusionShape.lineTo(5,-.55); fusionShape.lineTo(2.35,-.55);
    fusionShape.bezierCurveTo(.5,-.55,.1,-2.45,-1.75,-2.45);
    fusionShape.lineTo(-5,-2.45); fusionShape.lineTo(-5,-1.35); fusionShape.lineTo(-1.75,-1.35);
    fusionShape.bezierCurveTo(-.3,-1.35,.1,0,1.65,0);
    fusionShape.bezierCurveTo(.05,0,-.5,-.55,-1.75,-.55);
    fusionShape.lineTo(-5,-.55); fusionShape.lineTo(-5,.55); fusionShape.lineTo(-1.75,.55);
    fusionShape.bezierCurveTo(-.5,.55,.05,0,1.65,0);
    fusionShape.bezierCurveTo(.1,0,-.3,1.35,-1.75,1.35);
    fusionShape.lineTo(-5,1.35); fusionShape.closePath();
    const fusionGeometry = new THREE.ExtrudeGeometry(fusionShape,{depth:.13,bevelEnabled:true,bevelThickness:.012,bevelSize:.009,bevelSegments:2,steps:1,curveSegments:32});
    fusionGeometry.translate(0,0,-.065);
    geometry=fusionGeometry;
    const positions=geometry.getAttribute('position');
    const colors=new Float32Array(positions.count*3);
    const silver=new THREE.Color('#c2c4d0'),purple=new THREE.Color('#8450bf'),color=new THREE.Color();
    for(let i=0;i<positions.count;i++){
      color.copy(silver).lerp(purple,smooth((positions.getX(i)+1.4)/4.1));
      colors.set([color.r,color.g,color.b],i*3);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    material=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.94,roughness:.39,envMapIntensity:.92});
    const mesh=new THREE.Mesh(geometry,material);mesh.position.y=.77;mesh.scale.setScalar(.87);
    edgeGeometry=new THREE.EdgesGeometry(geometry,32);
    edgeMaterial=new THREE.LineBasicMaterial({color:0xc9bdcf,transparent:true,opacity:.19});
    mesh.add(new THREE.LineSegments(edgeGeometry,edgeMaterial));scene.add(mesh);
    function render(p=Number(stage.dataset.storyProgress||0)){
      const amount=1-smooth((p-.27)/.11);host.style.opacity=String(amount);
      if(!amount||reduced.matches||document.hidden)return;
      mesh.rotation.set(-.055,-.12+p*.12,-.022+p*.025);
      renderer.render(scene,camera);
    }
    function resize(){
      if(!host.clientWidth||!host.clientHeight)return;
      const aspect=host.clientWidth/host.clientHeight;
      renderer.setSize(host.clientWidth,host.clientHeight,false);
      camera.left=-6.4;camera.right=6.4;camera.top=6.4/aspect;camera.bottom=-6.4/aspect;
      camera.updateProjectionMatrix();render();
    }
    stage.addEventListener('storyprogress',event=>render(event.detail.progress));
    reduced.addEventListener('change',()=>{if(!reduced.matches){resize();render();}});
    observer=new ResizeObserver(resize);observer.observe(host);resize();
    stage.classList.add('is-metal-ready');
    renderer.domElement.addEventListener('webglcontextlost',event=>{
      event.preventDefault();stage.classList.remove('is-metal-ready');host.style.visibility='hidden';observer.disconnect();
    },{once:true});
    addEventListener('pageshow',resize);
  } catch (_) {
    stage.classList.remove('is-metal-ready');host.style.display='none';
    observer?.disconnect();geometry?.dispose();material?.dispose();edgeGeometry?.dispose();edgeMaterial?.dispose();environment?.dispose();renderer?.dispose();
  }
}
