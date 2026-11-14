// Final imported-town clearance, scoped to the user's 2026-11-14 video.
// This changes actual GLB triangles BEFORE render materials and collision bake.
// Protect: walking brick/stone paving, water, central tree/planter (separate
// root), original outer floor border, the entry gate and approved WARM lamps.
// Remove: architecture, support posts, stairs, spare trees and cyan ground
// pedestals, including the ones previously spared by a 4.5m perimeter band.
import {WOLFVEIL_IMPORTED_TOWN,WOLFVEIL_IMPORTED_TOWN_FLOOR_Y}
  from './WolfveilImportedTownLayout.mjs';

export const WOLFVEIL_TOWN_INTERIOR_CLEARANCE=Object.freeze({
  perimeterBandMeters:4.5,
  perimeterGroundMaximumAboveMeters:.75,
  floorArtMaxAboveMeters:.28,
  floorArtMaxBelowMeters:.15,
  floorArtMinFlatness:.84,
  stoneFloorMaxAboveMeters:.65,
  warmLampMaxHeightMeters:2.8,
});
const TILE_FLOOR=/^(?:Tile_.+|(?:Expansion_)?(?:paving|grass))$/i;
const STONE_FLOOR=/^stone$/i;
const WATER=/water|foam|river|canal|stream/i;
const FLAT_ART=/gold|gilt|bronze|inlay|engraving|mosaic|pattern|ring|rune|mark|brick/i;
const GATE=/gate|torii|portal|gateway|entry[-_ ]?arch/i;
const LAMP=/lamp|lantern|light|sconce/i;
const BLUE_FIXTURE=/blue|cyan|beacon|obelisk|marker|pedestal|teleport/i;
const TREE_PART=/tree|leaf|leaves|blossom|foliage|branch|trunk|pinklight|pink/i;

