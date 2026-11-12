/**
 * Game 3D forest-floor quality pass for exactly one 100m Wolfveil square.
 * All returned positions are UNshifted Wolfveil local metres; the existing
 * Game 3D scene root applies +70m Z once. No new trees, collision or terrain.
 */
import {sectionFromId, WOLFVEIL_SECTION_GRID} from './preview/wolfveilSectionGrid.mjs';

export const WOLFVEIL_FOREST_FLOOR_SQUARE_ID='WV-R06-C02';
const section=sectionFromId(WOLFVEIL_FOREST_FLOOR_SQUARE_ID);
export const WOLFVEIL_FOREST_FLOOR_BOUNDS=Object.freeze({
  id:section.id,
  minX:section.minX,maxX:section.maxX,
  minZ:section.minZ-WOLFVEIL_SECTION_GRID.sourceOffsetZ,
  maxZ:section.maxZ-WOLFVEIL_SECTION_GRID.sourceOffsetZ,
  rootOffsetZ:WOLFVEIL_SECTION_GRID.sourceOffsetZ,
});

const randomFromSeed=(seed)=>()=>{
  seed=(seed+0x6D2B79F5)>>>0;
  let t=Math.imul(seed^(seed>>>15),seed|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
};
const valid=n=>Number.isFinite(n);

/**
 * Exact R06-C02 palette contract for the existing Game 3D Sumi-e material pass:
 * subdued leaf-blue, woodland jade and weathered mineral stone. PBR textures
 * remain in the source asset; these are gentle instance tint multipliers, not
 * an emissive halo, detached VFX, or a substitute for 3D bark and real leaves.
 */
export const WOLFVEIL_R06C02_ART=Object.freeze({
  style:'realistic-material-first-living-sumi-e',
  grassColors:Object.freeze([0x4c7257,0x557b64,0x648b71,0x49675e,0x72896b]),
  stoneColors:Object.freeze([0x6c7771,0x78847c,0x63716e,0x828983,0x667773]),
  treeInsetMeters:12,
  treeFeatherMeters:7,
  maxGrassGrade:.86,
  maxStoneGrade:.40,
  // Existing large-root ancient FBX needs more soil clearance than a small
  // procedural tree. T07-05 independently reserves 3.5m for this species.
  ancientRootClearanceMeters:3.5,
  glowMode:'within-existing-material-only',
});

/**
 * Tint existing procedural fallback tree INSTANCES without touching trees in
 * other production squares. Root positions decide ownership, not offset crown
 * segment coordinates. The 12m inset exceeds authored crown/branch overhang;
 * a 7m smooth feather prevents abrupt painted bands at square edges.
 */
export function wolfveilR06C02TreeTint(rootX,rootZ,family='foliage'){
  const white=[1,1,1];
  if(!valid(rootX)||!valid(rootZ)||!['bark','foliage'].includes(family))
    return white;
  const b=WOLFVEIL_FOREST_FLOOR_BOUNDS;
  const edge=Math.min(rootX-b.minX,b.maxX-rootX,rootZ-b.minZ,b.maxZ-rootZ);
  if(edge<=WOLFVEIL_R06C02_ART.treeInsetMeters)return white;
  const transition=Math.min(1,Math.max(0,
    (edge-WOLFVEIL_R06C02_ART.treeInsetMeters)/WOLFVEIL_R06C02_ART.treeFeatherMeters));
  const smooth=transition*transition*(3-2*transition);
  const grain=.94+.06*Math.sin(rootX*.085+rootZ*.049);
  const target=family==='bark'?[.94,.98,1.01]:[.86,1.01,1.08];
  return target.map((v)=>1+(v-1)*smooth*grain);
}

const inBounds=(x,z,margin)=>x>=WOLFVEIL_FOREST_FLOOR_BOUNDS.minX+margin&&
  x<WOLFVEIL_FOREST_FLOOR_BOUNDS.maxX-margin&&
  z>=WOLFVEIL_FOREST_FLOOR_BOUNDS.minZ+margin&&
  z<WOLFVEIL_FOREST_FLOOR_BOUNDS.maxZ-margin;

/**
 * Returns visual-only clumps and low stones. The existing server-owned tree
 * anchors are reused only to find clear, natural-looking forest-floor gaps.
 * Nothing returned becomes a tree, a walkable surface or a physics body.
 */
export function planWolfveilSquareR06C02({
  trees=[],heightAt,clearOf,distanceToRiver,seed=0x060602,
}={}){
  if(!Array.isArray(trees)||typeof heightAt!=='function'||
     typeof clearOf!=='function'||typeof distanceToRiver!=='function'||
     !Number.isSafeInteger(seed))
    throw new TypeError('Forest-floor planning requires real tree, terrain and clearance inputs');
  const b=WOLFVEIL_FOREST_FLOOR_BOUNDS;
  // Include border-adjacent trunks, even when rooted in another square:
  // a rock or tuft inside ours must never clip an existing tree at the seam.
  const localTrees=trees.filter(t=>valid(t?.x)&&valid(t?.z)&&
    t.x>=b.minX-10&&t.x<=b.maxX+10&&
    t.z>=b.minZ-10&&t.z<=b.maxZ+10);
  const random=randomFromSeed(seed>>>0);
  const grass=[],stones=[];
  // More lawn-like coverage; keep one instanced mesh and reject unsuitable land.
  // This density is provisional pending actual Game 3D GPU/FPS measurements.
  const spacing=.90;
  const columns=(b.maxX-b.minX)/spacing;
  const rows=(b.maxZ-b.minZ)/spacing;
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const x=b.minX+(column+.18+random()*.64)*spacing;
    const z=b.minZ+(row+.18+random()*.64)*spacing;
    // Existing 4m hard grass cutoff created a visible ruler-straight bald
    // strip at neighboring section edges. Keep roots 1m inside this claimed
    // square (wider than the blade footprint and .65m terrain probes), then
    // feather their density across 9m instead of cutting grass off at 4m.
    // Stones retain the original conservative 4m solid boundary.
    if(!inBounds(x,z,1)||!clearOf({x,z},.6))continue;
    const edge=Math.min(x-b.minX,b.maxX-x,z-b.minZ,b.maxZ-z);
    const riverDistance=distanceToRiver(x,z);
    if(!valid(riverDistance)||riverDistance<18.5)continue;
    const y=heightAt(x,z);
    if(!valid(y))continue;
    // Sample *all four* sides of each root on the actual triangle surface.
    // East+north-only samples missed west/south cliffs and backward ridges.
    // The 1m grass-root inset keeps each .65m probe inside this owned square.
    const probe=.65;
    const yEast=heightAt(x+probe,z),yWest=heightAt(x-probe,z);
    const yNorth=heightAt(x,z+probe),ySouth=heightAt(x,z-probe);
    if(![yEast,yWest,yNorth,ySouth].every(valid))continue;
    const xGrade=Math.max(Math.abs(yEast-y),Math.abs(yWest-y))/probe;
    const zGrade=Math.max(Math.abs(yNorth-y),Math.abs(ySouth-y))/probe;
    const grade=Math.hypot(xGrade,zGrade);
    if(grade>WOLFVEIL_R06C02_ART.maxGrassGrade)continue;
    let nearest=Infinity,ancientRootDist=Infinity;
    for(const t of localTrees){
      const dist=Math.hypot(t.x-x,t.z-z);
      nearest=Math.min(nearest,dist);
      if(t.kind==='ancient')ancientRootDist=Math.min(ancientRootDist,dist);
    }
    // Do not plant through the wider, real FBX root footprint. Only this
    // square's visual scatter changes; existing tree anchors/colliders stay.
    if(nearest<1.7||ancientRootDist<WOLFVEIL_R06C02_ART.ancientRootClearanceMeters)
      continue;
    const nearTree=nearest>=2&&nearest<12;
    const zone=.5+.5*Math.sin(x*.075+Math.cos(z*.064)*1.3);
    const feather=Math.min(1,Math.max(0,(edge-1)/8));
    const edgeBlend=feather*feather*(3-2*feather);
    const density=(nearTree?.95:.86)*(.85+.15*zone)*(.18+.82*edgeBlend);
    if(random()<density){
      const height=.17+random()*.10; // densely repeated low lawn-scale blades
      grass.push({x,y,z,yaw:(random()-.5)*.25,
        width:.72+random()*.28,height,shade:Math.floor(random()*5)});
    }
    if(inBounds(x,z,4)&&grade<=WOLFVEIL_R06C02_ART.maxStoneGrade&&
       column%5===2&&row%5===2&&nearest>=2.5&&nearest<9&&
       random()<.72&&stones.length<30&&
       clearOf({x,z},1.1)&&stones.every(s=>Math.hypot(s.x-x,s.z-z)>3.2)){
      const size=.27+random()*.27;
      // Stone instancing stretches its horizontal footprint by 1.18. Guard
      // the whole visible stone, not just its center, from ancient FBX roots.
      if(ancientRootDist<WOLFVEIL_R06C02_ART.ancientRootClearanceMeters+size*1.18)
        continue;
      stones.push({x,y:y+size*.08,z,yaw:random()*Math.PI*2,
        size,shade:Math.floor(random()*5)});
    }
  }
  return {id:WOLFVEIL_FOREST_FLOOR_SQUARE_ID,grass,stones,
    existingTreeAnchors:localTrees.filter(t=>inBounds(t.x,t.z,0)).length,visualOnly:true,
    terrainModified:false,collidersAdded:0,sourceCoordinates:true};
}
