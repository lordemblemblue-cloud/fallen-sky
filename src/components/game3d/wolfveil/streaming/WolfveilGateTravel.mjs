// Walking or riding through a torii gate takes the player to the area beyond it.
//
// In portal-scene play each Wolfveil area is its own scene (GameWorld3D,
// `mode:'single'`, preload 0): only the current area's ground exists. The
// area loader switches area 12 m past a border (hysteresis), but the player
// can never get there: a bridge deck ends 12 m past its border and a trail
// ends at it, and a step onto missing ground is refused. So the gate decides
// instead, and the player arrives a few metres past the gate in the
// destination scene, facing on:
// - wolfveilGateTravel: crossing a gate's plane inside its opening, towards
//   another area (a bridge deck runs on through the gate), even in one long
//   frame; or standing in the opening already past the plane;
// - wolfveilGatePush: walking or riding into a gate's opening and being held
//   up short of it (a trail's ground ends at the border, up to a few metres
//   before a gate turned along its path).
//
// Pure data + math, no three.js. Positions are Game 3D WORLD x/z (local
// Wolfveil z + 70), like the area loader; gates are from WolfveilAreaVeils.
import {wolfveilAreaAtLocal} from './WolfveilFiveAreaPlan.mjs';
import {wolfveilAreaGates} from './WolfveilAreaVeils.mjs';

export const WOLFVEIL_GATE_TRAVEL=Object.freeze({
  landingMeters:6,   // arrival this far past the gate plane, along the gate
  openingSlack:.35,  // metres beyond the opening's half width still counted as inside
  // A longer jump in one frame is a teleport. Below it a slow frame (a hitch,
  // a background tab, a galloping mount) still goes through the gate it crosses.
  maxStepMeters:30,
  pushReachMeters:5, // a push into the opening counts this far in front of the gate,
                     // and standing in it counts this far past the plane
  pushHeading:.5,    // ...when the step asked for points into it (within 60 degrees)
  pushHeldUp:.35,    // ...and the world let less than this share of it through
});

const depthOf=(gate,x,z)=>(x-gate.x)*gate.facing[0]+(z-gate.z)*gate.facing[1];
const lateralOf=(gate,x,z)=>(x-gate.x)*gate.facing[1]-(z-gate.z)*gate.facing[0];

/**
 * Where a traveller through `gate` arrives in area `to`: LOCAL x/z on the
 * gate's axis, at least `meters` past its plane and inside `to`, plus the
 * heading of travel (yaw, 0 = +Z). Null when `to` is not one of its sides.
 */
export function wolfveilGateLanding(gate,to,{meters=WOLFVEIL_GATE_TRAVEL.landingMeters}={}){
  const sign=to===gate?.ahead?1:to===gate?.behind?-1:0;
  if(!sign)return null;
  const dx=gate.facing[0]*sign,dz=gate.facing[1]*sign;
  for(let d=Math.max(1,meters);d<=meters+8;d+=.5){
    const x=gate.x+dx*d,z=gate.z+dz*d;
    if(wolfveilAreaAtLocal(x,z)===to)return {x,z,meters:d,heading:Math.atan2(dx,dz)};
  }
  return null;
}

/**
 * The gate passed through, leaving the loaded `area` for another one:
 * {gate, from, to, landing, heading}, with `landing` in WORLD x/z. Either the
 * move `previous` -> `position` (WORLD x/z) crossed a gate's plane inside its
 * opening, or `position` already stands in an opening past the plane (a
 * crossing missed by a teleport or a mount snap ends there too). Null for
 * anything else: beside a gate, along it, into the loaded area, a teleport.
 */
