import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
import {WOLFVEIL_AREA_IDS,wolfveilAreaAtLocal,stableWolfveilArea} from './streaming/WolfveilFiveAreaPlan.mjs';

// Split the authoritative heightfield into area-owned draw meshes. The source
// geometry remains the source of truth for terrain paint and editor tooling;
// only the active area's indexed draw mesh is visible and raycastable.
export function createWolfveilTerrainAreaStream({source,material,parent,offsetZ=70,initialArea='town'}={}){
  if(!source?.attributes?.position||!parent?.add)
    throw new TypeError('Wolfveil terrain streaming requires terrain geometry and a scene parent');
  const position=source.attributes.position,color=source.attributes.color;
  const uv=source.attributes.uv,normal=source.attributes.normal,index=source.index;
  const areas=new Map(WOLFVEIL_AREA_IDS.map(id=>[id,{position:[],color:[],uv:[],normal:[]}]));
  const read=(attribute,i,n)=>attribute?.array
    ?Array.from(attribute.array.slice(i*attribute.itemSize,i*attribute.itemSize+n))
    :Array(n).fill(0);
  const vertexCount=index?.count||position.count;
  for(let i=0;i+2<vertexCount;i+=3){
    const ids=index?[index.array[i],index.array[i+1],index.array[i+2]]:[i,i+1,i+2];
    const cx=(position.getX(ids[0])+position.getX(ids[1])+position.getX(ids[2]))/3;
    const cz=(position.getZ(ids[0])+position.getZ(ids[1])+position.getZ(ids[2]))/3;
    const area=wolfveilAreaAtLocal(cx,cz);
    if(!areas.has(area))continue;
    const out=areas.get(area);
    for(const id of ids){
      out.position.push(...read(position,id,3));
      out.color.push(...read(color,id,3));
      out.uv.push(...read(uv,id,2));
      out.normal.push(...read(normal,id,3));
    }
  }
  const meshes=new Map();
  for(const [area,data] of areas){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.color,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name='SWV_AreaTerrain_'+area;
    mesh.userData.wolfveilAreaTerrain=area;
    mesh.userData.wolfveil=true;
    mesh.receiveShadow=true;
    mesh.raycast=acceleratedRaycast;
    parent.add(mesh);
    meshes.set(area,mesh);
  }
  let active=stableWolfveilArea({x:0,z:offsetZ},initialArea,{zOffset:offsetZ})||initialArea;
  const setActive=area=>{
    if(!meshes.has(area)||area===active)return false;
    const previous=meshes.get(active);
    if(previous?.geometry.boundsTree){
      previous.geometry.boundsTree.dispose?.();
      delete previous.geometry.boundsTree;
    }
    active=area;
    const next=meshes.get(active);
    next.geometry.boundsTree=new MeshBVH(next.geometry,{maxLeafTris:16});
    for(const [id,mesh] of meshes)mesh.visible=id===active;
    return true;
  };
  const initial=meshes.get(active);
  if(initial)initial.geometry.boundsTree=new MeshBVH(initial.geometry,{maxLeafTris:16});
  for(const [id,mesh] of meshes)mesh.visible=id===active;
  return {
    meshes,
    get activeArea(){return active;},
    update(position){
      if(!position)return false;
      const next=stableWolfveilArea(position,active,{zOffset:offsetZ});
      return next?setActive(next):false;
    },
    dispose(){
      for(const mesh of meshes.values()){
        mesh.parent?.remove(mesh);
        mesh.geometry.boundsTree?.dispose?.();
        mesh.geometry.dispose();
      }
      meshes.clear();
    },
  };
}
