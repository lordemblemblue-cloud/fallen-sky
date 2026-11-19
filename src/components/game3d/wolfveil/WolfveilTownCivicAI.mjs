// Non-combat Wolfveil town AI. All coordinates are viewer-world metres.
// Pure logic: no Three.js, no inventory/XP minting, no NPC-to-player physics.
import { CLONE_TOWN_GUARDS } from './WolfveilTownLivingQuarterLayout.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=(p)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
export function townRoomWorldPoint(room,x,z){
 if(!room||![room.x,room.z,room.yaw,room.scale,x,z].every(Number.isFinite)||room.scale<=0)
  throw new TypeError('Valid placed room required');
 const c=Math.cos(room.yaw),s=Math.sin(room.yaw);
 return {x:room.x+(c*x+s*z)*room.scale,z:room.z+(-s*x+c*z)*room.scale};
}
export const TOWN_STAFF=Object.freeze([
 {shopId:'blacksmith',id:'civic_bren',name:'Bren',role:'smith',questNpcId:'archer_vex'},
 {shopId:'tailor',id:'civic_ori',name:'Ori',role:'tailor',questNpcId:'archer_noor'},
 {shopId:'potion',id:'civic_yuki',name:'Yuki',role:'herbalist',questNpcId:'archer_kira'},
 {shopId:'models',id:'civic_nami',name:'Nami',role:'showroom',questNpcId:'archer_lyra'},
]);
const residentNames=['Mei','Kenji','Hana','Toma','Rin','Sora','Ilan','Aya'];
const valid=(p,collision,r=.48)=>finite(p)&&Number.isFinite(collision.groundAt(p.x,p.z))&&
 !collision.isSolid(p.x,p.z,r);
