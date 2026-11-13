// Deterministic landscaping plan for the whole Wolfveil valley: stones and
// boulders along trail shoulders, green and sun-dried grass tufts, rubble
// where a trail is washed out, and rock outcrops on rougher wild ground.
// Pure data (no THREE): every item is decorative and low enough to step over,
// so walkable ground, colliders and server movement are unchanged.
import {WOLFVEIL_ROUTES,WOLFVEIL_SITES,wolfveilRouteClearance,
  wolfveilDistanceToRiver} from './WolfveilLayout.js';
import {WOLFVEIL_PALACE} from './WolfveilPalaceLayout.mjs';
import {insideWolfveilImportedTown} from './WolfveilImportedTownLayout.mjs';
import {WOLFVEIL_TRAIL_BREAKS,wolfveilTrailBreakAt,wolfveilRoutePointAt,
  wolfveilRouteLength} from './WolfveilTrailBreaks.mjs';

export const WOLFVEIL_TRAIL_LANDSCAPING_BUDGET=Object.freeze({
  maxRocks:2600,maxTufts:3600,rockTriangles:20,tuftTriangles:15,
});
const TAU=Math.PI*2;
const mulberry32=(seed)=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);
  t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

// Keep plazas, the palace, the river and the map edge free of scatter.
export function openGround(x,z,half){
  if(Math.abs(x)>half||Math.abs(z)>half)return false;
  if(wolfveilDistanceToRiver(x,z)<16)return false;
  if(insideWolfveilImportedTown(x,z,2))return false; // nothing grows through the town's paving
  if(Math.abs(x-WOLFVEIL_PALACE.x)<WOLFVEIL_PALACE.width/2+12&&
     Math.abs(z-WOLFVEIL_PALACE.z)<WOLFVEIL_PALACE.depth/2+16)return false;
  const {market,sanctuary,southGate}=WOLFVEIL_SITES;
  if(Math.hypot(x-market.x,z-market.z)<46)return false;
  if(Math.hypot(x-sanctuary.x,z-sanctuary.z)<32)return false;
  if(Math.hypot(x-southGate.x,z-southGate.z)<26)return false;
  return true;
}

