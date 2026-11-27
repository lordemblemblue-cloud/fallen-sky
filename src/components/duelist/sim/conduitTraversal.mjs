// Renderer-independent traversal candidate for The Conduit. Never register in
// live matches until the actual geometry and server/client authority are certified.
// All coordinates are metres; feet may be below zero. No DOM or Three.js dependency.
import {registerConduitBroadphase,conduitCandidates} from './conduitBroadphase.mjs';
const EPS=1e-5;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const local=(s,x,z)=>{const dx=x-s.cx,dz=z-s.cz;return [dx*s.cos-dz*s.sin,dx*s.sin+dz*s.cos];};
function boxOverlap(s,x,z,r=0){
  const [lx,lz]=local(s,x,z);
  return Math.hypot(Math.max(0,Math.abs(lx)-s.hx),Math.max(0,Math.abs(lz)-s.hz))<=r;
}
function discOverlap(s,x,z,r=0){
  if(Math.hypot(x-s.cx,z-s.cz)>s.radius+r)return false;
  // A hole is free only when the complete queried circle fits in it.
  return !(s.cutouts??[]).some(c=>{const [u,v]=local(c,x,z);return Math.abs(u)+r<c.hx-EPS&&Math.abs(v)+r<c.hz-EPS;});
}
function annulusOverlap(s,x,z,r=0){
  const d=Math.hypot(x,z);return d+r>=s.rMin&&d-r<=s.rMax;
}
function rampY(s,x,z,r=0){
  const [u,v]=local(s,x,z);
  if(Math.abs(u)>s.width/2+r||Math.abs(v)>s.length/2+r)return null;
  return s.yStart+clamp((v+s.length/2)/s.length,0,1)*(s.yEnd-s.yStart);
}
const REGISTRY_KEYS=['obbs','ramps','cylinders','discs','annuli','shaftOpenings','jumpPads'];
export function snapshotConduitCollision(world){
  if(!world||REGISTRY_KEYS.some(k=>!Array.isArray(world[k])))throw new TypeError('Invalid Conduit collision registry');
  const clone=JSON.parse(JSON.stringify(Object.fromEntries(REGISTRY_KEYS.map(k=>[k,world[k]]))));
  const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
  const snapshot=freeze(clone);
  registerConduitBroadphase(snapshot);
  return snapshot;
}
// Flat landing contact uses the capsule footprint; ramps keep the center plane.
// A capsule can meet a deck edge before its center reaches the deck.
export function conduitSupport(world,x,z,upper,lower=-Infinity,contactRadius=0){
  let best=-Infinity;
  const consider=y=>{if(y<=upper+EPS&&y>=lower-EPS&&y>best)best=y;};
  for(const s of conduitCandidates(world,'obbs',x,z,contactRadius))if(s.walkable&&boxOverlap(s,x,z,contactRadius))consider(s.cy+s.hy);
  for(const s of world.discs)if(s.walkable&&discOverlap(s,x,z,contactRadius))consider(s.yMax);
  for(const s of world.annuli)if(s.walkable&&annulusOverlap(s,x,z,contactRadius))consider(s.yMax);
  for(const s of conduitCandidates(world,'ramps',x,z)){const y=rampY(s,x,z);if(y!==null)consider(y);}
  return best;
}
export function conduitBlockers(world,body,radius=.4,height=1.8){
  const {x,y,z}=body,out=[];
  const hit=(s,lo,hi,overlap)=>{if(overlap&&y<hi-EPS&&y+height>lo+EPS)out.push(s.label||'unnamed collider');};
  for(const s of conduitCandidates(world,'obbs',x,z,radius))if(y<s.cy+s.hy-EPS&&y+height>s.cy-s.hy+EPS)hit(s,s.cy-s.hy,s.cy+s.hy,boxOverlap(s,x,z,radius));
  for(const s of world.discs)hit(s,s.yMin,s.yMax,discOverlap(s,x,z,radius));
  for(const s of world.annuli)hit(s,s.yMin,s.yMax,annulusOverlap(s,x,z,radius));
  for(const s of conduitCandidates(world,'cylinders',x,z,radius))if(y<s.yMax-EPS&&y+height>s.yMin+EPS)hit(s,s.yMin,s.yMax,Math.hypot(x-s.cx,z-s.cz)<s.radius+radius-EPS);
  for(const s of conduitCandidates(world,'ramps',x,z)){
    // The analytic center surface is the walking plane. Treat its underside
    // as a slab, not a solid wedge extending all the way to the basement.
    const sy=rampY(s,x,z);
    if(s.hasUnderside&&sy!==null)hit(s,sy-(s.thickness??.36),sy,true);
  }
  return out;
}
export function conduitGrounded(world,body,radius=.4){
  const y=conduitSupport(world,body.x,body.z,body.y+.035,body.y-.035,radius);
  return Number.isFinite(y);
}
// Swept movement mutates only the supplied body, not the registry. A bounded
// step is used to avoid tunnelling. No artificial ground plane or Y=0 clamp.
export function moveConduitBody(world,body,dx,dz,dy,{radius=.4,height=1.8,stepUp=.41,stepDown=.41}={}){
  if(![body.x,body.y,body.z,dx,dz,dy,radius,height,stepUp,stepDown].every(Number.isFinite)||radius<=0||height<=0||stepUp<0||stepDown<0)throw new TypeError('Invalid movement');
  const n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz),Math.abs(dy))/.08));
  if(n>4096)throw new RangeError('Movement exceeds sweep budget');
  let hit=false,landed=false,ceiling=false;
  const free=p=>conduitBlockers(world,p,radius,height).length===0;
  for(let i=0;i<n;i++){
    for(const [axis,d] of [['x',dx/n],['z',dz/n]]){
      if(!d)continue;
      const grounded=dy<=0&&conduitGrounded(world,body,radius);
      const trial={...body,[axis]:body[axis]+d};
      if(grounded){
        const support=conduitSupport(world,trial.x,trial.z,body.y+stepUp,body.y-stepDown,radius);
        if(Number.isFinite(support)){
          const stepped={...trial,y:support};
          if(free(stepped)){Object.assign(body,stepped);landed=true;continue;}
        }
      }
      if(free(trial)){body[axis]=trial[axis];continue;}
      hit=true;
    }
    const target=body.y+dy/n;
    if(dy<0){
      const floor=conduitSupport(world,body.x,body.z,body.y,target,radius);
      if(Number.isFinite(floor)&&free({...body,y:floor})){body.y=floor;landed=true;continue;}
    }
    if(dy!==0){
      if(free({...body,y:target}))body.y=target;
      else{
        // Find last clear point of this short vertical sweep.
        let lo=0,hi=1;
        for(let j=0;j<12;j++){const m=(lo+hi)/2;if(free({...body,y:body.y+(target-body.y)*m}))lo=m;else hi=m;}
        body.y+=(target-body.y)*lo;hit=true;if(dy>0)ceiling=true;
      }
    }
  }
  return {hit,landed,ceiling};
}
export function conduitLaunchVelocity(pad,position,gravity=-22,time=1.45){
  if(![pad.targetX,pad.targetY,pad.targetZ,position.x,position.y,position.z,gravity,time].every(Number.isFinite)||gravity>=0||time<=0)throw new TypeError('Invalid launch');
  return {x:(pad.targetX-position.x)/time,y:(pad.targetY-position.y-.5*gravity*time*time)/time,z:(pad.targetZ-position.z)/time};
}
export function auditConduitSpawn(world,spawn){
  const support=conduitSupport(world,spawn.x,spawn.z,spawn.y+.06,spawn.y-.06);
  const blockers=conduitBlockers(world,spawn);
  return {id:spawn.id,ok:Number.isFinite(support)&&blockers.length===0,support:Number.isFinite(support)?support:null,blockers};
}
// Route probes use the candidate sweep, not A* connectivity alone. Failed
// edges are diagnostics, not automatically approved shortcuts.
export function probeConduitWalk(world,from,to){
  const body={x:from.x,y:from.y,z:from.z};
  if(!conduitGrounded(world,body)||conduitBlockers(world,body).length)return {ok:false,reason:'invalid start',end:body};
  const distance=Math.hypot(to.x-from.x,to.z-from.z),n=Math.max(1,Math.ceil(distance/.1));
  for(let i=0;i<n;i++){
    const x=from.x+(to.x-from.x)*(i+1)/n,z=from.z+(to.z-from.z)*(i+1)/n;
    moveConduitBody(world,body,x-body.x,z-body.z,-.06);
    if(Math.hypot(body.x-x,body.z-z)>.22)return {ok:false,reason:'horizontal obstruction',end:body};
    if(!conduitGrounded(world,body))return {ok:false,reason:'unsupported route',end:body};
  }
  return {ok:Math.hypot(body.x-to.x,body.z-to.z)<.23&&Math.abs(body.y-to.y)<.16,reason:'arrival check',end:body};
}
export function probeConduitPad(world,pad,{offsetX=0,offsetZ=0,gravity=-22,time=1.45}={}){
  const body={x:pad.x+offsetX,y:pad.y,z:pad.z+offsetZ};
  if(Math.hypot(offsetX,offsetZ)>pad.triggerRadius||!conduitGrounded(world,body)||conduitBlockers(world,body).length)return {ok:false,reason:'invalid takeoff',end:body};
  const v=conduitLaunchVelocity(pad,body,gravity,time),n=Math.ceil(time*120),dt=time/n;
  for(let i=0;i<n;i++){
    const dy=v.y*dt+.5*gravity*dt*dt;v.y+=gravity*dt;
    const moved=moveConduitBody(world,body,v.x*dt,v.z*dt,dy);
    if(moved.hit||moved.landed&&i<n-2)return {ok:false,reason:'launch obstructed',end:body};
  }
  return {ok:Math.hypot(body.x-pad.targetX,body.z-pad.targetZ)<.2&&Math.abs(body.y-pad.targetY)<.12&&conduitGrounded(world,body),reason:'landing check',end:body};
}
