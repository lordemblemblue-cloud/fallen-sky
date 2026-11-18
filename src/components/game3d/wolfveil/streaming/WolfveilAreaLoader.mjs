// Keeps one Wolfveil area drawn at a time: the town or one of its four sides.
//
// The valley is still ONE physical world. The terrain, its raycast BVH, the
// river, every walkable floor, colliders, enemies, NPCs and all server state
// are never touched. What changes is what the renderer is asked to draw:
//
//   * scenery that sits wholly inside one area is drawn only while that area
//     is loaded;
//   * map-wide instanced scenery (trees, stones, plants) is split into one
//     batch per area, and only the loaded areas' batches exist on the GPU;
//   * optionally the GPU copies of an unloaded area's meshes and textures are
//     released and re-uploaded by Three.js the next time the area is shown.
//
// No Three.js import: objects are duck-typed, so the logic runs in Node tests.
import {
  WOLFVEIL_AREA_Z_OFFSET,WOLFVEIL_AREA_IDS,WOLFVEIL_AREA_NEIGHBORS,
  WOLFVEIL_AREA_LOADING_OPTIONS,wolfveilAreaAtLocal,wolfveilAreaOfRect,
  stableWolfveilArea,nearWolfveilAreas,crossedWolfveilAreaPortal,wolfveilAreaInfo,
} from './WolfveilFiveAreaPlan.mjs';

export const WOLFVEIL_AREA_LOADING_MODES=Object.freeze(['single','neighbors','all']);
// Never managed: the ground, anything this loader or the older region
// streamer created, the portal markers and the underground cave network
// (a cave runs beneath several surface areas at once). The river and other
// map-wide meshes need no rule: whatever straddles a border stays loaded.
const SHARED_NAME=/^(?:WV_Area_|WV_Stream_|WV_Portal_)|Terrain|Cave/i;
// Already streamed around the player or animated by their owner every frame.
const DYNAMIC_NAME=/^(?:SWV_Near_GrassBlades_|SWV_Individual_GrassBlades_|Wolfveil_Town_Park_IndividualGrassBlades|WV_Meadow_|WV_LivingMeadow_|WV_4MileRadius_|DistantAmbientBirds|AmbientBird|Game3D_Clone_AmbientBirds)/;
const noRaycast=()=>{};
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const clockNow=()=>globalThis.performance?.now?.()??Date.now();

// "Virtual visibility". The owner of an object keeps full control of its
// `visible` flag; the loader adds a second condition on top. Reading
// `object.visible` gives owner intent AND area loaded, so a system that hides
// a retired mesh is never overruled when the area is shown again.
function installGate(object,onIntent=null){
  let intent=object.visible!==false,open=true;
  Object.defineProperty(object,'visible',{
    configurable:true,enumerable:true,
    get:()=>intent&&open,
    set(value){
      const next=Boolean(value);
      if(next===intent)return;
      intent=next;onIntent?.(next);
    },
  });
  return {
    get intent(){return intent;},
    get open(){return open;},
    setOpen(next){open=Boolean(next);},
    remove(){
      Object.defineProperty(object,'visible',{
        configurable:true,enumerable:true,writable:true,value:intent});
    },
  };
}
const FAR_SCENERY='far scenery, drawn from every area';
function triangleCount(geometry){
  const indexed=Number(geometry?.index?.count);
  if(indexed>0)return indexed/3;
  const vertices=Number(geometry?.attributes?.position?.count);
  return vertices>0?vertices/3:0;
}
function geometryBox(geometry){
  if(!geometry)return null;
  if(!geometry.boundingBox)geometry.computeBoundingBox?.();
  const box=geometry.boundingBox;
  if(!box||![box.min?.x,box.min?.y,box.min?.z,box.max?.x,box.max?.y,box.max?.z]
    .every(Number.isFinite))return null;
  return box;
}
const columnScale=(e,offset=0)=>Math.max(
  Math.hypot(e[offset],e[offset+1],e[offset+2]),
  Math.hypot(e[offset+4],e[offset+5],e[offset+6]),
  Math.hypot(e[offset+8],e[offset+9],e[offset+10]));