export function wolfveilGateTravel(previous,position,{
  area=null,gates=wolfveilAreaGates(),offsetZ=70,
  landingMeters=WOLFVEIL_GATE_TRAVEL.landingMeters,
  slack=WOLFVEIL_GATE_TRAVEL.openingSlack,maxStep=WOLFVEIL_GATE_TRAVEL.maxStepMeters,
  reach=WOLFVEIL_GATE_TRAVEL.pushReachMeters,
}={}){
  const bx=Number(position?.x),bz=Number(position?.z)-offsetZ;
  if(![bx,bz].every(Number.isFinite))return null;
  const ax=Number(previous?.x),az=Number(previous?.z)-offsetZ;
  const step=Math.hypot(bx-ax,bz-az);
  const moved=Number.isFinite(step)&&step>1e-6&&step<=maxStep;
  for(const gate of gates||[]){
    if(area&&!gate.areas.includes(area))continue;
    const after=depthOf(gate,bx,bz);
    if(moved){
      const before=depthOf(gate,ax,az);
      const ahead=before<=0&&after>0,behind=before>=0&&after<0;
      // Where the move meets the plane must be inside the opening.
      const t=ahead||behind?before/(before-after):NaN;
      if(Math.abs(lateralOf(gate,ax+(bx-ax)*t,az+(bz-az)*t))<=gate.halfWidth+slack){
        const journey=journeyThrough(gate,ahead?1:-1,{area,offsetZ,landingMeters});
        if(journey)return journey;
      }
    }
    // Already through: inside the opening, past the plane on the side that is not loaded.
    const sign=area?(gate.behind===area?1:gate.ahead===area?-1:0):0;
    const past=after*sign;
    if(sign&&past>0&&past<=reach+1e-9&&Math.abs(lateralOf(gate,bx,bz))<=gate.halfWidth+slack){
      const journey=journeyThrough(gate,sign,{area,offsetZ,landingMeters});
      if(journey)return journey;
    }
  }
  return null;
}

/**
 * A walk or ride into a gate's opening that the world held up short of the
 * gate: `previous` -> `position` is this frame's move (WORLD x/z) and `step`
 * the move that was asked for (WORLD x/z metres). Same result as
 * wolfveilGateTravel. Walking freely towards a gate never counts, only being
 * stopped while heading into its opening, near it, from the loaded area.
 */
export function wolfveilGatePush(previous,position,step,{
  area=null,gates=wolfveilAreaGates(),offsetZ=70,
  landingMeters=WOLFVEIL_GATE_TRAVEL.landingMeters,
  slack=WOLFVEIL_GATE_TRAVEL.openingSlack,reach=WOLFVEIL_GATE_TRAVEL.pushReachMeters,
  heading=WOLFVEIL_GATE_TRAVEL.pushHeading,heldUp=WOLFVEIL_GATE_TRAVEL.pushHeldUp,
}={}){
  const ax=Number(previous?.x),az=Number(previous?.z)-offsetZ;
  const bx=Number(position?.x),bz=Number(position?.z)-offsetZ;
  const sx=Number(step?.x),sz=Number(step?.z),length=Math.hypot(sx,sz);
  if(![ax,az,bx,bz,sx,sz].every(Number.isFinite)||!(length>1e-6))return null;
  if(Math.hypot(bx-ax,bz-az)>Math.max(length,WOLFVEIL_GATE_TRAVEL.maxStepMeters))return null;
  for(const gate of gates||[]){
    if(area&&!gate.areas.includes(area))continue;
    // Towards the side that is not loaded (or, without an area, the way asked).
    const into=sx*gate.facing[0]+sz*gate.facing[1];
    const sign=area?(gate.behind===area?1:gate.ahead===area?-1:0):Math.sign(into);
    if(!sign)continue;
    const wanted=into*sign;
    if(wanted<heading*length)continue;
    const depth=depthOf(gate,bx,bz)*sign;
    if(depth>.5||depth< -reach)continue;
    if(Math.abs(lateralOf(gate,bx,bz))>gate.halfWidth+slack)continue;
    const moved=(depthOf(gate,bx,bz)-depthOf(gate,ax,az))*sign;
    if(moved>heldUp*wanted)continue;
    const journey=journeyThrough(gate,sign,{area,offsetZ,landingMeters});
    if(journey)return journey;
  }
  return null;
}

function journeyThrough(gate,sign,{area,offsetZ,landingMeters}){
  const to=sign>0?gate.ahead:gate.behind,from=sign>0?gate.behind:gate.ahead;
  if(to===from||(area&&to===area))return null;
  const landing=wolfveilGateLanding(gate,to,{meters:landingMeters});
  if(!landing)return null;
  return {gate,from,to,heading:landing.heading,landing:{x:landing.x,z:landing.z+offsetZ}};
}
