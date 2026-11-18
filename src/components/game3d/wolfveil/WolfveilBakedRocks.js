// Game 3D baked rock field (2026-11-16 landscaping, round 2).
//
// One GLB (tools/landscape-bake/bake_rocks.py) holds six rock variants, each
// sculpted at 327,680 triangles and baked (normal, colour, AO) onto a
// ~900-triangle game mesh with 270- and 76-triangle LODs sharing one atlas.
// Every decorative valley rock (trail stones, wayfinding stones, washed-out
// rubble, mountain outcrops) becomes an instance of those meshes.
//
// Draw calls stay fixed: one InstancedMesh per variant per LOD (<= 18). A few
// times a second (whenever the player has moved a few metres) instances are
// re-bucketed into LODs by distance. Decorative only: no raycasts, colliders
// or walkable floors; the old procedural stones stay as the fallback until
// the GLB has loaded (and if it ever fails to).
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {planWolfveilRangeOutcrops} from './WolfveilRangeOutcrops.mjs';
import {planWolfveilTrailBreakLandscape} from './WolfveilTrailBreakLandscape.mjs';
import {wolfveilMountainness} from './WolfveilLandscapeDesign.mjs';

export const WOLFVEIL_BAKED_ROCKS=Object.freeze({
  url:'/game3d/landscape/wv_rocks.glb',
  variants:Object.freeze(['boulder','flat','block','standing','slab','rubble']),
  // LOD0 within 55 m, LOD1 within 160 m, LOD2 beyond.
  lodDistances:Object.freeze([55,160]),
  // Pebble-sized stones never need the 900-triangle LOD.
  smallStone:.35,
  // Draw distance for pebbles (< smallStone) and stones (< 1.2 m half-extent).
  drawDistance:Object.freeze([140,320]),
  refreshMeters:4,
});

const KIND_VARIANTS=Object.freeze({
  standing:['standing'],cairn:['flat','boulder'],gate:['block','boulder','standing'],
  rubble:['rubble','flat','slab'],river:['boulder','flat','rubble'],
  trail:['boulder','rubble','flat','block'],outcrop:['slab','block','boulder','rubble'],
  scree:['rubble','flat','slab'],
});

/** Deterministic variant for the i-th rock of a kind. */
export function wolfveilRockVariant(kind,i){
  const list=KIND_VARIANTS[kind]||KIND_VARIANTS.rubble;
  return list[(Math.imul(i+1,2654435761)>>>0)%list.length];
}

/**
 * Normalises one baked LOD so placements keep the old unit-stone meaning:
 * x/z span [-1,1], the flattened base sits at y=0 and the height is 2, so
 * scale (sx,sy,sz) = half-extents in metres and position.y = ground - sink.
 */
export function normaliseWolfveilRockGeometry(geometry){
  const g=geometry.clone();
  g.computeBoundingBox();
  const b=g.boundingBox;
  g.translate(-(b.max.x+b.min.x)/2,-b.min.y,-(b.max.z+b.min.z)/2);
  g.scale(2/Math.max(1e-6,b.max.x-b.min.x),2/Math.max(1e-6,b.max.y-b.min.y),2/Math.max(1e-6,b.max.z-b.min.z));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const _euler=new THREE.Euler(),_quat=new THREE.Quaternion(),_pos=new THREE.Vector3(),_scl=new THREE.Vector3();
const FOOT=[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1],[0,0]];
/**
 * Instance matrix for a placement {x,z,yaw,sx,sy,sz,sink,tiltX?,tiltZ?}.
 * The base rests on the LOWEST ground under its footprint (no floating
 * downhill edge); stacked stones (sink < 0) use the centre height.
 */
