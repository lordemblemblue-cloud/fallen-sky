import {IMPORTED_CTF as map,ctfMove,ctfSafe,ctfSupport,ctfBlockers} from '../src/components/duelist/sim/importedCtfLayout.mjs';
export function walk(points){
 const [x,y,z]=points[0],b={x,y,z};for(const [tx,ty,tz] of points.slice(1)){
 for(let i=0;i<1800;i++){const dx=tx-b.x,dz=tz-b.z,d=Math.hypot(dx,dz);if(d<.07)break;const s=Math.min(d,.11);ctfMove(b,dx/d*s,dz/d*s,-.035);}
 if(Math.hypot(tx-b.x,tz-b.z)>.22||Math.abs(ty-b.y)>.22)return {target:[tx,ty,tz],actual:b,blockers:ctfBlockers({...b,radius:.4}).map(p=>p.id)};
 }return null;
}
let fails=[];
for(const s of map.spawns){if(!ctfSafe(s,s.team))fails.push(['spawn',s.id]);const sign=s.team==='red'?-1:1,z=s.y===4.8?0:s.z<0?-14:14;const r=walk([[s.x,s.y,s.z],[s.x,s.y,z],[sign*33,s.y,z]]);if(r)fails.push([s.id,r]);}
for(const r of map.ramps){const x=(r.minX+r.maxX)/2,d=Math.sign(r.endZ-r.startZ),points=[[x,r.startY,r.startZ-d*.75],[x,r.endY,r.endZ+d*.75]];for(const p of [points,points.slice().reverse()]){const e=walk(p);if(e)fails.push([r.id,e]);}}
const routes={bridge:[[-31,4.8,0],[-31,4.8,-2.4],[31,4.8,-2.4],[31,4.8,0]],upper:[[-31,4.8,0],[-30,4.8,-8.5],[-30,9.6,-19.5],[30,9.6,-19.5],[30,4.8,-8.5],[31,4.8,0]],lower:[[-31,4.8,0],[-30,4.8,7],[-30,0,18],[-30,0,21.5],[30,0,21.5],[30,0,18],[30,4.8,7],[31,4.8,0]]};
for(const [k,p] of Object.entries(routes))for(const route of [p,p.slice().reverse()]){const e=walk(route);if(e)fails.push([k,e]);}
console.log('CTF production navigation audit: ',fails.length?'FAIL':'PASS','24 spawns/exits,20 stair directions,6 flag routes');console.log(JSON.stringify(fails,null,2));if(fails.length)process.exitCode=1;
