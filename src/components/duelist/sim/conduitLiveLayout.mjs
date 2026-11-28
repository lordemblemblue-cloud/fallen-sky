// Actual match layout; identical immutable geometry on the host and prediction client.
import manifest from './conduitLiveData.mjs';
import {createConduitMatchAdapter} from './conduitMatchAdapter.mjs';
import {conduitSupport,conduitBlockers,conduitGrounded,moveConduitBody,probeConduitWalk,snapshotConduitCollision} from './conduitTraversal.mjs';
const registry=snapshotConduitCollision(manifest.world);
export const CONDUIT_MATCH_LAYOUTS=Object.freeze(Object.fromEntries(['tdm','ffa'].map(mode=>[mode,Object.freeze({
 id:'the-conduit',conduitImported:true,imported:true,radius:manifest.radius,capacity:mode==='tdm'?8:6,mode,world:registry,parts:Object.freeze([])
})])));
export function createConduitLiveMatch(mode,random){return createConduitMatchAdapter(manifest,{mode,random});}
export const conduitLiveSupport=(x,z,upper,lower=-Infinity,radius=0)=>conduitSupport(registry,x,z,upper,lower,radius);
export const conduitLiveBlockers=(p)=>conduitBlockers(registry,p,p.radius??.4,p.height??1.8);
export const conduitLiveGrounded=(p,r)=>conduitGrounded(registry,p,r);
export function conduitLiveMove(p,dx,dz,dy,r,allowStep){return moveConduitBody(registry,p,dx,dz,dy,{radius:r,stepUp:allowStep ? .41 : 0,stepDown:allowStep ? .41 : 0});}
// Exact segment intervals for solid OBBs, cylinders, annuli, ramp slabs
// and disc cutouts. Camera padding conservatively expands solid boundaries.
function interval(a,b,lo,hi){
 const d=b-a;if(Math.abs(d)<1e-10)return a>=lo&&a<=hi?[0,1]:null;
 const p=(lo-a)/d,q=(hi-a)/d;return [Math.min(p,q),Math.max(p,q)];
}
function intersect(...xs){if(xs.some(x=>!x))return null;const lo=Math.max(0,...xs.map(x=>x[0])),hi=Math.min(1,...xs.map(x=>x[1]));return lo<=hi?[lo,hi]:null;}
const local=(s,p)=>{const x=p.x-s.cx,z=p.z-s.cz;return [x*s.cos-z*s.sin,x*s.sin+z*s.cos];};
function boxInterval(s,a,b,pad,lo=-Infinity,hi=Infinity){
 const [x,z]=local(s,a),[u,v]=local(s,b);
 if(s.hx+pad<0||s.hz+pad<0)return null;
 return intersect(interval(x,u,-s.hx-pad,s.hx+pad),interval(z,v,-s.hz-pad,s.hz+pad),interval(a.y,b.y,lo,hi));
}
function radial(a,b,cx,cz,r){
 if(r<0)return null;
 const x=a.x-cx,z=a.z-cz,dx=b.x-a.x,dz=b.z-a.z,A=dx*dx+dz*dz,B=2*(x*dx+z*dz),C=x*x+z*z-r*r;
 if(A<1e-12)return C<=0?[0,1]:null;
 const D=B*B-4*A*C;if(D<0)return null;const q=Math.sqrt(D);return intersect([(-B-q)/(2*A),(-B+q)/(2*A)]);
}
function removeHoles(solid,holes){
 if(!solid)return null;
 let t=solid[0];
 for(const h of holes.filter(Boolean).sort((x,y)=>x[0]-y[0])){
   if(h[1]<t)continue;if(h[0]>t)return t;t=Math.max(t,h[1]+1e-8);if(t>solid[1])return null;
 }
 return t<=solid[1]?t:null;
}
export function conduitLiveRay(a,b,pad=0){
 let best=1;
 const accept=t=>{if(t!=null&&t>=0&&t<best)best=t;};
 for(const s of registry.obbs)accept(boxInterval(s,a,b,pad,s.cy-s.hy-pad,s.cy+s.hy+pad)?.[0]);
 for(const s of registry.cylinders)accept(intersect(radial(a,b,s.cx,s.cz,s.radius+pad),interval(a.y,b.y,s.yMin-pad,s.yMax+pad))?.[0]);
 for(const s of registry.discs)accept(removeHoles(intersect(radial(a,b,s.cx,s.cz,s.radius+pad),interval(a.y,b.y,s.yMin-pad,s.yMax+pad)),(s.cutouts??[]).map(c=>boxInterval(c,a,b,-pad))));
 for(const s of registry.annuli)accept(removeHoles(intersect(radial(a,b,0,0,s.rMax+pad),interval(a.y,b.y,s.yMin-pad,s.yMax+pad)),[radial(a,b,0,0,s.rMin-pad)]));
 for(const s of registry.ramps){
  if(!s.hasUnderside)continue;
  const [x,z]=local(s,a),[u,v]=local(s,b),slope=(s.yEnd-s.yStart)/s.length;
  const h1=a.y-s.yStart-(z+s.length/2)*slope,h2=b.y-s.yStart-(v+s.length/2)*slope;
  accept(intersect(interval(x,u,-s.width/2-pad,s.width/2+pad),interval(z,v,-s.length/2-pad,s.length/2+pad),interval(h1,h2,-(s.thickness??.36)-pad,pad))?.[0]);
 }
 return best;
}
const routeAdapter=createConduitLiveMatch('tdm',()=>0);
const nodes=manifest.nodes;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function anchor(p){
 return nodes.filter(n=>Math.abs(n.pos.y-p.y)<.5).sort((a,b)=>distance(a.pos,p)-distance(b.pos,p)).slice(0,6)
  .find(n=>probeConduitWalk(registry,p,n.pos).ok);
}
// The graph node a route starts or ends at. The same-level walkable node comes first, as before. A fighter on a
// ramp (between node levels) or in a corner with no straight line to its six nearest same-level nodes had none, so
// conduitBotPath returned no route and the bot stood still for the rest of the match (and so did every bot chasing
// it). Then try the nearest nodes at any level that it can walk to, and last the nearest node outright.
function routeEnd(p){
 const near=()=>nodes.slice().sort((a,b)=>distance(a.pos,p)-distance(b.pos,p));
 return anchor(p)??near().slice(0,16).find(n=>Math.abs(n.pos.y-p.y)<3.5&&probeConduitWalk(registry,p,n.pos).ok)??near()[0]??null;
}
export function conduitBotPath(from,to){
 if(Math.abs(from.y-to.y)<.16&&distance(from,to)<8&&probeConduitWalk(registry,from,to).ok)return [{x:to.x,y:to.y,z:to.z}];
 const a=routeEnd(from),b=routeEnd(to);if(!a||!b)return [];
 const route=routeAdapter.findRoute(a.id,b.id);if(!route)return [];
 const points=[a.pos];for(const seg of route.segments)points.push(...seg.points.slice(1));
 if(probeConduitWalk(registry,b.pos,to).ok)points.push(to);
 return points.map(p=>({x:p.x,y:p.y,z:p.z}));
}
export function conduitPadAt(body){return registry.jumpPads.find(p=>Math.abs(body.y-p.y)<.12&&Math.hypot(body.x-p.x,body.z-p.z)<=p.triggerRadius)??null;}
export const conduitPickupDefinitions=Object.freeze(manifest.pickups.map(p=>Object.freeze({...p,position:Object.freeze(p.position)})));
