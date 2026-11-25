// Renderer-independent geometry from Phase 6; Phase 9-inspired swept support.
// The existing world owns gravity, roll, jump, abilities, damage and timers.
import data from './importedCtfData.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const box=(b,kind='wall')=>({...b,kind,x0:b.minX,x1:b.maxX,z0:b.minZ,z1:b.maxZ,y0:b.minY??b.bottomY,y1:b.maxY??b.topY});
const floors=data.floors.map(f=>box(f,'deck'));
const ramps=data.ramps.map(r=>({...r,kind:'step',x0:r.minX,x1:r.maxX,z0:r.minZ,z1:r.maxZ,y0:r.startY-.28,y1:r.endY}));
const solids=data.solids.map(b=>box(b));
for(const c of data.ceilings)solids.push(box({...c,minY:c.y,maxY:c.y+.5}));
const cell=4;
function index(parts){const m=new Map();for(const p of parts)for(let x=Math.floor(p.x0/cell);x<=Math.floor(p.x1/cell);x++)for(let z=Math.floor(p.z0/cell);z<=Math.floor(p.z1/cell);z++){const k=x+','+z;if(!m.has(k))m.set(k,[]);m.get(k).push(p);}return m;}
const fi=index(floors),ri=index(ramps),si=index(solids);
function near(m,x,z,r=0){if(r===0)return m.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[];const set=new Set();for(let a=Math.floor((x-r)/cell);a<=Math.floor((x+r)/cell);a++)for(let b=Math.floor((z-r)/cell);b<=Math.floor((z+r)/cell);b++)for(const p of m.get(a+','+b)||[])set.add(p);return set;}
const overlaps=(p,x,z,r=0)=>Math.hypot(x-clamp(x,p.x0,p.x1),z-clamp(z,p.z0,p.z1))<=r+1e-7;
const rampY=(p,z)=>p.startY+clamp((z-p.startZ)/(p.endZ-p.startZ),0,1)*(p.endY-p.startY);
export const IMPORTED_CTF=Object.freeze({id:'ctf-industrial-warehouse-v1',radius:60,capacity:8,imported:true,ctfImported:true,parts:[...floors,...ramps,...solids],floors,ramps,solids,spawns:data.spawns,spawnZones:data.spawnZones,flags:data.flags,cargo:data.cargo,portals:data.portals});
export function ctfHeights(x,z,r=.025){const ys=[];for(const p of near(fi,x,z,r))if(overlaps(p,x,z,r))ys.push(p.y1);for(const p of near(ri,x,z,r))if(overlaps(p,x,z,r))ys.push(rampY(p,z));for(const p of near(si,x,z,r))if(p.landable&&overlaps(p,x,z,r))ys.push(p.y1);return [...new Set(ys)].sort((a,b)=>b-a);}
export function ctfSupport(x,z,maxY,r=.025){return ctfHeights(x,z,r).find(y=>y<=maxY+1e-6)??-Infinity;}
export function ctfBlockers({x,y,z,radius=.4,height=1.8}){
 const hit=[];
 // At a stair/deck junction the capsule overlaps the deck edge before its
 // centre reaches it. Permit the connected ramp within one step-height.
 const join=top=>[...near(ri,x,z,.05)].some(r=>overlaps(r,x,z,.05)&&Math.abs(rampY(r,z)-y)<.16&&Math.abs(top-r.endY)<.02&&y>=top-.46);
 for(const p of near(si,x,z,radius))if(p.y1>y+.22&&p.y0<y+height-.05&&overlaps(p,x,z,radius)&&!(p.category==='slab'&&join(p.y1)))hit.push(p);
 for(const p of near(fi,x,z,radius))if(p.y1>y+.10&&p.y0<y+height-.05&&overlaps(p,x,z,radius)&&!join(p.y1))hit.push(p);
 // Sloped stairs are solid, not an invisible one-way elevation trigger.
 for(const p of near(ri,x,z,.02))if(overlaps(p,x,z,.02)){const top=rampY(p,z);if(top>y+.22&&top-.28<y+height-.05)hit.push(p);}
 return hit;
}
export function ctfMove(body,dx,dz,dy,radius=.4,allowStep=true){
 const n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz),Math.abs(dy))/.12));let hit=false,landed=false,ceiling=false;
 for(let i=0;i<n;i++){
  const wasGrounded=Math.abs(ctfSupport(body.x,body.z,body.y+.08)-body.y)<.1;
  for(const [axis,d] of [['x',dx/n],['z',dz/n]]){
   if(!d)continue;
   const trial={...body,[axis]:body[axis]+d};
   const support=ctfSupport(trial.x,trial.z,body.y+(allowStep&&dy<=0&&wasGrounded?.45:.06));
   if(allowStep&&dy<=0&&wasGrounded&&Number.isFinite(support)&&support>=body.y-.45)trial.y=support;
   if(ctfBlockers({...trial,radius}).length){hit=true;continue;}
   body[axis]=trial[axis];body.y=trial.y;
  }
  let next=body.y+dy/n;
  if(dy>0){
   const cap=(p,bottom)=>{if(overlaps(p,body.x,body.z,radius)&&body.y+1.8<=bottom+.015&&next+1.8>bottom){next=Math.min(next,bottom-1.8);ceiling=true;hit=true;}};
   for(const p of near(si,body.x,body.z,radius))cap(p,p.y0);
   for(const p of near(fi,body.x,body.z,radius))cap(p,p.y0);
   for(const p of near(ri,body.x,body.z,radius))cap(p,rampY(p,body.z)-.28);
  }else{
   let support=ctfSupport(body.x,body.z,body.y+(allowStep&&wasGrounded?.45:.06));
   for(const p of near(si,body.x,body.z,radius))if(p.category!=='railing'&&p.category!=='stair_underside'&&p.y1<=body.y+.06&&p.y1>=next-.06&&overlaps(p,body.x,body.z,radius))support=Math.max(support,p.y1);
   if(Number.isFinite(support)&&next<=support+.06){next=support;landed=true;}
   else if(wasGrounded&&dy===0)next-=.025;
  }
  body.y=next;
 }
 return {hit,landed,ceiling};
}
export function ctfRay(from,to,pad=0){const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)/.15));for(let i=1;i<n;i++){
 const t=i/n,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t,z=from.z+(to.z-from.z)*t;
 for(const p of near(si,x,z,pad))if(y>=p.y0-pad&&y<=p.y1+pad&&overlaps(p,x,z,pad))return t;
 for(const p of near(fi,x,z,pad))if(y>=p.y0-pad&&y<=p.y1+pad&&overlaps(p,x,z,pad))return t;
 for(const p of near(ri,x,z,pad))if(overlaps(p,x,z,pad)&&y>=rampY(p,z)-.28-pad&&y<=rampY(p,z)+pad)return t;
 }return 1;}
