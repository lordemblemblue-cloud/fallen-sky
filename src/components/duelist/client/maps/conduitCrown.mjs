// Crown tactical layout. All coordinates in Conduit map-local metres.
export const CROWN_TACTICAL_SPEC=Object.freeze({coverRadius:6.0,coverOffset:1.85,coverWidth:2.2,coverDepth:.78,coverHeight:.75,landingRadius:1.2,bodyRadius:.4,bodyHeight:1.8});
const polar=(a,r,t=0)=>({x:Math.sin(a)*r+Math.cos(a)*t,z:Math.cos(a)*r-Math.sin(a)*t});
const point=(a,r,t,y)=>({...polar(a,r,t),y});
export function createConduitCrownPlan(cfg){
  const s=CROWN_TACTICAL_SPEC,y=cfg.yCrown,cover=[],details=[],landings=[],exits=[];
  const detail=(label,a,r,t,dy,sx,sy,sz,material)=>{
    const p=polar(a,r,t);details.push({label,x:p.x,y:y+dy,z:p.z,sx,sy,sz,rotY:a,material});
  };
  cfg.cardinals.forEach((a,i)=>{
    // Slightly offset each barrier to leave the cardinal escape lane open.
    const p=polar(a,s.coverRadius,s.coverOffset);
    cover.push({label:'Crown Cover '+(i+1),x:p.x,y:y+s.coverHeight/2,z:p.z,sx:s.coverWidth,sy:s.coverHeight,sz:s.coverDepth,rotY:a,walkable:true});
    // Flush cap and recessed face styling. No new collision or shadow casters.
    detail('cover stripe '+i,a,s.coverRadius,s.coverOffset,s.coverHeight+.006,s.coverWidth-.08,.012,s.coverDepth-.06,'orangeSafety');
    for(const t of [-.8,.8])detail('cover trim '+i+' '+t,a,s.coverRadius-.391,s.coverOffset+t,.33,.12,.44,.012,'brushedSteel');
    // Visual-only hazard stripe at open edge; no raised physical lip.
    for(let j=-2;j<=2;j++)detail('exit '+i+' '+j,a,8.05,j*.29,.008,.18,.016,.30,'yellowHazard');
    exits.push(point(a,8.2,0,y));
  });
  cfg.buildings.forEach(b=>{
    const a=b.angle,r=cfg.crownLandingR;
    landings.push({id:b.id,...point(a,r,0,y),radius:s.landingRadius});
    // Outline landing envelope with recessed, non-colliding corner marks.
    for(const t of [-1,1])for(const dr of [-1,1]){
      detail(b.id+' landing cross '+t+' '+dr,a,r+dr*1.10,t*1.10,.009,.35,.018,.08,'cyanGlow');
      detail(b.id+' landing side '+t+' '+dr,a,r+dr*1.10,t*1.10,.009,.08,.018,.35,'cyanGlow');
    }
    for(const t of [-.26,.26])detail(b.id+' inward guide '+t,a,r-1.55,t,.008,.14,.016,.36,'brushedSteel');
  });
  // Low-profile concentric power-up markings, leaving the pickup at origin.
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    detail('pickup ring '+i,a,1.45,0,.008,.46,.016,.07,i%4===0?'redGlow':'brushedSteel');
  }
  return {cover,details,landings,exits};
}
export function crownCoverOverlap(box,p,r=CROWN_TACTICAL_SPEC.bodyRadius,h=CROWN_TACTICAL_SPEC.bodyHeight){
  const dx=p.x-box.x,dz=p.z-box.z,c=Math.cos(box.rotY),s=Math.sin(box.rotY);
  const u=dx*c-dz*s,v=dx*s+dz*c;
  return Math.hypot(Math.max(0,Math.abs(u)-box.sx/2),Math.max(0,Math.abs(v)-box.sz/2))<r-1e-7&&p.y<box.y+box.sy/2-1e-7&&p.y+h>box.y-box.sy/2+1e-7;
}
export function crownSegmentClear(plan,from,to,r=CROWN_TACTICAL_SPEC.bodyRadius){
  const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)/.08));
  for(let i=0;i<=n;i++){
    const t=i/n,p={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t};
    if(plan.cover.some(b=>crownCoverOverlap(b,p,r)))return false;
  }
  return true;
}
export function crownPadArcClear(plan,pad,target,gravity=-22,time=1.45){
  const vy=(target.y-pad.y-.5*gravity*time*time)/time,n=Math.ceil(time*240);
  for(let i=0;i<=n;i++){
    const t=i*time/n,p={x:pad.x+(target.x-pad.x)*t/time,y:pad.y+vy*t+.5*gravity*t*t,z:pad.z+(target.z-pad.z)*t/time};
    if(plan.cover.some(b=>crownCoverOverlap(b,p)))return false;
  }
  return true;
}
