import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateWorldViewStore144}
 from '../../../src/components/game3d/network/privateWorldViewModel144.mjs';
import {createPrivateWorldScenePreview145}
 from '../../../src/components/game3d/network/privateWorldScenePreview145.mjs';
import {createPrivateWorldInputBridge146,mapPrivateWorldMovement146}
 from '../../../src/components/game3d/network/privateWorldInputBridge146.mjs';
import {createPrivateWorldCutoverRehearsal147,
 comparePrivateWorldToLegacy147,PRIVATE_WORLD_RELEASE_BLOCKERS_147}
 from '../../../src/components/game3d/network/privateWorldCutoverRehearsal147.mjs';

const connectionId='12345678-1234-1234-1234-123456789012';
const instanceId='world-1450001',instanceEpoch='epoch-1450001';
const mapFingerprint='a'.repeat(64);
const makeSnapshot=(eventSeq=0,hp=100,enemyHp=30)=>({
 protocol:1,version:'13.7',instanceId,instanceEpoch,
 mapFingerprint,eventSeq,serverTime:1000+eventSeq*50,
 player:{x:1,z:2,hp,maxHp:100,stamina:75,facing:0,
  lastIntentSeq:0},
 enemies:[{id:'wolf1',x:3,z:2,hp:enemyHp,maxHp:30,
  alive:enemyHp>0,pendingImpactAt:null}],
 rewardsIssued:false,productionReady:false,
});
const packet=s=>({ok:true,version:'13.7',reset:true,connectionId,
 snapshot:s,cursor:s.eventSeq,
 nextIntentSeq:s.player.lastIntentSeq+1,
 rewardsIssued:false,productionReady:false});
const createView=()=>{
 const v=createPrivateWorldViewStore144({
  instanceId,instanceEpoch,mapFingerprint,
 });
 v.connected(packet(makeSnapshot()));
 return v;
};
const page=(s,from)=>({ok:true,version:'13.7',reset:false,
 gap:false,snapshot:s,events:[],nextSeq:from,hasMore:false,
 rewardsIssued:false,productionReady:false});