export function planWolfveilTrailLandscaping({heightAt,seed=0x7a11c0de,half=538}={}){
  if(typeof heightAt!=='function')throw new TypeError('heightAt sampler required');
  const rand=mulberry32(seed),B=WOLFVEIL_TRAIL_LANDSCAPING_BUDGET;
  const rocks=[],tufts=[],plantAnchors=[],grassAnchors=[];
  const rock=(x,z,size,moss=0)=>{
    if(rocks.length>=B.maxRocks)return;
    const y=heightAt(x,z);if(!Number.isFinite(y))return;
    rocks.push({x,y,z,size,yaw:rand()*TAU,tilt:(rand()-.5)*.5,
      squash:.62+rand()*.5,stretch:.8+rand()*.55,tone:rand(),moss});
  };
  const tuft=(x,z,dry,size=1)=>{
    if(tufts.length>=B.maxTufts)return;
    const y=heightAt(x,z);if(!Number.isFinite(y))return;
    tufts.push({x,y,z,dry,size:size*(.75+rand()*.7),yaw:rand()*TAU,tone:rand()});
  };

  // 1. Trail shoulders: clustered stones and grass just off the walked line.
  for(const route of WOLFVEIL_ROUTES){
    const total=wolfveilRouteLength(route),wild=route.kind==='explore'||route.kind==='ridge';
    const edge=route.width/2;
    for(let along=3,station=0;along<total;along+=6,station++){
      const p=wolfveilRoutePointAt(route,along);
      if(!p||wolfveilTrailBreakAt(route.id,along))continue;
      for(const side of [-1,1]){
        const at=(offset,slide)=>[p.x+p.dx*slide-p.dz*side*offset,
          p.z+p.dz*slide+p.dx*side*offset];
        const free=([x,z],clear)=>openGround(x,z,half)&&wolfveilRouteClearance(x,z)>=clear;
        if(rand()<(wild?.36:.2)){
          const offset=edge+1.1+rand()*4.6,slide=(rand()-.5)*5,count=1+Math.floor(rand()*3);
          for(let i=0;i<count;i++){
            const spot=at(offset+(i?(rand()-.5)*3.2:0),slide+(i?(rand()-.5)*3.2:0));
            if(free(spot,.7))rock(spot[0],spot[1],i?.14+rand()*.26:.42+rand()*.5,rand()<.35?rand()*.6:0);
          }
        }
        const blades=1+Math.floor(rand()*3);
        for(let i=0;i<blades;i++){
          const spot=at(edge+.35+rand()*6.5,(rand()-.5)*6);
          if(free(spot,.25))tuft(spot[0],spot[1],rand()<(wild?.55:.3));
        }
        // Spots for the imported plant and grass models, spaced along trails.
        if((station+(side>0?2:0))%4===0){
          const spot=at(edge+2+rand()*4,(rand()-.5)*4);
          if(free(spot,1.5)){
            const y=heightAt(spot[0],spot[1]);
            (station%8<4?plantAnchors:grassAnchors).push({x:spot[0],y,z:spot[1],yaw:rand()*TAU});
          }
        }
      }
    }
  }

  // 2. Washed-out stretches: rubble and overgrowth where the dirt ribbon stops.
  for(const gap of WOLFVEIL_TRAIL_BREAKS){
    const route=WOLFVEIL_ROUTES.find(r=>r.id===gap.route);
    if(!route)continue;
    for(let along=gap.from-2.5;along<=gap.to+2.5;along+=1.1){
      const p=wolfveilRoutePointAt(route,along);if(!p)continue;
      const across=()=>(rand()-.5)*(route.width+3.5),slide=()=>(rand()-.5)*1.4;
      for(let i=0;i<2;i++){
        const lateral=across(),s=slide();
        if(!openGround(p.x-p.dz*lateral,p.z+p.dx*lateral,half))continue;
        rock(p.x+p.dx*s-p.dz*lateral,p.z+p.dz*s+p.dx*lateral,.1+rand()*.24,rand()<.3?.4:0);
      }
      for(let i=0;i<2;i++){
        const lateral=across(),s=slide();
        if(!openGround(p.x-p.dz*lateral,p.z+p.dx*lateral,half))continue;
        tuft(p.x+p.dx*s-p.dz*lateral,p.z+p.dz*s+p.dx*lateral,rand()<.6,.85);
      }
    }
  }

  // 3. Wild ground: outcrops gather where the land is rougher or higher.
  const cell=30;
  for(let cz=-half;cz<half;cz+=cell)for(let cx=-half;cx<half;cx+=cell){
    const x=cx+rand()*cell,z=cz+rand()*cell,roll=rand();
    if(!openGround(x,z,half)||wolfveilRouteClearance(x,z)<2.5)continue;
    const y=heightAt(x,z),slope=Math.hypot(heightAt(x+3,z)-y,heightAt(x,z+3)-y)/3;
    const chance=.07+.38*smooth(.12,.36,slope)+.1*smooth(55,120,y);
    if(roll>chance)continue;
    const count=2+Math.floor(rand()*5),spread=1.6+rand()*2.4;
    for(let i=0;i<count;i++){
      const a=rand()*TAU,r=rand()*spread;
      rock(x+Math.cos(a)*r,z+Math.sin(a)*r,i?.16+rand()*.34:.5+rand()*.45,rand()<.4?rand()*.7:0);
    }
    for(let i=0,n=2+Math.floor(rand()*4);i<n;i++){
      const a=rand()*TAU,r=1+rand()*(spread+2.5);
      tuft(x+Math.cos(a)*r,z+Math.sin(a)*r,rand()<.7);
    }
  }
  return Object.freeze({rocks,tufts,plantAnchors,grassAnchors,
    triangles:rocks.length*B.rockTriangles+tufts.length*B.tuftTriangles});
}