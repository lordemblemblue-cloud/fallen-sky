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
 * adopt(mesh) folds an existing rock InstancedMesh into the field (same
 * transforms, optionally its own per-instance tints); setFilter(fn) limits
 * drawing to instances where fn(x, z) is true (e.g. the loaded region).
 */
export function createWolfveilBakedRockField(world,placements,{heightAt,url=WOLFVEIL_BAKED_ROCKS.url,
  loader=null,onReady=null,onError=null,castShadow=true}={}){
  if(typeof heightAt!=='function')throw new TypeError('heightAt sampler required');
  const R=WOLFVEIL_BAKED_ROCKS,V=R.variants;
  // Growable instance store: adopted meshes join after construction.
  const store={matrix:[],color:[],variant:[],bias:[],reach:[],x:[],z:[]};
  const perVariant=new Array(V.length).fill(0);
  // Size-based draw distance: pebbles vanish (sub-pixel) past 140 m, stones
  // past 320 m; boulders and range outcrops always draw.
  function push(matrix,tint,v,extent,x,z){
    store.matrix.push(matrix);
    store.color.push(Float32Array.of(tint[0],tint[1],tint[2]));
    store.variant.push(v);perVariant[v]++;
    store.bias.push(extent<R.smallStone);
    store.reach.push(extent<R.smallStone?R.drawDistance[0]:extent<1.2?R.drawDistance[1]:Infinity);
    store.x.push(x);store.z.push(z);
  }
  const m=new THREE.Matrix4(),kindIndex={};
  for(const p of placements){
    const k=kindIndex[p.kind]=(kindIndex[p.kind]??-1)+1;
    const v=Math.max(0,V.indexOf(p.variant||wolfveilRockVariant(p.kind,k)));
    push(wolfveilRockMatrix(p,heightAt,m).toArray(new Float32Array(16)),p.tint||[1,1,1],v,
      Math.max(p.sx,p.sy,p.sz),p.x,p.z);
  }
  const group=new THREE.Group();
  group.name='SWV_BakedRockField';
  group.visible=false;
  group.userData={decorativeOnly:true,nonCollider:true,bakedRocks:true};
  world.group.add(group);
  const state={ready:false,failed:false,meshes:null,geometries:null,material:null,
    lastX:NaN,lastZ:NaN,disposed:false,owned:[],lodCounts:[0,0,0],filter:null};
  const adopted=[];

  function makeMesh(v,lod,capacity){
    const name=V[v];
    const mesh=new THREE.InstancedMesh(state.geometries[v][lod],state.material,Math.max(1,capacity));
    mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1,capacity)*3),3);
    mesh.count=0;
    mesh.name=`SWV_BakedRock_${name}_LOD${lod}`;
    mesh.frustumCulled=false;
    mesh.castShadow=castShadow&&lod===0;
    mesh.receiveShadow=true;
    mesh.raycast=()=>{};
    mesh.userData={decorativeOnly:true,nonCollider:true,bakedRock:name,lod};
    group.add(mesh);
    return mesh;
  }
  function ensureCapacity(){
    if(!state.meshes)return;
    state.meshes.forEach((lods,v)=>lods.forEach((mesh,lod)=>{
      if(mesh.instanceMatrix.count>=perVariant[v])return;
      group.remove(mesh);mesh.dispose();
      lods[lod]=makeMesh(v,lod,perVariant[v]);
    }));
  }
  function refresh(px,pz){
    if(!state.meshes)return;
    const [d0,d1]=R.lodDistances,fill=state.meshes.map(l=>l.map(()=>0));
    const lodCounts=[0,0,0],filter=state.filter;
    for(let i=0;i<store.x.length;i++){
      const x=store.x[i],z=store.z[i],d=Math.hypot(x-px,z-pz);
      if(d>store.reach[i]||(filter&&!filter(x,z)))continue;
      let lod=d<d0?0:d<d1?1:2;
      if(store.bias[i]&&lod<2)lod=d<d0*.55?1:2;
      const v=store.variant[i],mesh=state.meshes[v][lod],n=fill[v][lod]++;
      mesh.instanceMatrix.array.set(store.matrix[i],n*16);
      mesh.instanceColor.array.set(store.color[i],n*3);
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
  // An adopted mesh stops drawing once its baked copies are live. Meshes
  // whose raycasts matter keep raycasting through an invisible material
  // CLONE (shared materials are never mutated); decorative ones just hide.
  function retire(entry){
    if(entry.saved)return;
    const mesh=entry.mesh;
    if(entry.keepRaycast){
      entry.saved={material:mesh.material};
      const mat=mesh.material.clone();
      mat.colorWrite=false;mat.depthWrite=false;
      mesh.material=mat;
      state.owned.push(mat);
    }else{
      entry.saved={visible:mesh.visible};
      mesh.visible=false;
    }
  }
  function again(){
    refresh(Number.isFinite(state.lastX)?state.lastX:0,Number.isFinite(state.lastZ)?state.lastZ:0);
  }

  const gltfLoader=loader||(typeof document!=='undefined'?new GLTFLoader():null);
  if(gltfLoader){
    gltfLoader.load(url,gltf=>{
      if(state.disposed)return;
      state.geometries=V.map(name=>[0,1,2].map(lod=>{
        const node=gltf.scene.getObjectByName(`wv_rock_${name}_LOD${lod}`);
        if(!node?.isMesh)throw Error(`wv_rocks.glb is missing wv_rock_${name}_LOD${lod}`);
        state.material??=node.material;
        const geometry=normaliseWolfveilRockGeometry(node.geometry);
        state.owned.push(geometry);
        return geometry;
      }));
      state.material.name='SWV_BakedRockAtlas';
      state.owned.push(state.material);
      for(const key of ['map','normalMap'])if(state.material[key]){
        state.material[key].anisotropy=8;state.owned.push(state.material[key]);
      }
      state.meshes=V.map((name,v)=>[0,1,2].map(lod=>makeMesh(v,lod,perVariant[v])));
      state.ready=true;
      group.visible=true;
      for(const entry of adopted)retire(entry);
      again();
      onReady?.({count:store.x.length,perVariant:Object.fromEntries(V.map((v,i)=>[v,perVariant[i]]))});
    },undefined,error=>{
      if(state.disposed)return;
      state.failed=true;
      onError?.(error);
    });
  }

  return {
    group,
    get count(){return store.x.length;},
    get ready(){return state.ready;},
    get failed(){return state.failed;},
    get lodCounts(){return state.lodCounts.slice();},
    /**
     * Folds an existing rock InstancedMesh (unit solid centred on each
     * instance origin) into the field: same transforms scaled by `scale`,
     * baked variants picked per instance, its own tints (copyColors,
     * normalised to the field's tone) or one `tint`. Returns the count.
     */
    adopt(mesh,{variants=['boulder'],tint=[.55,.56,.57],copyColors=false,scale=1,keepRaycast=false}={}){
      if(!mesh?.isInstancedMesh||!mesh.count)return 0;
      const fix=new THREE.Matrix4().makeScale(scale,scale,scale)
        .multiply(new THREE.Matrix4().makeTranslation(0,-1,0)); // base-normalised -> centred
      const rel=new THREE.Matrix4();
      if(mesh.parent===group.parent){mesh.updateMatrix();rel.copy(mesh.matrix);}
      else{
        mesh.updateWorldMatrix(true,false);group.parent?.updateWorldMatrix(true,false);
        rel.copy(group.parent?.matrixWorld??new THREE.Matrix4()).invert().multiply(mesh.matrixWorld);
      }
      const c=new THREE.Color();
      let gain=1;
      if(copyColors&&mesh.instanceColor){
        let lum=0;
        for(let i=0;i<mesh.count;i++){mesh.getColorAt(i,c);lum+=.2126*c.r+.7152*c.g+.0722*c.b;}
        gain=.92/Math.max(1e-3,lum/mesh.count);
      }
      const local=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,local);
        local.premultiply(rel).decompose(pos,q,s);
        let t=tint;
        if(copyColors&&mesh.instanceColor){mesh.getColorAt(i,c);t=[c.r*gain,c.g*gain,c.b*gain];}
        const v=Math.max(0,V.indexOf(variants[(Math.imul(i+1,2654435761)>>>0)%variants.length]));
        push(local.multiply(fix).toArray(new Float32Array(16)),t,v,Math.max(s.x,s.y,s.z)*scale,pos.x,pos.z);
      }
      const entry={mesh,keepRaycast,saved:null};
      adopted.push(entry);
      if(state.ready){ensureCapacity();retire(entry);again();}
      return mesh.count;
    },
    /** Draw only instances where fn(x, z) (local metres) is true; null = all. */
    setFilter(fn){
      state.filter=typeof fn==='function'?fn:null;
      if(state.ready)again();
    },
    update(px,pz){
      if(!Number.isFinite(px)||!Number.isFinite(pz))return;
      if(!state.ready){state.lastX=px;state.lastZ=pz;return;}
      if(Math.hypot(px-state.lastX,pz-state.lastZ)>=R.refreshMeters)refresh(px,pz);
    },
    dispose(){
      state.disposed=true;
      group.removeFromParent();
      for(const entry of adopted){
        if(entry.saved?.material)entry.mesh.material=entry.saved.material;
        if(entry.saved&&'visible' in entry.saved)entry.mesh.visible=entry.saved.visible;
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
