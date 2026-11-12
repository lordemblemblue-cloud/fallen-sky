// Replace Game 3D's *visual* grass with instances derived from the owner's
// original 2 x 2m GLB. Terrain, route clearance, authoritative movement,
// reserved square plans and Game 1 remain untouched.
//
// Source: Long_Grass_Tile_2m_Game3D.glb (1107 authored individual blades).
// These near/far GLBs retain those SAME blade vertices and source colors,
// spatially sampled to 192/72 blades to keep the GPU budget bounded.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clearOf} from './WolfveilForestLayout.js';
import {WOLFVEIL_SITES} from './WolfveilLayout.js';

export const WOLFVEIL_OWNER_GRASS_TILE=Object.freeze({
  original:'https://media.base44.com/files/public/6876751a602125f45f1861b9/9742a2995_Long_Grass_Tile_2m_Game3D.glb',
  near:'https://media.base44.com/files/public/6876751a602125f45f1861b9/baf170ee6_Long_Grass_Tile_2m_Game3D_LOD_near.glb',
  far:'https://media.base44.com/files/public/6876751a602125f45f1861b9/7553e869a_Long_Grass_Tile_2m_Game3D_LOD_far.glb',
  originalTriangleCount:11070,nearTriangleCount:1920,farTriangleCount:720,
  gridMeters:2.35,maxVillageInstances:3200,
});

const readonlyZeroRaycast=()=>{};
const isGrassObject=object=>Boolean(object?.isInstancedMesh&&(
  object.userData?.kind==='grass'||
  /^SWV_Natural_3D_Grass_|^SWV_SWQuarter_Consolidated_Grass_Batch$|^SWV_RiverFlow_RouteGrass$/.test(object.name||'')||
  (object.userData?.decorativeOnly&&/grass/i.test(object.name||''))
));