export function ctfZone(team,b,r=.4){const z=data.spawnZones[team];return !!z&&b.x>=z.minX-r&&b.x<=z.maxX+r&&b.z>=z.minZ-r&&b.z<=z.maxZ+r&&b.y<z.maxY&&b.y+1.8>z.minY;}
export function ctfRestricted(team,b,carrying=false){return (team==='red'||team==='blue')&&(ctfZone(team==='red'?'blue':'red',b)||carrying&&ctfZone(team,b));}
export function ctfSpawn(team,bodies,id){const occupied=[...bodies].filter(([k])=>k!==id).map(([,b])=>b);
 const valid=data.spawns.filter(s=>s.team===team&&Math.abs(ctfSupport(s.x,s.z,s.y+.05)-s.y)<.08&&!ctfBlockers({...s,radius:.48}).length);
 const score=s=>occupied.reduce((d,b)=>Math.min(d,Math.hypot(s.x-b.x,s.y-b.y,s.z-b.z)),Infinity);
 // Prefer upper spawn deck for initial flag access; lower deck remains available.
 valid.sort((a,b)=>Math.min(6,score(b))-Math.min(6,score(a))||b.y-a.y);
 if(!valid.length)throw Error('No valid industrial CTF spawn');const {x,y,z,yaw}=valid[0];return {x,y,z,yaw};
}
export function ctfSafe(p,team,carrying=false){return !ctfRestricted(team,p,carrying)&&!ctfBlockers({...p,radius:.48}).length&&Math.abs(ctfSupport(p.x,p.z,p.y+.06)-p.y)<.08;}
export function ctfEmbedded(b){return ctfBlockers({...b,radius:.20}).length>0;}
export function ctfRecovery(b,team,bodies,id,lastSafe,carrying=false){
 const safe=p=>ctfSafe(p,team,carrying)&&![...bodies].some(([k,o])=>k!==id&&Math.abs(o.y-p.y)<1.8&&Math.hypot(o.x-p.x,o.z-p.z)<.85);
 for(let r=.75;r<=10;r+=.75){let best=null,cost=Infinity;for(let j=0;j<24;j++){const a=j*Math.PI/12,x=b.x+Math.cos(a)*r,z=b.z+Math.sin(a)*r;for(const y of ctfHeights(x,z)){
   const p={x,y,z,yaw:b.yaw};if(y>b.y+.45||y<b.y-6||!safe(p))continue;const s=Math.abs(y-b.y)*2+r;if(s<cost){best=p;cost=s;}
 }}if(best)return best;}
 if(lastSafe&&safe(lastSafe))return {...lastSafe,yaw:b.yaw};
 return carrying?null:ctfSpawn(team,bodies,id);
}
