// Original, renderer-independent PvP arena blockouts. Coordinates are metres.
// All solid geometry is explicit and shared: never mount the art without its authority collision.
// Layouts are shared by offline matches, server authority and client prediction.
const box = (id, kind, x, y, z, width, height, depth) =>
  Object.freeze({ id, kind, x0:x-width/2, x1:x+width/2, y0:y, y1:y+height, z0:z-depth/2, z1:z+depth/2 });

function building(id, x, z, stairsSide = 1, approach = -1) {
  const parts = [
    box(id+'-west', 'wall', x-3.2, 0, z, 0.4, 3.2, 5.6),
    box(id+'-east', 'wall', x+3.2, 0, z, 0.4, 3.2, 5.6),
    box(id+'-roof', 'deck', x, 3.0, z, 6.8, 0.2, 5.6),
    box(id+'-roof-cover', 'cover', x-stairsSide*2.5, 3.2, z, 0.45, 0.9, 2.8),
  ];
  // Open north/south portal through the lower floor; an external stepped
  // maintenance duct leads to the roof independently of a fighter's jump skill.
  for (let i=0; i<8; i++) {
    const h=(i+1)*0.4;
    parts.push(box(id+'-step-'+i, 'step', x+stairsSide*1.6, 0, z+approach*(2.8+(7-i+0.5)*0.72), 2.2, h, 0.72));
  }
  // Low duct sidewalls make the stepped shortcut readable while leaving headroom.
  for (const side of [-1,1]) {
    for (let i=0; i<8; i++) {
      parts.push(box(id+'-duct-'+side+'-'+i, 'duct', x+stairsSide*1.6+side*1.2, (i+1)*0.4, z+approach*(2.8+(7-i+0.5)*0.72), 0.2, 0.55, 0.72));
    }
  }
  return parts;
}
const cover=(id,x,z,w=2.4,d=1.1)=>box(id,'cover',x,0,z,w,0.85,d);
const layout=(id,radius,capacity,parts)=>Object.freeze({id,radius,capacity,parts:Object.freeze(parts)});
const MAPS=Object.freeze({
  control:layout('meridian-observatory-district',28,8,[
    ...building('relay',-3,0),
    ...building('east-lab',3,10,-1),
    cover('north-screen',2,-10), cover('south-screen',-1,15),
    cover('east-screen',15,8,1.1,2.4), cover('west-screen',-18,-3,1.1,2.4),
  ]),
  escort:layout('meridian-freight-district',28,[
    ...building('loading-bay',7,-9,-1),
    ...building('service-bay',-14,10),
    cover('loading-screen',9,2), cover('defense-screen',13,12),
    cover('west-screen',-11,-7,1.1,2.4), cover('arrival-screen',-7,16),
  ]),
  tdm:layout('meridian-combat-district',22,8,[
    ...building('west-station',-7,2),
    ...building('east-station',7,-2,-1,1),
    cover('north-west',-5,-12), cover('north-east',5,-12),
    cover('south-west',-5,12), cover('south-east',5,12),
    cover('center-screen',0,0,2.2,1.0),
  ]),
});
export function getModeArenaLayout(mode) { return Object.hasOwn(MAPS,mode) ? MAPS[mode] : null; }

// Query a horizontal circle against the footprint of a box. The vertical
// interval is separately checked for a fighter's feet/head; standing exactly
// on a platform does not count as interpenetration.
export function overlapsArenaFootprint(part,x,z,radius=0) {
  const dx=x-Math.max(part.x0,Math.min(x,part.x1));
  const dz=z-Math.max(part.z0,Math.min(z,part.z1));
  return radius===0 ? dx===0 && dz===0 : dx*dx+dz*dz<radius*radius;
}
export function arenaBodyBlockers(map,{x,y,z,radius,height}) {
  return map.parts.filter(p=>y<p.y1-1e-6 && y+height>p.y0+1e-6 && overlapsArenaFootprint(p,x,z,radius));
}
// A support candidate for downward movement, not a replacement for swept
// movement: callers must first resolve horizontal movement and head clearance.
export function arenaLandingHeight(map,{x,z,previousY,nextY}) {
  if (nextY>previousY) return null;
  let landing=nextY<=0 && previousY>=0 ? 0 : null;
  for (const p of map.parts) {
    if (p.y1<=previousY+1e-6 && p.y1>=nextY-1e-6 && overlapsArenaFootprint(p,x,z)) {
      landing=Math.max(landing??-Infinity,p.y1);
    }
  }
  return landing;
}

