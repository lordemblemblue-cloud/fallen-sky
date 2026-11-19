import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
import {
  WOLFVEIL_AREA_IDS,WOLFVEIL_AREA_LOADING_OPTIONS,wolfveilAreaAtLocal,stableWolfveilArea,nearWolfveilAreas,
} from './streaming/WolfveilFiveAreaPlan.mjs';

// Streams the Wolfveil ground per area. The area the player is in is always
// loaded; any other area within `preloadMeters` is built ahead of time, one
// section per frame, so walking up to a gate shows real ground on the far
// side and the player can step straight through. Sections out of range (plus
// `unloadSlackMeters`, so a player pacing at the edge does not rebuild) are
// disposed with their raycast BVH. The source heightfield stays CPU-side for
// landscape paint and editor tools.
//
// Each triangle belongs to exactly one area (by its centroid), so loaded
// sections tile the terrain with no gap and no overlap along a border.
export function createWolfveilTerrainAreaStream({
  source,material,parent,offsetZ=70,initialArea='town',
  preloadMeters=WOLFVEIL_AREA_LOADING_OPTIONS.preloadMeters,unloadSlackMeters=25,
}={}){
  if(!source?.attributes?.position||!parent?.add)
    throw new TypeError('Wolfveil terrain streaming requires terrain geometry and a scene parent');
  const position=source.attributes.position,index=source.index;
  // Baked terrain splat weights (WolfveilTerrainSplat.js), when the terrain has them.
  const attributes=[
    ['position',position],['color',source.attributes.color],['uv',source.attributes.uv],
    ['normal',source.attributes.normal],['aSplat',source.attributes.aSplat],
  ].filter(([,attribute])=>attribute?.array);
  // Which area owns each triangle: computed once, so building a section is a copy.
  const triangles=new Map(WOLFVEIL_AREA_IDS.map(id=>[id,[]]));
  const vertexCount=index?.count||position.count;
  const vertexOf=k=>index?index.array[k]:k;
  for(let k=0;k+2<vertexCount;k+=3){
    const a=vertexOf(k),b=vertexOf(k+1),c=vertexOf(k+2);
    const cx=(position.getX(a)+position.getX(b)+position.getX(c))/3;
    const cz=(position.getZ(a)+position.getZ(b)+position.getZ(c))/3;
    triangles.get(wolfveilAreaAtLocal(cx,cz))?.push(k);
  }
  const triangleLists=new Map([...triangles].map(([id,list])=>[id,Uint32Array.from(list)]));
  const sections=new Map(); // area -> mesh
  let active=null,disposed=false,builds=0,releases=0,lastBuildMs=0;
  let preload=Math.max(0,Number(preloadMeters)||0);
  const clock=()=>globalThis.performance?.now?.()??Date.now();

  function build(area){
    const started=clock();
    const list=triangleLists.get(area);
    const geometry=new THREE.BufferGeometry();
    for(const [name,attribute] of attributes){
      const size=attribute.itemSize,out=new Float32Array(list.length*3*size);
      let o=0;
      for(const k of list)for(let v=0;v<3;v++){
        const from=vertexOf(k+v)*size;
        for(let s=0;s<size;s++)out[o++]=attribute.array[from+s];
      }
      geometry.setAttribute(name,new THREE.BufferAttribute(out,size));
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    geometry.boundsTree=new MeshBVH(geometry,{maxLeafTris:16});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name='SWV_ActiveAreaFloor_'+area;
    mesh.userData.wolfveilAreaTerrain=area;mesh.userData.wolfveil=true;
    mesh.receiveShadow=true;mesh.raycast=acceleratedRaycast;
    parent.add(mesh);
    sections.set(area,mesh);
    builds++;lastBuildMs=clock()-started;
    return mesh;
  }
  function release(area){
    const mesh=sections.get(area);
    if(!mesh)return;
    sections.delete(area);
    mesh.parent?.remove(mesh);
    mesh.geometry.boundsTree=null;
    mesh.geometry.dispose();
    releases++;
  }
  const near=(position,current,meters)=>nearWolfveilAreas(position,current,{zOffset:offsetZ,preloadMeters:meters});

  active=stableWolfveilArea({x:0,z:offsetZ},initialArea,{zOffset:offsetZ})||initialArea;
  if(!WOLFVEIL_AREA_IDS.includes(active))active='town';
  build(active);
  return {
    get activeArea(){return active;},
    get loadedAreas(){return [...sections.keys()];},
    /** Ground of `areaId` (the area loader's current area) plus every area in reach. */
    update(position,areaId=null){
      if(!position||disposed)return false;
      const next=WOLFVEIL_AREA_IDS.includes(areaId)
        ?areaId:stableWolfveilArea(position,active,{zOffset:offsetZ});
      if(!next)return false;
      active=next;
      let changed=false;
      // Never leave the player above a missing floor (teleport, respawn).
      if(!sections.has(active)){build(active);changed=true;}
      // Preload the rest, one section per frame.
      const wanted=near(position,active,preload);
      const missing=wanted.find(id=>!sections.has(id));
      if(missing){build(missing);changed=true;}
      const keep=new Set(near(position,active,preload+Math.max(0,unloadSlackMeters)));
      for(const id of [...sections.keys()])
        if(id!==active&&!keep.has(id)){release(id);changed=true;}
      return changed;
    },
    setPreloadMeters(meters){
      const value=Number(meters);
      if(Number.isFinite(value))preload=Math.max(0,value);
      return preload;
    },
    stats(){
      return {active,loaded:[...sections.keys()],preloadMeters:preload,builds,releases,lastBuildMs:+lastBuildMs.toFixed(1),
        triangles:Object.fromEntries([...sections].map(([id,mesh])=>[id,mesh.geometry.attributes.position.count/3]))};
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      for(const id of [...sections.keys()])release(id);
      active=null;
    },
  };
}
