// Cave rings (story mode, 2026-11-23). The ring at a cave's mouth takes the
// player into THAT cave on the cave map, in its entry hall 16 m in, instead of
// the Wolf Rotunda in the middle of the network. A ring just inside the same
// arch takes them back out to the bench outside that mouth, in the area the
// mouth is in. Pure; WORLD coordinates (Wolfveil-local + 70 m Z).
import {
  WOLFVEIL_EXPLORABLE_CAVES,WOLFVEIL_CAVE_DROP,sampleWolfveilCaveSpace,
} from './WolfveilCaveLayout.mjs';
import {WOLFVEIL_CAVE_APPROACHES} from './WolfveilCaveAccessPlan.mjs';
import {wolfveilHeight} from './WolfveilLayout.js';
import {wolfveilAreaAtWorld} from './streaming/WolfveilFiveAreaPlan.mjs';

const OFFSET_Z=70;
export const WOLFVEIL_CAVE_RING=Object.freeze({
  hallAlong:16, // the entry hall, metres in from the mouth along the cave
  exitAlong:WOLFVEIL_CAVE_DROP.exitAlong, // the way out, inside the arch
  triggerRadius:3.25, // as WolfveilDungeonPortals
  exitFloorReach:3, // a tunnel passing above or below never touches the exit
});
// Orbit yaw whose camera looks along (fx,fz): Game 2 yaw = orbit + PI and
// forward = (sin, cos) of it (Game3DGame2Camera.mjs).
const orbitYawFacing=(fx,fz)=>Math.atan2(fx,fz)-Math.PI;

export function wolfveilCaveById(id){
  return typeof id==='string'?WOLFVEIL_EXPLORABLE_CAVES.find(cave=>cave.id===id)||null:null;
}

/** Where a ring at `caveId`'s mouth lands the player on the cave map, facing in. */
export function wolfveilCaveRingArrival(caveId){
  const cave=wolfveilCaveById(caveId);
  if(!cave)return null;
  const [mx,mz]=cave.mouth,[dx,dz]=cave.dir,along=WOLFVEIL_CAVE_RING.hallAlong;
  const x=mx+dx*along,z=mz+dz*along,space=sampleWolfveilCaveSpace(x,z,.75);
  if(!space)return null;
  return {caveId:cave.id,x,y:space.floorY+.1,z:z+OFFSET_Z,yaw:orbitYawFacing(dx,dz)};
}

/** The rings out of the cave map, one inside each cave's arch. */
export function wolfveilCaveRingExits(){
  return WOLFVEIL_EXPLORABLE_CAVES.map(cave=>{
    const [mx,mz]=cave.mouth,[dx,dz]=cave.dir,along=WOLFVEIL_CAVE_RING.exitAlong;
    const x=mx+dx*along,z=mz+dz*along,space=sampleWolfveilCaveSpace(x,z,.62);
    return space?{id:cave.id,x,y:space.floorY+2.2,z:z+OFFSET_Z,floorY:space.floorY}:null;
  }).filter(Boolean);
}

/**
 * Out of `caveId`: the staging bench of its approach, 10.5 m outside the mouth
 * (clear of the mouth's ring), facing away from the cave, and its area.
 */
export function wolfveilCaveRingReturn(caveId){
  const cave=wolfveilCaveById(caveId);
  if(!cave)return null;
  const [dx,dz]=cave.dir;
  const bench=WOLFVEIL_CAVE_APPROACHES.find(a=>a.caveId===cave.id)?.points
    .find(p=>p.kind==='staging');
  const x=bench?.x??cave.mouth[0]-dx*10.5,z=bench?.z??cave.mouth[1]-dz*10.5;
  const world={x,y:wolfveilHeight(x,z),z:z+OFFSET_Z};
  return {caveId:cave.id,...world,yaw:orbitYawFacing(-dx,-dz),area:wolfveilAreaAtWorld(world)};
}
