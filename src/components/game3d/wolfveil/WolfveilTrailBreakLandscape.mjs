// Landscaping for the washed-out trail stretches ("breakaway path";
// WolfveilTrailBreaks.mjs), 2026-11-16 landscaping round 2. Pure data.
//
// Where the dirt ribbon stops, the story should read from the ground: a line
// of flat stepping stones carries the walker across, boulders the water
// could not move frame both washout edges, a scree fan runs across the trail
// where the run-off crossed, and the soil underneath turns to gravel.
// Rocks are baked-rock placements (WolfveilBakedRocks.js); decorative only.
import {WOLFVEIL_ROUTES} from './WolfveilLayout.js';
import {WOLFVEIL_TRAIL_BREAKS,wolfveilRoutePointAt} from './WolfveilTrailBreaks.mjs';

const TAU=Math.PI*2;
const mulberry32=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);
  t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};

/** Baked-rock placements for every trail break (unshifted local metres). */
export function planWolfveilTrailBreakLandscape({seed=0xb7ea4,routes=WOLFVEIL_ROUTES}={}){
  const rand=mulberry32(seed),out=[];
  for(const gap of WOLFVEIL_TRAIL_BREAKS){
    const route=routes.find(r=>r.id===gap.route);
    if(!route)continue;
    const half=route.width/2;
    // 1. Stepping stones down the old centre line.
    for(let along=gap.from+.9;along<=gap.to-.6;along+=1.05+rand()*.25){
      const p=wolfveilRoutePointAt(route,along);if(!p)continue;
      const lateral=(rand()-.5)*.5;
      const s=.3+rand()*.12;
      out.push({x:p.x-p.dz*lateral,z:p.z+p.dx*lateral,yaw:rand()*TAU,
        sx:s,sy:.075+rand()*.035,sz:s*(.8+rand()*.2),sink:.015,kind:'stepping',variant:'flat',
        tint:[.98,.97,.95]});
    }
    // 2. Boulders framing both washout edges, off the walking line.
    for(const along of [gap.from,gap.to]){
      const p=wolfveilRoutePointAt(route,along);if(!p)continue;
      for(const side of [-1,1]){
        const n=1+Math.floor(rand()*2);
        for(let i=0;i<n;i++){
          const lateral=side*(half+1.1+rand()*1.6),slide=(rand()-.5)*2.2;
          const s=.45+rand()*.45;
          out.push({x:p.x+p.dx*slide-p.dz*lateral,z:p.z+p.dz*slide+p.dx*lateral,yaw:rand()*TAU,
            sx:s*(1+rand()*.4),sy:s*(.6+rand()*.3),sz:s,sink:s*.35,kind:'gate',tint:[.9,.89,.86]});
        }
      }
    }
    // 3. A scree fan across the trail where the run-off crossed it.
    const mid=wolfveilRoutePointAt(route,(gap.from+gap.to)/2);
    if(mid)for(let i=0;i<14;i++){
      const lateral=(rand()-.5)*(route.width+9),slide=(rand()-.5)*(2.2+Math.abs(lateral)*.35);
      if(Math.abs(lateral)<half*.6&&Math.abs(slide)<.8)continue; // keep the stepping line clear
      const s=.1+rand()*.22;
      out.push({x:mid.x+mid.dx*slide-mid.dz*lateral,z:mid.z+mid.dz*slide+mid.dx*lateral,yaw:rand()*TAU,
        sx:s*(1+rand()*.5),sy:s*(.5+rand()*.3),sz:s,sink:s*.3,kind:'scree',tint:[.86,.84,.8]});
    }
  }
  return out;
}

// Segment cache for the gravel mask: each break as a polyline along its route.
let BREAK_SEGMENTS=null;
function breakSegments(){
  if(BREAK_SEGMENTS)return BREAK_SEGMENTS;
  BREAK_SEGMENTS=[];
  for(const gap of WOLFVEIL_TRAIL_BREAKS){
    const route=WOLFVEIL_ROUTES.find(r=>r.id===gap.route);
    if(!route)continue;
    const pts=[];
    for(let a=gap.from-2;a<=gap.to+2.01;a+=2)pts.push(wolfveilRoutePointAt(route,a));
    for(let i=0;i<pts.length-1;i++)if(pts[i]&&pts[i+1])
      BREAK_SEGMENTS.push({a:pts[i],b:pts[i+1],half:route.width/2});
  }
  return BREAK_SEGMENTS;
}

/** 0..1 gravel weight on the ground of a washed-out stretch (soft edge). */
export function wolfveilTrailBreakGravel(x,z){
  let best=0;
  for(const s of breakSegments()){
    const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,l=dx*dx+dz*dz||1;
    if(Math.abs(x-s.a.x)>12||Math.abs(z-s.a.z)>12)continue;
    const t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.z)*dz)/l));
    const d=Math.hypot(x-s.a.x-dx*t,z-s.a.z-dz*t);
    const w=1-Math.max(0,Math.min(1,(d-s.half-.5)/3));
    if(w>best)best=w;
  }
  return best*best*(3-2*best);
}
