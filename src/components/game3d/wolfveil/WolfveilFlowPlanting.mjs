// Deterministic, renderer-independent route-aware planting for the LIVE Wolfveil scene.
// Coordinates are the unshifted Wolfveil map, not player/world-space after +70m offset.
// This describes visual-only plants; forest trunks and terrain retain their existing authority.
export const WOLFVEIL_FLOW_BUDGET=Object.freeze({grass:5700,shrubs:380,stones:210});
const finite=(v)=>Number.isFinite(v);
const unit=v=>Math.max(0,Math.min(1,v));
const validPosition=(x,z,margin)=>finite(x)&&finite(z)&&Math.abs(x)<550-margin&&Math.abs(z)<550-margin;
const randomFromSeed=(seed)=>{
 let state=seed>>>0;
 return ()=>{state=(state+0x6D2B79F5)>>>0;
  let t=Math.imul(state^(state>>>15),state|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
 };
};
const farEnough=(x,z,trees,clearance)=>!trees.some(t=>
 Math.abs(t.x-x)<clearance&&Math.abs(t.z-z)<clearance&&Math.hypot(t.x-x,t.z-z)<clearance);

/**
 * Place a continuous but nonuniform pair of living borders along authored routes.
 * Banks weave with the centerline and use the tangent to make clumps flow
 * forwards like a current. Player path interiors remain completely clear.
 * All the geometry using these points stays cosmetic; no fake client collision.
 */
export function planWolfveilFlowPlanting({routes=[],clearOf=()=>true,heightAt=()=>0,
 distanceToRiver=()=>Infinity,trees=[],seed=0x51c0f22,step=1.6,
 budgets=WOLFVEIL_FLOW_BUDGET}={}){
 if(!Array.isArray(routes)||!Array.isArray(trees)||!finite(step)||step<1.4||step>12)
  throw Error('Invalid Wolfveil flow planting inputs');
 const rng=randomFromSeed(seed),grass=[],shrubs=[],stones=[];
 let considered=0;
 for(const route of routes){
  if(!Array.isArray(route?.points)||!finite(route.width)||route.width<=0)continue;
  let traveled=0;
  for(let i=0;i<route.points.length-1;i++){
   const a=route.points[i],b=route.points[i+1];
   if(!Array.isArray(a)||!Array.isArray(b)||!a.concat(b).every(finite))continue;
   const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
   if(length<.1)continue;
   const nx=-dz/length,nz=dx/length,angle=Math.atan2(dx,dz);
   const steps=Math.floor(length/step);
   for(let j=0;j<steps;j++){
    const distance=(j+.35+rng()*.28)*step;
    const t=unit(distance/length),cx=a[0]+dx*t,cz=a[1]+dz*t;
    for(const sign of [-1,1]){
     considered++;
     // Three unaligned stream ribbons: fine grass shoulder, taller grass bank,
     // then alternating understory/stone punctuation near bends.
     const wave=.58*Math.sin((traveled+distance)*.087+sign*1.4+i*.8);
     const band=1.15+rng()*3.65+wave;
     const reach=route.width*.5+Math.max(.75,band);
     const x=cx+sign*nx*reach+(rng()-.5)*.55;
     const z=cz+sign*nz*reach+(rng()-.5)*.55;
     if(!validPosition(x,z,9)||!clearOf({x,z},.32)||
        !farEnough(x,z,trees,2.25)||distanceToRiver(x,z)<17.2)continue;
     const y=heightAt(x,z);
     if(!finite(y))continue;
     const yaw=angle+.23*Math.sin((traveled+distance)*.11+sign*2)+(rng()-.5)*.24;
     const bend=Math.abs(Math.sin((traveled+distance)*.087+i*.8));
     // Vary apparent clump length and density rather than repeating a fence.
     if(grass.length<(budgets.grass??0)){
      grass.push({x,y,z,yaw,width:.48+rng()*.52,height:.45+rng()*.68,
       shade:Math.floor(rng()*5),route:route.id});
     }
     const farther=reach>route.width*.5+2.2;
     if(farther&&j%3===0&&rng()<.79&&shrubs.length<(budgets.shrubs??0)&&
        clearOf({x,z},1.25)&&farEnough(x,z,trees,3)){
      shrubs.push({x,y:y+.4,z,yaw,scale:.45+rng()*.58,
       shade:Math.floor(rng()*4),route:route.id});
     }else if(j%4===1&&bend>.22&&rng()<.59&&stones.length<(budgets.stones??0)){
      const radius=.20+rng()*.28;
      stones.push({x,y:y+radius*.18,z,yaw,scale:radius,route:route.id});
     }
    }
   }
   traveled+=length;
  }
 }
 return {grass,shrubs,stones,considered,visualOnly:true};
}

// Broad, repeatable world currents for meadow grass outside the road banks.
// The function changes gradually over hundreds of metres, unlike white-noise
// per-clump rotation, and preserves uniform traversal/physical collision.
export function wolfveilGrassCurrent(x,z){
 if(!finite(x)||!finite(z))return 0;
 const lateral=Math.sin(z*.007+Math.sin(x*.004)*.85)*.65+
   Math.cos(x*.005-z*.002)*.28;
 const forward=.85+.24*Math.cos(x*.003-z*.006);
 return Math.atan2(lateral,forward);
}