function previewFixture(view=createView()){
 const events=[],objects=new Set();
 const scene={
  add(obj){events.push('add:'+obj.id);objects.add(obj)},
  remove(obj){events.push('remove:'+obj.id);objects.delete(obj)},
 };
 const records=new Map();
 const makeMarker=({id,kind})=>{
  const marker={object:{id,kind},
   setPosition(x,y,z){marker.position={x,y,z}},
   setHealth(health){marker.health=health},
   dispose(){marker.disposed=true},
  };
  records.set(id,marker);return marker;
 };
 return {view,events,objects,records,scene,makeMarker};
}
test('14.5 visual scene overlay never writes to legacy actor meshes',()=>{
 const f=previewFixture();
 const handle=createPrivateWorldScenePreview145({
  view:f.view,scene:f.scene,makeMarker:f.makeMarker,
  sampleHeight:()=>10,
 });
 assert.equal(handle.getMarkerCount(),2);
 assert.deepEqual(f.records.get('__private_player__').position,{
  x:1,y:10,z:2,
 });
 assert.deepEqual(f.records.get('enemy:wolf1').health,{
  hp:30,maxHp:30,alive:true,kind:'enemy',
 });
 assert.equal(handle.mutatesLiveWorld,false);
 assert.equal(handle.grantsRewards,false);
 assert.equal(f.objects.size,2);
 handle.dispose();
 assert.equal(f.objects.size,0);
 assert.ok([...f.records.values()].every(r=>r.disposed===true));
});
test('14.5 updates original markers without spawning duplicate visual actors',()=>{
 const f=previewFixture();
 const handle=createPrivateWorldScenePreview145({
  view:f.view,scene:f.scene,makeMarker:f.makeMarker,
 });
 const earlier=f.records.get('enemy:wolf1');
 const later=makeSnapshot(1,80,18);
 f.view.received({
  ok:true,version:'13.7',reset:true,gap:true,snapshot:later,
  events:[],nextSeq:later.eventSeq,hasMore:false,
  rewardsIssued:false,productionReady:false,
 });
 assert.equal(handle.getMarkerCount(),2);
 assert.equal(f.records.get('enemy:wolf1'),earlier);
 assert.equal(earlier.health.hp,18);
 assert.equal(f.records.get('__private_player__').health.hp,80);
 assert.equal(f.events.filter(s=>s==='add:enemy:wolf1').length,1);
 f.view.stop();
 assert.equal(handle.getMarkerCount(),0);
 assert.equal(earlier.disposed,true);
 handle.dispose();handle.dispose();
});
test('14.5 isolated marker factory and world height must be valid',()=>{
 const f=previewFixture();
 assert.throws(()=>createPrivateWorldScenePreview145({
  view:f.view,scene:f.scene,makeMarker:()=>({object:{}}),
 }),/14.5/);
 assert.throws(()=>createPrivateWorldScenePreview145({
  view:f.view,scene:f.scene,makeMarker:f.makeMarker,
  sampleHeight:()=>NaN,
 }),/14.5/);
 assert.equal(f.objects.size,0);
});
test('14.6 W/A/S/D normalized relative to camera yaw',()=>{
 const one=mapPrivateWorldMovement146({keys:{w:true},cameraYaw:0});
 assert.deepEqual(one,{x:0,z:-1,facing:0});
 const diagonal=mapPrivateWorldMovement146({
  keys:{w:true,d:true},cameraYaw:0,
 });
 assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<1e-12);
 const rotated=mapPrivateWorldMovement146({
  keys:{w:true},cameraYaw:Math.PI/2,
 });
 assert.ok(Math.abs(rotated.x+1)<1e-12);
 assert.ok(Math.abs(rotated.z)<1e-12);
 assert.throws(()=>mapPrivateWorldMovement146({cameraYaw:Infinity}),/14.6/);
});
test('14.6 disabled by default and rate limits its private inputs',async()=>{
 const v=createView(),now={value:1000},sent=[];
 const c={input:async x=>{sent.push(x);return {mode:'connected'}},
  attack:async()=>({queued:true,hitConfirmed:false,rewardsAuthorized:false}),
  disconnect:async()=>{v.stop()},
 };
 const bridge=createPrivateWorldInputBridge146({
  client:c,view:v,clock:()=>now.value,minIntervalMs:100,
 });
 assert.equal((await bridge.step({keys:{w:true},cameraYaw:0})).sent,false);
 assert.equal(bridge.enable().liveWorldAuthority,false);
 assert.equal((await bridge.step({keys:{w:true},cameraYaw:0})).sent,true);
 now.value=1050;
 assert.equal((await bridge.step({keys:{d:true},cameraYaw:0})).reason,
  'rate_limited');
 now.value=1110;
 assert.equal((await bridge.step({keys:{d:true},cameraYaw:0})).sent,true);
 assert.equal(sent.length,2);
 await bridge.disable();
 assert.equal(v.getState().mode,'disconnected');
 assert.equal(bridge.isEnabled(),false);
});
test('14.6 preview target must exist and be alive in server snapshot',async()=>{
 const v=createView(),shots=[];
 const c={input:async()=>({mode:'connected'}),
  attack:async a=>{shots.push(a);return {
   queued:true,hitConfirmed:false,rewardsAuthorized:false,
  }},
  disconnect:async()=>{v.stop()},
 };
 const bridge=createPrivateWorldInputBridge146({client:c,view:v});
 bridge.enable();
 assert.equal((await bridge.basicAttack({targetId:'player'})).sent,false);
 assert.equal((await bridge.basicAttack({targetId:'wolf1'})).queued,true);
 assert.equal(shots.length,1);
 assert.deepEqual(shots[0],{targetId:'wolf1',weaponPath:'damage'});
 assert.equal(bridge.isEnabled(),true);
 await bridge.close();
 assert.equal(bridge.isEnabled(),false);
});
test('14.6 invalid server strike receipt never confirmed as hit',async()=>{
 const v=createView();
 const client={input:async()=>({mode:'connected'}),
  attack:async()=>({queued:true,hitConfirmed:true,rewardsAuthorized:true}),
  disconnect:async()=>{v.stop()},
 };
 const bridge=createPrivateWorldInputBridge146({client,view:v});
 bridge.enable();
 await assert.rejects(bridge.basicAttack({targetId:'wolf1'}),
  /untrusted_attack_ack/);
 await bridge.close();
});
test('14.7 shadow comparison detects player and NPC drift without modifying',()=>{
 const s=makeSnapshot(2),legacy={
  mapFingerprint,player:{x:1,z:2,hp:100,maxHp:100},
  enemies:[{id:'wolf1',x:3,z:2,hp:30,maxHp:30}],
 };
 const matched=comparePrivateWorldToLegacy147({snapshot:s,legacy});
 assert.equal(matched.ok,true);
 assert.equal(matched.reason,'matched_visual_observation');
 assert.equal(matched.matching,2);
 assert.equal(matched.safeToActivate,false);
 assert.deepEqual(matched.blockers,PRIVATE_WORLD_RELEASE_BLOCKERS_147);
 const diverged=comparePrivateWorldToLegacy147({
  snapshot:s,legacy:{...legacy,player:{...legacy.player,hp:70},
   enemies:[{...legacy.enemies[0],x:55}]},
 });
 assert.equal(diverged.divergences.length,2);
 assert.ok(diverged.divergences.some(d=>d.hpDelta===30));
 assert.equal(legacy.player.hp,100);
 assert.equal(diverged.gameplayMutated,false);
});
test('14.7 rejects missing world, mismatched map, missing and duplicate enemies',()=>{
 const s=makeSnapshot();
 const base={mapFingerprint,player:{x:1,z:2,hp:100,maxHp:100},
  enemies:[]};
 assert.equal(comparePrivateWorldToLegacy147({
  snapshot:s,legacy:null,
 }).reason,'incomplete_legacy_observation');
 assert.equal(comparePrivateWorldToLegacy147({
  snapshot:s,legacy:{...base,mapFingerprint:'b'.repeat(64)},
 }).reason,'map_fingerprint_mismatch');
 assert.equal(comparePrivateWorldToLegacy147({
  snapshot:s,legacy:base,
 }).divergences[0].reason,'missing_legacy_enemy');
 assert.equal(comparePrivateWorldToLegacy147({
  snapshot:s,legacy:{...base,enemies:[{
   id:'wolf1',x:3,z:2,hp:30,maxHp:30,
  },{id:'wolf1',x:3,z:2,hp:30,maxHp:30}]},
 }).divergences.some(d=>d.reason==='duplicate_or_invalid_legacy_actor'),true);
});
test('14.7 clean repeated comparisons still cannot activate live authority',()=>{
 const v=createView();
 const current={mapFingerprint,player:{x:1,z:2,hp:100,maxHp:100},
  enemies:[{id:'wolf1',x:3,z:2,hp:30,maxHp:30}]};
 const rehearsal=createPrivateWorldCutoverRehearsal147({
  view:v,readLegacyState:()=>current,maxHistory:2,
 });
 for(let i=0;i<3;i++)assert.equal(rehearsal.observe().matching,2);
 assert.equal(rehearsal.getHistory().length,2);
 const verdict=rehearsal.assess();
 assert.equal(verdict.observationsMatch,true);
 assert.equal(verdict.readyForLiveCutover,false);
 assert.equal(verdict.activated,false);
 assert.equal(rehearsal.liveAuthoritySwitchInstalled,false);
 v.stop();
 assert.equal(rehearsal.observe().reason,'private_world_not_connected');
 rehearsal.dispose();
 assert.throws(()=>rehearsal.observe(),/rehearsal_closed/);
});
