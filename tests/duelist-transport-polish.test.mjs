import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoadwayShell, createEscortArena } from '../src/components/duelist/client/maps/escortArena.mjs';
import { createWorld, addFighter, bodyOf, step } from '../src/components/duelist/sim/world.mjs';
import { MOVES, createFighter } from '../src/components/duelist/core/index.mjs';
import { createPredictor } from '../src/components/duelist/net/predict.mjs';
import { compactWaitingInputs, encodeOwn } from '../src/components/duelist/net/protocol.mjs';
import { createMatch, stepMatch, matchView } from '../src/components/duelist/sim/match.mjs';
import { defenderRespawnDelay, ESCORT_LENGTH, payloadPose } from '../src/components/duelist/sim/escort.mjs';
const dt=1/60;

test('consecutive buffered rolls never subtract the previous roll travel',()=>{
 const world=createWorld({arenaRadius:100});addFighter(world,{id:'r'});const b=bodyOf(world,'r'),f=world.fighters.get('r');
 let prior=b.x,seenSecond=false,buffered=false;
 for(let i=0;i<75;i++){
  step(world,dt,{r:{move:{x:1,z:0},presses:i===0||i===22?['roll']:[]}});
  if(f.buffer?.command==='roll')buffered=true;
  if(i>29&&f.action?.id==='roll')seenSecond=true;
  assert.ok(b.x>=prior-1e-8,'backward displacement at '+i+': '+prior+' -> '+b.x);prior=b.x;
 }
 assert.ok(buffered&&seenSecond,'exercise the same-ID buffered transition');
 assert.ok(b.x>=MOVES.roll.rootMotion*1.95,'both rolls cover their distance');
});

test('input burst retains the direction of the original evasive press',()=>{
 const queue=[];
 for(let i=0;i<12;i++){
  queue.push({seq:i,move:{x:i===0?1:-1,z:0},face:i===0?Math.PI/2:-Math.PI/2,strafe:false,presses:i===0?['roll']:[]});
  compactWaitingInputs(queue);
 }
 const roll=queue.find(i=>i.presses.includes('roll'));
 assert.ok(roll);assert.equal(roll.move.x,1);assert.equal(roll.face,Math.PI/2);
 assert.equal(queue.at(-1).seq,11);
});

test('large roll corrections ease visually while authority and real respawns remain exact',()=>{
 const server=createWorld({arenaRadius:100});const f=addFighter(server,{id:'r'}),b=bodyOf(server,'r');
 const prediction=createPredictor({id:'r',arenaRadius:100});
 const show=createFighter({id:'r'}),shown={x:0,y:0,z:0};
 prediction.reconcile(encodeOwn(f,b,server.time),-1);
 for(let i=0;i<24;i++)prediction.advance(i,{move:{x:1,z:0},presses:i===0?['roll']:[]});
 prediction.present(show,shown,prediction.world.time,dt);
 const before=shown.x;assert.ok(before>5);
 // Server rejected a speculative roll; the authoritative position changes immediately,
 // but the displayed position does not jump back the full roll distance in one frame.
 prediction.reconcile(encodeOwn(f,b,server.time),23);
 assert.equal(prediction.body.x,0);
 prediction.present(show,shown,prediction.world.time,dt);
 assert.ok(shown.x>before-1.0);
 for(let i=0;i<120;i++)prediction.present(show,shown,prediction.world.time,dt);
 assert.ok(Math.abs(shown.x)<.005);
 b.x=15;f.protectedUntil=1;
 prediction.reconcile(encodeOwn(f,b,server.time),24);
 prediction.present(show,shown,prediction.world.time,dt);
 assert.equal(shown.x,15,'actual respawn cuts to authority');
});

test('road shell has a visible opaque downward face and perimeter, not an upward-only plane',()=>{
 const positions=[0,0,0,0,0,2,2,0,0,2,0,0,0,0,2,2,0,2];
 const mesh=new THREE.Mesh(createRoadwayShell(positions),new THREE.MeshStandardMaterial());
 mesh.updateMatrixWorld(true);
 const bottom=new THREE.Raycaster(new THREE.Vector3(1,-2,1),new THREE.Vector3(0,1,0)).intersectObject(mesh);
 assert.ok(bottom.length);assert.ok(Math.abs(bottom[0].point.y+.38)<1e-6);
 const side=new THREE.Raycaster(new THREE.Vector3(-2,-.2,1),new THREE.Vector3(1,0,0)).intersectObject(mesh);
 assert.ok(side.length);assert.ok(Math.abs(side[0].point.x)<1e-6);
 mesh.geometry.dispose();mesh.material.dispose();
});

