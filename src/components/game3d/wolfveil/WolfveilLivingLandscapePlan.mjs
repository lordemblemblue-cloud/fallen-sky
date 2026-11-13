// Deterministic planting plan that brings the Wolfveil valley to life:
// wildflower drifts in the open meadows, shrub thickets on damp ground and
// near the river, ferns and fallen logs under the trees, and reed beds with
// wet stones along the riverbank. Pure data (no THREE). Everything here is
// decorative and soft: no colliders, walkable ground and server movement
// are unchanged.
import {WOLFVEIL_RIVER,WOLFVEIL_CAVES,wolfveilRouteClearance,wolfveilDistanceToRiver,
  wolfveilRiverHeightAtZ} from './WolfveilLayout.js';
import {wolfveilTreePlacements,wolfveilNativeElmPlacements} from './WolfveilForestLayout.js';
import {isInsideWolfveilFountainHomeClearance} from './WolfveilFountainHomesLayout.mjs';
import {openGround} from './WolfveilTrailLandscapingPlan.mjs';

export const WOLFVEIL_LIVING_LANDSCAPE_BUDGET=Object.freeze({
  maxFlowers:2000,maxShrubs:420,maxFerns:600,maxReeds:800,maxBankStones:400,maxLogs:60,
  flowerTriangles:18,shrubTriangles:60,fernTriangles:18,reedTriangles:15,
  stoneTriangles:20,logTriangles:28,
});
// One species owns each drift, the way meadows really colour in patches.
export const WOLFVEIL_FLOWER_SPECIES=Object.freeze(['daisy','buttercup','lupine','poppy','heather']);
const FLOWER_DRIFT=.78;
const TAU=Math.PI*2;
const mulberry32=(seed)=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);
  t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const hash=(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s);};
// Smooth value noise: gives drifts and thickets soft, organic outlines.
const noise=(x,z)=>{
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
};
const nearCave=(x,z)=>WOLFVEIL_CAVES.some(c=>
  Math.hypot(x-c.entry[0],z-c.entry[1])<12||Math.hypot(x-c.exit[0],z-c.exit[1])<12);

