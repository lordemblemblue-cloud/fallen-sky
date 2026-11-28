import { CELESTIAL_ASSETS } from './world/celestialAssets.mjs';

// Capture three full-body views using one renderer and one model load.
// No continuous game loop; failed captures can be retried.
let request;
export function previewNewGameHero(){
 if(!request)request=capture().catch(()=>{request=undefined;return null;});
 return request;
}
async function capture(){
 const THREE=await import('three');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {createSceneRenderer,destroySceneRenderer}=await import('@/lib/webgpuSceneRenderer.js');
 const {disposeResources}=await import('./core/resourceCleanup.mjs');
 let model,renderer;
 try{
  model=(await new GLTFLoader().loadAsync(CELESTIAL_ASSETS.character.url)).scene;
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model,true),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  if(box.isEmpty()||!Number.isFinite(size.length())||size.y<=0)throw Error('Invalid preview bounds');
  const bone=n=>model.getObjectByName('mixamorig:'+n)?.getWorldPosition(new THREE.Vector3());
  const head=bone('Head'),neck=bone('Neck'),left=bone('LeftArm'),right=bone('RightArm');
  if(!head||!neck||!left||!right)throw Error('Model orientation unavailable');
  const up=head.clone().sub(neck).normalize(),front=left.clone().sub(right).cross(up).normalize();
  if(up.lengthSq()<.5||front.lengthSq()<.5)throw Error('Invalid model orientation');
  const halfHeight=Math.max(size.y*.59,size.x*.78,size.z*.78);
  const scene=new THREE.Scene();scene.add(model,new THREE.HemisphereLight(0xffffff,0x65749b,2.4));
  const key=new THREE.DirectionalLight(0xffeedc,3);key.position.copy(center).addScaledVector(front,size.y).addScaledVector(up,size.y);scene.add(key);
  const camera=new THREE.OrthographicCamera(-halfHeight*.8,halfHeight*.8,halfHeight,-halfHeight,.001,Math.max(10,size.length()*10));
  camera.up.copy(up);camera.position.copy(center).addScaledVector(front,size.length()*2);camera.lookAt(center);
  const created=createSceneRenderer('fantasy-battle',{alpha:true,antialias:true,powerPreference:'low-power'});renderer=created.renderer;
  await created.ready;renderer.setPixelRatio(1);renderer.setSize(512,640,false);renderer.setClearColor(0x000000,0);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=640;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Preview canvas unavailable');
  const frames={};
  for(const [id,angle] of [['front',0],['left',Math.PI/5],['right',-Math.PI/5]]){
   const direction=front.clone().applyAxisAngle(up,angle);
   camera.position.copy(center).addScaledVector(direction,size.length()*2);camera.lookAt(center);
   if(renderer.isWebGPURenderer&&typeof renderer.renderAsync==='function')await renderer.renderAsync(scene,camera);else renderer.render(scene,camera);
   ctx.clearRect(0,0,512,640);ctx.drawImage(renderer.domElement,0,0);
   const pixels=ctx.getImageData(0,0,512,640).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>32)visible++;
   if(visible>=100)frames[id]=canvas.toDataURL('image/png');
   if(id==='front'&&!frames.front)throw Error('Empty preview');
  }
  return Object.freeze(frames);
 }finally{
  const resources=[];model?.traverse(o=>{if(o.geometry)resources.push(o.geometry);if(o.skeleton?.boneTexture)resources.push(o.skeleton.boneTexture);for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m)continue;resources.push(m);for(const v of Object.values(m))if(v?.isTexture)resources.push(v);}});
  try{disposeResources(resources);}finally{destroySceneRenderer(renderer);}
 }
}