export function wolfveilRockMatrix(p,heightAt,out=new THREE.Matrix4()){
  let ground=heightAt(p.x,p.z);
  if(p.sink>=0&&p.grounding!=='center'){
    const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
    for(const [u,v] of FOOT){
      const lx=u*p.sx*.8,lz=v*p.sz*.8;
      const h=heightAt(p.x+lx*c+lz*s,p.z-lx*s+lz*c);
      if(Number.isFinite(h)&&h<ground)ground=h;
    }
  }
  _euler.set(p.tiltX||0,p.yaw||0,p.tiltZ||0,'YXZ');
  _quat.setFromEuler(_euler);
  _pos.set(p.x,ground-(p.sink||0),p.z);
  _scl.set(p.sx,p.sy,p.sz);
  return out.compose(_pos,_quat,_scl);
}

/**
 * placements: [{x,z,yaw,sx,sy,sz,sink,kind,tint?:[r,g,b],tiltX?,tiltZ?}]
 * in the Wolfveil group's local metres. Returns a controller; call
 * update(localX, localZ) with the player position every frame.
 */
export function createWolfveilBakedRockField(world,placements,{heightAt,url=WOLFVEIL_BAKED_ROCKS.url,
  loader=null,onReady=null,onError=null,castShadow=true}={}){
  if(typeof heightAt!=='function')throw new TypeError('heightAt sampler required');
  const R=WOLFVEIL_BAKED_ROCKS,V=R.variants;
  const count=placements.length;
  const matrices=new Float32Array(count*16),colors=new Float32Array(count*3);
  const variant=new Uint8Array(count),bias=new Uint8Array(count),xz=new Float32Array(count*2);
  // Size-based draw distance: pebbles vanish (sub-pixel) past 140 m, stones
  // past 320 m; boulders and range outcrops always draw.
  const reach=new Float32Array(count);
  const perVariant=new Array(V.length).fill(0);
  const m=new THREE.Matrix4(),kindIndex={};
  placements.forEach((p,i)=>{
    const k=kindIndex[p.kind]=(kindIndex[p.kind]??-1)+1;
    const v=Math.max(0,V.indexOf(p.variant||wolfveilRockVariant(p.kind,k)));
    variant[i]=v;perVariant[v]++;
    const extent=Math.max(p.sx,p.sy,p.sz);
    bias[i]=extent<R.smallStone?1:0;
    reach[i]=extent<R.smallStone?R.drawDistance[0]:extent<1.2?R.drawDistance[1]:Infinity;
    wolfveilRockMatrix(p,heightAt,m).toArray(matrices,i*16);
    const t=p.tint||[1,1,1];
    colors[i*3]=t[0];colors[i*3+1]=t[1];colors[i*3+2]=t[2];
    xz[i*2]=p.x;xz[i*2+1]=p.z;
  });
  const group=new THREE.Group();
  group.name='SWV_BakedRockField';
  group.visible=false;
  group.userData={decorativeOnly:true,nonCollider:true,bakedRocks:true};
  world.group.add(group);
  const state={ready:false,failed:false,meshes:null,lastX:NaN,lastZ:NaN,disposed:false,
    owned:[],lodCounts:[0,0,0]};

  function refresh(px,pz){
    if(!state.meshes)return;
    const [d0,d1]=R.lodDistances,fill=state.meshes.map(l=>l.map(()=>0));
    const lodCounts=[0,0,0];
    for(let i=0;i<count;i++){
      const dx=xz[i*2]-px,dz=xz[i*2+1]-pz,d=Math.hypot(dx,dz);
      if(d>reach[i])continue;
      let lod=d<d0?0:d<d1?1:2;
      if(bias[i]&&lod<2)lod=d<d0*.55?1:2;
      const v=variant[i],mesh=state.meshes[v][lod],n=fill[v][lod]++;
      mesh.instanceMatrix.array.set(matrices.subarray(i*16,i*16+16),n*16);
      mesh.instanceColor.array.set(colors.subarray(i*3,i*3+3),n*3);
      lodCounts[lod]++;
    }
    state.meshes.forEach((lods,v)=>lods.forEach((mesh,lod)=>{
      mesh.count=fill[v][lod];
      mesh.instanceMatrix.needsUpdate=true;
      mesh.instanceColor.needsUpdate=true;
    }));
    state.lodCounts=lodCounts;
    state.lastX=px;state.lastZ=pz;
  }

  // Existing rock meshes whose raycasting must stay exactly as it is (e.g.
  // the gorge boulders): a baked twin draws at the same transforms and the
  // original keeps raycasting while writing no colour or depth.
  const adopted=[];
  function twin(entry){
    if(!state.meshes||entry.twin)return;
    const {mesh,variant,tint}=entry;
    const v=Math.max(0,V.indexOf(variant));
    const source=state.meshes[v][1].geometry;
    const centred=source.clone().translate(0,-1,0); // [0,2] -> [-1,1], like a unit solid
    state.owned.push(centred);
    const t=new THREE.InstancedMesh(centred,state.meshes[v][1].material,mesh.count);
    const m=new THREE.Matrix4(),c=new THREE.Color(tint[0],tint[1],tint[2]);
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);t.setMatrixAt(i,m);t.setColorAt(i,c);}
    t.instanceMatrix.needsUpdate=true;t.instanceColor.needsUpdate=true;
    t.name=mesh.name+'_BakedTwin';
    t.frustumCulled=false;t.receiveShadow=true;
    t.raycast=()=>{};
    t.userData={decorativeOnly:true,nonCollider:true,bakedTwinOf:mesh.name};
    mesh.parent?.add(t);
    entry.saved={colorWrite:mesh.material.colorWrite,depthWrite:mesh.material.depthWrite};
    mesh.material.colorWrite=false;mesh.material.depthWrite=false;
    entry.twin=t;
  }

  const gltfLoader=loader||(typeof document!=='undefined'?new GLTFLoader():null);
  if(gltfLoader&&count){
    gltfLoader.load(url,gltf=>{
      if(state.disposed)return;
      let material=null;
      const meshes=V.map(name=>[0,1,2].map(lod=>{
        const node=gltf.scene.getObjectByName(`wv_rock_${name}_LOD${lod}`);
        if(!node?.isMesh)throw Error(`wv_rocks.glb is missing wv_rock_${name}_LOD${lod}`);
        material??=node.material;
        const geometry=normaliseWolfveilRockGeometry(node.geometry);
        state.owned.push(geometry);
        const mesh=new THREE.InstancedMesh(geometry,material,Math.max(1,perVariant[V.indexOf(name)]));
        mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(mesh.count*3),3);
        mesh.count=0;
        mesh.name=`SWV_BakedRock_${name}_LOD${lod}`;
        mesh.frustumCulled=false;
        mesh.castShadow=castShadow&&lod===0;
        mesh.receiveShadow=true;
        mesh.raycast=()=>{};
        mesh.userData={decorativeOnly:true,nonCollider:true,bakedRock:name,lod};
        group.add(mesh);
        return mesh;
      }));
      material.name='SWV_BakedRockAtlas';
      state.owned.push(material);
      for(const key of ['map','normalMap'])if(material[key]){
        material[key].anisotropy=8;state.owned.push(material[key]);
      }
      state.meshes=meshes;
      state.ready=true;
      group.visible=true;
      for(const entry of adopted)twin(entry);
      refresh(Number.isFinite(state.lastX)?state.lastX:0,Number.isFinite(state.lastZ)?state.lastZ:0);
      onReady?.({count,perVariant:Object.fromEntries(V.map((v,i)=>[v,perVariant[i]]))});
    },undefined,error=>{
      if(state.disposed)return;
      state.failed=true;
      onError?.(error);
    });
  }

  return {
    group,count,
    get ready(){return state.ready;},
    get failed(){return state.failed;},
    get lodCounts(){return state.lodCounts.slice();},
    /** Draw a baked twin of an existing rock InstancedMesh (see twin()). */
    adopt(mesh,{variant='boulder',tint=[.55,.56,.57]}={}){
      if(!mesh?.isInstancedMesh)return false;
      const entry={mesh,variant,tint,twin:null};
      adopted.push(entry);
      twin(entry);
      return true;
    },
    update(px,pz){
      if(!Number.isFinite(px)||!Number.isFinite(pz))return;
      if(!state.ready){state.lastX=px;state.lastZ=pz;return;}
      if(Math.hypot(px-state.lastX,pz-state.lastZ)>=R.refreshMeters)refresh(px,pz);
    },
    dispose(){
      state.disposed=true;
      group.removeFromParent();
      for(const entry of adopted)if(entry.twin){
        entry.twin.removeFromParent();
        Object.assign(entry.mesh.material,entry.saved);
      }
      for(const o of state.owned)o.dispose?.();
      state.owned.length=0;
    },
  };
}

