import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
import {WOLFVEIL_AREA_IDS,wolfveilAreaAtLocal,stableWolfveilArea} from './streaming/WolfveilFiveAreaPlan.mjs';

// Keep one rendered terrain section and one collision BVH at a time. The
// existing source heightfield remains CPU-side for the landscape paint and
// tile editor; area meshes are built on portal entry and disposed on exit.
export function createWolfveilTerrainAreaStream({source,material,parent,offsetZ=70,initialArea='town'}={}){
  if(!source?.attributes?.position||!parent?.add)
    throw new TypeError('Wolfveil terrain streaming requires terrain geometry and a scene parent');
  const position=source.attributes.position,color=source.attributes.color;
  const uv=source.attributes.uv,normal=source.attributes.normal,index=source.index;
  const read=(attribute,i)=>attribute?.array
    ?Array.from(attribute.array.slice(i*attribute.itemSize,i*attribute.itemSize+attribute.itemSize))
    :Array(attribute?.itemSize||0).fill(0);
  let active=null,mesh=null,disposed=false;
  const build=area=>{
    const p=[],c=[],t=[],n=[];
    const vertexCount=index?.count||position.count;
    for(let i=0;i+2<vertexCount;i+=3){
      const ids=index?[index.array[i],index.array[i+1],index.array[i+2]]:[i,i+1,i+2];
      const cx=(position.getX(ids[0])+position.getX(ids[1])+position.getX(ids[2]))/3;
      const cz=(position.getZ(ids[0])+position.getZ(ids[1])+position.getZ(ids[2]))/3;
      if(wolfveilAreaAtLocal(cx,cz)!==area)continue;
      for(const id of ids){
        p.push(...read(position,id));
        c.push(...read(color,id));
        t.push(...read(uv,id));
        n.push(...read(normal,id));
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(t,2));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.boundsTree=new MeshBVH(geometry,{maxLeafTris:16});
    const next=new THREE.Mesh(geometry,material);
    next.name='SWV_AreaTerrain_'+area;
    next.userData.wolfveilAreaTerrain=area;
    next.userData.wolfveil=true;
    next.receiveShadow=true;
    next.raycast=acceleratedRaycast;
    parent.add(next);
    return next;
  };
  const setActive=area=>{
    if(disposed||!WOLFVEIL_AREA_IDS.includes(area)||area===active)return false;
    if(mesh){
      mesh.parent?.remove(mesh);
      mesh.geometry.boundsTree?.dispose?.();
      mesh.geometry.dispose();
    }
    active=area;
    mesh=build(area);
    return true;
  };
  active=stableWolfveilArea({x:0,z:offsetZ},initialArea,{zOffset:offsetZ})||initialArea;
  if(!WOLFVEIL_AREA_IDS.includes(active))active='town';
  mesh=build(active);
  return {
    get activeArea(){return active;},
    update(position){
      if(!position||disposed)return false;
      const next=stableWolfveilArea(position,active,{zOffset:offsetZ});
      return next?setActive(next):false;
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      if(mesh){
        mesh.parent?.remove(mesh);
        mesh.geometry.boundsTree?.dispose?.();
        mesh.geometry.dispose();
        mesh=null;
      }
      active=null;
    },
  };
}
