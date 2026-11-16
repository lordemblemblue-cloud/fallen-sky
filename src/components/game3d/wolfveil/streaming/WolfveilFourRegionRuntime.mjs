import * as THREE from 'three';
import {
  WOLFVEIL_REGION_Z_OFFSET,WOLFVEIL_STREAM_REGIONS,WOLFVEIL_STREAM_GATEWAYS,
  WOLFVEIL_REGION_STREAM_OPTIONS,regionAtWolfveilLocal,
  stableWolfveilStreamRegion,nearWolfveilStreamRegions,crossedWolfveilGateway,
} from './WolfveilFourRegionPlan.mjs';

const VALID_REGIONS=new Set(WOLFVEIL_STREAM_REGIONS.map(entry=>entry.id));
// Safe static world instance sources. Keep separately swapped owner-tree
// fallbacks, live grass replacement batches, and physics/water OUT of this
// list: their owning systems change visibility/geometry asynchronously.
const STREAMABLE_STATIC_NAME=/^(?:SWV_Instanced_|SWV_CedarPineMaple_Trunks$|SWV_Pine_Cedar_RealLayeredBoughs$|SWV_Autumn_Coral_CourtyardMapleLeaves$|SWV_VisibleCedarBranches$|SWV_FlexibleBambooStems$|SWV_FernAndShrub_Patches$|SWV_Natural_Path_Edge_Weathered_Stones$)/;
// IMPORTANT: This only manages static instanced architecture/decor. Terrain,
// BVH, water, cave floors, all collision, AI, NPCs, GLBs and character state
// stay owned by their existing runtime. Discarding those resources would make
// the player fall at a bridge or break server/client parity.
// The original instanced source meshes never render while the stream runs;
// region-specific GPU instance buffers are created on demand and disposed
// as the player moves away. Geometry and materials are shared and NOT freed
// until the canonical village calls world.dispose().
export function createWolfveilFourRegionRuntime({
  world,position=null,offsetZ=WOLFVEIL_REGION_Z_OFFSET,
  onTransition=()=>{},onStats=()=>{},
  preloadMeters=WOLFVEIL_REGION_STREAM_OPTIONS.preloadMeters,
  batchesPerFrame=WOLFVEIL_REGION_STREAM_OPTIONS.batchesPerFrame,
}={}){
  if(!world?.group||!Array.isArray(world.meshes))
    throw new TypeError('Wolfveil four-region runtime requires the authoritative WolfveilBuilder');
  const plans=new Map(WOLFVEIL_STREAM_REGIONS.map(entry=>[entry.id,[]]));
  const active=new Map();
  const sources=[];
  const local=new THREE.Matrix4(),color=new THREE.Color();
  let totalInstances=0,disabled=false,disposed=false,exportDepth=0;
  const originalRegion=stableWolfveilStreamRegion(position)||'town';
  let pendingGateway=null;
  let currentRegion=originalRegion,lastPosition=position&&{
    x:Number(position.x),z:Number(position.z),
  };
  const srcList=[...world.meshes];
  for(const mesh of srcList){
    if(!mesh?.isInstancedMesh||!STREAMABLE_STATIC_NAME.test(mesh.name)||
      mesh.visible===false||mesh.count<1||!mesh.parent)continue;
    // Only the builder's static unit-box/cylinder batches are eligible.
    // Animated plants, individual blades, imported house GLBs, and all
    // physics/camera raycast floors remain outside this partition.
    const records=new Map();
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,local);
      const e=local.elements;
      const region=regionAtWolfveilLocal(e[12],e[14]);
      if(!region||!VALID_REGIONS.has(region))continue;
      if(!records.has(region))records.set(region,[]);
      const matrix=new Float32Array(16);matrix.set(e);
      const instance={matrix};
      if(mesh.instanceColor){mesh.getColorAt(i,color);instance.color=[color.r,color.g,color.b];}
      records.get(region).push(instance);
      totalInstances++;
    }
    if(!records.size)continue;
    sources.push({mesh,wasVisible:mesh.visible});
    mesh.visible=false;
    for(const [region,instances] of records)
      plans.get(region).push({mesh,instances});
  }

  // Assets at the player spawn are available before the very first render.
  function makeRegion(id){
    if(disposed||active.has(id)||!plans.has(id))return;
    active.set(id,{meshes:[],loaded:0,desired:true});
  }
  function loadBatch(id,record){
    if(disposed||exportDepth)return;
    const source=record.mesh;
    const clone=new THREE.InstancedMesh(source.geometry,source.material,record.instances.length);
    clone.name='WV_Stream_'+id+'_'+source.name;
    clone.position.copy(source.position);
    clone.quaternion.copy(source.quaternion);
    clone.scale.copy(source.scale);
    clone.layers.mask=source.layers.mask;
    clone.renderOrder=source.renderOrder;
    clone.castShadow=source.castShadow;
    clone.receiveShadow=source.receiveShadow;
    clone.frustumCulled=source.frustumCulled;
    clone.userData={wolfveilStreamRegion:id,renderOnly:true};
    for(let i=0;i<record.instances.length;i++){
      // The matrix object is reused to avoid allocating once per instance.
      local.fromArray(record.instances[i].matrix);
      clone.setMatrixAt(i,local);
      if(record.instances[i].color)clone.setColorAt(
        i,color.setRGB(...record.instances[i].color));
    }
    clone.instanceMatrix.needsUpdate=true;
    if(clone.instanceColor)clone.instanceColor.needsUpdate=true;
    source.parent.add(clone); // same +70m Wolfveil world transform
    return clone;
  }
  function loadNext(id,limit){
    makeRegion(id);
    const node=active.get(id);
    if(!node)return 0;
    const queue=plans.get(id);
    let count=0;
    while(count<limit&&node.loaded<queue.length){
      const clone=loadBatch(id,queue[node.loaded]);
      if(clone)node.meshes.push(clone);
      node.loaded++;
      count++;
    }
    return count;
  }
  function unloadRegion(id){
    const node=active.get(id);
    if(!node)return;
    for(const mesh of node.meshes){
      mesh.parent?.remove(mesh);
      // InstancedMesh.dispose() releases GPU instanceMatrix buffers; shared
      // geometry/material belong to original WolfveilBuilder and remain alive.
      mesh.dispose?.();
    }
    node.meshes.length=0;
    active.delete(id);
  }
  if(!disabled)loadNext(currentRegion,Infinity);
  function getStats(){
    const loaded=[...active.keys()];
    const visible=loaded.reduce((sum,id)=>sum+(active.get(id)?.meshes?.length||0),0);
    const instances=loaded.reduce((sum,id)=>sum+(active.get(id)?.meshes||[])
      .reduce((n,mesh)=>n+mesh.count,0),0);
    return {
      enabled:!disabled&&!disposed,mode:'static_instance_buffers',
      region:currentRegion,sourceBatches:sources.length,sourceInstances:totalInstances,
      loadedRegions:loaded,loadedBatches:visible,loadedInstances:instances,
      unloadedInstances:Math.max(0,totalInstances-instances),
      terrainStreaming:'existing_meadow_tiles',collisionStreaming:false,
      distantGeometryAndMaterialsShared:true,
    };
  }
  function update(playerPosition,{paused=false}={}){
    if(disposed||disabled||exportDepth||!playerPosition)return getStats();
    const next=stableWolfveilStreamRegion(playerPosition,currentRegion,{zOffset:offsetZ});
    if(!next)return getStats();
    const crossing=lastPosition&&crossedWolfveilGateway(lastPosition,playerPosition,{zOffset:offsetZ});
    if(crossing)pendingGateway={
      ...crossing,at:{x:Number(playerPosition.x),z:Number(playerPosition.z)},
    };
    if(pendingGateway&&Math.hypot(
      Number(playerPosition.x)-pendingGateway.at.x,
      Number(playerPosition.z)-pendingGateway.at.z)>36)pendingGateway=null;
    if(next!==currentRegion){
      const previous=currentRegion;
      currentRegion=next;
      // No empty frame after a fast run or workflow teleport. This allocates
      // only destination instance buffers, never a second terrain.
      loadNext(currentRegion,Infinity);
      const gate=(crossing||pendingGateway);
      if(!paused)onTransition({from:previous,to:next,gateway:gate?.id||null,
        gatewayLabel:gate?.label||null});
      pendingGateway=null;
    }
    lastPosition={x:Number(playerPosition.x),z:Number(playerPosition.z)};
    const desired=new Set(nearWolfveilStreamRegions(playerPosition,currentRegion,
      {zOffset:offsetZ,preloadMeters}));
    desired.add(currentRegion);
    let remaining=Math.max(1,Number(batchesPerFrame)||4);
    for(const region of desired){
      if(remaining<=0)break;
      remaining-=loadNext(region,remaining);
    }
    const ready=[...desired].every(id=>active.get(id)?.loaded===plans.get(id).length);
    // Keep the previous bank visible until the new one is fully prepared.
    if(ready)for(const id of [...active.keys()]){
      if(!desired.has(id))unloadRegion(id);
    }
    const stats=getStats();onStats(stats);return stats;
  }
  async function withFullMapExport(task){
    if(disposed||typeof task!=='function')throw Error('Cannot export disposed stream');
    exportDepth++;
    if(exportDepth===1){
      for(const {mesh,wasVisible} of sources)mesh.visible=wasVisible;
      for(const entry of active.values())for(const mesh of entry.meshes)mesh.visible=false;
    }
    try{return await task();}
    finally{
      exportDepth--;
      if(!exportDepth&&!disposed){
        for(const {mesh} of sources)mesh.visible=false;
        for(const entry of active.values())for(const mesh of entry.meshes)mesh.visible=true;
      }
    }
  }
  function dispose(){
    if(disposed)return;
    disposed=true;
    for(const id of [...active.keys()])unloadRegion(id);
    for(const {mesh,wasVisible} of sources)mesh.visible=wasVisible;
    sources.length=0;plans.clear();
  }
  return {update,getStats,withFullMapExport,dispose,
    getRegion:()=>currentRegion,
    getGateways:()=>WOLFVEIL_STREAM_GATEWAYS,
  };
}