// Neutral-ish tints over the baked albedo (it already carries colour + AO).
const WAYFINDING_TINT=Object.freeze({standing:[1,1,.98],cairn:[1.02,1,.97],gate:[.86,.85,.83],
  rubble:[.8,.78,.75],river:[.72,.75,.74]});

/**
 * All decorative valley rocks as one baked field: wayfinding stones
 * (WolfveilLandscapeMarkers), trail-shoulder / washed-out / wild-ground
 * stones (WolfveilTrailLandscaping) and range outcrops. The procedural
 * stones are hidden only once the GLB is ready.
 */
export function installWolfveilBakedRockField(world,{trailLandscaping=null,landscapeMarkers=null,
  livingLandscape=null,heightAt,loader=null,outcrops=true,trailBreaks=false,onReady=null,onError=null}={}){
  const placements=[];
  for(const p of landscapeMarkers?.plan??[])
    placements.push({...p,tint:WAYFINDING_TINT[p.kind]||WAYFINDING_TINT.rubble});
  // Chiselled 20-triangle stones (trail shoulders, washed-out stretches, wild
  // ground, wet riverbank): same footprint, now a baked rock.
  const chiselled=(r,kind,base,spread)=>{
    // On the ranges, stones take the weathered cliff tone instead of reading
    // as light granite dots against the darker rock faces.
    const m=Math.max(0,Math.min(1,(wolfveilMountainness(r.x,r.z)-.2)/.4));
    const t=(base+spread*r.tone)*(1-.28*m),moss=r.moss||0;
    placements.push({x:r.x,z:r.z,yaw:r.yaw,tiltX:r.tilt*.5,tiltZ:r.tilt*.3,
      sx:r.size*r.stretch,sy:r.size*r.squash*.72,sz:r.size,sink:r.size*r.squash*.5,kind,
      tint:[t*(1-moss*.18),t*(1-moss*.05),t*(1-moss*.3)]});
  };
  for(const r of trailLandscaping?.rockPlan??[])chiselled(r,'trail',.86,.18);
  for(const r of livingLandscape?.bankStonePlan??[])chiselled(r,'river',.66,.14);
  const outcropPlan=outcrops?planWolfveilRangeOutcrops({heightAt}):[];
  placements.push(...outcropPlan);
  // Stepping stones, washout boulders and scree where a trail is broken.
  const breakPlan=trailBreaks?planWolfveilTrailBreakLandscape():[];
  placements.push(...breakPlan);
  const fallback=[...(trailLandscaping?.rockMeshes??[]),...(livingLandscape?.bankStoneMeshes??[]),
    ...(landscapeMarkers?.mesh?[landscapeMarkers.mesh]:[])];
  const field=createWolfveilBakedRockField(world,placements,{heightAt,loader,onError,
    onReady(detail){
      for(const mesh of fallback)mesh.visible=false;
      onReady?.({...detail,outcrops:outcropPlan.length});
    }});
  field.outcrops=outcropPlan.length;
  field.breakRocks=breakPlan.length;
  return field;
}
