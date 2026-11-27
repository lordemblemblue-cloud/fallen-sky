import {escortMove,escortEnemyZone} from './importedEscortLayout.mjs';
import nav from './importedEscortNavData.mjs';
const nodes=nav.nodes.map(([x,y,z])=>({x,y,z}));
const edges=nav.edges,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const bins=new Map(), key=(x,z)=>Math.floor(x/8)+','+Math.floor(z/8);
nodes.forEach((p,i)=>{const k=key(p.x,p.z);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);});
function nearest(p){const ids=[];for(let x=Math.floor((p.x-8)/8);x<=Math.floor((p.x+8)/8);x++)for(let z=Math.floor((p.z-8)/8);z<=Math.floor((p.z+8)/8);z++)ids.push(...(bins.get(x+','+z)||[]));return ids.map(i=>({i,d:dist(p,nodes[i])})).filter(v=>v.d<=8).sort((a,b)=>a.d-b.d).slice(0,18);}
function walk(a,b,team,stage){const q={x:a.x,y:a.y,z:a.z},n=Math.max(1,Math.ceil(dist(a,b)/.24));for(let i=1;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;escortMove(q,x-q.x,z-q.z,-.02,.4,true);if(Math.hypot(q.x-x,q.z-z)>.30||team&&escortEnemyZone(team,stage,q))return false;}return dist(q,b)<.48;}
export function escortBotPath(from,to,team,stage=0){
 const target={x:to.x,y:to.y??0,z:to.z};if(dist(from,target)<12&&walk(from,target,team,stage))return[target];
 const starts=nearest(from).filter(v=>walk(from,nodes[v.i],team,stage)),ends=new Map(nearest(target).filter(v=>walk(nodes[v.i],target,team,stage)).map(v=>[v.i,v.d]));
 if(!starts.length||!ends.size)return[];
 const costs=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),heap=[];
 const push=(i,f)=>{let n=heap.length;heap.push([i,f]);while(n){const p=(n-1)>>1;if(heap[p][1]<=f)break;heap[n]=heap[p];n=p;}heap[n]=[i,f];};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=last[1])break;heap[i]=heap[j];i=j;}heap[i]=last;}return top;};
 for(const v of starts){costs[v.i]=v.d;push(v.i,v.d+dist(nodes[v.i],target));}
 let best=-1,bestCost=Infinity;
 while(heap.length){const [i,f]=pop();if(f>=bestCost)break;if(f>costs[i]+dist(nodes[i],target)+1e-6)continue;if(ends.has(i)&&costs[i]+ends.get(i)<bestCost){best=i;bestCost=costs[i]+ends.get(i);}
  for(const j of edges[i]){if(team&&escortEnemyZone(team,stage,nodes[j]))continue;const g=costs[i]+dist(nodes[i],nodes[j]);if(g>=costs[j])continue;costs[j]=g;prev[j]=i;push(j,g+dist(nodes[j],target));}}
 if(best<0)return[];const path=[target];for(let i=best;i>=0;i=prev[i])path.unshift(nodes[i]);return path;
}
