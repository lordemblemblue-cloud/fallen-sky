// FINAL clone-only legacy town geometry sweep. Run AFTER the original tile
// repair and BEFORE baking collision: names and source mesh attachment are not
// evidence of a safe walkable surface. In the assembled Blender GLB, a mesh
// named "stone", "paving", "grass" or "Tile_*" can own vertical stair skins,
// stacked walls and roof/deck faces as well as a real ground plane.
//
// This pass deletes all intersecting elevated geometry inside the inner town,
// even when the face belongs to a larger attached Blender object. Floor faces,
// canal/water and the outer-square rim survive. The owner's centre tree and
// planter are separate THREE.Groups and never enter this function.
import {WOLFVEIL_IMPORTED_TOWN,WOLFVEIL_IMPORTED_TOWN_FLOOR_Y}
  from './WolfveilImportedTownLayout.mjs';

export const WOLFVEIL_TOWN_LEGACY_PURGE=Object.freeze({
  perimeterBandMeters:4.5,
  maxFloorAboveMeters:.22,
  maxFloorBelowMeters:2.5, // canal bottom / recessed original paving
  minFloorFlatness:.88,
});
const FLOOR=/^(?:Tile_[\w.\-]+|(?:Expansion_)?(?:paving|grass)|stone)$/i;
const WATER=/water|foam|river|canal|stream/i;

function point(attribute,i,matrix){
  const x=attribute.getX(i),y=attribute.getY(i),z=attribute.getZ(i);
  const m=matrix?.elements;
  if(!m)return {x,y,z};
  const w=m[3]*x+m[7]*y+m[11]*z+m[15]||1;
  return {
    x:(m[0]*x+m[4]*y+m[8]*z+m[12])/w,
    y:(m[1]*x+m[5]*y+m[9]*z+m[13])/w,
    z:(m[2]*x+m[6]*y+m[10]*z+m[14])/w,
  };
}
function flatness(a,b,c){
  const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z;
  const vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const len=Math.hypot(nx,ny,nz);
  return len>1e-10?Math.abs(ny)/len:0;
}
function inside(p,hx,hz){
  return Math.abs(p.x)<=hx&&Math.abs(p.z)<=hz;
}
function pointInTriangle(p,a,b,c){
  const ux=b.x-a.x,uz=b.z-a.z,vx=c.x-a.x,vz=c.z-a.z;
  const det=ux*vz-uz*vx;
  if(Math.abs(det)<1e-9)return false;
  const dx=p.x-a.x,dz=p.z-a.z;
  const u=(dx*vz-dz*vx)/det, v=(ux*dz-uz*dx)/det;
  return u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8;
}
function segmentIntersectsRect(a,b,hx,hz){
  // Liang-Barsky clipping handles near-vertical and horizontal wall edges,
  // including a huge old roof triangle that spans beyond the perimeter.
  const dx=b.x-a.x,dz=b.z-a.z;
  let enter=0,exit=1;
  for(const [p,q]of [[-dx,a.x+hx],[dx,hx-a.x],[-dz,a.z+hz],[dz,hz-a.z]]){
    if(Math.abs(p)<1e-12){if(q<0)return false;continue;}
    const t=q/p;
    if(p<0)enter=Math.max(enter,t);
    else exit=Math.min(exit,t);
    if(enter>exit)return false;
  }
  return true;
}
function overlapsInner(a,b,c,hx,hz){
  if(Math.max(a.x,b.x,c.x)<-hx||Math.min(a.x,b.x,c.x)>hx||
     Math.max(a.z,b.z,c.z)<-hz||Math.min(a.z,b.z,c.z)>hz)return false;
  if([a,b,c].some(p=>inside(p,hx,hz)))return true;
  for(const x of [-hx,hx])for(const z of [-hz,hz])
    if(pointInTriangle({x,z},a,b,c))return true;
  return segmentIntersectsRect(a,b,hx,hz)||
    segmentIntersectsRect(b,c,hx,hz)||
    segmentIntersectsRect(c,a,hx,hz);
}
/**
 * A face is "floor" only if its real world-space normal is nearly horizontal
 * and every vertex is in the floor's low ground band. Mesh names alone do not
 * grant floor protection. Old vertical tile skirts have to be removed.
 */
