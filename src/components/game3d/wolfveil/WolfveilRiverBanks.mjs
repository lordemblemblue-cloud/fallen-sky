// Shared Wolfveil riverbank geometry. No browser or THREE dependency:
// terrain, water surface and the multiplayer map must agree on river grade.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{const v=clamp(t,0,1);return v*v*(3-2*v);};
function validated(points,width){
 if(!Array.isArray(points)||points.length<2||!Number.isFinite(width)||width<=0)
  throw new RangeError('Invalid Wolfveil river dimensions');
 for(const p of points)if(!Array.isArray(p)||p.length<3||
  !p.slice(0,3).every(Number.isFinite))
  throw new RangeError('Invalid Wolfveil river control point');
 for(let i=1;i<points.length;i++)if(Math.hypot(
  points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])<.001)
  throw new RangeError('Zero-length Wolfveil river segment');
}
export function wolfveilRiverCrossSections(points,width){
 validated(points,width);
 const tangent=[];
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1];
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  tangent.push([dx/len,dz/len]);
 }
 return points.map((p,i)=>{
  const before=tangent[Math.max(0,i-1)],after=tangent[Math.min(tangent.length-1,i)];
  const a=[before[1],-before[0]],b=[after[1],-after[0]];
  let nx=a[0]+b[0],nz=a[1]+b[1];
  const magnitude=Math.hypot(nx,nz);
  if(magnitude<.001){nx=b[0];nz=b[1];}
  else{nx/=magnitude;nz/=magnitude;}
  // The same exact left/right vertices are shared by both neighboring
  // segments, including at turns. Miter limit prevents giant corner spikes.
  const projection=nx*b[0]+nz*b[1];
  const scale=Math.min(1.55,1/Math.max(.15,projection));
  const half=width*.5*scale;
  return {
   left:[p[0]-nx*half,p[2],p[1]-nz*half],
   right:[p[0]+nx*half,p[2],p[1]+nz*half],
   downstream:after.slice(),
   miter:scale,
  };
 });
}
export function sampleWolfveilRiverbank(x,z,points,width){
 if(!Number.isFinite(x)||!Number.isFinite(z))return null;
 // This is sampled thousands of times while building shared terrain;
 // caller must pass a validated immutable authored river.
 let nearest=null,best=Infinity;
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],dx=b[0]-a[0],dz=b[1]-a[1];
  const lenSq=dx*dx+dz*dz||1;
  const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/lenSq,0,1);
  const distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
  if(distance<best){
   best=distance;
   nearest={distance,surfaceHeight:a[2]+(b[2]-a[2])*t,
    segment:i,t};
  }
 }
 return nearest;
}
// Carve the *single shared physical terrain* into a smooth submerged bed and
// shoreline. This operates on the original terrain height, not an extra
// noncolliding visual floor. On the bank's outer edge its height AND slope
// rejoin the original analytical terrain continuously.
export function gradeWolfveilRiverbank(x,z,naturalHeight,points,width){
 if(!Number.isFinite(naturalHeight))return naturalHeight;
 const nearest=sampleWolfveilRiverbank(x,z,points,width);
 if(!nearest)return naturalHeight;
 const {distance,surfaceHeight}=nearest,half=width*.5;
 const submergedEnd=half-1.8;
 const outer=half+21;
 if(distance>=outer)return naturalHeight;
 const bed=surfaceHeight-2.15;
 const submergedEdge=surfaceHeight-.78;
 if(distance<=submergedEnd){
  // Keep the bed underwater, gently scooped rather than a flat plate.
  const cross=smooth(distance/submergedEnd);
  return bed+cross*.72;
 }
 if(distance<=half){
  const t=smooth((distance-submergedEnd)/(half-submergedEnd));
  return bed+.72+(submergedEdge-(bed+.72))*t;
 }
 const bankBlend=smooth((distance-half)/(outer-half));
 // At the water edge there is no vertical cliff or see-through gap.
 // Gradually rejoin the authored surroundings, including rougher terrain.
 return submergedEdge*(1-bankBlend)+naturalHeight*bankBlend;
}
