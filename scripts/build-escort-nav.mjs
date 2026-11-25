import {writeFileSync} from 'node:fs';
import {IMPORTED_ESCORT,escortHeights,escortBlockers,escortMove} from '../src/components/duelist/sim/importedEscortLayout.mjs';
const step=1.5,nodes=[],edges=[],bins=new Map(),key=(x,z)=>Math.floor(x/step)+','+Math.floor(z/step);
const add=(x,y,z)=>{if(!Number.isFinite(y)||escortBlockers({x,y,z,radius:.45}).length)return;const k=key(x,z),old=bins.get(k)||[];if(old.some(i=>Math.hypot(nodes[i][0]-x,nodes[i][1]-y,nodes[i][2]-z)<.25))return;old.push(nodes.length);bins.set(k,old);nodes.push([x,y,z]);edges.push([]);};
for(let x=-99;x<=96;x+=step)for(let z=-194;z<=202;z+=step)for(const y of escortHeights(x,z))add(x,y,z);
for(const p of IMPORTED_ESCORT.route.filter((_,i)=>i%4===0))add(p.x,p.y,p.z);
for(const zone of Object.values(IMPORTED_ESCORT.spawnZones))for(const p of zone.points)add(p.x,p.y,p.z);
function walk(a,b){const q={x:a[0],y:a[1],z:a[2]},n=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])/.24));for(let i=1;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,z=a[2]+(b[2]-a[2])*i/n;escortMove(q,x-q.x,z-q.z,-.02,.4,true);if(Math.hypot(q.x-x,q.z-z)>.30)return false;}return Math.hypot(q.x-b[0],q.y-b[1],q.z-b[2])<.45;}
for(let i=0;i<nodes.length;i++){const a=nodes[i];for(let x=Math.floor((a[0]-2.6)/step);x<=Math.floor((a[0]+2.6)/step);x++)for(let z=Math.floor((a[2]-2.6)/step);z<=Math.floor((a[2]+2.6)/step);z++)for(const j of bins.get(x+','+z)||[]){if(j<=i)continue;const b=nodes[j];if(Math.hypot(a[0]-b[0],a[2]-b[2])>2.6||Math.abs(a[1]-b[1])>2.3)continue;if(walk(a,b)&&walk(b,a)){edges[i].push(j);edges[j].push(i);}}}
writeFileSync('src/components/duelist/sim/importedEscortNavData.mjs','// Generated from authoritative collision by scripts/build-escort-nav.mjs\nexport default '+JSON.stringify({nodes,edges})+';\n');
globalThis.console.log('navigation nodes',nodes.length,'edges',edges.reduce((n,e)=>n+e.length,0)/2);