export function planWolfveilLivingLandscape({heightAt,seed=0x1eaf5eed,half=538}={}){
  if(typeof heightAt!=='function')throw new TypeError('heightAt sampler required');
  const rand=mulberry32(seed),B=WOLFVEIL_LIVING_LANDSCAPE_BUDGET;
  const flowers=[],shrubs=[],ferns=[],reeds=[],bankStones=[],logs=[];
  const free=(x,z,clear)=>openGround(x,z,half)&&wolfveilRouteClearance(x,z)>=clear&&
    !isInsideWolfveilFountainHomeClearance(x,z,2)&&!nearCave(x,z);
  const slopeAt=(x,z,y)=>Math.hypot(heightAt(x+2,z)-y,heightAt(x,z+2)-y)/2;
  const put=(list,max,item)=>{if(list.length<max&&Number.isFinite(item.y))list.push(item);};

  // 1. Wildflower drifts on gentle, open ground below the high ridges.
  const species=WOLFVEIL_FLOWER_SPECIES.length;
  for(let cz=-half;cz<half;cz+=18)for(let cx=-half;cx<half;cx+=18){
    const x=cx+rand()*18,z=cz+rand()*18,roll=rand(),drift=noise(x/85,z/85);
    if(drift<FLOWER_DRIFT||!free(x,z,1))continue;
    const y=heightAt(x,z);
    if(y>105||slopeAt(x,z,y)>.24)continue;
    const home=Math.floor(noise(x/170+40,z/170-17)*species)%species;
    const count=3+Math.floor((drift-FLOWER_DRIFT)/(1-FLOWER_DRIFT)*10+roll*3);
    for(let i=0;i<count;i++){
      const a=rand()*TAU,r=Math.sqrt(rand())*8,fx=x+Math.cos(a)*r,fz=z+Math.sin(a)*r;
      const stray=rand()<.14;
      if(!free(fx,fz,.5))continue;
      put(flowers,B.maxFlowers,{x:fx,y:heightAt(fx,fz),z:fz,
        species:stray?(home+1+Math.floor(rand()*2))%species:home,
        size:.8+rand()*.6,yaw:rand()*TAU,tone:rand()});
    }
  }

  // 2. Shrub thickets: damp hollows and the outer riverbank grow the most.
  for(let cz=-half;cz<half;cz+=32)for(let cx=-half;cx<half;cx+=32){
    const x=cx+rand()*32,z=cz+rand()*32,roll=rand();
    if(!free(x,z,2.2))continue;
    const y=heightAt(x,z);
    if(slopeAt(x,z,y)>.42)continue;
    const chance=.05+.3*smooth(.5,.78,noise(x/75+9,z/75+3))+
      .3*(1-smooth(18,48,wolfveilDistanceToRiver(x,z)));
    if(roll>chance)continue;
    for(let i=0,n=1+Math.floor(rand()*4);i<n;i++){
      const a=rand()*TAU,r=i?1+rand()*3.2:0,sx=x+Math.cos(a)*r,sz=z+Math.sin(a)*r;
      if(!free(sx,sz,1.6))continue;
      const sy=heightAt(sx,sz);
      put(shrubs,B.maxShrubs,{x:sx,y:sy,z:sz,size:i?.5+rand()*.4:.75+rand()*.45,
        yaw:rand()*TAU,tone:rand(),dry:sy>70&&rand()<.5});
    }
  }

  // 3. Forest floor: ferns ring every tree, and old trees have dropped a log.
  const fern=(x,z)=>{if(free(x,z,.6))put(ferns,B.maxFerns,
    {x,y:heightAt(x,z),z,size:.8+rand()*.7,yaw:rand()*TAU,tone:rand()});};
  for(const tree of [...wolfveilTreePlacements(),...wolfveilNativeElmPlacements()]){
    for(let i=0,n=7+Math.floor(rand()*6);i<n;i++){
      const a=rand()*TAU,r=2.4+rand()*7;
      fern(tree.x+Math.cos(a)*r,tree.z+Math.sin(a)*r);
    }
    if(rand()>(tree.kind==='ancient'?.9:.4))continue;
    const a=rand()*TAU,r=5+rand()*7,x=tree.x+Math.cos(a)*r,z=tree.z+Math.sin(a)*r;
    const length=2.4+rand()*2.4,yaw=rand()*TAU,ex=Math.cos(yaw)*length/2,ez=-Math.sin(yaw)*length/2;
    if(!free(x,z,2.2)||!free(x+ex,z+ez,1.2)||!free(x-ex,z-ez,1.2))continue;
    // Lay the log along the ground it rests on.
    const high=heightAt(x+ex,z+ez),low=heightAt(x-ex,z-ez);
    if(Math.abs(high-low)>length*.45)continue;
    put(logs,B.maxLogs,{x,y:(high+low)/2,z,length,radius:.15+rand()*.09,yaw,
      pitch:Math.atan2(high-low,length),moss:rand(),tone:rand()});
    for(let i=0;i<3;i++)fern(x+(rand()-.5)*length,z+(rand()-.5)*length);
  }

  // 4. Riverbank: reed beds in patches, wet stones between them. The falls
  // and every bridge approach stay clear.
  const pts=WOLFVEIL_RIVER.points,[fallMin,fallMax]=WOLFVEIL_RIVER.waterfallRange;
  const bank=WOLFVEIL_RIVER.width/2;
  let run=0;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
    for(let s=0;s<length;s+=1.6,run+=1.6)for(const side of [-1,1]){
      const bed=noise(run/13+side*31,side*7.3),offset=bank+.4+rand()*2.6;
      const slide=rand()*1.6,pick=rand(),size=rand(),tone=rand();
      const x=a[0]+dx*(s+slide)-dz*side*offset,z=a[1]+dz*(s+slide)+dx*side*offset;
      if(Math.abs(x)>half||Math.abs(z)>half||(z>fallMin-14&&z<fallMax+14))continue;
      if(wolfveilDistanceToRiver(x,z)<bank+.2||wolfveilRouteClearance(x,z)<3)continue;
      const y=heightAt(x,z),water=wolfveilRiverHeightAtZ(z);
      if(!(y>water-.3&&y<water+1.8))continue;
      if(bed>.52)put(reeds,B.maxReeds,{x,y,z,size:.8+size*.6,yaw:pick*TAU,tone});
      else if(pick<.4)put(bankStones,B.maxBankStones,{x,y,z,size:.12+size*.34,yaw:pick*TAU*2.5,
        tilt:(tone-.5)*.5,squash:.5+tone*.4,stretch:.85+size*.5,tone,moss:pick<.12?.5:0});
    }
  }

  const triangles=flowers.length*B.flowerTriangles+shrubs.length*B.shrubTriangles+
    ferns.length*B.fernTriangles+reeds.length*B.reedTriangles+
    bankStones.length*B.stoneTriangles+logs.length*B.logTriangles;
  return Object.freeze({flowers,shrubs,ferns,reeds,bankStones,logs,triangles});
}