test('imported roadway and bridge are closed, with depth-writing opaque materials',()=>{
 const grad={addColorStop(){}};
 globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:(o,k)=>o[k]??(k==='createLinearGradient'||k==='createRadialGradient'?()=>grad:()=>{}),set:(o,k,v)=>(o[k]=v,true)})})};
 const scene=new THREE.Scene(),a=createEscortArena(scene),shell=a.root.getObjectByName('OpaqueRoadwayAndBridgeUnderside');
 assert.ok(shell);assert.equal(shell.material.transparent,false);assert.equal(shell.material.depthWrite,true);
 assert.ok(shell.geometry.attributes.position.count>1000);
 for(const k of ['roadway','bridgeDeck','slateDeck','elevatedDeck','tacticalDeck','spawnDeckAtk','spawnDeckDef']){
  const m=a.map.mats[k];assert.equal(m.opacity,1);assert.equal(m.transparent,false);assert.equal(m.depthWrite,true);
 }
 scene.updateMatrixWorld(true);
 const p=payloadPose(ESCORT_LENGTH*.48);
 const hits=new THREE.Raycaster(new THREE.Vector3(p.x,p.y-2,p.z),new THREE.Vector3(0,1,0)).intersectObject(shell);
 assert.ok(hits.length,'actual bridge/road underside is visible from below');
 a.dispose();
});

const start=()=>{
 const m=createMatch({mode:'escort',seats:2,players:[{id:'a',team:'red'},{id:'b',team:'blue'}]});
 while(m.phase==='countdown')stepMatch(m,dt);
 return m;
};
function setProgress(m,percent,stage){
 m.escort.distance=ESCORT_LENGTH*percent/100;
 Object.assign(m.escort,payloadPose(m.escort.distance),{progress:percent,stage,pointACaptured:true});
}
test('progressive defense reinforcement delay is bounded and monotonic',()=>{
 const m=start();const values=[];
 for(const percent of [0,25,50,75,90,99]){
  setProgress(m,percent,percent>=65?2:percent>=35?1:0);
  m.escort.defenderRespawnSeconds=defenderRespawnDelay(m.escort);values.push(m.escort.defenderRespawnSeconds);
 }
 assert.equal(values[0],4);assert.equal(values.at(-1),20);
 for(let i=1;i<values.length;i++)assert.ok(values[i]>=values[i-1]);
 assert.equal(defenderRespawnDelay({progress:0,stage:0,x:-23,z:55,defenderRespawnSeconds:4}),20,'near an active enemy spawn also increases delay');
});

test('defender deaths already waiting extend at a checkpoint; falls cannot bypass respawn',()=>{
 const m=start(),b=m.seats.get('b'),a=m.seats.get('a');
 bodyOf(m.world,'b').y=-20;stepMatch(m,dt);
 assert.equal(m.world.fighters.get('b').vitals.dead,true);
 assert.ok(Math.abs(b.respawnAt-b.respawnStartedAt-4)<1e-6);
 setProgress(m,94,2);stepMatch(m,dt);
 assert.equal(m.escort.defenderRespawnSeconds,20);
 assert.ok(Math.abs(b.respawnAt-b.respawnStartedAt-20)<1e-6);
 // An existing corpse inside a newly-active enemy protected zone is not revived.
 Object.assign(bodyOf(m.world,'b'),{x:-89,y:6,z:55});
 stepMatch(m,dt);assert.equal(m.world.fighters.get('b').vitals.dead,true);
 assert.ok(matchView(m,'b').me.respawnIn>19);
 bodyOf(m.world,'a').y=-20;stepMatch(m,dt);
 assert.ok(Math.abs(a.respawnAt-a.respawnStartedAt-4)<1e-6,'attackers retain normal cooldown');
 for(let i=0;i<5*60;i++)stepMatch(m,dt);
 assert.equal(m.world.fighters.get('a').vitals.dead,false);
 assert.equal(m.world.fighters.get('b').vitals.dead,true);
 for(let i=0;i<16*60;i++)stepMatch(m,dt);
 assert.equal(m.world.fighters.get('b').vitals.dead,false);
 assert.equal(b.respawnAt,null);
});
