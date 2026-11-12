// Four reusable instances of the user's actual Tripo "asian temple" GLB.
// The source image is 8K; the Game 3D runtime asset preserves real geometry,
// PBR/normal maps, and 4K color detail at a bounded GPU cost. It is a *single*
// remote asset load and a single InstancedMesh draw for all four buildings.
// A very small placeholder is visible until the model decodes or if offline.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {WOLFVEIL_FOUNTAIN_HOMES,WOLFVEIL_FOUNTAIN_PAD}
  from './WolfveilFountainHomesLayout.mjs';
import {wolfveilHeight} from './WolfveilLayout.js';

export const WOLFVEIL_TRIPO_TEMPLE_URL=
  'https://media.base44.com/files/public/6876751a602125f45f1861b9/ff9b6b28c_wolfveil_temple_house_runtime_4k.glb';
export const WOLFVEIL_TRIPO_TEMPLE_SHA256=
  '8f7996e21033ef66d9ab0eb7bf7556279cfc8f57e5438d28c5c66c36a11df804';

// Tripo GLB is already Y-up; its floor/bounding-box minimum is Y=0.
// These dimensions come from inspecting the actual uploaded GLB accessors.
export const WOLFVEIL_TRIPO_NATIVE_BOUNDS=Object.freeze({
  minX:-.4904937744140625,maxX:.4904937744140625,
  minY:0,maxY:.654998779296875,
  minZ:-.3970947265625,maxZ:.3970947265625,
});

// Base44 routes out of Game 3D without reloading the browser. Dispose the
// imported Tripo geometry, its PBR color/roughness/normal textures, and its
// material on teardown. Shared textures are disposed exactly once.
function releaseTripoGltfScene(scene){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  scene?.traverse?.(object=>{
    if(!object.isMesh)return;
    if(object.geometry)geometries.add(object.geometry);
    for(const mat of Array.isArray(object.material)?object.material:[object.material])
      if(mat)materials.add(mat);
  });
  for(const mat of materials)
    for(const value of Object.values(mat))
      if(value?.isTexture)textures.add(value);
  for(const texture of textures)texture.dispose?.();
  for(const material of materials)material.dispose?.();
  for(const geometry of geometries)geometry.dispose?.();
}

export function installWolfveilFountainHomes(world,{
  url=WOLFVEIL_TRIPO_TEMPLE_URL,
  loader=new GLTFLoader(),
  onReady,
  onError,
}={}){
  if(!world?.mesh||!Array.isArray(world.meshes))
    throw new TypeError('Wolfveil fountain residences need an existing Three.js world');
  const sites=WOLFVEIL_FOUNTAIN_HOMES;
  // The buildings are intentionally non-enterable until a genuine interior
  // model/door system exists. Solid client/server footprints are identical.
  const colliders=sites.map(site=>Object.freeze({
    id:site.id,kind:site.kind,x:site.x,z:site.z,w:site.w,d:site.d,
    Y:wolfveilHeight(site.x,site.z),
  }));

  // One batched, low-cost silhouette is retained if a network GLB is missing;
  // do not make an invisible collision wall while a model is still loading.
  const body=new THREE.InstancedMesh(
    new THREE.BoxGeometry(1,1,1),
    new THREE.MeshStandardMaterial({color:0x4d4036,roughness:.87}),sites.length);
  const roof=new THREE.InstancedMesh(
    new THREE.ConeGeometry(1,1,4),
    new THREE.MeshStandardMaterial({color:0x242c3a,roughness:.74}),sites.length);
  const dummy=new THREE.Object3D();
  sites.forEach((s,i)=>{
    const y=wolfveilHeight(s.x,s.z);
    dummy.position.set(s.x,y+4.75,s.z);
    dummy.rotation.set(0,s.yaw,0);
    dummy.scale.set(18.6,9.5,14.8);
    dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);
    dummy.position.set(s.x,y+10.25,s.z);
    dummy.rotation.set(0,Math.PI/4+s.yaw,0);
    dummy.scale.set(15.5,4.2,13.2);
    dummy.updateMatrix();roof.setMatrixAt(i,dummy.matrix);
  });
  body.instanceMatrix.needsUpdate=true;roof.instanceMatrix.needsUpdate=true;
  body.name='SWV_TripoFountainHomes_LoadingTimberSilhouettes';
  roof.name='SWV_TripoFountainHomes_LoadingPitchedRoofs';
  for(const mesh of [body,roof]){
    mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;
    world.mesh(mesh);
  }

  let disposed=false,readyState='loading',loadedBatch=null,ownedSource=null;
  const ready=new Promise(resolve=>{
    loader.load(url,gltf=>{
      if(disposed){
        releaseTripoGltfScene(gltf?.scene);
        resolve(false);return;
      }
      try{
        if(!gltf?.scene)throw Error('The owner Tripo temple GLB has no scene');
        gltf.scene.updateMatrixWorld(true);
        const meshes=[];
        gltf.scene.traverse(obj=>{if(obj.isMesh)meshes.push(obj);});
        if(meshes.length!==1)
          throw Error('The four-instance fountain contract requires the supplied single-mesh Tripo GLB');
        const original=meshes[0];
        const batch=new THREE.InstancedMesh(original.geometry,original.material,sites.length);
        const local=original.matrixWorld;
        const placement=new THREE.Matrix4();
        sites.forEach((s,i)=>{
          placement.compose(
            new THREE.Vector3(s.x,wolfveilHeight(s.x,s.z)-WOLFVEIL_FOUNTAIN_PAD.embed,s.z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),s.yaw),
            new THREE.Vector3(s.scale,s.scale,s.scale));
          const m=placement.multiply(local);
          batch.setMatrixAt(i,m);
        });
        batch.instanceMatrix.needsUpdate=true;
        batch.frustumCulled=false;
        batch.receiveShadow=true;batch.castShadow=true;
        batch.name='SWV_OriginalTripoTempleFourFountainResidences';
        // The same PBR texture/material/geometry are shared by all instances.
        world.mesh(batch);
        loadedBatch=batch;
        ownedSource=gltf.scene;
        body.visible=false;roof.visible=false;
        readyState='ready';
        // UI callbacks must never turn a structurally valid model into a
        // half-registered fallback with unloaded textures.
        try{onReady?.({count:sites.length,meshCount:1,assetSha256:WOLFVEIL_TRIPO_TEMPLE_SHA256});}
        catch(error){console.warn('[Wolfveil fountain homes] status callback failed:',error);}
        resolve(true);
      }catch(error){
        releaseTripoGltfScene(gltf?.scene);
        readyState='fallback';onError?.(error);resolve(false);
      }
    },undefined,error=>{
      if(disposed){resolve(false);return;}
      readyState='fallback';onError?.(error);resolve(false);
    });
  });
  return {ready,colliders,
    get state(){return readyState;},
    get loadedBatch(){return loadedBatch;},
    count:sites.length,
    dispose(){
      if(disposed)return;
      disposed=true;
      // In-flight GLB loads release their source when the late callback
      // returns. Once loaded, detach the same GPU batch before releasing
      // geometry/maps so world.dispose will not dispose it a second time.
      if(loadedBatch){
        loadedBatch.parent?.remove(loadedBatch);
        const at=world.meshes.indexOf(loadedBatch);
        if(at>=0)world.meshes.splice(at,1);
        releaseTripoGltfScene(ownedSource);
        ownedSource=null;loadedBatch=null;
      }
    },
  };
}