const vertex=(attribute,index,matrix)=>{
  const x=attribute.getX(index),y=attribute.getY(index),z=attribute.getZ(index);
  const m=matrix?.elements;
  if(!m)return {x,y,z};
  const w=m[3]*x+m[7]*y+m[11]*z+m[15]||1;
  return {
    x:(m[0]*x+m[4]*y+m[8]*z+m[12])/w,
    y:(m[1]*x+m[5]*y+m[9]*z+m[13])/w,
    z:(m[2]*x+m[6]*y+m[10]*z+m[14])/w,
  };
};
function flatTriangle(a,b,c,minFlatness){
  const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z;
  const vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const len=Math.hypot(nx,ny,nz);
  return len>1e-9&&Math.abs(ny)/len>=minFlatness;
}
function withinY(a,b,c,lo,hi){
  return [a.y,b.y,c.y].every(y=>y>=lo&&y<=hi);
}
function warmLamp(node){
  const name=node.name||'';
  if(!LAMP.test(name)||TREE_PART.test(name)||BLUE_FIXTURE.test(name))return false;
  const mats=Array.isArray(node.material)?node.material:[node.material];
  return mats.some(mat=>{
    const color=mat?.emissive&&mat.emissive.getHex?.()!==0
      ?mat.emissive:mat?.color;
    return color&&color.r>.25&&color.r>=color.g*.92&&color.r>color.b*1.10;
  });
}
/** Use the same edited triangle index for rendering, ground contact and collision. */
export function clearWolfveilImportedTownInterior(townRoot,{
  floorY=WOLFVEIL_IMPORTED_TOWN_FLOOR_Y+WOLFVEIL_IMPORTED_TOWN.floorLiftMeters,
  perimeterBandMeters=WOLFVEIL_TOWN_INTERIOR_CLEARANCE.perimeterBandMeters,
}={}){
  const empty={removedFaces:0,changedMeshes:0,protectedFloorMeshes:0,
    preservedPerimeterFaces:0,preservedFloorArtFaces:0,preservedGateFaces:0,
    preservedWarmLampFaces:0,removedPerimeterStructureFaces:0,
    removedStoneStructureFaces:0,removedTreeFaces:0};
  if(!townRoot?.traverse)return empty;
  if(!(perimeterBandMeters>0&&perimeterBandMeters<WOLFVEIL_IMPORTED_TOWN.width/4))
    throw Error('Invalid town perimeter safety band');
  const config=WOLFVEIL_TOWN_INTERIOR_CLEARANCE,town=WOLFVEIL_IMPORTED_TOWN;
  const cx=town.x,cz=town.z+70,halfX=town.width/2,halfZ=town.depth/2;
  const inside=(v)=>Math.abs(v.x-cx)<=halfX+.05&&Math.abs(v.z-cz)<=halfZ+.05;
  const onPerimeter=(v)=>Math.abs(v.x-cx)>=halfX-perimeterBandMeters||
      Math.abs(v.z-cz)>=halfZ-perimeterBandMeters;
  const report={...empty};
  townRoot.updateMatrixWorld?.(true);
  townRoot.traverse(node=>{
    if(!node?.isMesh||!node.geometry?.attributes?.position)return;
    // The 80 tile tops and brick-paved walks are sacred. The tree, planter
    // and civic gate are separate groups, outside the imported GLB subtree.
    if(TILE_FLOOR.test(node.name)||WATER.test(node.name)){
      report.protectedFloorMeshes++;return;
    }
    const stone=STONE_FLOOR.test(node.name),isGate=GATE.test(node.name);
    const isLamp=warmLamp(node);
    const geom=node.geometry,pos=geom.attributes.position,index=geom.index;
    const count=index?.count??index?.array?.length??pos.count;
    const at=i=>index?(typeof index.getX==='function'?index.getX(i):index.array[i]):i;
    const oldGroups=geom.groups?.length
      ?geom.groups.map(g=>({start:g.start,count:g.count,materialIndex:g.materialIndex}))
      :[{start:0,count,materialIndex:0}];
    const kept=[],groups=[];let removed=0;
    for(const group of oldGroups){
      const start=kept.length;
      for(let i=group.start;i+2<Math.min(count,group.start+group.count);i+=3){
        const ia=at(i),ib=at(i+1),ic=at(i+2);
        if(![ia,ib,ic].every(v=>Number.isInteger(v)&&v>=0&&v<pos.count))continue;
        const a=vertex(pos,ia,node.matrixWorld),b=vertex(pos,ib,node.matrixWorld),
          c=vertex(pos,ic,node.matrixWorld);
        const p=[a,b,c],within=p.every(inside),isOuter=p.some(onPerimeter);
        const flat=flatTriangle(a,b,c,config.floorArtMinFlatness);
        const isLowGround=withinY(a,b,c,floorY-.20,
          floorY+config.perimeterGroundMaximumAboveMeters);
        const floorArt=FLAT_ART.test(node.name)&&flat&&
          withinY(a,b,c,floorY-config.floorArtMaxBelowMeters,
            floorY+config.floorArtMaxAboveMeters);
        const stoneGround=stone&&isLowGround&&
          (flat||Math.max(a.y,b.y,c.y)<=floorY+.3);
        const perimeterGround=isOuter&&isLowGround&&flat;
        const approvedLamp=isLamp&&withinY(a,b,c,floorY-.3,
          floorY+config.warmLampMaxHeightMeters);
        // Boundary-straddling source faces may extend into the surrounding
        // terrain. Never alter off-town geometry. Unlike the previous cleanup,
        // a face does NOT survive simply because it lies in the outer 4.5m.
        let preserve=!within||isGate||floorArt||stoneGround||perimeterGround||approvedLamp;
        // The explicit blue-lit pedestals and vegetation never qualify as
        // approved lamps, even if a nearby unrelated material is warm.
        if(within&&(BLUE_FIXTURE.test(node.name)||TREE_PART.test(node.name))&&!isGate)
          preserve=false;
        if(preserve){
          kept.push(ia,ib,ic);
          if(isGate)report.preservedGateFaces++;
          else if(approvedLamp)report.preservedWarmLampFaces++;
          else if(floorArt||stoneGround)report.preservedFloorArtFaces++;
          else if(isOuter)report.preservedPerimeterFaces++;
        }else{
          removed++;
          if(isOuter)report.removedPerimeterStructureFaces++;
          if(stone)report.removedStoneStructureFaces++;
          if(TREE_PART.test(node.name))report.removedTreeFaces++;
        }
      }
      if(kept.length>start)groups.push({
        start,count:kept.length-start,materialIndex:group.materialIndex});
    }
    if(!removed)return;
    // Editing indices rather than visible=false keeps the new obstacle list
    // AND authored contact grid free of invisible walls and old stair faces.
    geom.setIndex(kept);geom.clearGroups?.();
    for(const g of groups)geom.addGroup?.(g.start,g.count,g.materialIndex);
    geom.setDrawRange?.(0,kept.length);
    geom.computeBoundingBox?.();geom.computeBoundingSphere?.();
    node.userData??={};node.userData.cloneTownInteriorCleared=true;
    node.userData.cloneTownRemovedFaces=removed;
    report.changedMeshes++;report.removedFaces+=removed;
  });
  townRoot.userData??={};
  townRoot.userData.cloneTownInteriorClearance=report;
  return report;
}