function findNearbySafe(candidate,collision){
 if(valid(candidate,collision))return candidate;
 for(const radius of [.7,1.5,2.5,4])for(let i=0;i<16;i++){
  const angle=i*Math.PI/8;
  const p={x:candidate.x+Math.cos(angle)*radius,z:candidate.z+Math.sin(angle)*radius};
  if(valid(p,collision))return p;
 }
 return null;
}
/** Uses the existing placed shop/home transforms; never spawns duplicate houses. */
export function planWolfveilTownCivilians({shops=[],homes=[],collision,includeGuards=true}={}){
 if(typeof collision?.groundAt!=='function'||typeof collision?.isSolid!=='function')
  throw new TypeError('Real town navigation collision is required');
 const agents=[];
 for(const def of TOWN_STAFF){
  const room=shops.find(r=>r.id===def.shopId);
  if(!room)continue;
  const anchor=townRoomWorldPoint(room,3.1,.15); // inside open counter, not wall
  const safe=findNearbySafe(anchor,collision);
  if(safe)agents.push({...def,mode:'vendor',homeX:safe.x,homeZ:safe.z,x:safe.x,z:safe.z});
 }
 for(let i=0;i<homes.length&&i<residentNames.length;i++){
  const room=homes[i];
  const porch=townRoomWorldPoint(room,0,4.65); // outside the 2.7m genkan gap
  const safe=findNearbySafe(porch,collision);
  if(!safe)continue;
  const roam=townRoomWorldPoint(room,0,7.1);
  const walk=findNearbySafe(roam,collision)||safe;
  agents.push({id:'civic_home_'+i,name:residentNames[i],role:'resident',
   mode:'resident',houseId:room.id,homeX:safe.x,homeZ:safe.z,
   x:safe.x,z:safe.z,route:[[safe.x,safe.z],[walk.x,walk.z]],speed:.63+(i%3)*.11});
 }
 if(includeGuards){
  for(const guard of CLONE_TOWN_GUARDS){
   const start=findNearbySafe({x:guard.route[0][0],z:guard.route[0][1]},collision);
   const end=findNearbySafe({x:guard.route[1][0],z:guard.route[1][1]},collision);
   if(start&&end)agents.push({...guard,mode:'patrol',x:start.x,z:start.z,
    route:[[start.x,start.z],[end.x,end.z]],questNpcId:guard.side==='left'?'archer_vex':'archer_lyra'});
  }
 }
 return agents;
}
export function townSegmentWalkable(a,b,collision,radius=.46){
 if(!valid(a,collision,radius)||!valid(b,collision,radius))return false;
 const steps=Math.max(1,Math.ceil(dist(a,b)/.19));
 let py=collision.groundAt(a.x,a.z);
 for(let i=1;i<=steps;i++){
  const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
  if(collision.isSolid(x,z,radius))return false;
  const y=collision.groundAt(x,z);
  if(!Number.isFinite(y)||Math.abs(y-py)>.6)return false;
  py=y;
 }
 return true;
}
// Four-plus diagonal A*, with corner cuts forbidden, 1.4m cells and a hard cap
// on explored cells. Blocked destinations fail closed rather than teleporting.
export function findTownWalkPath(start,goal,collision,{cell=1.4,maxExplored=4500,
 bounds={minX:-64,maxX:64,minZ:-69,maxZ:69}}={}){
 if(!valid(start,collision)||!valid(goal,collision)||!Number.isFinite(cell)||cell<=.5)return [];
 if(townSegmentWalkable(start,goal,collision))return [{x:goal.x,z:goal.z}];
 const col=p=>Math.round((p.x-bounds.minX)/cell),row=p=>Math.round((p.z-bounds.minZ)/cell);
 const nc=Math.floor((bounds.maxX-bounds.minX)/cell),nr=Math.floor((bounds.maxZ-bounds.minZ)/cell);
 const key=(i,j)=>j*(nc+1)+i;
 const point=(i,j)=>({x:bounds.minX+i*cell,z:bounds.minZ+j*cell});
 const near=(p)=>{
  const ci=col(p),cj=row(p);let best=null,d=Infinity;
  for(let k=-3;k<=3;k++)for(let n=-3;n<=3;n++){
   const i=ci+k,j=cj+n;if(i<0||j<0||i>nc||j>nr)continue;
   const q=point(i,j);
   if(!valid(q,collision)||!townSegmentWalkable(p,q,collision))continue;
   const dd=dist(p,q);if(dd<d){best={i,j,q};d=dd;}
  }
  return best;
 };
 const s=near(start),g=near(goal);if(!s||!g)return [];
 const startId=key(s.i,s.j),goalId=key(g.i,g.j);
 const open=[{id:startId,i:s.i,j:s.j,f:dist(s.q,g.q)}],bestG=new Map([[startId,0]]),previous=new Map();
 const visited=new Set();const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
 let explored=0;
 while(open.length&&explored++<maxExplored){
  open.sort((a,b)=>b.f-a.f);const here=open.pop();if(visited.has(here.id))continue;
  visited.add(here.id);
  if(here.id===goalId){
   const nodes=[];let next=here.id;let safety=maxExplored+3;
   while(next!==startId&&safety--){const i=next%(nc+1),j=Math.floor(next/(nc+1));nodes.push(point(i,j));next=previous.get(next);if(next===undefined)return []}
   nodes.reverse();const path=[];let anchor=start;
   // Smooth the lattice without cutting through any walls or room corners.
   for(let i=0;i<nodes.length;){let j=nodes.length-1;
    for(;j>i;j--)if(townSegmentWalkable(anchor,nodes[j],collision))break;
    const q=nodes[j];path.push(q);anchor=q;i=j+1;
   }
   if(townSegmentWalkable(anchor,goal,collision))path.push({x:goal.x,z:goal.z});
   return path;
  }
  const origin=point(here.i,here.j);
  for(const [di,dj] of directions){
   const i=here.i+di,j=here.j+dj;if(i<0||j<0||i>nc||j>nr)continue;
   const q=point(i,j),id=key(i,j);if(visited.has(id)||!valid(q,collision))continue;
   if(!townSegmentWalkable(origin,q,collision))continue;
   if(di&&dj&&(!townSegmentWalkable(origin,point(here.i+di,here.j),collision)||
     !townSegmentWalkable(origin,point(here.i,here.j+dj),collision)))continue;
   const nextG=bestG.get(here.id)+Math.hypot(di,dj)*cell;
   if(nextG >= (bestG.get(id)??Infinity))continue;
   bestG.set(id,nextG);previous.set(id,here.id);
   open.push({id,i,j,f:nextG+dist(q,g.q)});
  }
 }
 return [];
}
export function advanceTownCitizen(agent,dt,collision,others=[]){
 if(!agent||!Number.isFinite(dt)||dt<=0||agent.mode==='vendor')return false;
 const now={x:agent.x,z:agent.z};
 if(!agent.waypoints?.length)return false;
 const goal=agent.waypoints[0],length=dist(now,goal);
 if(length<.18){agent.waypoints.shift();return false;}
 const speed=Math.max(.2,Math.min(1.6,agent.speed||.85));
 const step=Math.min(length,Math.min(dt,.10)*speed);
 const next={x:now.x+(goal.x-now.x)*step/length,z:now.z+(goal.z-now.z)*step/length};
 const crowded=others.some(p=>p.id!==agent.id&&Math.hypot(p.x-next.x,p.z-next.z)<1.12);
 if(crowded||!townSegmentWalkable(now,next,collision)){agent.blockedFor=(agent.blockedFor||0)+dt;return false;}
 agent.x=next.x;agent.z=next.z;agent.blockedFor=0;return true;
}
