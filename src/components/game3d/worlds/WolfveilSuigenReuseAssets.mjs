import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
 WOLFVEIL_SUIGEN_REUSE_ASSET_URL,WOLFVEIL_SUIGEN_REUSE_TYPES,
 WOLFVEIL_SUIGEN_REUSE_PLACEMENTS,eligibleWolfveilSuigenReusePlacement,
} from './WolfveilSuigenReusePlan.mjs';

function disposeImportedPack(pack){
  const seenGeometry=new Set(),seenMaterials=new Set(),seenTextures=new Set();
  pack?.traverse?.(node=>{
    if(!node.isMesh)return;
    if(node.geometry&&!seenGeometry.has(node.geometry)){
      seenGeometry.add(node.geometry);
      node.geometry.dispose();
    }
    for(const mat of (Array.isArray(node.material)?node.material:[node.material])){
      if(!mat||seenMaterials.has(mat))continue;
      seenMaterials.add(mat);
      for(const value of Object.values(mat)){
        if(value?.isTexture&&!seenTextures.has(value)){
          seenTextures.add(value);value.dispose();
        }
      }
      mat.dispose();
    }
  });
}

/**
 * Decoration ONLY: copies six prefab families from the uploader's original
 * GLB into isolated parts of the unchanged Classic Wolfveil terrain.
 * Absolutely no imported terrain, roads, buildings, water, spawn, navmesh,
 * gameplay collider or quest state is inserted/replaced.
 *
 * Old Classic fallback trees stay visible until and after loading.
 */
export async function loadClassicWolfveilSuigenAccents({
 scene,signal,sampleGroundY,insideTravel,routeDistance,riverDistance,
 protectedTile,insideTown,nearGameplaySite,
}={}){
 if(!scene?.isScene)throw new TypeError('Classic Wolfveil scene required');
 const loader=new GLTFLoader();
 loader.setCrossOrigin('anonymous');
 const asset=await loader.loadAsync(WOLFVEIL_SUIGEN_REUSE_ASSET_URL);
 if(signal?.aborted){
   disposeImportedPack(asset.scene);
   throw new Error('Suigen selective-asset load cancelled');
 }
 const templates={};
 for(const [type,meta] of Object.entries(WOLFVEIL_SUIGEN_REUSE_TYPES)){
   const meshes=[];
   for(let i=0;i<meta.parts;i++){
     const node=asset.scene.getObjectByName(type+'_Part_'+i);
     if(!node?.isMesh)break;
     meshes.push(node);
   }
   if(meshes.length===meta.parts)templates[type]=meshes;
 }
 const root=new THREE.Group();
 root.name='Wolfveil_Classic_Reused_Suigen_Trees_Bamboo_Rocks';
 root.userData.decorativeOnly=true;
 root.userData.noGameplayCollision=true;
 root.userData.source='Wolfveil_Dominion_Of_Suigen_2400m_AAA_Map.mjs';
 let placed=0,skipped=0,trees=0,bamboo=0,rocks=0;
 const instances=[];
 for(const item of WOLFVEIL_SUIGEN_REUSE_PLACEMENTS){
   const valid=eligibleWolfveilSuigenReusePlacement(item,{
     sampleGroundY,insideTravel,routeDistance,riverDistance,
     protectedTile,insideTown,nearGameplaySite,
   });
   if(!valid||!templates[item.type]){skipped++;continue;}
   const floor=sampleGroundY(item.x,item.z);
   if(!Number.isFinite(floor)){skipped++;continue;}
   const type=WOLFVEIL_SUIGEN_REUSE_TYPES[item.type];
   const prefab=new THREE.Group();
   prefab.name='Wolfveil_Classic_Accented_'+item.id;
   prefab.userData.sourceFamily=item.type;
   for(const original of templates[item.type]){
     const mesh=original.clone(false);
     mesh.geometry=original.geometry;
     mesh.material=original.material;
     mesh.castShadow=type.category==='tree'&&/Part_0$/.test(original.name);
     mesh.receiveShadow=type.category!=='bamboo';
     mesh.raycast=()=>[]; // world collision and player-foot probes unchanged
     prefab.add(mesh);
   }
   prefab.position.set(item.x,floor+type.groundOffset*item.scale,item.z);
   prefab.rotation.y=item.yaw;
   prefab.scale.setScalar(item.scale);
   root.add(prefab);instances.push(prefab);
   placed++;
   if(type.category==='tree')trees++;
   else if(type.category==='bamboo')bamboo++;
   else rocks++;
 }
 if(signal?.aborted){
   disposeImportedPack(asset.scene);
   throw new Error('Suigen selective-asset load cancelled');
 }
 scene.add(root);
 root.updateMatrixWorld(true);
 let disposed=false;
 const status=Object.freeze({
   source:'Suigen owner GLB extracted geometry and materials',
   sourcePrefabKinds:Object.keys(templates),sourceMeshParts:18,
   candidates:WOLFVEIL_SUIGEN_REUSE_PLACEMENTS.length,
   placed,skipped,trees,bamboo,rocks,
   terrainReplaced:false,authoritativeCollisionChanged:false,
 });
 root.userData.sourceAssetStatus=status;
 return {
   root,status,
   setVisible(visible){if(!disposed)root.visible=!!visible;},
   dispose(){
     if(disposed)return;
     disposed=true;
     scene.remove(root);
     root.clear();
     disposeImportedPack(asset.scene);
   },
 };
}
