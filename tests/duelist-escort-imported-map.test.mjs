import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createEscortArena,buildEscortVehicle} from '../src/components/duelist/client/maps/escortArena.mjs';
import {IMPORTED_ESCORT,escortSupport,escortBlockers,escortMove} from '../src/components/duelist/sim/importedEscortLayout.mjs';
import {escortBotPath} from '../src/components/duelist/sim/escortBotNav.mjs';
import {ESCORT_LENGTH,ESCORT_CHECKPOINTS,payloadPose,stepEscort} from '../src/components/duelist/sim/escort.mjs';
import {createMatch} from '../src/components/duelist/sim/match.mjs';
import {bodyOf} from '../src/components/duelist/sim/world.mjs';
import {DuelistRoomEngine} from '../src/components/duelist/net/actorRoomEngine.mjs';
import {PROTOCOL} from '../src/components/duelist/net/protocol.mjs';
const grad={addColorStop(){}};
globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:(o,k)=>o[k]??(k==='createLinearGradient'||k==='createRadialGradient'?()=>grad:()=>{}),set:(o,k,v)=>(o[k]=v,true)})})};
test('actual imported map geometry, original scenery and vehicle build with real Three.js',()=>{
 const scene=new THREE.Scene(),a=createEscortArena(scene),v=buildEscortVehicle(scene);
 assert.equal(a.map.walkableTriangles.length,IMPORTED_ESCORT.floors.length);assert.equal(a.map.runEngineeringAudit().filter(r=>r.pass).length,12);
 assert.equal(a.map.controlPoints.length,15);assert.equal(a.environment.falls.length,2);
 const before=a.environment.waterTextures[0].tex.offset.y;a.environment.update(.1);assert.notEqual(a.environment.waterTextures[0].tex.offset.y,before);
 assert.ok(v.transportVisual.children.length>15);a.dispose();assert.equal(a.root.parent,null);
});
test('all 54 spawn slots have actual authoritative ground, clearance and navigation to combat',()=>{
 let n=0;for(const z of Object.values(IMPORTED_ESCORT.spawnZones)){const team=z.team==='attacker'?'red':'blue',stage=z.activeStages[0],target=z.id==='attackerBase'?{x:0,y:0,z:-148}:z.id==='attackerCP1'?{x:54,y:4,z:-54}:z.id==='defenderBase'?{x:44,y:2,z:155}:{x:-56,y:6,z:56};for(const p of z.points){assert.ok(Math.abs(escortSupport(p.x,p.z,p.y+.1)-p.y)<.1,p.id);assert.equal(escortBlockers({...p,radius:.48}).length,0,p.id);assert.ok(escortBotPath(p,target,team,stage).length,p.id);n++;}}assert.equal(n,54);
});
const overlap=(a,b)=>{for(const p of [a,b])for(let i=0;i<p.length;i++){const c=p[i],d=p[(i+1)%p.length],nx=d.z-c.z,nz=c.x-d.x,proj=q=>q.map(v=>v.x*nx+v.z*nz),u=proj(a),v=proj(b);if(Math.max(...u)<Math.min(...v)||Math.max(...v)<Math.min(...u))return false;}return true;};
test('full transport footprint and fighter traversal across the 432m path',()=>{
 assert.ok(ESCORT_LENGTH>430&&ESCORT_LENGTH<435);const foot={...payloadPose(0)};
 for(let d=0;d<=ESCORT_LENGTH;d+=.2){const p=payloadPose(d),cos=Math.cos(p.yaw),sin=Math.sin(p.yaw),poly=[[-2.1,-3.2],[2.1,-3.2],[2.1,3.2],[-2.1,3.2]].map(([x,z])=>({x:p.x+x*cos+z*sin,z:p.z-x*sin+z*cos}));
 for(const b of IMPORTED_ESCORT.solids){if(b.y1<=p.y+.2||b.y0>=p.y+2.8||b.x0>p.x+4||b.x1<p.x-4||b.z0>p.z+4||b.z1<p.z-4)continue;assert.ok(!overlap(poly,b.polygon||[{x:b.x0,z:b.z0},{x:b.x1,z:b.z0},{x:b.x1,z:b.z1},{x:b.x0,z:b.z1}]),b.id+' at '+d);}
 escortMove(foot,p.x-foot.x,p.z-foot.z,-.01,.4,true);assert.ok(Math.hypot(foot.x-p.x,foot.y-p.y,foot.z-p.z)<.22,'route drift at '+d);
 }
});
test('Point A activation, elevation-aware contest, physical CP locks, bonuses and final arrival',()=>{
 const m=createMatch({mode:'escort',seats:2,players:[{id:'a',team:'red'},{id:'b',team:'blue'}]});
 const a=bodyOf(m.world,'a'),b=bodyOf(m.world,'b');Object.assign(a,{x:0,y:0,z:-148});for(let i=0;i<300;i++)stepEscort(m,1/60);
 assert.ok(m.escort.pointACaptured);assert.equal(m.escort.bonusTime,60);
 for(let i=0;i<2;i++){m.escort.distance=ESCORT_CHECKPOINTS[i]-.01;Object.assign(m.escort,payloadPose(m.escort.distance));Object.assign(a,m.escort);Object.assign(b,{x:m.escort.x,y:m.escort.y+5,z:m.escort.z});stepEscort(m,1/60);assert.equal(m.escort.stage,i+1);assert.equal(m.escort.defenders,0);assert.equal(m.escort.bonusTime,60+(i+1)*90);const p=payloadPose(ESCORT_CHECKPOINTS[i]);assert.ok(Math.hypot(p.x-[54,-56][i],p.z-[-54,56][i])<.25);}
 m.escort.distance=ESCORT_LENGTH-.01;Object.assign(m.escort,payloadPose(m.escort.distance));Object.assign(a,m.escort);assert.equal(stepEscort(m,1/60),'red');assert.equal(m.escort.progress,100);
});
test('public Transport actor room joins two distinct clients on the imported layout',()=>{
 let now=0,n=0;const room=new DuelistRoomEngine('m6',{clock:()=>now,idFactory:()=>String(++n).padStart(32,'0')});
 const client=id=>({id,identity:{type:'anonymous',anonymousId:id},messages:[],send(m){this.messages.push(m);},reject(code){this.rejected=code;}});
 const a=client('a'),b=client('b');for(const c of [a,b]){room.connect(c);room.message(c,{t:'hello',v:PROTOCOL});room.message(c,{t:'join',mode:'escort',matchId:'m6',cls:'duelist'});}
 assert.equal(room.status().players,2);assert.equal(room.status().bots,8);assert.equal(room.match.world.arenaLayout,IMPORTED_ESCORT);
 for(let i=0;i<240;i++){now+=1/60;room.tick();}const snap=a.messages.filter(m=>m.t==='snap').at(-1);assert.ok(snap.fighters.length>=2);assert.ok(Number.isFinite(snap.escortDistance));assert.ok(a.messages.some(m=>m.t==='snap'&&m.view?.escort?.stage===0));
});
