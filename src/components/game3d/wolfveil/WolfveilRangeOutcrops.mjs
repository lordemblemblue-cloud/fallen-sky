// Rock outcrops on the sculpted ranges (2026-11-16 landscaping, round 2).
// Big baked rocks (WolfveilBakedRocks.js) bedded into the steep flanks so
// the ranges read as rock breaking through soil, not smooth lumps. Pure
// data (no THREE). Decorative only: they sit on slopes too steep to be
// walking routes and never come near trails, the river or encounter sites.
import {wolfveilHeight,wolfveilDistanceToRiver,wolfveilAnyTrailClearance} from './WolfveilLayout.js';
import {wolfveilMountainness,wolfveilFightingGroundAt,wolfveilMobAreaAt} from './WolfveilLandscapeDesign.mjs';

export const WOLFVEIL_OUTCROP_BUDGET=Object.freeze({max:900,cell:16,half:542});
const mulberry32=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);
  t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

/**
 * Placements {x,z,yaw,tiltX,sx,sy,sz,sink,kind:'outcrop',grounding:'center',tint}
 * in unshifted local metres. The long axis follows the contour, the base is
 * tilted with the slope, and the rock is sunk deep enough that the downhill
 * edge never floats above the ground.
 */
export function planWolfveilRangeOutcrops({heightAt=wolfveilHeight,seed=0x0c7c0de,
  half=WOLFVEIL_OUTCROP_BUDGET.half,cell=WOLFVEIL_OUTCROP_BUDGET.cell}={}){
  const rand=mulberry32(seed),out=[],max=WOLFVEIL_OUTCROP_BUDGET.max;
  for(let cz=-half;cz<half;cz+=cell)for(let cx=-half;cx<half;cx+=cell){
    const x=cx+rand()*cell,z=cz+rand()*cell;
    const roll=rand(),sizeRoll=rand(),shape=rand(),tone=rand();
    if(out.length>=max)break;
    const m=wolfveilMountainness(x,z);
    if(m<.25)continue;
    const e=2,gx=(heightAt(x+e,z)-heightAt(x-e,z))/(2*e),gz=(heightAt(x,z+e)-heightAt(x,z-e))/(2*e);
    const slope=Math.hypot(gx,gz);
    if(roll>smooth(.35,.95,slope)*smooth(.25,.7,m)*.8)continue;
    if(wolfveilAnyTrailClearance(x,z)<9||wolfveilDistanceToRiver(x,z)<22)continue;
    if(wolfveilFightingGroundAt(x,z,12)||wolfveilMobAreaAt(x,z,12))continue;
    const s=1.8+sizeRoll*sizeRoll*5.5;
    const sx=s*(1+.6*shape),sy=s*(.45+.3*rand()),sz=s*(.7+.3*rand());
    const phi=Math.atan(slope),theta=-.75*phi;
    // Uphill along local +z; the base tilts with the slope by 75%.
    const reach=sz*.8,gap=reach*Math.max(0,Math.tan(phi)-Math.sin(-theta));
    const sink=Math.max(.32*2*sy,gap+.35);
    // On near-vertical faces the "no floating edge" depth would bury the rock.
    if(sink>1.2*sy)continue;
    out.push({x,z,yaw:Math.atan2(gx,gz)+(rand()-.5)*.5,tiltX:theta,tiltZ:(rand()-.5)*.12,
      sx,sy,sz,sink,kind:'outcrop',grounding:'center',
      tint:[.92+.1*tone,.92+.1*tone,.9+.1*tone]});
  }
  return out;
}
