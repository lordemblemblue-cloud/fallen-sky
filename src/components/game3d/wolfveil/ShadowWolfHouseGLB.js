// Single shared copy of the owner-provided Shadow Wolf realistic v4 house.
// Wolfveil's 18 residential plots all use instancing of its real detailed
// geometry. Public shops, inns and halls retain their own authored layouts.
// The binary goes in /public/game3d/models/ (see docs/game3d/SHADOW_WOLF_HOUSE_GLB.md).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const SHADOW_WOLF_HOUSE_URL='/game3d/models/shadow_wolf_samurai_house_realistic_v4.glb';
export const SHADOW_WOLF_HOUSE_SHA256='c15b69b1496a678547a46da772c25f6c8b29151d9ccf78dd943aa981d6e82806';
export const SHADOW_WOLF_HOUSE_COUNT=18;

// This GLB is authored Z-up. Its entrance faces -Y, so rotate -90 degrees
// about X (Z becomes vertical) then 180 degrees about game-world Y.
// The result faces the same -Z street direction as the original village homes.
const orientation=new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI/2,Math.PI,0,'YXZ'),
);
const floorNames=/^(02_Interior_Oak_Subfloor|02_Porch_Individually_Planked|07_Entry_Handcut_Stone_Stairs|20_Upper_Floor_Walkable_Main_Deck|21_Groundfloor_Warm_Timber_Floor|21_Kitchen_Tile_Floor|26_Bathroom_Stone_Floor|27_Upstairs_Tatami_Floor|28_Upper_Bathroom_Floor|V4_01_Stair_Flight_A_Treads|V4_02_Stair_Flight_B_Treads)/;
const removeEntryObstruction=/^V4_12_Entrance_(Insulated_Kickpanel|Inside_Grasp|Security_Lockplate)/;
const hiddenSitePatch=/^00_Site_Minimal_Mountain_Earth/;

export function wolfveilResidencePlacement(b){
  if(b?.kind!=='residence'||!Number.isFinite(b.Y))throw Error('Expected a measured Wolfveil residence');
  // The uploaded house is 14.45m wide including its decorative ground patch,
  // 12.8m across its eaves and 11.7m front-to-back. Preserve proportions:
  // uniform scale only; no stretching the architecture or texture UVs.
  const scale=Math.min(b.w/12.8,b.d/11.7,1.12);
  // Original main-floor height in the GLB is about +0.62m. Align that
  // surface with the existing village doorstep and the natural earth bridge.
  const position=new THREE.Vector3(b.x,b.Y+.245-.62*scale,b.z);
  const transform=new THREE.Matrix4().compose(
    position,orientation,new THREE.Vector3(scale,scale,scale),
  );
  return {scale,transform,
    // Relative to the original construction, new colliders tightly follow
    // actual exterior walls instead of the decorative site / roof overhang.
    walls:{x:b.x,z:b.z+.37*scale,w:10.95*scale,d:7.35*scale,doorHalfWidth:1.48*scale},
  };
}

function adjustedSourceMatrix(mesh){
  const result=mesh.matrixWorld.clone();
  const name=mesh.name||'';
  // Park the two shoji leaves beside the 3m doorway, rather than leaving
  // them visibly shut while the avatar is expected to pass through.
  if(name.startsWith('05_Sliding_Entrance_Left_'))
    result.multiply(new THREE.Matrix4().makeTranslation(-1.55,0,0));
  else if(name.startsWith('05_Sliding_Entrance_Right_'))
    result.multiply(new THREE.Matrix4().makeTranslation(1.55,0,0));
  return result;
}

export function installShadowWolfHouseModels(world,buildings,{url=SHADOW_WOLF_HOUSE_URL,onReady,onError,loader=new GLTFLoader()}={}){
  const homes=buildings.filter(b=>b.kind==='residence');
  if(!homes.length)return {ready:Promise.resolve(false),dispose(){}};
  let disposed=false;
  const added=[];
  // Loader requests a static local public asset, never Google Drive and never
  // per-house transfers. Keep procedural homes visible if asset is unavailable.
  const ready=new Promise(resolve=>{
    loader.load(url,gltf=>{
      if(disposed){resolve(false);return;}
      try{
        const scene=gltf?.scene;
        if(!scene)throw Error('The Shadow Wolf file has no scene');
        scene.updateMatrixWorld(true);
        const placements=homes.map(wolfveilResidencePlacement);
        let renderedMeshes=0,walkableMeshes=0;
        scene.traverse(object=>{
          if(!object.isMesh || hiddenSitePatch.test(object.name) ||
              removeEntryObstruction.test(object.name))return;
          const source=adjustedSourceMatrix(object);
          const batch=new THREE.InstancedMesh(object.geometry,object.material,homes.length);
          const instanceMatrix=new THREE.Matrix4();
          placements.forEach(({transform},i)=>{
            instanceMatrix.multiplyMatrices(transform,source);
            batch.setMatrixAt(i,instanceMatrix);
          });
          batch.name='SWV_ShadowWolfV4_'+object.name;
          batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          batch.instanceMatrix.needsUpdate=true;
          batch.frustumCulled=false;
          batch.castShadow=true;
          batch.receiveShadow=true;
          world.mesh(batch);
          added.push(batch);
          renderedMeshes++;
          if(floorNames.test(object.name)){
            // Rendered homes are instanced, but raycasts need the *same* floor
            // at each local residence. Invisible physical meshes are limited
            // to walkable floors, stairs and exterior threshold.
            for(const {transform} of placements){
              const floor=new THREE.Mesh(object.geometry,new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));
              floor.name='SWV_WalkableHouseV4_'+object.name;
              floor.matrixAutoUpdate=false;
              floor.matrix.multiplyMatrices(transform,source);
              world.mesh(floor);
              world.walkableSurfaces??=[];
              world.walkableSurfaces.push(floor);
              added.push(floor);
              walkableMeshes++;
            }
          }
        });
        if(!renderedMeshes)throw Error('The house has no renderable meshes');
        const detail={houses:homes.length,renderedMeshes,walkableMeshes,
          placements:placements.map(({scale,walls},i)=>({id:homes[i].id,scale,walls}))};
        world.group?.updateMatrixWorld?.(true);
        onReady?.(detail);
        resolve(detail);
      }catch(error){
        // Loader success is not enough if the GLB is structurally unusable.
        added.forEach(mesh=>{
          mesh.parent?.remove(mesh);
          if(mesh.name.startsWith('SWV_WalkableHouseV4_')){
            world.walkableSurfaces=world.walkableSurfaces?.filter(m=>m!==mesh);
            mesh.material.dispose();
          }
        });
        onError?.(error);
        resolve(false);
      }
    },undefined,error=>{
      if(!disposed)onError?.(error);
      resolve(false);
    });
  });
  return {ready,dispose(){disposed=true;}};
}
