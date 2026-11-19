import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
import {WOLFVEIL_AREA_IDS,wolfveilAreaAtLocal,stableWolfveilArea,wolfveilAreaInfo} from './streaming/WolfveilFiveAreaPlan.mjs';

// Keep one rendered terrain section and one collision BVH at a time. The
// existing source heightfield remains CPU-side for landscape paint and editor
// tools; section meshes are built on portal entry and disposed on exit.
export function createWolfveilTerrainAreaStream({source,material,parent,offsetZ=70,initialArea='town'}={}){
  if(!source?.attributes?.position||!parent?.add)
    throw new TypeError('Wolfveil terrain streaming requires terrain geometry and a scene parent');
  const position=source.attributes.position,color=source.attributes.color;
  const uv=source.attributes.uv,normal=source.attributes.normal,index=source.index;
  // Baked terrain splat weights (WolfveilTerrainSplat.js), when the terrain has them.
  const splat=source.attributes.aSplat;
  const copy=(target,attribute,i)=>{
    if(!attribute?.array)return;
    const start=i*attribute.itemSize;
    for(let k=0;k<attribute.itemSize;k++)target.push(attribute.array[start+k]);
  };
  let active=null,mesh=null,pending=null,requestId=0,disposed=false,overlay=null;
  const build=area=>{
    const p=[],c=[],t=[],n=[],w=[];
    const vertexCount=index?.count||position.count;
    for(let i=0;i+2<vertexCount;i+=3){
      const ids=index?[index.array[i],index.array[i+1],index.array[i+2]]:[i,i+1,i+2];
      const cx=(position.getX(ids[0])+position.getX(ids[1])+position.getX(ids[2]))/3;
      const cz=(position.getZ(ids[0])+position.getZ(ids[1])+position.getZ(ids[2]))/3;
      if(wolfveilAreaAtLocal(cx,cz)!==area)continue;
      for(const id of ids){
        copy(p,position,id);copy(c,color,id);copy(t,uv,id);copy(n,normal,id);copy(w,splat,id);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(t,2));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
    if(splat)geometry.setAttribute('aSplat',new THREE.Float32BufferAttribute(w,splat.itemSize));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    geometry.boundsTree=new MeshBVH(geometry,{maxLeafTris:16});
    const next=new THREE.Mesh(geometry,material);
    next.name='SWV_ActiveAreaFloor_'+area;
    next.userData.wolfveilAreaTerrain=area;next.userData.wolfveil=true;
    next.receiveShadow=true;next.raycast=acceleratedRaycast;
    parent.add(next);
    return next;
  };
  const removeOverlay=()=>{
    // In browser DOM, remove exists. Headless report stubs need a safe fallback.
    if(typeof overlay?.remove==='function')overlay.remove();
    else overlay?.parentNode?.removeChild?.(overlay);
    overlay=null;
  };
  const showOverlay=area=>{
    if(typeof document==='undefined')return;
    if(!overlay){
      overlay=document.createElement('div');
      overlay.setAttribute('role','status');
      overlay.setAttribute('aria-live','polite');
      Object.assign(overlay.style,{
        position:'fixed',inset:'0',zIndex:'2147483000',display:'grid',
        placeItems:'center',background:'rgba(8,12,18,.94)',color:'#f2eadb',
        font:'600 16px system-ui,sans-serif',letterSpacing:'.04em',
        pointerEvents:'none',opacity:'1',
      });
      document.body.appendChild(overlay);
    }
    const label=wolfveilAreaInfo(area)?.label||area;
    overlay.textContent='Loading '+label+'…';
  };
  const setActive=area=>{
    if(disposed||!WOLFVEIL_AREA_IDS.includes(area)||area===active||area===pending)return false;
    pending=area;
    const id=++requestId;
    showOverlay(area);
    const commit=()=>{
      if(disposed||id!==requestId)return;
      try{
        const next=build(area);
        if(mesh){
          mesh.parent?.remove(mesh);
          mesh.geometry.boundsTree?.dispose?.();
          mesh.geometry.dispose();
        }
        mesh=next;active=area;pending=null;
        removeOverlay();
      }catch(error){
        pending=null;removeOverlay();
        globalThis.console?.error?.('Wolfveil terrain area failed to load:',error);
      }
    };
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(commit);
    else commit();
    return true;
  };
  active=stableWolfveilArea({x:0,z:offsetZ},initialArea,{zOffset:offsetZ})||initialArea;
  if(!WOLFVEIL_AREA_IDS.includes(active))active='town';
  mesh=build(active);
  return {
    get activeArea(){return active;},
    update(position,areaId=null){
      if(!position||disposed)return false;
      const next=WOLFVEIL_AREA_IDS.includes(areaId)
        ?areaId:stableWolfveilArea(position,active,{zOffset:offsetZ});
      if(pending&&next===active){requestId++;pending=null;removeOverlay();return false;}
      return next?setActive(next):false;
    },
    dispose(){
      if(disposed)return;
      disposed=true;requestId++;pending=null;removeOverlay();
      if(mesh){
        mesh.parent?.remove(mesh);mesh.geometry.boundsTree?.dispose?.();
        mesh.geometry.dispose();mesh=null;
      }
      active=null;
    },
  };
}
