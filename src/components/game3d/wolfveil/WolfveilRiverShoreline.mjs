// Game 3D-only visual river reach: grow the existing unindexed water ribbon
// to meet the TRUE currently-shared physical terrain (not a new fake floor).
// Default Game 1 water retains the authored 19m geometry unchanged.
import {wolfveilRiverCrossSections} from './WolfveilRiverBanks.mjs';

export function fitWolfveilWaterToBanks(points,width,terrainHeightAt,{
  maxReach=14,increment=.5,lipOverlap=.025,
}={}){
 if(typeof terrainHeightAt!=='function'||!Number.isFinite(maxReach)||
    maxReach<0||maxReach>24||!Number.isFinite(increment)||
    increment<=0||increment>4||!Number.isFinite(lipOverlap)||
    lipOverlap<0||lipOverlap>.12)
   throw new RangeError('Invalid Wolfveil water-to-bank parameters');
 const sections=wolfveilRiverCrossSections(points,width);
 let covered=0,unresolved=0;
 const result=sections.map((section,index)=>{
  const fitted={...section};
  for(const side of ['left','right']){
   const p=section[side],origin=points[index];
   // Keep an authored shared miter at every bend; each joined segment uses
   // the SAME newly extended corner, not independent normals.
   const dx=p[0]-origin[0],dz=p[2]-origin[1];
   const len=Math.hypot(dx,dz);
   if(len<.01)continue;
   const ux=dx/len,uz=dz/len,waterY=p[1];
   const height=(d)=>terrainHeightAt(p[0]+ux*d,p[2]+uz*d);
   const safe=(v)=>Number.isFinite(v);
   const first=height(0);
   if(!safe(first)){unresolved++;continue;}
   if(first>=waterY+lipOverlap){covered++;continue;}
   let lo=0,hi=null;
   for(let d=Math.min(increment,maxReach);d<=maxReach+1e-8;d=Math.min(d+increment,maxReach)){
    const sample=height(d);
    if(!safe(sample)){unresolved++;break;}
    if(sample>=waterY+lipOverlap){hi=d;break;}
    lo=d;
    if(d===maxReach)break;
   }
   if(hi==null){unresolved++;continue;}
   for(let j=0;j<12;j++){
    const mid=(lo+hi)*.5;
    const v=height(mid);
    if(!safe(v)){unresolved++;hi=null;break;}
    if(v>=waterY+lipOverlap)hi=mid;
    else lo=mid;
   }
   if(hi==null)continue;
   fitted[side]=[p[0]+ux*hi,waterY,p[2]+uz*hi];
   covered++;
  }
  return fitted;
 });
 return {sections:result,covered,unresolved};
}

// Bound per-segment shoreline interpolation to preserve the natural curves
// BETWEEN authored waypoints, not only at the 16 original corner joins.
export function resampleWolfveilRiverPoints(points,maxStep=7){
 if(!Number.isFinite(maxStep)||maxStep<2||maxStep>20)
   throw new RangeError('Invalid Wolfveil river sampling step');
 wolfveilRiverCrossSections(points,1); // validate segment lengths/values
 const out=[points[0].slice()];
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const count=Math.max(1,Math.ceil(length/maxStep));
  for(let k=1;k<=count;k++){
   const t=k/count;
   out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,
     a[2]+(b[2]-a[2])*t]);
  }
 }
 return out;
}