// Keep the support radius smaller than the horizontal body so narrow treads
// can be traversed while still preventing a fighter's capsule from clipping.
export const ARENA_BODY_HEIGHT=1.8;
const EPS=1e-5;
export function arenaGrounded(map,body,radius=0.4) {
  return body.y<=EPS || map.parts.some(p=>Math.abs(p.y1-body.y)<EPS &&
    overlapsArenaFootprint(p,body.x,body.z,radius*0.85));
}
function blocked(map,body,radius) {
  return arenaBodyBlockers(map,{...body,radius,height:ARENA_BODY_HEIGHT});
}
// Swept axis-separated motion, with a bounded automatic stair step. The
// collision interval is height-aware; rooftops do not block the ground tunnel.
export function moveArenaBody(map,body,dx,dz,dy,radius=0.4,allowStep=true) {
  const n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz),Math.abs(dy))/0.15));
  let hit=false, landed=false, ceiling=false;
  for(let i=0;i<n;i++){
    for(const [axis,delta] of [['x',dx/n],['z',dz/n]]){
      if(!delta)continue;
      const trial={x:body.x,y:body.y,z:body.z,[axis]:body[axis]+delta};
      const blockers=blocked(map,trial,radius);
      if(!blockers.length){body[axis]=trial[axis];continue;}
      if(allowStep && dy<=0 && arenaGrounded(map,body,radius)){
        const top=Math.max(...blockers.map(p=>p.y1));
        if(top>body.y && top-body.y<=0.41 && blockers.every(p=>p.kind==='step')){
          trial.y=top;
          if(!blocked(map,trial,radius).length){
            body[axis]=trial[axis];body.y=top;landed=true;continue;
          }
        }
      }
      hit=true;
    }
    const next=Math.max(0,body.y+dy/n);
    if(dy>0){
      let limit=next;
      for(const p of map.parts){
        if(!overlapsArenaFootprint(p,body.x,body.z,radius))continue;
        if(body.y+ARENA_BODY_HEIGHT<=p.y0+EPS && next+ARENA_BODY_HEIGHT>p.y0)
          limit=Math.min(limit,p.y0-ARENA_BODY_HEIGHT);
      }
      if(limit<next){ceiling=true;hit=true;}
      body.y=Math.max(0,limit);
    }else if(dy<0){
      let floor=0;
      for(const p of map.parts){
        if(p.y1<=body.y+EPS && p.y1>=next-EPS &&
          overlapsArenaFootprint(p,body.x,body.z,radius))floor=Math.max(floor,p.y1);
      }
      body.y=Math.max(next,floor);
      if(body.y<=EPS || floor>=next-EPS && floor>0)landed=true;
    }
  }
  const distance=Math.hypot(body.x,body.z), limit=map.radius-radius;
  if(distance>limit){body.x*=limit/distance;body.z*=limit/distance;hit=true;}
  return {hit,landed,ceiling};
}
// 3D segment vs box, used for camera, combat and projectile occlusion.
export function arenaRayFraction(map,from,to,pad=0){
  let best=1;
  for(const p of map.parts){
    let enter=0,exit=best;
    for(const axis of ['x','y','z']){
      const o=from[axis],d=to[axis]-o,lo=p[axis+'0']-pad,hi=p[axis+'1']+pad;
      if(Math.abs(d)<1e-9){if(o<lo || o>hi){enter=2;break;}continue;}
      const a=(lo-o)/d,b=(hi-o)/d;
      enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
      if(enter>exit)break;
    }
    if(enter<=exit && exit>=0 && enter>=0)best=Math.min(best,enter);
  }
  return best;
}
export function arenaLineClear(map,a,b){
  return arenaRayFraction(map,{x:a.x,y:(a.y||0)+1.2,z:a.z},{x:b.x,y:(b.y||0)+1.2,z:b.z})>=1-EPS;
}

// Navigation anchors at building/cover corners. Ground routes intentionally
// stay off roofs; players may use the stairs. Cache the graph per immutable map.
const navCache=new WeakMap();
const routeClear=(map,a,b)=>arenaRayFraction(map,{x:a.x,y:0.65,z:a.z},{x:b.x,y:0.65,z:b.z},0.42)>=1-EPS;
function groundGraph(map){
  if(navCache.has(map))return navCache.get(map);
  const nodes=[];
  for(const part of map.parts){
    if(part.y0>0.65 || part.y1<0.4 || part.kind==='step' || part.kind==='duct')continue;
    for(const x of [part.x0-0.75,part.x1+0.75])for(const z of [part.z0-0.75,part.z1+0.75]){
      if(Math.hypot(x,z)>=map.radius-0.6 || arenaBodyBlockers(map,{x,y:0,z,radius:0.5,height:ARENA_BODY_HEIGHT}).length)continue;
      nodes.push({x,z});
    }
  }
  // A coarse ring adds open bypasses without building a large grid.
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,x=Math.sin(a)*(map.radius-2),z=Math.cos(a)*(map.radius-2);
    if(!arenaBodyBlockers(map,{x,y:0,z,radius:0.5,height:ARENA_BODY_HEIGHT}).length)nodes.push({x,z});
  }
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const edges=nodes.map((a,i)=>nodes.flatMap((b,j)=>j!==i && routeClear(map,a,b)?[{j,d:distance(a,b)}]:[]));
  const graph={nodes,edges};navCache.set(map,graph);return graph;
}
export function nextArenaGroundWaypoint(map,from,to){
  if(routeClear(map,from,to))return to;
  const {nodes,edges}=groundGraph(map);
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const costs=nodes.map(p=>routeClear(map,from,p)?dist(from,p):Infinity);
  const first=nodes.map((_,i)=>i),done=new Set();
  let best=Infinity,way=null;
  for(let k=0;k<nodes.length;k++){
    let i=-1;for(let j=0;j<nodes.length;j++)if(!done.has(j)&&(i<0||costs[j]<costs[i]))i=j;
    if(i<0||costs[i]>=best)break;
    done.add(i);
    if(routeClear(map,nodes[i],to)){const total=costs[i]+dist(nodes[i],to);if(total<best){best=total;way=nodes[first[i]];}}
    for(const {j,d} of edges[i])if(costs[i]+d<costs[j]){costs[j]=costs[i]+d;first[j]=first[i];}
  }
  return way;
}