export function selectWolfveilOwnerGrassRoots(world,{gridMeters=WOLFVEIL_OWNER_GRASS_TILE.gridMeters,
  maxInstances=WOLFVEIL_OWNER_GRASS_TILE.maxVillageInstances,
  clear=clearOf}={}){
  if(!(gridMeters>=2&&gridMeters<=8)||maxInstances<1)throw Error('Invalid grass replacement budget');
  const seen=new Set(),roots=[];
  const affected=(world?.meshes||[]).filter(isGrassObject);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),
    scale=new THREE.Vector3();
  for(const mesh of affected){
    // Existing authored clumps were already terrain-sampled, placed outside
    // tree/road exclusions, and clipped to their single-square owner. Retain
    // their original roots instead of generating a new unchecked map grid.
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);
      matrix.decompose(position,rotation,scale);
      const x=position.x,z=position.z,y=position.y;
      if(![x,y,z].every(Number.isFinite))continue;
      if(!clear({x,z},1.18))continue; // tile half-width cannot overlap a road
      const gx=Math.floor(x/gridMeters),gz=Math.floor(z/gridMeters);
      const key=gx+':'+gz;
      if(seen.has(key))continue;
      seen.add(key);
      // Stable spatial ranking spreads the capped budget across ALL of the
      // authored owner squares, instead of starving later tile workstreams.
      let hashed=(Math.imul(gx,73856093)^Math.imul(gz,19349663))>>>0;
      hashed=Math.imul(hashed^(hashed>>>16),0x7feb352d);
      hashed=Math.imul(hashed^(hashed>>>15),0x846ca68b);
      const priority=(hashed^(hashed>>>16))>>>0;
      roots.push({x,y,z,angle:2*Math.atan2(rotation.y,rotation.w),cell:key,priority});
    }
  }
  roots.sort((a,b)=>a.priority-b.priority||a.x-b.x||a.z-b.z);
  return {roots:roots.slice(0,maxInstances),affected};
}
export function installWolfveilOwnerGrassTile(world,{groundCover,ownerModels,loader=new GLTFLoader(),
  onStatus=()=>{},plan=selectWolfveilOwnerGrassRoots}={}){
  if(!world?.group||!groundCover)return null;
  let disposed=false,ready=false,error=null,installed=[],nearGeometry=null,farGeometry=null;
  const listeners=new Set();
  const ownedSourceMeshes=[];
  const status=()=>({ready,failed:error?String(error?.message||error):null,
    originalHidden:ready?installed.length:0,
    tileInstances:installed.reduce((n,m)=>n+m.count,0),
    nearTriangles:WOLFVEIL_OWNER_GRASS_TILE.nearTriangleCount,
    farTriangles:WOLFVEIL_OWNER_GRASS_TILE.farTriangleCount,
    model:'Long_Grass_Tile_2m_Game3D',ownerOriginalUrl:WOLFVEIL_OWNER_GRASS_TILE.original});
  const signal=()=>{if(!disposed)onStatus(status());};
  const notify=()=>{
    for(const callback of [...listeners])callback();
    signal();
  };
  const readGlb=url=>new Promise((resolve,reject)=>{
    loader.load(url,gltf=>resolve(gltf),undefined,reject);
  });
  const extract=(gltf)=>{
    const root=gltf.scene||gltf.scenes?.[0];
    if(!root)throw Error('Grass GLB has no scene');
    root.updateMatrixWorld(true);
    let source=null;
    root.traverse(node=>{if(node.isMesh&&node.geometry&&!source)source=node;});
    if(!source||!source.geometry.getAttribute('position')?.count)
      throw Error('Grass GLB has no valid foliage mesh');
    const geometry=source.geometry.clone();
    geometry.applyMatrix4(source.matrixWorld);
    geometry.computeBoundingBox();
    const b=geometry.boundingBox;
    geometry.translate(-(b.min.x+b.max.x)/2,-b.min.y,-(b.min.z+b.max.z)/2);
    geometry.computeBoundingSphere();
    ownedSourceMeshes.push(root);
    return {geometry,material:source.material};
  };
  const buildBatch=(geometry,material,entries,name)=>{
    if(!entries.length)return null;
    const batch=new THREE.InstancedMesh(geometry,material,entries.length);
    batch.name=name;
    const transform=new THREE.Object3D();
    for(let i=0;i<entries.length;i++){
      const root=entries[i];
      const variation=((Math.imul(Math.floor(root.x*17),73856093)^
        Math.imul(Math.floor(root.z*13),19349663))>>>0)%1000/1000;
      const scale=.77+.18*variation;
      transform.position.set(root.x,root.y,root.z);
      transform.rotation.set(0,root.angle,0);
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      batch.setMatrixAt(i,transform.matrix);
    }
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingSphere();
    batch.frustumCulled=true;batch.castShadow=false;batch.receiveShadow=true;
    batch.raycast=readonlyZeroRaycast;
    batch.userData={visualOnly:true,decorativeOnly:true,nonCollider:true,
      ownerGrassTile:true,sourceGLB:WOLFVEIL_OWNER_GRASS_TILE.original};
    return batch;
  };
  const update=()=>{
    if(!ready||disposed)return;
    // The owner's older accent GLB can finish loading after the replacement.
    // Hide it then too, rather than layering two conflicting grass styles.
    ownerModels?.group?.traverse(node=>{
      if(node?.isMesh&&/^SWV_Owner_grass_/i.test(node.name||''))node.visible=false;
    });
  };
  Promise.all([readGlb(WOLFVEIL_OWNER_GRASS_TILE.near),
    readGlb(WOLFVEIL_OWNER_GRASS_TILE.far)])
    .then(([nearGltf,farGltf])=>{
      if(disposed)return;
      const near=extract(nearGltf),far=extract(farGltf);
      const {roots,affected}=plan(world);
      if(!affected.length||!roots.length)throw Error('No existing planted grass roots');
      const sourceWind=groundCover.grassMeshes?.[0]?.material;
      const makeMaterial=source=>{
        const material=source.clone();
        material.vertexColors=true;
        material.side=THREE.DoubleSide;
        material.roughness=.91;
        if(typeof sourceWind?.onBeforeCompile==='function'){
          material.onBeforeCompile=sourceWind.onBeforeCompile;
          material.customProgramCacheKey=sourceWind.customProgramCacheKey;
        }
        world.ownedMaterials.push(material);
        return material;
      };
      const nearMat=makeMaterial(near.material),farMat=makeMaterial(far.material);
      const center=WOLFVEIL_SITES.market;
      const nearRoots=[],farRoots=[];
      for(const r of roots)(Math.hypot(r.x-center.x,r.z-center.z)<85
        ?nearRoots:farRoots).push(r);
      // Chunk by 32m so frustum culling rejects offscreen 2m tiles;
      // one continent-sized InstancedMesh would submit every blade even
      // when the camera only sees a few metres of the map.
      const chunked=(geometry,material,spots,label)=>{
        const chunks=new Map();
        for(const root of spots){
          const key=Math.floor(root.x/32)+':'+Math.floor(root.z/32);
          if(!chunks.has(key))chunks.set(key,[]);
          chunks.get(key).push(root);
        }
        return [...chunks.entries()].map(([key,positions])=>
          buildBatch(geometry,material,positions,label+'_'+key)).filter(Boolean);
      };
      const meshes=[
        ...chunked(near.geometry,nearMat,nearRoots,'SWV_Owner_LongGrass_Tile_2m_Near'),
        ...chunked(far.geometry,farMat,farRoots,'SWV_Owner_LongGrass_Tile_2m_Far'),
      ];
      if(!meshes.length)throw Error('No replacement instances');
      for(const mesh of meshes)world.mesh(mesh);
      nearGeometry=near.geometry;farGeometry=far.geometry;
      installed=meshes;
      // Swap only after BOTH GLBs were successfully decoded and placed.
      for(const mesh of affected)mesh.visible=false;
      ready=true;update();notify();
    }).catch(e=>{
      if(disposed)return;
      error=e;
      console.warn('Game 3D long-grass tile unavailable; keeping original grass',e);
      signal();
    });
  return {
    status,update,
    getMeadowGeometry:()=>ready?farGeometry:null,
    onReady(fn){if(typeof fn!=='function')return ()=>{};listeners.add(fn);if(ready)fn();
      return ()=>listeners.delete(fn);},
    dispose(){disposed=true;listeners.clear();
      for(const mesh of installed)mesh.parent?.remove(mesh);
      // A far geometry can be loaded for the meadow without an in-village
      // far batch; by now the streamed meadow has already been disposed.
      if(farGeometry&&!installed.some(m=>m.geometry===farGeometry))
        farGeometry.dispose();
      if(nearGeometry&&!installed.some(m=>m.geometry===nearGeometry))
        nearGeometry.dispose();
      // World owns the replacement instanced geometries and materials;
      // it disposes them after the streamed meadow has been shut down.
      installed=[];
      for(const src of ownedSourceMeshes)src.traverse(node=>{
        node.geometry?.dispose?.();
        if(Array.isArray(node.material))node.material.forEach(m=>m.dispose?.());
        else node.material?.dispose?.();
      });
    },
  };
}
