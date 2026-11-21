import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
import {WOLFVEIL_AREA_IDS,stableWolfveilArea,wolfveilAreaInfo} from './streaming/WolfveilFiveAreaPlan.mjs';
import {clipGeometryToWolfveilArea,wolfveilAreaClipPlanes} from './streaming/WolfveilAreaClip.mjs';

// The whole valley's ground in one section (the whole-world switch,
// WolfveilAreaScenes.mjs): built once, never swapped for an area.
export const WOLFVEIL_WHOLE_TERRAIN='all';
// The earth face that drops from an area's cut edge (see edgeSkirt below).
export const WOLFVEIL_AREA_EDGE_SKIRT=Object.freeze({depth:14,shade:.42});

// A dark earth face down from every edge the border cut, so the loaded area
// ends in a clean cliff instead of a paper-thin sheet over the void (the
// outer edge of the valley has the same, SWV_Outer_Terrain_Edge_Cliff).
// LOCAL coordinates, like the terrain source. Decorative only: no raycasts.
export function wolfveilAreaEdgeSkirt(geometry,planes,{depth=WOLFVEIL_AREA_EDGE_SKIRT.depth,shade=WOLFVEIL_AREA_EDGE_SKIRT.shade}={}){
  const p=geometry?.attributes?.position,c=geometry?.attributes?.color;
  if(!p||!planes?.length)return null;
  const on=(plane,i)=>Math.abs((plane.axis===0?p.getX(i):p.getZ(i))-plane.value)<1e-4;
  const pos=[],col=[],nor=[];
  for(let t=0;t+2<p.count;t+=3)for(let k=0;k<3;k++){
    const a=t+k,b=t+(k+1)%3;
    const plane=planes.find(pl=>on(pl,a)&&on(pl,b));
    if(!plane)continue;
    // Outward: away from the area, across the border.
    const nx=plane.axis===0?-plane.sign:0,nz=plane.axis===1?-plane.sign:0;
    const rgb=(i,k2=1)=>c?[c.getX(i)*shade*k2,c.getY(i)*shade*k2,c.getZ(i)*shade*k2]:[.2*shade*k2,.16*shade*k2,.12*shade*k2];
    const quad=[
      [p.getX(a),p.getY(a),p.getZ(a),...rgb(a)],[p.getX(b),p.getY(b),p.getZ(b),...rgb(b)],
      [p.getX(b),p.getY(b)-depth,p.getZ(b),...rgb(b,.6)],[p.getX(a),p.getY(a)-depth,p.getZ(a),...rgb(a,.6)],
    ];
    for(const i of [0,1,2,0,2,3]){pos.push(...quad[i].slice(0,3));col.push(...quad[i].slice(3));nor.push(nx,0,nz);}
  }
  if(!pos.length)return null;
  const skirt=new THREE.BufferGeometry();
  skirt.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  skirt.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  skirt.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  skirt.computeBoundingSphere();
  return skirt;
}

// Keep one rendered terrain section and one collision BVH at a time. The
// existing source heightfield remains CPU-side for landscape paint and editor
// tools; section meshes are built on portal entry and disposed on exit.
// A section is its area's ground cut exactly along the border (a straight
// edge with an earth face below it), not whole triangles picked by their
// centre, whose sawtooth edge showed as "teeth" against the far side.
export function createWolfveilTerrainAreaStream({source,material,parent,offsetZ=70,initialArea='town'}={}){
  if(!source?.attributes?.position||!parent?.add)
    throw new TypeError('Wolfveil terrain streaming requires terrain geometry and a scene parent');
  let active=null,mesh=null,pending=null,requestId=0,disposed=false,overlay=null;
  let skirtMaterial=null;
  const build=area=>{
    let geometry,skirt=null;
    if(area===WOLFVEIL_WHOLE_TERRAIN)geometry=source.clone();
    else{
      // The source is LOCAL Wolfveil x/z: the border lines need no offset.
      const planes=wolfveilAreaClipPlanes(area,{offsetZ:0});
      geometry=clipGeometryToWolfveilArea(source,area,{offsetZ:0,planes})?.geometry||source.clone();
      skirt=wolfveilAreaEdgeSkirt(geometry,planes);
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    geometry.boundsTree=new MeshBVH(geometry,{maxLeafTris:16});
    const next=new THREE.Mesh(geometry,material);
    next.name='SWV_ActiveAreaFloor_'+area;
    next.userData.wolfveilAreaTerrain=area;next.userData.wolfveil=true;
    next.receiveShadow=true;next.raycast=acceleratedRaycast;
    if(skirt){
      skirtMaterial??=new THREE.MeshStandardMaterial({name:'SWV_AreaEdgeSkirt',vertexColors:true,
        roughness:1,metalness:0,side:THREE.DoubleSide});
      const face=new THREE.Mesh(skirt,skirtMaterial);
      face.name='SWV_ActiveAreaEdgeSkirt_'+area;
      face.raycast=()=>{};
      face.userData={wolfveil:true,decorativeOnly:true,nonCollider:true,notWalkable:true};
      next.add(face);
    }
    parent.add(next);
    return next;
  };
  const release=section=>{
    if(!section)return;
    section.parent?.remove(section);
    section.geometry.boundsTree?.dispose?.();
    section.geometry.dispose();
    for(const child of section.children)child.geometry?.dispose?.();
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
        release(mesh);
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
  // Entering through a portal must construct the destination floor first.
  // Deriving this from the town origin ignored initialArea on every non-town map.
  active=WOLFVEIL_AREA_IDS.includes(initialArea)?initialArea:'town';
  if(initialArea===WOLFVEIL_WHOLE_TERRAIN)active=WOLFVEIL_WHOLE_TERRAIN;
  mesh=build(active);
  return {
    get activeArea(){return active;},
    update(position,areaId=null){
      // The whole valley's ground stays as it is.
      if(!position||disposed||active===WOLFVEIL_WHOLE_TERRAIN)return false;
      const next=WOLFVEIL_AREA_IDS.includes(areaId)
        ?areaId:stableWolfveilArea(position,active,{zOffset:offsetZ});
      if(pending&&next===active){requestId++;pending=null;removeOverlay();return false;}
      return next?setActive(next):false;
    },
    dispose(){
      if(disposed)return;
      disposed=true;requestId++;pending=null;removeOverlay();
      release(mesh);mesh=null;
      skirtMaterial?.dispose();skirtMaterial=null;
      active=null;
    },
  };
}
