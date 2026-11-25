import data from './importedEscortData.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cell=8, key=(x,z)=>Math.floor(x/cell)+','+Math.floor(z/cell);
const bounds=(poly)=>({x0:Math.min(...poly.map(p=>p.x)),x1:Math.max(...poly.map(p=>p.x)),z0:Math.min(...poly.map(p=>p.z)),z1:Math.max(...poly.map(p=>p.z))});
const floors=data.triangles.map((t,i)=>{
 const [a,b,c]=[t.a,t.b,t.c].map(([x,y,z])=>({x,y,z}));const polygon=[a,b,c],den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
 return {id:'surface-'+i,kind:'deck',section:t.section,polygon,...bounds(polygon),y0:Math.min(a.y,b.y,c.y)-.38,y1:Math.max(a.y,b.y,c.y),a,b,c,den};
}).filter(p=>Math.abs(p.den)>1e-8);
const solids=data.boxes.map((p,i)=>({id:p.label+'-'+i,kind:'wall',x0:p.minX,x1:p.maxX,y0:p.minY,y1:p.maxY,z0:p.minZ,z1:p.maxZ}));
for(const [i,s] of data.rails.entries()){
 const dx=s.x1-s.x0,dz=s.z1-s.z0,l=Math.hypot(dx,dz);if(l<1e-6)continue;
 const x=dz/l*.14,z=-dx/l*.14,polygon=[{x:s.x0+x,z:s.z0+z},{x:s.x1+x,z:s.z1+z},{x:s.x1-x,z:s.z1-z},{x:s.x0-x,z:s.z0-z}];
 solids.push({id:s.label+'-'+i,kind:'wall',polygon,...bounds(polygon),y0:s.minY,y1:s.maxY});
}
function index(parts){const m=new Map();for(const p of parts)for(let x=Math.floor(p.x0/cell);x<=Math.floor(p.x1/cell);x++)for(let z=Math.floor(p.z0/cell);z<=Math.floor(p.z1/cell);z++){const k=x+','+z;if(!m.has(k))m.set(k,[]);m.get(k).push(p);}return m;}
const fi=index(floors),si=index(solids);
function nearby(m,x,z,r=0){if(!r)return m.get(key(x,z))||[];const set=new Set();for(let i=Math.floor((x-r)/cell);i<=Math.floor((x+r)/cell);i++)for(let j=Math.floor((z-r)/cell);j<=Math.floor((z+r)/cell);j++)for(const p of m.get(i+','+j)||[])set.add(p);return set;}
function seg(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);}
function overlap(p,x,z,r=0){if(x<p.x0-r||x>p.x1+r||z<p.z0-r||z>p.z1+r)return false;if(!p.polygon)return Math.hypot(x-clamp(x,p.x0,p.x1),z-clamp(z,p.z0,p.z1))<=r+1e-7;let inside=false;for(let i=0,j=p.polygon.length-1;i<p.polygon.length;j=i++){const a=p.polygon[i],b=p.polygon[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside||p.polygon.some((a,i)=>seg(x,z,a,p.polygon[(i+1)%p.polygon.length])<=r+1e-7);}
function h(p,x,z){const {a,b,c,den}=p,u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;return clamp(u*a.y+v*b.y+(1-u-v)*c.y,p.y0+.38,p.y1);}
export const IMPORTED_ESCORT=Object.freeze({id:'escort-mountain-canyon-v1',radius:215,capacity:10,imported:true,escortImported:true,parts:[...floors,...solids],floors,solids,spawnZones:data.spawnZones,buildings:data.buildings||[],route:data.route});
export function escortHeights(x,z,r=0){const ys=[];for(const p of nearby(fi,x,z,r))if(overlap(p,x,z,r)){const y=h(p,x,z);if(!ys.some(v=>Math.abs(v-y)<.05))ys.push(y);}// Building walls, columns and garage/canopy roofs also have solid upper
 // faces. A downward jump must land on them instead of entering the mesh.
 for(const p of nearby(si,x,z,r))if(!p.polygon&&overlap(p,x,z,r)&&!ys.some(v=>Math.abs(v-p.y1)<.05))ys.push(p.y1);
 return ys.sort((a,b)=>b-a);}
export function escortSupport(x,z,maxY,r=0){return escortHeights(x,z,r).find(y=>y<=maxY+1e-6)??-Infinity;}
export function escortBlockers({x,y,z,radius=.4,height=1.8}){const hit=[];for(const p of nearby(si,x,z,radius))if(p.y1>y+.10&&p.y0<y+height-.05&&overlap(p,x,z,radius))hit.push(p);for(const p of nearby(fi,x,z,radius))if(overlap(p,x,z,radius)){const top=h(p,x,z);if(top>y+.45&&top-.38<y+height-.05)hit.push(p);}return hit;}
export function escortMove(body,dx,dz,dy,radius=.4,allowStep=true){const n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz),Math.abs(dy))/.12));let hit=false,landed=false,ceiling=false;for(let i=0;i<n;i++){
 const oldY=body.y,wasGrounded=Math.abs(escortSupport(body.x,body.z,oldY+.08,.06)-oldY)<.10;
 for(const [axis,d] of [['x',dx/n],['z',dz/n]]){if(!d)continue;const trial={...body,[axis]:body[axis]+d};const support=escortSupport(trial.x,trial.z,body.y+(allowStep&&dy<=0&&wasGrounded?.45:.06),.06);if(allowStep&&dy<=0&&wasGrounded&&Number.isFinite(support)&&support>=body.y-.45)trial.y=support;
 if(escortBlockers({...trial,radius}).length){hit=true;continue;}body[axis]=trial[axis];body.y=trial.y;}
 let next=body.y+dy/n;
 if(dy>0){for(const p of nearby(si,body.x,body.z,radius))if(overlap(p,body.x,body.z,radius)&&body.y+1.8<=p.y0+.01&&next+1.8>p.y0){next=Math.min(next,p.y0-1.8);ceiling=true;hit=true;}for(const p of nearby(fi,body.x,body.z,radius))if(overlap(p,body.x,body.z,radius)){const bottom=h(p,body.x,body.z)-.38;if(body.y+1.8<=bottom+.01&&next+1.8>bottom){next=Math.min(next,bottom-1.8);ceiling=true;hit=true;}}}
 else{
  let support=escortSupport(body.x,body.z,body.y+(allowStep&&wasGrounded?.45:.06),.06);
  // The capsule may overhang the edge of a roof or pillar. Treat a top
  // crossed by its footprint as a landing, not an entry into the column.
  for(const p of nearby(si,body.x,body.z,radius))if(!p.polygon&&p.y1<=body.y+.06&&p.y1>=next-.06&&overlap(p,body.x,body.z,radius))support=Math.max(support,p.y1);
  if(Number.isFinite(support)&&next<=support+.06){next=support;landed=true;}else if(wasGrounded&&dy===0)next-=.025;
 }
 body.y=next;
 }return {hit,landed,ceiling};}
