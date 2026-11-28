import {useEffect,useRef,useState} from 'react';
import {CELESTIAL_ASSETS} from './world/celestialAssets.mjs';
import {disposeResources} from './core/resourceCleanup.mjs';

// Real textured character, rendered only on interaction/resize. No persistent
// animation loop, second world, placeholder geometry, or editor chrome.
export default function CharacterCreationViewer(){
 const host=useRef(null),controller=useRef(null);
 const [status,setStatus]=useState('loading'),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const target=host.current;
  let active=true,model,renderer,controls,observer,frame=0,rendering=false,queued=false,disposeRenderer;
  const releaseModel=object=>{
   if(!object)return;
   const resources=[];
   object.traverse(o=>{if(o.geometry)resources.push(o.geometry);if(o.skeleton?.boneTexture)resources.push(o.skeleton.boneTexture);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){resources.push(m);for(const v of Object.values(m))if(v?.isTexture)resources.push(v);}});
   disposeResources(resources);
  };
  const release=()=>{cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();controller.current=null;releaseModel(model);model=null;if(renderer){renderer.domElement?.remove();disposeRenderer?.(renderer);renderer=null;}};
  const fail=()=>{if(!active)return;active=false;clearTimeout(deadline);release();setStatus('error');};
  const deadline=setTimeout(fail,25000);
  const setup=async()=>{
   const [THREE,{GLTFLoader},{OrbitControls},renderers]=await Promise.all([import('three'),import('three/addons/loaders/GLTFLoader.js'),import('three/addons/controls/OrbitControls.js'),import('@/lib/webgpuSceneRenderer.js')]);
   if(!active)return;
   disposeRenderer=renderers.destroySceneRenderer;
   const gltf=await new GLTFLoader().loadAsync(CELESTIAL_ASSETS.character.url);
   if(!active){releaseModel(gltf.scene);return;}
   model=gltf.scene;model.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(model,true),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   if(bounds.isEmpty()||!Number.isFinite(size.length())||size.y<=0)throw Error('Invalid model bounds');
   const bone=n=>model.getObjectByName('mixamorig:'+n)?.getWorldPosition(new THREE.Vector3());
   const head=bone('Head'),neck=bone('Neck'),left=bone('LeftArm'),right=bone('RightArm');
   const front=head&&neck&&left&&right?left.clone().sub(right).cross(head.clone().sub(neck)).normalize():new THREE.Vector3(0,0,1);
   if(front.lengthSq()<.5)front.set(0,0,1);
   // The supplied rig has no authored idle clip; retain its actual pose.
   const scene=new THREE.Scene();scene.add(model,new THREE.HemisphereLight(0xffffff,0x637c9d,2.2));
   const key=new THREE.DirectionalLight(0xffeed4,3);key.position.copy(center).addScaledVector(front,size.y).add(new THREE.Vector3(0,size.y,0));scene.add(key);
   const rim=new THREE.DirectionalLight(0x9dcfff,1.5);rim.position.copy(center).addScaledVector(front,-size.y).add(new THREE.Vector3(0,size.y,0));scene.add(rim);
   const camera=new THREE.PerspectiveCamera(33,1,.001,Math.max(100,size.length()*30));
   const radius=Math.max(size.length()/2,.01);
   const distance=()=>radius/Math.sin(Math.min(33*Math.PI/360,Math.atan(Math.tan(33*Math.PI/360)*camera.aspect)))*1.05;
   const reset=()=>{camera.position.copy(center).addScaledVector(front,distance());camera.lookAt(center);controls?.target.copy(center);controls?.update();};
   const created=renderers.createSceneRenderer('fantasy-battle',{alpha:true,antialias:true,powerPreference:'low-power'});
   renderer=created.renderer;
   try{await created.ready;}catch(error){if(!active)return;disposeRenderer(renderer);renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}
   if(!active)return;
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));renderer.setClearColor(0x000000,0);
   renderer.domElement.setAttribute('aria-hidden','true');target.appendChild(renderer.domElement);
   const draw=()=>{if(!active)return;if(rendering){queued=true;return;}if(frame)return;frame=requestAnimationFrame(async()=>{frame=0;if(!active||!renderer)return;rendering=true;try{if(renderer.isWebGPURenderer&&renderer.renderAsync)await renderer.renderAsync(scene,camera);else renderer.render(scene,camera);if(active){clearTimeout(deadline);setStatus('ready');}}catch{fail();}finally{rendering=false;if(queued){queued=false;draw();}}});};
   const resize=()=>{if(!active||!renderer)return;const w=Math.max(1,target.clientWidth),h=Math.max(1,target.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);reset();draw();};
   controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableDamping=false;controls.minDistance=radius*1.2;controls.maxDistance=radius*12;controls.target.copy(center);controls.addEventListener('change',draw);
   controller.current={turn:direction=>{const offset=camera.position.clone().sub(center).applyAxisAngle(new THREE.Vector3(0,1,0),direction*Math.PI/6);camera.position.copy(center).add(offset);controls.update();draw();},reset:()=>{reset();draw();}};
   observer=new ResizeObserver(resize);observer.observe(target);resize();
  };
  setup().catch(fail);
  return()=>{active=false;clearTimeout(deadline);release();};
 },[attempt]);
 return <section className="fa-character-viewer" aria-label="3D character preview">
  <div className="fa-character-aura" aria-hidden="true"/>
  <div ref={host} className="fa-character-canvas"/>
  {status==='loading'&&<p className="fa-character-viewer-message" role="status">Preparing your character…</p>}
  {status==='error'&&<div className="fa-character-viewer-message" role="status"><p>3D preview unavailable. You can still create your character.</p><button type="button" className="fa-button" onClick={()=>{setStatus('loading');setAttempt(n=>n+1);}}>Retry preview</button></div>}
  {status==='ready'&&<div className="fa-character-viewer-actions"><button type="button" className="fa-button" aria-label="Rotate character left" onClick={()=>controller.current?.turn(-1)}>‹</button><button type="button" className="fa-button" onClick={()=>controller.current?.reset()}>Reset view</button><button type="button" className="fa-button" aria-label="Rotate character right" onClick={()=>controller.current?.turn(1)}>›</button></div>}
 </section>;
}
