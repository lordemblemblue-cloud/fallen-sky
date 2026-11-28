import { CELESTIAL_ASSETS } from './world/celestialAssets.mjs';

// One shared capture per browser session, never a renderer per portrait or a live
// animation loop. Use the owner-supplied textured GLB, not an unrelated illustration.
let portraitRequest;
export function celestialPortrait(){
  if(!portraitRequest)portraitRequest=capture().catch(()=>null);
  return portraitRequest;
}
async function capture(){
  const THREE=await import('three');
  const { GLTFLoader }=await import('three/addons/loaders/GLTFLoader.js');
  const { createSceneRenderer,destroySceneRenderer }=await import('@/lib/webgpuSceneRenderer.js');
  const { disposeResources }=await import('./core/resourceCleanup.mjs');
  let model,renderer;
  try{
    const gltf=await new GLTFLoader().loadAsync(CELESTIAL_ASSETS.character.url);
    model=gltf.scene;
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model,true),size=bounds.getSize(new THREE.Vector3());
    if(bounds.isEmpty()||!Number.isFinite(size.y)||size.y<=0)throw Error('Invalid character bounds');
    const bone=name=>model.getObjectByName('mixamorig:'+name)?.getWorldPosition(new THREE.Vector3());
    const head=bone('Head'),neck=bone('Neck'),left=bone('LeftArm'),right=bone('RightArm');
    if(!head||!neck||!left||!right)throw Error('Character portrait bones unavailable');
    const up=head.clone().sub(neck).normalize();
    const front=left.clone().sub(right).cross(up).normalize();
    if(up.lengthSq()<.5||front.lengthSq()<.5)throw Error('Invalid portrait orientation');
    const center=head.clone().lerp(neck,.25).addScaledVector(up,size.y*.025);
    const halfHeight=size.y*.19;
    const scene=new THREE.Scene();
    scene.add(model,new THREE.HemisphereLight(0xffffff,0x6d6888,2.4));
    const key=new THREE.DirectionalLight(0xfff3df,3);key.position.copy(center).addScaledVector(front,size.y).addScaledVector(up,size.y);scene.add(key);
    const camera=new THREE.OrthographicCamera(-halfHeight,halfHeight,halfHeight,-halfHeight,.001,Math.max(10,size.length()*10));
    camera.up.copy(up);camera.position.copy(center).addScaledVector(front,size.y*2);camera.lookAt(center);
    const created=createSceneRenderer('fantasy-battle',{alpha:true,antialias:true,powerPreference:'low-power'});
    renderer=created.renderer;
    await created.ready;
    renderer.setPixelRatio(1);renderer.setSize(256,256,false);renderer.setClearColor(0x000000,0);
    if(renderer.isWebGPURenderer&&typeof renderer.renderAsync==='function')await renderer.renderAsync(scene,camera);else renderer.render(scene,camera);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('Portrait canvas unavailable');
    ctx.drawImage(renderer.domElement,0,0);
    const pixels=ctx.getImageData(0,0,256,256).data;
    let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>32)visible++;
    if(visible<100)throw Error('Empty character portrait');
    return canvas.toDataURL('image/png');
  }finally{
    const resources=[];
    model?.traverse(o=>{
      if(o.geometry)resources.push(o.geometry);
      if(o.skeleton?.boneTexture)resources.push(o.skeleton.boneTexture);
      for(const m of Array.isArray(o.material)?o.material:[o.material]){
        if(!m)continue;resources.push(m);
        for(const value of Object.values(m))if(value?.isTexture)resources.push(value);
      }
    });
    disposeResources(resources);destroySceneRenderer(renderer);
  }
}