export function escortRay(from,to,pad=0){const d=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z),n=Math.max(1,Math.ceil(d/.14));for(let i=1;i<n;i++){const t=i/n,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t,z=from.z+(to.z-from.z)*t;for(const p of nearby(si,x,z,pad))if(y>=p.y0-pad&&y<=p.y1+pad&&overlap(p,x,z,pad))return t;for(const p of nearby(fi,x,z,pad))if(overlap(p,x,z,pad)){const top=h(p,x,z);if(y<=top+pad&&y>=top-.38-pad)return t;}}return 1;}
export function escortSpawn(team,stage,bodies,id){const zone=Object.values(data.spawnZones).find(z=>z.team===(team==='red'?'attacker':'defender')&&z.activeStages.includes(stage));const occupied=[...bodies].filter(([k])=>k!==id).map(([,b])=>b);const valid=zone.points.filter(p=>Math.abs(escortSupport(p.x,p.z,p.y+.1)-p.y)<.1&&!escortBlockers({...p,radius:.48}).length);const score=p=>occupied.reduce((n,b)=>Math.min(n,Math.hypot(p.x-b.x,p.z-b.z,p.y-b.y)),Infinity);valid.sort((a,b)=>score(b)-score(a));if(!valid.length)throw Error('No valid escort spawn '+zone.id);const {x,y,z,yaw}=valid[0];return {x,y,z,yaw};}
export function escortEnemyZone(team,stage,body){return Object.values(data.spawnZones).find(z=>z.team!==(team==='red'?'attacker':'defender')&&z.activeStages.includes(stage)&&body.x>=z.protectedBounds.minX-.4&&body.x<=z.protectedBounds.maxX+.4&&body.z>=z.protectedBounds.minZ-.4&&body.z<=z.protectedBounds.maxZ+.4&&body.y<z.protectedBounds.maxY&&body.y+1.8>z.protectedBounds.minY);}

