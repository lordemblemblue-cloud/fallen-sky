import {routesToTest} from './importedControlRoutes.mjs';
import {importedMove, importedSupport, importedBlockers} from './importedControlLayout.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.y??0)-(b.y??0));
const key=p=>[p.x,p.y??0,p.z].join(',');
const cache=new WeakMap();
// Test a continuous walking segment against the same movement solver as players.
// Cap search work: authored routes form the long-distance network.
function walkable(map,a,b){
  const body={x:a.x,y:a.y??0,z:a.z};const d=Math.hypot(b.x-a.x,b.z-a.z);
  const n=Math.max(1,Math.ceil(d/.3));
  for(let i=1;i<=n;i++){
    const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;
    importedMove(map,body,x-body.x,z-body.z,-.01,.4,true);
    if(Math.hypot(body.x-x,body.z-z)>.32||Math.abs(importedSupport(map,body.x,body.z,body.y+.06)-body.y)>.09)return false;
  }
  return dist(body,b)<.5;
}
function graph(map){
  if(cache.has(map))return cache.get(map);
  const nodes=[],ids=new Map(),edges=[];
  const add=p=>{const k=key(p);if(!ids.has(k)){ids.set(k,nodes.length);nodes.push({x:p.x,y:p.y??0,z:p.z});edges.push([]);}return ids.get(k);};
  const link=(a,b)=>{if(a===b||edges[a].some(e=>e.i===b))return;const d=dist(nodes[a],nodes[b]);edges[a].push({i:b,d});edges[b].push({i:a,d});};
  for(const route of routesToTest){const ids=route.waypoints.map(add);for(let i=1;i<ids.length;i++)link(ids[i-1],ids[i]);}
  for(const team of Object.values(map.spawns))for(const p of [...team.primarySpawns,...team.fallbackSpawns])add(p);
  for(const p of map.controlPoints)add(p);
  // Nearby verified connectors join ground routes, stair landings and spawn approaches.
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    if(dist(nodes[i],nodes[j])<=22&&Math.abs(nodes[i].y-nodes[j].y)<=4.1&&!edges[i].some(e=>e.i===j)&&walkable(map,nodes[i],nodes[j])&&walkable(map,nodes[j],nodes[i]))link(i,j);
  }
  const g={nodes,edges};cache.set(map,g);return g;
}
export function importedBotPath(map,from,to){
  const target={x:to.x,y:to.y??0,z:to.z};
  if(dist(from,target)<22&&walkable(map,from,target))return [target];
  const {nodes,edges}=graph(map);
  const nearest=p=>nodes.map((n,i)=>({i,d:dist(p,n)})).sort((a,b)=>a.d-b.d).slice(0,8);
  const starts=nearest(from).filter(e=>e.d<35&&walkable(map,from,nodes[e.i]));
  const ends=new Map(nearest(target).filter(e=>e.d<35&&walkable(map,nodes[e.i],target)).map(e=>[e.i,e.d]));
  const costs=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),done=new Set();
  for(const e of starts)costs[e.i]=e.d;
  let best=-1,bestCost=Infinity;
  for(let k=0;k<nodes.length;k++){
    let i=-1;for(let j=0;j<nodes.length;j++)if(!done.has(j)&&(i<0||costs[j]<costs[i]))i=j;
    if(i<0||costs[i]>=bestCost)break;done.add(i);
    if(ends.has(i)&&costs[i]+ends.get(i)<bestCost){best=i;bestCost=costs[i]+ends.get(i);}
    for(const e of edges[i])if(costs[i]+e.d<costs[e.i]){costs[e.i]=costs[i]+e.d;prev[e.i]=i;}
  }
  if(best<0)return [];
  const path=[target];for(let i=best;i>=0;i=prev[i])path.unshift(nodes[i]);return path;
}
