// Game 3D-only art direction: reveal the WEST hillside's existing owner dirt/stone
// in roughly 80% of its interior, leaving deterministic, separated grass islands.
// Uses Wolfveil-local X/Z (Game 3D parent applies +70m Z exactly once).
// This module changes decoration only: never geometry, BVH, paths or collision.
import {WOLFVEIL_WEST_HILLSIDE} from './WolfveilWestHillside.mjs';

export const WOLFVEIL_WEST_ROCK_GRASS = Object.freeze({
  islandCellMeters:34,
  targetGrassAreaFraction:.20,
  grassSpacingMeters:4.6,
  maxExtraClumps:9000,
  biome:'western-owner-dirt-and-stone',
});

const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function hash(ix,iz,salt){
  let n=(Math.imul(ix,0x45d9f3b)^Math.imul(iz,0x27d4eb2d)^salt)>>>0;
  n=Math.imul(n^(n>>>16),0x7feb352d)>>>0;
  n=Math.imul(n^(n>>>15),0x846ca68b)>>>0;
  return ((n^(n>>>16))>>>0)/4294967296;
}

// One *entire* west half of the authored world, not just the hillside grove.
// Preserve a soft west/east biome transition around the market approach.
export function wolfveilRockSideBlend(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  return 1-smooth(-140,-38,x);
}

/** Coherent elliptical patches rather than uniform one-in-five random tufts. */
export function isWolfveilWestRockGrassIsland(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  const cell=WOLFVEIL_WEST_ROCK_GRASS.islandCellMeters;
  const gx=Math.floor(x/cell),gz=Math.floor(z/cell);
  for(let ix=gx-1;ix<=gx+1;ix++)for(let iz=gz-1;iz<=gz+1;iz++){
    const cx=(ix+.5)*cell+(hash(ix,iz,0x5f12b)-.5)*10;
    const cz=(iz+.5)*cell+(hash(ix,iz,0x1ac72)-.5)*10;
    const rx=(7.5+hash(ix,iz,0x81f30)*3.8)*.965;
    const rz=(6.5+hash(ix,iz,0x7d81a)*3.6)*.965;
    const angle=hash(ix,iz,0x612e1)*Math.PI*2;
    const dx=x-cx,dz=z-cz;
    const u=(dx*Math.cos(angle)+dz*Math.sin(angle))/rx;
    const v=(-dx*Math.sin(angle)+dz*Math.cos(angle))/rz;
    if(u*u+v*v<=1)return true;
  }
  return false;
}

/** Preserve the grassy mountain side; feather depletion into existing west soil. */
export function wolfveilWestRockGrassAllowed(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  const rocky=wolfveilRockSideBlend(x,z);
  if(rocky<=.12)return true;
  if(isWolfveilWestRockGrassIsland(x,z))return true;
  // Transitional dirt/grass border is feathered, not a rectangular cut.
  const depletion=smooth(.12,.75,rocky);
  return hash(Math.floor(x*2),Math.floor(z*2),0x39d7ab)>=depletion;
}

/** Add small widely separated grass fields on top of otherwise exposed rock/soil.
 * Uses the same actual rendered height sampler and existing clearance services.
 */
export function planWolfveilWestRockGrassPockets({
  heightAt,clearOf=()=>true,distanceToRiver=()=>Infinity,
  routeClearance=()=>Infinity,trees=[],maxClumps=WOLFVEIL_WEST_ROCK_GRASS.maxExtraClumps,
}={}){
  if(typeof heightAt!=='function'||typeof clearOf!=='function'||
    typeof distanceToRiver!=='function'||typeof routeClearance!=='function'||
    !Array.isArray(trees))throw new TypeError('West rock pockets need terrain and clearances');
  const grass=[],step=WOLFVEIL_WEST_ROCK_GRASS.grassSpacingMeters;
  // Full authoritative core's western half: southern, northern and central
  // rock are covered. Sculpting/graded-hill boundaries are deliberately NOT
  // reused here because this is only a vegetation/art-direction pass.
  const west=WOLFVEIL_WEST_HILLSIDE;
  for(let z=-550+step*.5;z<550;z+=step){
    for(let x=west.minX+step*.5;x<-38;x+=step){
      const ix=Math.floor(x/step),iz=Math.floor(z/step);
      const px=x+(hash(ix,iz,0x71a1)-.5)*step*.52;
      const pz=z+(hash(ix,iz,0xf401)-.5)*step*.52;
      if(wolfveilRockSideBlend(px,pz)<.58||
        !isWolfveilWestRockGrassIsland(px,pz))continue;
      // Exclude roads, rivers, buildings, live tree roots and steep rock.
      if(!clearOf({x:px,z:pz},.45)||distanceToRiver(px,pz)<18||
        routeClearance(px,pz)<2.2||
        trees.some(t=>Number.isFinite(t.x)&&Number.isFinite(t.z)&&
          Math.hypot(px-t.x,pz-t.z)<(t.kind==='ancient'?3.0:2.0)))continue;
      const y=heightAt(px,pz),yX=heightAt(px+.7,pz),yZ=heightAt(px,pz+.7);
      if(![y,yX,yZ].every(Number.isFinite)||
        Math.hypot(yX-y,yZ-y)>.56)continue;
      const r=hash(ix,iz,0x1aba),r2=hash(ix,iz,0x5029);
      grass.push({x:px,z:pz,y,yaw:r*Math.PI*2,
        width:.38+r2*.36,height:.12+r*.18,
        shade:Math.floor(hash(ix,iz,0x3da)*5)});
      if(grass.length>=maxClumps)return grass;
    }
  }
  return grass;
}