export function createWolfveilAreaLoader({
  world,position=null,offsetZ=WOLFVEIL_AREA_Z_OFFSET,
  mode='single',portals=[],extraUnits=[],exclude=()=>false,
  preloadMeters=WOLFVEIL_AREA_LOADING_OPTIONS.preloadMeters,
  hysteresisMeters=WOLFVEIL_AREA_LOADING_OPTIONS.hysteresisMeters,
  batchesPerFrame=WOLFVEIL_AREA_LOADING_OPTIONS.batchesPerFrame,
  // A batch must sit unchanged this long before it is split per area.
  settleSeconds=3,scanSeconds=2,auditSeconds=1,
  // Tall landmarks (peaks, towers) stay on the skyline from every area.
  skylineMeters=40,maxDepth=3,unitAuditsPerFrame=48,
  // Far scenery: tall, cheap instanced scenery (the forest) is never split or
  // unloaded, so an unloaded area still shows its trees on the horizon. One
  // draw call per kind of tree for the whole valley, the same as one area.
  farScenery=true,farSceneryMeters=4,farSceneryMaxTriangles=60000,
  // Far outline: tall scenery that IS unloaded with its area (buildings, big
  // trees) is baked into one coarse mesh per area and shown while that area
  // is unloaded. The caller supplies the builder:
  //   farProxy.build(area, [{mesh, matrices}]) -> {object, triangles, ...} | null
  //   farProxy.dispose(object)
  farProxy=null,farProxySeconds=2,
  // With the ground height known (world x, z -> y), a part also counts as
  // tall when its top stands this far above the ground under it: the walls
  // of a building made of many short pieces, not only its roof.
  groundHeightAt=null,farOutlineReachMeters=2.5,
  releaseGpuMemory=false,releaseDelaySeconds=20,
  onTransition=()=>{},onStats=()=>{},onAreasChanged=()=>{},
  now=clockNow,
}={}){
  if(!world?.group||!Array.isArray(world.group.children))
    throw new TypeError('Wolfveil area loader requires the authoritative WolfveilBuilder');
  const settings={
    mode:WOLFVEIL_AREA_LOADING_MODES.includes(mode)?mode:'single',
    preloadMeters,hysteresisMeters,batchesPerFrame,
    releaseGpuMemory:Boolean(releaseGpuMemory),releaseDelaySeconds,
    farScenery:Boolean(farScenery),
  };
  const units=new Map();      // object -> single-area scenery record
  const batches=new Map();    // instanced source -> per-area split record
  const pending=new Map();    // instanced source -> waiting to prove it is static
  const known=new Map();      // object -> {state,signature}
  const dynamicNames=new Set();
  const extras=new Set(extraUnits.filter(Boolean));
  const loaded=new Set(WOLFVEIL_AREA_IDS);
  const unloadedAt=new Map(),released=new Set();
  const totals={releasedGeometries:0,releasedTextures:0};
  let disposed=false,disabled=false,exportDepth=0,failure=null;
  let current=stableWolfveilArea(position||{x:0,z:offsetZ},null,{zOffset:offsetZ})||'town';
  let lastPosition=position?{x:Number(position.x),z:Number(position.z)}:null;
  let pendingPortal=null,lastScan=-Infinity,lastAudit=-Infinity,dirty=true,scanId=0;
  let lastStats=null,lastStatsAt=-Infinity,statsStale=true;
  // Bookkeeping is spread out so no single frame pays for the whole valley.
  let totalsCache=null,scanChanged=false,quietScans=0,auditQueue=[],auditCursor=0;
  let building=0; // per-area copies still waiting for their turn to be built
  const buildingAreas=new Set(); // areas whose copies are still being built
  const proxies=new Map();       // area -> {object, signature, triangles, ...}
  let proxyDue=true,proxyAt=-Infinity,proxyQueue=[],proxyFailure=null;
  let unitsStale=true; // unit gates need re-applying (loaded set or unit list changed)

  const walkable=()=>new Set(world.walkableSurfaces||[]);
  function sceneRoot(){
    let root=world.group;
    while(root.parent)root=root.parent;
    return root;
  }
  function isExcluded(object,floors){
    if(!object||object.isLight||object.isCamera||object.isScene)return true;
    const data=object.userData||{};
    if(data.isTerrain||data.wolfveilAreaShared||data.wolfveilAreaClone)return true;
    if(floors.has(object))return true;
    const name=object.name||'';
    if(SHARED_NAME.test(name)||DYNAMIC_NAME.test(name))return true;
    return Boolean(exclude(object));
  }
  // World-space footprint of an object and everything under it.
  function footprint(root){
    const out={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,
      minZ:Infinity,maxZ:-Infinity,triangles:0,drawCalls:0,nodes:0,
      actor:false,lights:false,leaves:[]};
    const grow=(x,y,z,pad=0)=>{
      if(x-pad<out.minX)out.minX=x-pad;if(x+pad>out.maxX)out.maxX=x+pad;
      if(y-pad<out.minY)out.minY=y-pad;if(y+pad>out.maxY)out.maxY=y+pad;
      if(z-pad<out.minZ)out.minZ=z-pad;if(z+pad>out.maxZ)out.maxZ=z+pad;
    };
    const visit=object=>{
      out.nodes++;
      if(object.isSkinnedMesh||object.isBone)out.actor=true;
      if(object.isLight)out.lights=true;
      const box=object.geometry&&object.matrixWorld?.elements
        ?geometryBox(object.geometry):null;
      if(box){
        const e=object.matrixWorld.elements;
        const groups=Array.isArray(object.material)?Math.max(1,object.material.length):1;
        // Render layer mask 0 marks an original that a draw-call merger has
        // replaced: it is still gated and measured, but it costs nothing.
        const drawn=object.layers?.mask!==0;
        out.leaves.push(object);
        if(object.isInstancedMesh&&object.instanceMatrix?.array){
          const reach=.5*Math.hypot(box.max.x-box.min.x,box.max.y-box.min.y,
            box.max.z-box.min.z)+Math.hypot(
            (box.max.x+box.min.x)/2,(box.max.y+box.min.y)/2,(box.max.z+box.min.z)/2);
          const array=object.instanceMatrix.array,scale=columnScale(e);
          const count=Math.min(object.count|0,Math.floor(array.length/16));
          for(let i=0;i<count;i++){
            const o=i*16,x=array[o+12],y=array[o+13],z=array[o+14];
            grow(e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],
              e[2]*x+e[6]*y+e[10]*z+e[14],reach*columnScale(array,o)*scale);
          }
          if(drawn)out.triangles+=triangleCount(object.geometry)*count;
        }else{
          for(let corner=0;corner<8;corner++){
            const x=corner&1?box.max.x:box.min.x,y=corner&2?box.max.y:box.min.y;
            const z=corner&4?box.max.z:box.min.z;
            grow(e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],
              e[2]*x+e[6]*y+e[10]*z+e[14]);
          }
          if(drawn)out.triangles+=triangleCount(object.geometry);
        }
        if(drawn)out.drawCalls+=groups;
      }
      for(const child of object.children||[])visit(child);
    };
    visit(root);
    out.empty=!out.leaves.length||!Number.isFinite(out.minX);
    return out;
  }
  function signature(object){
    let nodes=0;
    const visit=node=>{nodes++;for(const child of node.children||[])visit(child);};
    visit(object);
    return nodes+':'+(object.isInstancedMesh
      ?(object.count|0)+':'+(object.instanceMatrix?.version|0):'');
  }
  function remember(object,state,sig,reason=null){
    const before=known.get(object);
    if(!before||before.state!==state||before.signature!==sig)scanChanged=true;
    known.set(object,{state,signature:sig,reason,scan:scanId});
  }
  function forgetUnit(object){
    const unit=units.get(object);
    if(!unit)return;
    for(const gate of unit.gates)gate.remove();
    units.delete(object);totalsCache=null;
  }
  function makeUnit(object,area,print){
    // A unit that carries lights is hidden mesh by mesh so its lights stay in
    // the scene: changing the number of active lights would force Three.js to
    // recompile every lit material at each area change.
    const targets=print.lights?print.leaves:[object];
    const inside=node=>{
      for(const child of node.children||[]){forgetUnit(child);inside(child);}
    };
    inside(object); // one gate per object: a parent unit replaces its children
    const e=object.matrixWorld?.elements;
    units.set(object,{
      object,area,triangles:print.triangles,drawCalls:print.drawCalls,
      // An owner showing or hiding a part changes what the far outline holds.
      targets,gates:targets.map(target=>installGate(target,()=>{proxyDue=true;})),
      home:e?[e[12],e[13],e[14]]:null,
    });
    remember(object,'unit',signature(object));
    dirty=true;totalsCache=null;unitsStale=true;
  }
  // Typical standing height of one instance, in world metres. Uses the world
  // Y row of (world x instance) so models authored lying down still count.
  function instanceHeight(mesh){
    const box=mesh.geometry?geometryBox(mesh.geometry):null;
    const array=mesh.instanceMatrix?.array,w=mesh.matrixWorld?.elements;
    const count=Math.min(mesh.count|0,array?Math.floor(array.length/16):0);
    if(!box||!w||count<1)return 0;
    const sx=box.max.x-box.min.x,sy=box.max.y-box.min.y,sz=box.max.z-box.min.z;
    const step=Math.max(1,Math.floor(count/24)),heights=[];
    for(let i=0;i<count;i+=step){
      const o=i*16;
      const row=c=>w[1]*array[o+c*4]+w[5]*array[o+c*4+1]+w[9]*array[o+c*4+2];
      heights.push(Math.abs(row(0))*sx+Math.abs(row(1))*sy+Math.abs(row(2))*sz);
    }
    heights.sort((a,b)=>a-b);
    return heights[heights.length>>1]||0;
  }
  function isFarScenery(mesh,print){
    if(!settings.farScenery||!mesh.isInstancedMesh||mesh.isSkinnedMesh||!(mesh.count>=1))return false;
    if(!(print.triangles>0)||print.triangles>farSceneryMaxTriangles)return false;
    return instanceHeight(mesh)>=farSceneryMeters;
  }
  function batchEligible(mesh){
    if(!mesh.isInstancedMesh||!(mesh.count>=2)||!mesh.parent)return false;
    if(mesh.isSkinnedMesh||mesh.morphTexture)return false;
    const array=mesh.instanceMatrix?.array;
    if(!array||array.length<mesh.count*16)return false;
    const attributes=mesh.geometry?.attributes||{};
    // Per-instance shader data is indexed by the original instance order.
    for(const key in attributes){
      const attribute=attributes[key];
      if(attribute?.isInstancedBufferAttribute||attribute?.isInstancedInterleavedBufferAttribute||
        attribute?.data?.isInstancedInterleavedBuffer)return false;
    }
    return true;
  }
  function instanceAreas(mesh){
    const e=mesh.matrixWorld?.elements,array=mesh.instanceMatrix.array;
    if(!e)return null;
    const lists=new Map();
    for(let i=0;i<mesh.count;i++){
      const o=i*16,x=array[o+12],y=array[o+13],z=array[o+14];
      const area=wolfveilAreaAtLocal(e[0]*x+e[4]*y+e[8]*z+e[12],
        e[2]*x+e[6]*y+e[10]*z+e[14]-offsetZ);
      if(!area)return null; // an unreadable instance: leave the batch whole
      if(!lists.has(area))lists.set(area,[]);
      lists.get(area).push(i);
    }
    return new Map([...lists].map(([area,list])=>[area,Uint32Array.from(list)]));
  }
  function syncCloneVisibility(record){
    for(const clone of record.clones.values())
      clone.visible=!exportDepth&&record.primed&&record.gate.intent;
  }
  function splitBatch(mesh){
    const lists=instanceAreas(mesh);
    if(!lists){remember(mesh,'shared',signature(mesh),'unreadable instances');return;}
    const record={
      // `primed` turns true once every loaded area has its copy; until then
      // the original batch keeps drawing so nothing blinks out.
      source:mesh,lists,clones:new Map(),primed:false,
      count:mesh.count,version:mesh.instanceMatrix.version|0,
      geometry:mesh.geometry,material:mesh.material,
      trianglesPerInstance:triangleCount(mesh.geometry),
      drawCalls:Array.isArray(mesh.material)?Math.max(1,mesh.material.length):1,
    };
    record.gate=installGate(mesh,()=>{proxyDue=true;syncCloneVisibility(record);});
    batches.set(mesh,record);
    remember(mesh,'batch',signature(mesh));
    dirty=true;totalsCache=null;
  }
  function buildClone(record,area){
    const source=record.source,indices=record.lists.get(area);
    if(!indices||record.clones.has(area)||!source.parent)return null;
    const clone=new source.constructor(source.geometry,source.material,indices.length);
    const from=source.instanceMatrix.array,to=clone.instanceMatrix.array;
    for(let i=0;i<indices.length;i++){
      const read=indices[i]*16,write=i*16;
      for(let k=0;k<16;k++)to[write+k]=from[read+k];
    }
    clone.instanceMatrix.needsUpdate=true;
    const colors=source.instanceColor;
    if(colors?.array){
      const size=colors.itemSize||3;
      const copy=new colors.array.constructor(indices.length*size);
      for(let i=0;i<indices.length;i++)for(let k=0;k<size;k++)
        copy[i*size+k]=colors.array[indices[i]*size+k];
      clone.instanceColor=new colors.constructor(copy,size);
      clone.instanceColor.needsUpdate=true;
    }
    clone.name='WV_Area_'+area+'_'+(source.name||'batch');
    clone.position.copy(source.position);
    clone.quaternion.copy(source.quaternion);
    clone.scale.copy(source.scale);
    if(source.matrixAutoUpdate===false){
      clone.matrixAutoUpdate=false;clone.matrix.copy(source.matrix);
    }
    clone.layers.mask=source.layers.mask;
    clone.renderOrder=source.renderOrder;
    clone.castShadow=source.castShadow;
    clone.receiveShadow=source.receiveShadow;
    clone.frustumCulled=source.frustumCulled;
    for(const key of ['onBeforeRender','onAfterRender','customDepthMaterial','customDistanceMaterial'])
      if(has(source,key))clone[key]=source[key];
    // The whole source batch stays in the scene for any raycast that used it;
    // a drawn copy must never become a second hit target.
    clone.raycast=noRaycast;
    clone.userData={...(source.userData||{}),wolfveilAreaClone:area,renderOnly:true};
    clone.visible=false; // shown by syncCloneVisibility once the batch is primed
    source.parent.add(clone);
    record.clones.set(area,clone);
    return clone;
  }
  function dropClone(record,area){
    const clone=record.clones.get(area);
    if(!clone)return;
    clone.parent?.remove(clone);
    // Frees the per-area instance buffer; geometry and material are shared
    // with the source batch and stay alive.
    clone.dispose?.();
    record.clones.delete(area);
  }
  function releaseBatch(mesh,state){
    const record=batches.get(mesh);
    if(!record)return;
    for(const area of [...record.clones.keys()])dropClone(record,area);
    record.gate.remove();
    batches.delete(mesh);totalsCache=null;
    if(state){remember(mesh,state,signature(mesh));
      if(state==='dynamic')dynamicNames.add(mesh.name||'(unnamed batch)');}
    else known.delete(mesh);
    dirty=true;
  }

  function consider(object,depth,floors,time){
    if(units.has(object)||batches.has(object))return;
    if(isExcluded(object,floors)){remember(object,'excluded','');return;}
    const seen=known.get(object);
    if(seen)seen.scan=scanId;
    if(seen?.state==='dynamic')return;
    const sig=signature(object);
    if(seen&&seen.signature===sig&&(seen.state==='shared'||seen.state==='excluded'))return;
    // Parts added since the last drawn frame have no world matrix yet. An
    // unchanged model relies on the renderer, which refreshes them each frame.
    if(!seen||seen.signature!==sig)object.updateWorldMatrix?.(true,true);
    const print=footprint(object);
    if(print.actor){
      // Animated characters are never managed. A container that merely holds
      // some (the town with its citizens) is searched for its static parts.
      const container=!object.isSkinnedMesh&&!object.isBone&&depth<maxDepth&&
        (object.children||[]).some(child=>!child.isBone&&!child.isSkinnedMesh);
      remember(object,container?'group':'excluded',sig);
      if(container)for(const child of [...object.children])
        if(!child.isBone&&!child.isSkinnedMesh)consider(child,depth+1,floors,time);
      return;
    }
    if(print.empty){remember(object,'shared',sig,'nothing to draw yet');return;}
    if(isFarScenery(object,print)){
      pending.delete(object);
      remember(object,'shared',sig,FAR_SCENERY);
      known.get(object).far={instances:object.count|0,triangles:Math.round(print.triangles)};
      return;
    }
    const areaOwnedTerrain=object.userData?.wolfveilAreaTerrain;
    const area=WOLFVEIL_AREA_IDS.includes(areaOwnedTerrain)
      ?areaOwnedTerrain
      :wolfveilAreaOfRect(print.minX,print.maxX,print.minZ-offsetZ,print.maxZ-offsetZ);
    // A skyline landmark is tall AND slender (a peak, a tower). A wide model
    // that merely follows sloping ground is ordinary scenery. Terrain chunks
    // carry an explicit owner because their cells follow grid lines at a
    // portal border and can straddle that mathematical line by one cell.
    const height=print.maxY-print.minY;
    const tall=height>=skylineMeters&&
      height>=.4*Math.max(print.maxX-print.minX,print.maxZ-print.minZ);
    if(area&&(!tall||WOLFVEIL_AREA_IDS.includes(areaOwnedTerrain))){
      pending.delete(object);
      // Async models fill in over several frames: wait until two scans agree.
      if(seen?.state==='settling'&&seen.signature===sig)makeUnit(object,area,print);
      else remember(object,'settling',sig);
      return;
    }
    if(object.isInstancedMesh){
      if(!batchEligible(object)){
        remember(object,'shared',sig,'per-instance shader data');return;
      }
      const wait=pending.get(object);
      const version=object.instanceMatrix.version|0;
      if(!wait||wait.version!==version||wait.count!==object.count){
        const changes=wait?wait.changes+1:0;
        if(changes>=3){
          pending.delete(object);dynamicNames.add(object.name||'(unnamed batch)');
          remember(object,'dynamic',sig);return;
        }
        pending.set(object,{since:time,version,count:object.count,changes});
        remember(object,'pending',sig);return;
      }
      if(time-wait.since>=settleSeconds*1000){pending.delete(object);splitBatch(object);}
      else remember(object,'pending',sig);
      return;
    }
    if(depth<maxDepth&&(object.children||[]).length){
      remember(object,'group',sig);
      for(const child of [...object.children])consider(child,depth+1,floors,time);
      return;
    }
    remember(object,'shared',sig,tall&&area?'skyline landmark':'spans several areas');
  }
  function scan(time){
    lastScan=time;scanId++;scanChanged=false;
    const floors=walkable();
    for(const child of [...world.group.children])consider(child,0,floors,time);
    for(const extra of extras)if(extra.parent)consider(extra,0,floors,time);
    // Streamed grass tiles and other short-lived objects come and go: drop
    // every record that was not seen in this scan so nothing is kept alive.
    for(const [object,entry] of known){
      if(entry.scan===scanId||units.has(object)||batches.has(object))continue;
      known.delete(object);pending.delete(object);
    }
    // While models are still arriving, look every `scanSeconds`; once several
    // scans in a row find nothing new, look three times less often.
    quietScans=scanChanged||pending.size?0:quietScans+1;
    if(scanChanged)proxyDue=true;
  }
  const scanInterval=()=>scanSeconds*1000*(quietScans>=5?3:1);
  // Anything that turned out to move, change or leave goes back to how its
  // owner built it. The loader never fights another system for an object.
  function audit(time){
    lastAudit=time;
    for(const [mesh,record] of [...batches]){
      if(!mesh.parent){releaseBatch(mesh,null);continue;}
      if(mesh.count!==record.count||(mesh.instanceMatrix?.version|0)!==record.version){
        releaseBatch(mesh,'dynamic');continue;
      }
      if(mesh.geometry!==record.geometry){releaseBatch(mesh,null);continue;}
      if(mesh.material!==record.material){
        record.material=mesh.material;
        for(const clone of record.clones.values())clone.material=mesh.material;
      }
    }
  }
  function auditUnit(object,unit){
    if(!object.parent){forgetUnit(object);known.delete(object);dirty=true;return;}
    const e=object.matrixWorld?.elements;
    if(unit.home&&e&&Math.hypot(e[12]-unit.home[0],e[13]-unit.home[1],e[14]-unit.home[2])>.5){
      // It moves, so it is not scenery: an area must never hide a thing
      // that can walk or ride out of it.
      forgetUnit(object);remember(object,'dynamic',signature(object));
      dynamicNames.add(object.name||'(unnamed object)');dirty=true;return;
    }
    const seen=known.get(object);
    if(seen&&seen.signature!==signature(object)){
      // The model gained or lost parts: measure it again on the next scan.
      forgetUnit(object);known.delete(object);dirty=true;quietScans=0;
    }
  }
  // A few units per frame, round and round, instead of all of them at once.
  function auditUnits(limit){
    if(auditCursor>=auditQueue.length){auditQueue=[...units.keys()];auditCursor=0;}
    const stop=Math.min(auditQueue.length,auditCursor+limit);
    for(;auditCursor<stop;auditCursor++){
      const object=auditQueue[auditCursor],unit=units.get(object);
      if(unit)auditUnit(object,unit);
    }
  }

  function desiredAreas(playerPosition){
    if(settings.mode==='all')return new Set(WOLFVEIL_AREA_IDS);
    if(settings.mode==='neighbors')
      return new Set([current,...WOLFVEIL_AREA_NEIGHBORS[current]]);
    return new Set(nearWolfveilAreas(playerPosition||{x:0,z:offsetZ},current,
      {zOffset:offsetZ,preloadMeters:settings.preloadMeters}));
  }
  const passive=()=>disabled||disposed||exportDepth>0;
  function applyUnits(){
    if(!unitsStale)return;
    unitsStale=false;
    const open=passive();
    for(const unit of units.values()){
      const show=open||loaded.has(unit.area);
      for(const gate of unit.gates)gate.setOpen(show);
    }
  }
  // Returns how many per-area batches are still waiting to be built.
  function applyBatches(budget){
    let waiting=0,remaining=budget;
    buildingAreas.clear();
    for(const record of batches.values()){
      if(disabled||disposed){
        for(const area of [...record.clones.keys()])dropClone(record,area);
        record.primed=false;record.gate.setOpen(true);continue;
      }
      let ready=true;
      for(const area of record.lists.keys()){
        if(!loaded.has(area)||record.clones.has(area))continue;
        if(remaining>0){buildClone(record,area);remaining--;}
        else{waiting++;ready=false;buildingAreas.add(area);}
      }
      if(ready)record.primed=true;
      record.gate.setOpen(exportDepth>0||!record.primed);
      syncCloneVisibility(record);
    }
    return waiting;
  }
  function dropUnloadedClones(){
    for(const record of batches.values())
      for(const area of [...record.clones.keys()])
        if(!loaded.has(area))dropClone(record,area);
  }

  // ---- GPU memory -------------------------------------------------------
  function ownResources(object,geometries,textures){
    if(object.geometry)geometries.add(object.geometry);
    const list=Array.isArray(object.material)?object.material:[object.material];
    for(const material of list){
      if(!material)continue;
      for(const key in material){
        const value=material[key];
        if(value?.isTexture)textures.add(value);
      }
      for(const key in material.uniforms||{}){
        const value=material.uniforms[key]?.value;
        if(value?.isTexture)textures.add(value);
      }
    }
  }
  const safeGeometry=geometry=>{
    if(!geometry?.dispose||geometry.boundsTree)return false;
    const attributes=geometry.attributes||{};
    for(const key in attributes){
      const attribute=attributes[key];
      // An upload callback usually frees the CPU copy: nothing to re-upload.
      if(!attribute?.array?.length&&!attribute?.data?.array?.length)return false;
      if(has(attribute,'onUploadCallback'))return false;
    }
    return true;
  };
  const safeTexture=texture=>{
    if(!texture?.dispose||texture.isRenderTargetTexture||texture.isVideoTexture||
      texture.isDepthTexture)return false;
    if(texture.isCompressedTexture)return Array.isArray(texture.mipmaps)&&texture.mipmaps.length>0;
    const image=texture.image;
    if(!image)return false;
    if(image.data)return true; // data textures keep their pixels
    return (image.videoWidth||image.naturalWidth||image.width||0)>0;
  };
  function releaseGpu(area){
    const hiddenTargets=new Set();
    const mine={geometries:new Set(),textures:new Set()};
    const collect=(node,sets)=>{
      ownResources(node,sets.geometries,sets.textures);
      for(const child of node.children||[])collect(child,sets);
    };
    for(const unit of units.values()){
      if(loaded.has(unit.area))continue;
      for(const target of unit.targets){
        hiddenTargets.add(target);
        if(unit.area===area)collect(target,mine);
      }
    }
    if(!mine.geometries.size&&!mine.textures.size){released.add(area);return;}
    const inUse={geometries:new Set(),textures:new Set()};
    const walk=node=>{
      if(hiddenTargets.has(node))return;
      ownResources(node,inUse.geometries,inUse.textures);
      for(const child of node.children||[])walk(child);
    };
    walk(sceneRoot());
    for(const geometry of mine.geometries){
      if(inUse.geometries.has(geometry)||!safeGeometry(geometry))continue;
      geometry.dispose();totals.releasedGeometries++;
    }
    for(const texture of mine.textures){
      if(inUse.textures.has(texture)||!safeTexture(texture))continue;
      texture.dispose();totals.releasedTextures++;
    }
    released.add(area);
  }
  function releaseIdleAreas(time){
    if(!settings.releaseGpuMemory||passive())return;
    for(const area of WOLFVEIL_AREA_IDS){
      if(loaded.has(area)||released.has(area))continue;
      const since=unloadedAt.get(area);
      if(since!==undefined&&time-since>=settings.releaseDelaySeconds*1000)releaseGpu(area);
    }
  }

  function setLoaded(next,time){
    let changed=false;
    for(const area of WOLFVEIL_AREA_IDS){
      const want=next.has(area);
      if(want===loaded.has(area))continue;
      changed=true;
      if(want){loaded.add(area);unloadedAt.delete(area);released.delete(area);}
      else{loaded.delete(area);unloadedAt.set(area,time);}
    }
    if(changed){statsStale=true;unitsStale=true;syncProxies();onAreasChanged([...loaded]);}
    return changed;
  }
  function refresh(playerPosition,time,{immediate=false}={}){
    const desired=passive()?new Set(WOLFVEIL_AREA_IDS):desiredAreas(playerPosition);
    // Load first, unload second: an area is only let go once every area that
    // should be on screen has all of its batches built.
    const growing=new Set([...loaded,...desired]);
    setLoaded(growing,time);
    applyUnits();
    const waiting=applyBatches(immediate?Infinity:Math.max(1,Number(settings.batchesPerFrame)||4));
    if(!waiting){
      if(setLoaded(desired,time))applyUnits();
      dropUnloadedClones();
    }
    if(waiting!==building){building=waiting;statsStale=true;}
    syncProxies();
    dirty=waiting>0;
  }

  function summary(){
    if(totalsCache)return totalsCache;
    const perArea=Object.fromEntries(WOLFVEIL_AREA_IDS.map(id=>[id,
      {units:0,unitTriangles:0,unitDrawCalls:0,instances:0,instanceTriangles:0,batches:0}]));
    for(const unit of units.values()){
      const entry=perArea[unit.area];
      entry.units++;entry.unitTriangles+=unit.triangles;entry.unitDrawCalls+=unit.drawCalls;
    }
    let sourceInstances=0;
    for(const record of batches.values()){
      sourceInstances+=record.count;
      for(const [area,indices] of record.lists){
        const entry=perArea[area];
        entry.batches++;entry.instances+=indices.length;
        entry.instanceTriangles+=indices.length*record.trianglesPerInstance;
      }
    }
    totalsCache={perArea,sourceInstances};
    return totalsCache;
  }
  function getStats(){
    const {perArea,sourceInstances}=summary();
    const areas=[...loaded];
    const sum=key=>areas.reduce((total,id)=>total+perArea[id][key],0);
    const all=key=>WOLFVEIL_AREA_IDS.reduce((total,id)=>total+perArea[id][key],0);
    const loadedInstances=sum('instances');
    const info=wolfveilAreaInfo(current);
    return {
      enabled:!disabled&&!disposed,mode:settings.mode,
      failed:failure?String(failure?.message||failure):null,
      area:current,areaLabel:info?.label||current,side:info?.side||null,
      loadedAreas:areas,
      units:{total:units.size,loaded:sum('units')},
      batches:{split:batches.size,settling:pending.size,dynamic:dynamicNames.size,building},
      farScenery:farSceneryTotals(),
      farOutline:{
        enabled:Boolean(farProxy)&&settings.farScenery&&!proxyFailure,
        failed:proxyFailure?String(proxyFailure.message||proxyFailure):null,
        shown:[...proxies].filter(([,proxy])=>proxy.object.visible!==false).map(([area])=>area),
        areas:Object.fromEntries([...proxies].map(([area,proxy])=>[area,{
          sources:proxy.sources,triangles:proxy.triangles,
          sourceTriangles:proxy.sourceTriangles,cellMeters:proxy.cellMeters}])),
      },
      triangles:{
        loaded:Math.round(sum('unitTriangles')+sum('instanceTriangles')),
        unloaded:Math.round(all('unitTriangles')+all('instanceTriangles')
          -sum('unitTriangles')-sum('instanceTriangles')),
      },
      drawCallsHidden:all('unitDrawCalls')-sum('unitDrawCalls'),
      gpuRelease:{enabled:settings.releaseGpuMemory,areas:[...released],
        geometries:totals.releasedGeometries,textures:totals.releasedTextures},
      collisionStreaming:false,terrainStreaming:'existing_meadow_tiles',
      // Field names kept from the four-region streamer's console readout.
      region:current,loadedRegions:areas,sourceBatches:batches.size,
      sourceInstances,loadedInstances,
      unloadedInstances:Math.max(0,sourceInstances-loadedInstances),
    };
  }
  // What ended up where: the checklist for the first in-game review.
  // ---- far outline -------------------------------------------------------
  const sourceIds=new WeakMap();let nextSourceId=1;
  const idOf=object=>{
    let id=sourceIds.get(object);
    if(!id){id=nextSourceId++;sourceIds.set(object,id);}
    return id;
  };
  // World Y extent of a plain mesh.
  function meshHeight(mesh){
    const box=mesh.geometry?geometryBox(mesh.geometry):null,e=mesh.matrixWorld?.elements;
    if(!box||!e)return 0;
    return Math.abs(e[1])*(box.max.x-box.min.x)+Math.abs(e[5])*(box.max.y-box.min.y)+
      Math.abs(e[9])*(box.max.z-box.min.z);
  }
  // Glass, water and glows have no outline. Leaves cut out of a texture do:
  // they are flagged transparent but drawn at full strength.
  function standsTall(mesh){
    const height=meshHeight(mesh);
    if(height>=farSceneryMeters)return true;
    if(typeof groundHeightAt!=='function'||!(height>0))return false;
    const box=geometryBox(mesh.geometry),e=mesh.matrixWorld.elements;
    const x=(box.min.x+box.max.x)/2,y=(box.min.y+box.max.y)/2,z=(box.min.z+box.max.z)/2;
    const ground=groundHeightAt(e[0]*x+e[4]*y+e[8]*z+e[12],e[2]*x+e[6]*y+e[10]*z+e[14]);
    const top=e[1]*x+e[5]*y+e[9]*z+e[13]+height/2;
    return Number.isFinite(ground)&&top-ground>=farOutlineReachMeters;
  }
  const solid=mesh=>{
    const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    return Boolean(material)&&material.visible!==false&&material.depthWrite!==false&&
      !(Number(material.opacity??1)<1);
  };
  function worldInstance(mesh,i){ // matrixWorld x instanceMatrix[i]
    const w=mesh.matrixWorld.elements,a=mesh.instanceMatrix.array,o=i*16,out=new Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)
      out[c*4+r]=w[r]*a[o+c*4]+w[4+r]*a[o+c*4+1]+w[8+r]*a[o+c*4+2]+w[12+r]*a[o+c*4+3];
    return out;
  }
  // Everything tall that is unloaded together with its area, per area.
  function tallSources(){
    const byArea=new Map(WOLFVEIL_AREA_IDS.map(id=>[id,[]]));
    for(const unit of units.values()){
      const gates=new Map(unit.targets.map((target,i)=>[target,unit.gates[i]]));
      const wanted=node=>{ // the owner's own visibility, from the part up to the unit
        for(let at=node;at;at=at.parent){
          const gate=gates.get(at);
          if(gate?!gate.intent:at.visible===false)return false;
          if(at===unit.object)break;
        }
        return true;
      };
      const list=byArea.get(unit.area);
      for(const leaf of footprint(unit.object).leaves){
        if(!leaf.isMesh||leaf.isSkinnedMesh||leaf.layers?.mask===0||!solid(leaf)||!wanted(leaf))continue;
        if(leaf.isInstancedMesh){
          if(instanceHeight(leaf)<farSceneryMeters)continue;
          const count=Math.min(leaf.count|0,Math.floor(leaf.instanceMatrix.array.length/16));
          list.push({mesh:leaf,matrices:Array.from({length:count},(_,i)=>worldInstance(leaf,i)),
            stamp:idOf(leaf)+':'+count+':'+(leaf.instanceMatrix.version|0)});
        }else if(standsTall(leaf))
          list.push({mesh:leaf,matrices:[[...leaf.matrixWorld.elements]],
            stamp:idOf(leaf)+':'+idOf(leaf.geometry)});
      }
    }
    for(const record of batches.values()){
      const mesh=record.source;
      if(!record.gate.intent||!solid(mesh)||instanceHeight(mesh)<farSceneryMeters)continue;
      for(const [area,indices] of record.lists)if(indices.length)
        byArea.get(area).push({mesh,matrices:Array.from(indices,i=>worldInstance(mesh,i)),
          stamp:idOf(mesh)+':'+indices.length+':'+record.version});
    }
    return byArea;
  }
  function dropProxy(area){
    const proxy=proxies.get(area);
    if(!proxy)return;
    proxies.delete(area);statsStale=true;
    try{farProxy?.dispose?.(proxy.object);}catch{/* already gone */}
  }
  function dropProxies(){for(const area of [...proxies.keys()])dropProxy(area);proxyQueue=[];}
  // An outline shows while its area is unloaded, and for the few frames in
  // which a just-loaded area is still building its real scenery.
  function syncProxies(){
    const off=passive()||!settings.farScenery;
    for(const [area,proxy] of proxies){
      const show=!off&&(!loaded.has(area)||buildingAreas.has(area));
      if(proxy.object.visible!==show){proxy.object.visible=show;statsStale=true;}
    }
  }
  // Re-plans when the scenery changed, then bakes at most one area per frame.
  function advanceProxies(time){
    if(!farProxy||proxyFailure||!settings.farScenery||passive())return;
    try{
      // Parts hidden deep inside a model do not announce themselves: look
      // again every half minute.
      if(time-proxyAt>=30000)proxyDue=true;
      if(proxyDue&&!pending.size&&time-proxyAt>=farProxySeconds*1000){
        proxyDue=false;proxyAt=time;proxyQueue=[];
        for(const [area,sources] of tallSources()){
          const signature=sources.map(source=>source.stamp).join(',');
          if(proxies.get(area)?.signature===signature)continue;
          if(!sources.length){dropProxy(area);continue;}
          proxyQueue.push({area,sources,signature});
        }
      }
      const job=proxyQueue.shift();
      if(!job)return;
      dropProxy(job.area);
      const built=farProxy.build(job.area,job.sources);
      if(built?.object){
        proxies.set(job.area,{...built,signature:job.signature,sources:job.sources.length});
        statsStale=true;syncProxies();
      }
    }catch(error){
      // Outlines are decoration: lose them, keep the loader.
      proxyFailure=error||Error('unknown');
      try{dropProxies();}catch{/* nothing left to drop */}
      globalThis.console?.warn?.('Wolfveil far outline switched itself off:',proxyFailure);
    }
  }
  function farSceneryTotals(){
    const out={enabled:settings.farScenery,batches:0,instances:0,triangles:0};
    for(const [object,entry] of known){
      if(entry.reason!==FAR_SCENERY||!entry.far||!object.parent)continue;
      out.batches++;out.instances+=entry.far.instances;out.triangles+=entry.far.triangles;
    }
    return out;
  }
  function getReport(){
    const {perArea}=summary();
    const shared=[];
    for(const [object,entry] of known){
      if(entry.state!=='shared'||!object.parent)continue;
      const print=footprint(object);
      if(print.empty)continue;
      shared.push({name:object.name||'(unnamed)',triangles:Math.round(print.triangles),
        drawCalls:print.drawCalls,reason:entry.reason||'spans several areas'});
    }
    shared.sort((a,b)=>b.triangles-a.triangles);
    return {
      area:current,mode:settings.mode,loadedAreas:[...loaded],
      areas:Object.fromEntries(WOLFVEIL_AREA_IDS.map(id=>[id,{
        ...perArea[id],
        triangles:Math.round(perArea[id].unitTriangles+perArea[id].instanceTriangles),
      }])),
      alwaysLoaded:{objects:shared.length,
        triangles:shared.reduce((total,entry)=>total+entry.triangles,0),
        drawCalls:shared.reduce((total,entry)=>total+entry.drawCalls,0),
        largest:shared.slice(0,20)},
      leftToOwner:[...dynamicNames].sort(),
    };
  }

  // Fail open. If the real scene holds something this loader did not expect,
  // it switches itself off, draws the whole valley exactly as it was built
  // and stays out of the way. A loading aid must never stop the game.
  function failOpen(error){
    failure=error||Error('unknown');
    try{
      disabled=true;unitsStale=true;
      setLoaded(new Set(WOLFVEIL_AREA_IDS),now());applyUnits();applyBatches(0);
    }catch{/* hand back whatever can still be handed back */
      for(const unit of units.values())for(const gate of unit.gates)gate.setOpen(true);
      for(const record of batches.values())record.gate.setOpen(true);
    }
    statsStale=true;
    try{dropProxies();}catch{/* outlines are decoration */}
    globalThis.console?.warn?.('Wolfveil area loader switched itself off:',failure);
  }
  function update(playerPosition,options={}){
    if(disposed||failure){
      if(!lastStats||statsStale){lastStats=getStats();statsStale=false;}
      return lastStats;
    }
    try{return advance(playerPosition,options);}
    catch(error){failOpen(error);lastStats=getStats();onStats(lastStats);return lastStats;}
  }
  function advance(playerPosition,{paused=false}={}){
    const time=now();
    if(time-lastScan>=scanInterval())scan(time);
    if(time-lastAudit>=auditSeconds*1000)audit(time);
    auditUnits(unitAuditsPerFrame);
    if(!paused)advanceProxies(time);
    // The area follows the player even while the loader is switched off, so
    // notices keep working and switching back on needs no catch-up frame.
    if(playerPosition&&!exportDepth){
      const next=stableWolfveilArea(playerPosition,current,
        {zOffset:offsetZ,hysteresisMeters:settings.hysteresisMeters});
      const crossing=lastPosition&&crossedWolfveilAreaPortal(lastPosition,playerPosition,
        portals,{zOffset:offsetZ});
      if(crossing)pendingPortal={...crossing,
        at:{x:Number(playerPosition.x),z:Number(playerPosition.z)}};
      if(pendingPortal&&Math.hypot(Number(playerPosition.x)-pendingPortal.at.x,
        Number(playerPosition.z)-pendingPortal.at.z)>36)pendingPortal=null;
      lastPosition={x:Number(playerPosition.x),z:Number(playerPosition.z)};
      if(next&&next!==current){
        const previous=current;current=next;
        // No empty frame after a sprint, mount or workflow teleport.
        refresh(playerPosition,time,{immediate:true});
        const gate=crossing||pendingPortal;
        const info=wolfveilAreaInfo(next);
        if(!paused)onTransition({
          from:previous,to:next,label:info?.label||next,side:info?.side||null,
          detail:info?.description||null,
          gateway:gate?.id||null,gatewayLabel:gate?.portal?.pathLabel||gate?.label||null,
        });
        pendingPortal=null;statsStale=true;
      }
    }
    const want=passive()?null:desiredAreas(playerPosition);
    const settled=!want||(want.size===loaded.size&&[...want].every(id=>loaded.has(id)));
    if(dirty||!settled)refresh(playerPosition,time);
    releaseIdleAreas(time);
    // Totals walk every record, so publish twice a second, not every frame.
    if(!lastStats||statsStale||time-lastStatsAt>=500){
      lastStats=getStats();lastStatsAt=time;statsStale=false;onStats(lastStats);
    }
    return lastStats;
  }
  async function withFullMapExport(task){
    if(disposed||typeof task!=='function')throw Error('Cannot export a disposed area loader');
    exportDepth++;
    if(exportDepth===1){unitsStale=true;applyUnits();applyBatches(0);syncProxies();}
    try{return await task();}
    finally{
      exportDepth--;
      if(!exportDepth&&!disposed){unitsStale=true;applyUnits();applyBatches(Infinity);dirty=true;}
      syncProxies();
    }
  }
  // In-game A/B switch: off draws the whole valley exactly as it was built.
  function setEnabled(enabled){
    if(disposed||exportDepth||failure)return false;
    const next=Boolean(enabled);
    if(next===!disabled)return true;
    disabled=!next;unitsStale=true;
    const time=now();
    if(disabled){setLoaded(new Set(WOLFVEIL_AREA_IDS),time);applyUnits();applyBatches(0);}
    else refresh(lastPosition,time,{immediate:true});
    onStats(getStats());
    return true;
  }
  function setMode(next){
    if(!WOLFVEIL_AREA_LOADING_MODES.includes(next)||disposed)return false;
    if(settings.mode!==next){settings.mode=next;dirty=true;}
    return true;
  }
  function setOptions(options={}){
    if(Number.isFinite(options.preloadMeters)&&options.preloadMeters>=0)
      settings.preloadMeters=options.preloadMeters;
    if(typeof options.releaseGpuMemory==='boolean')
      settings.releaseGpuMemory=options.releaseGpuMemory;
    if(Number.isFinite(options.releaseDelaySeconds)&&options.releaseDelaySeconds>=0)
      settings.releaseDelaySeconds=options.releaseDelaySeconds;
    if(typeof options.farScenery==='boolean'&&options.farScenery!==settings.farScenery){
      settings.farScenery=options.farScenery;
      // Classify the instanced scenery afresh under the new rule.
      if(settings.farScenery){
        for(const mesh of [...batches.keys()])
          if(isFarScenery(mesh,footprint(mesh)))releaseBatch(mesh,null);
        for(const object of [...units.keys()])
          if(isFarScenery(object,footprint(object))){forgetUnit(object);known.delete(object);}
      }else{
        for(const [object,entry] of [...known])
          if(entry.reason===FAR_SCENERY)known.delete(object);
        dropProxies();
      }
      totalsCache=null;statsStale=true;lastScan=-Infinity;proxyDue=true;
    }
    if(options.mode)setMode(options.mode);
    dirty=true;
    return {...settings};
  }
  function addUnits(list=[]){
    for(const object of list)if(object)extras.add(object);
    lastScan=-Infinity;
  }
  function dispose(){
    if(disposed)return;
    disposed=true;
    try{dropProxies();}catch{/* outlines are decoration */}
    for(const mesh of [...batches.keys()])releaseBatch(mesh,null);
    for(const object of [...units.keys()])forgetUnit(object);
    pending.clear();known.clear();extras.clear();
  }

  // Read-only snapshot of what is managed, for diagnostics and tests.
  function inspect(){
    return {
      units:[...units.values()].map(unit=>({object:unit.object,area:unit.area,
        targets:[...unit.targets],open:unit.gates.every(gate=>gate.open),
        triangles:unit.triangles,drawCalls:unit.drawCalls})),
      batches:[...batches.values()].map(record=>({source:record.source,
        count:record.count,primed:record.primed,
        areas:Object.fromEntries([...record.lists].map(([area,list])=>[area,list.length])),
        clones:Object.fromEntries(record.clones)})),
      settling:[...pending.keys()],
    };
  }
  try{scan(now());refresh(position,now(),{immediate:true});}
  catch(error){failOpen(error);}
  return {
    update,getStats,getReport,withFullMapExport,setEnabled,setMode,setOptions,
    addUnits,dispose,inspect,
    rescan(){lastScan=-Infinity;},
    getArea:()=>current,getRegion:()=>current,
    getPortals:()=>portals,getGateways:()=>portals,
    getOptions:()=>({...settings}),
  };
}
