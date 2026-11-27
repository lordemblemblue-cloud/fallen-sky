import data from './importedCtfNavData.mjs';
import {ctfMove,ctfRestricted,ctfSupport,ctfBlockers} from './importedCtfLayout.mjs';
const {nodes,edges}=data;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.y-b.y)*1.4);
// Edges are generated and tested using the production movement solver.
export function ctfWalkClear(a,b,team=null,carrying=false){
 if(!Number.isFinite(a.y)||!Number.isFinite(b.y))return false;
 const q={x:a.x,y:a.y,z:a.z},d=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(d/.12));
 for(let i=0;i<n;i++){
  ctfMove(q,(b.x-a.x)/n,(b.z-a.z)/n,-.025,.4,true);
  if(ctfRestricted(team,q,carrying))return false;
  if(Math.hypot(q.x-(a.x+(b.x-a.x)*(i+1)/n),q.z-(a.z+(b.z-a.z)*(i+1)/n))>.20)return false;
 }
 return Math.hypot(q.x-b.x,q.z-b.z)<.20&&Math.abs(q.y-b.y)<.18;
}
export function ctfBotPath(from,to,team,carrying=false){
 if(!from||!to)return [];
 const target={...to,y:to.y??0};
 const allowed=p=>!ctfRestricted(team,p,carrying);
 if(!allowed(target)){
  // A foe in its protected room is not a valid combat destination.
  return [];
 }
 if(ctfWalkClear(from,target,team,carrying))return [target];
 const nearest=(p,reverse=false)=>nodes.map((n,i)=>({n,i,d:dist(n,p)})).filter(x=>allowed(x.n)&&Math.abs(x.n.y-p.y)<1.8&&x.d<12).sort((a,b)=>a.d-b.d).slice(0,24).filter(x=>reverse?ctfWalkClear(x.n,p,team,carrying):ctfWalkClear(p,x.n,team,carrying)).slice(0,5);
 const starts=nearest(from),goals=nearest(target,true);if(!starts.length||!goals.length)return [];
 const goalCost=new Map(goals.map(x=>[x.i,x.d]));
 const open=new Set(starts.map(x=>x.i)),cost=new Map(starts.map(x=>[x.i,x.d])),parent=new Map();
 let end=-1,best=Infinity;
 while(open.size){
  let i=-1,min=Infinity;for(const k of open){const f=cost.get(k)+dist(nodes[k],target);if(f<min){min=f;i=k;}}
  if(i<0||min>=best)break;open.delete(i);
  if(goalCost.has(i)&&cost.get(i)+goalCost.get(i)<best){best=cost.get(i)+goalCost.get(i);end=i;}
  for(const j of edges[i])if(allowed(nodes[j])){const c=cost.get(i)+dist(nodes[i],nodes[j]);if(c<(cost.get(j)??Infinity)){cost.set(j,c);parent.set(j,i);open.add(j);}}
 }
 if(end<0)return [];
 const path=[target];while(end!==undefined){path.unshift(nodes[end]);end=parent.get(end);}
 return path;
}