// Recovery is authority-owned, local, and never awards healing or a new life.
export function escortEmbedded(body,radius=.4){
 const {x,y,z}=body;
 for(const p of nearby(si,x,z,radius))if(p.y1>y+.16&&p.y0<y+1.65&&overlap(p,x,z,.13))return true;
 for(const p of nearby(fi,x,z,.03))if(overlap(p,x,z,.03)){
  const top=h(p,x,z);if(top>y+.17&&top-.38<y+.10)return true;
 }
 return false;
}
export function escortRecoverySpot(body,team,stage,bodies,id,lastSafe){
 const occupied=[...bodies].filter(([k])=>k!==id).map(([,b])=>b);
 const buildings=(data.buildings||[]).filter(b=>body.x>=b.minX-.5&&body.x<=b.maxX+.5&&body.z>=b.minZ-.5&&body.z<=b.maxZ+.5&&body.y<b.maxY+.15&&body.y+1.8>b.minY);
 const outside=p=>buildings.every(b=>p.x<b.minX-.5||p.x>b.maxX+.5||p.z<b.minZ-.5||p.z>b.maxZ+.5);
 const safe=p=>outside(p)&&!escortEnemyZone(team,stage,p)&&!escortBlockers({...p,radius:.48}).length&&
  !escortEmbedded(p)&&Math.abs(escortSupport(p.x,p.z,p.y+.06,.03)-p.y)<.08&&
  !occupied.some(b=>Math.abs(b.y-p.y)<1.7&&Math.hypot(b.x-p.x,b.z-p.z)<.85);
 // Never move up through a roof to gain an advantage. Prefer a nearby floor
 // on the same or a lower level, and do not choose a point inside the column.
 for(let r=.75;r<=12;r+=.75){
  let best=null,score=Infinity;
  for(let i=0;i<24;i++){
   const a=i*Math.PI/12,x=body.x+Math.cos(a)*r,z=body.z+Math.sin(a)*r;
   for(const y of escortHeights(x,z,.02)){
    if(y>body.y+(buildings.length?Math.max(0,...buildings.map(b=>(b.baseY??body.y)-body.y))+.45:.45)||y<body.y-8)continue;
    const p={x,y,z,yaw:body.yaw};if(!safe(p))continue;
    const cost=Math.abs(body.y-y)*2+Math.hypot(body.x-x,body.z-z);
    if(cost<score){score=cost;best=p;}
   }
  }
  if(best)return best;
 }
 if(lastSafe&&Math.hypot(lastSafe.x-body.x,lastSafe.z-body.z)<25&&safe(lastSafe))return {...lastSafe,yaw:body.yaw};
 return escortSpawn(team,stage,bodies,id);
}