export function purgeWolfveilTownLegacyStructures(townRoot,{
  floorY=WOLFVEIL_IMPORTED_TOWN_FLOOR_Y+WOLFVEIL_IMPORTED_TOWN.floorLiftMeters,
  config=WOLFVEIL_TOWN_LEGACY_PURGE,
}={}){
  const out={inspectedFaces:0,removedFaces:0,removedMeshes:0,changedMeshes:0,
    removedAttachedFaces:0,preservedFloorFaces:0,
    protectedPerimeterFaces:0,protectedWaterMeshes:0};
  if(!townRoot?.traverse)return out;
  const world=WOLFVEIL_IMPORTED_TOWN;
  const cx=world.x,cz=world.z+70;
  const hx=world.width/2-config.perimeterBandMeters;
  const hz=world.depth/2-config.perimeterBandMeters;
  if(!(hx>0&&hz>0))throw Error('Invalid clone-town perimeter protection');
  townRoot.updateMatrixWorld?.(true);
  // Some imported objects share the same BufferGeometry: before editing, do
  // not let the previous mesh's deletion alter another transform's triangles.
  const seen=new Set();
  townRoot.traverse(node=>{
    if(!node?.isMesh || !node.geometry?.attributes?.position)return;
    if(WATER.test(node.name)){out.protectedWaterMeshes++;return;}
    let geometry=node.geometry;
    if(seen.has(geometry)&&typeof geometry.clone==='function'){
      geometry=geometry.clone();node.geometry=geometry;
    }
    seen.add(geometry);
    const position=geometry.attributes.position,index=geometry.index;
    const count=index?.count??index?.array?.length??position.count;
    const at=i=>index?(typeof index.getX==='function'?index.getX(i):index.array[i]):i;
    const groups=geometry.groups?.length
      ?geometry.groups.map(g=>({start:g.start,count:g.count,materialIndex:g.materialIndex}))
      :[{start:0,count,materialIndex:0}];
    const kept=[],nextGroups=[];
    let removedThisMesh=0,keptThisMesh=0;
    for(const group of groups){
      const start=kept.length;
      for(let i=group.start;i+2<Math.min(count,group.start+group.count);i+=3){
        const ia=at(i),ib=at(i+1),ic=at(i+2);
        if(![ia,ib,ic].every(n=>Number.isInteger(n)&&n>=0&&n<position.count))continue;
        const a=point(position,ia,node.matrixWorld),b=point(position,ib,node.matrixWorld),
          c=point(position,ic,node.matrixWorld);
        if(![a,b,c].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z))){
          removedThisMesh++;continue;
        }
        out.inspectedFaces++;
        const worldA={x:a.x-cx,z:a.z-cz},worldB={x:b.x-cx,z:b.z-cz},
          worldC={x:c.x-cx,z:c.z-cz};
        const touchesInterior=overlapsInner(worldA,worldB,worldC,hx,hz);
        const approvedFloor=FLOOR.test(node.name)&&
          flatness(a,b,c)>=config.minFloorFlatness&&
          [a,b,c].every(p=>p.y>=floorY-config.maxFloorBelowMeters &&
                                p.y<=floorY+config.maxFloorAboveMeters);
        if(!touchesInterior){
          // Any triangle wholly confined to the outer perimeter or beyond
          // survives. This is the only architectural protection; giant
          // attached triangles crossing the inner town are not grandfathered.
          kept.push(ia,ib,ic);keptThisMesh++;out.protectedPerimeterFaces++;
        }else if(approvedFloor){
          kept.push(ia,ib,ic);keptThisMesh++;out.preservedFloorFaces++;
        }else{
          removedThisMesh++;
          if(FLOOR.test(node.name))out.removedAttachedFaces++;
        }
      }
      if(kept.length>start)
        nextGroups.push({start,count:kept.length-start,materialIndex:group.materialIndex});
    }
    if(!removedThisMesh)return;
    // Renderer and bakeWolfveilTownCollision both use this same index, so an
    // attached wall cannot remain as an invisible collision obstacle.
    geometry.setIndex(kept);
    geometry.clearGroups?.();
    for(const group of nextGroups)
      geometry.addGroup?.(group.start,group.count,group.materialIndex);
    geometry.setDrawRange?.(0,kept.length);
    geometry.computeBoundingBox?.();geometry.computeBoundingSphere?.();
    node.userData??={};
    node.userData.cloneLegacyTownPurged=true;
    node.userData.cloneLegacyTownRemovedFaces=removedThisMesh;
    if(!keptThisMesh){node.visible=false;out.removedMeshes++;}
    out.changedMeshes++;out.removedFaces+=removedThisMesh;
  });
  townRoot.userData??={};
  townRoot.userData.cloneTownLegacyPurge=out;
  return out;
}
