import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateEncounterNpcHost178} from '../privateEncounterNpcHost178.mjs';
import {createGame3DTrustedNpcWorldBridge177} from '../trustedNpcWorldBridge177.mjs';
import {createGame3DNpcInteractionGate175} from '../privateNpcInteractionGate175.mjs';

const sessionId='qb174-'+'f'.repeat(64);
const actor={ownerId:'owner178',characterId:'hero178',questId:'axe_q_first_patrol',npcId:'archer_lyra',sessionId};
const scope={ownerId:actor.ownerId,characterId:actor.characterId,instanceId:'wolfveil-instance-178',instanceEpoch:'epoch-178-one'};
const context=Object.freeze({secret:Symbol('private-world-auth')});
const NPC_SPAWN={x:2.0,z:0};
const now=1793667700000;
function harness(opts={}){
 let time=now,position=opts.player||{x:0,z:0},hp=opts.hp??100,connected=opts.connected!==false;
 let blocked=!!opts.blocked,leases=opts.lease!==false,tick=opts.tick??(now-500),seals=0,logins=0;
 const mapWorld={id:'wolfveil-v1',fingerprint:'a'.repeat(64),
  valid:p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<100&&Math.abs(p.z)<100,
  height:()=>0,
  canStrike:()=>!blocked};
 const encounter={version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapId:mapWorld.id,mapFingerprint:mapWorld.fingerprint,
  worldOrigin:Object.freeze({x:0,z:0}),snapshot(){return {
   instanceId:scope.instanceId,privateBetaOnly:true,rewardsIssued:false,
   serverTime:tick,player:{...position,hp},enemies:[],eventSeq:0
  }}};
 const spawn={source:'sealed-private-world-npc-seed-178',sealed:true,npcId:actor.npcId,
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
  mapFingerprint:mapWorld.fingerprint,position:NPC_SPAWN,...opts.spawn};
 const host=createGame3DPrivateEncounterNpcHost178({encounter,mapWorld,scope,
  now:()=>time,verifyExclusiveWorldLease:async()=>leases,
  resolveTrustedWorldActor:async subject=>{logins++;return subject===context&&connected?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:actor.ownerId,characterId:actor.characterId,
   actionSessionId:sessionId,sessionExpiresAtMs:time+25000,...opts.identity}:null;},
  resolveSealedNpcSpawn:async()=>{seals++;return opts.resolveSpawn?
   opts.resolveSpawn(spawn):spawn;}});
 return {host,context,mapWorld,encounter,
  record:(x={})=>host.recordServerInteraction({serverRequestContext:context,
   questId:actor.questId,npcId:actor.npcId,...x}),
  advance:n=>{time+=n},move:p=>{position=p},setHp:v=>{hp=v},
  setTick:v=>{tick=v},setLOS:v=>{blocked=!v},setLease:v=>{leases=v},
  get calls(){return {seals,logins}}};
}
const wrap=h=>createGame3DTrustedNpcWorldBridge177({
  consumeServerNpcInteraction:h.host.consumeServerNpcInteraction,
  readServerWorldSnapshot:h.host.readServerWorldSnapshot,
  verifyServerLineOfSight:h.host.verifyServerLineOfSight,now:()=>now});

test('17.8 requires genuine 13.6 server snapshot, map and lease resolver',()=>{
 assert.throws(()=>createGame3DPrivateEncounterNpcHost178(),/private encounter/);
 const h=harness();assert.equal(h.host.publicRouteInstalled,false);
 assert.equal(h.host.installedInLiveGame,false);
 assert.equal(h.host.browserCoordinatesAccepted,false);
});
test('17.8 generates a host-owned receipt from 13.6 position and sealed NPC spawn',async()=>{
 const h=harness(),r=await h.record();
 assert.equal(r.ok,true);assert.match(r.receiptId,/^npc178-/);
 assert.equal(r.rewardsIssued,false);assert.equal(h.calls.seals,1);
 const bridge=wrap(h),gate=createGame3DNpcInteractionGate175({
  resolveTrustedInteraction:bridge.resolveTrustedInteraction,now:()=>now});
 const result=await gate.validate({ownerId:actor.ownerId,characterId:actor.characterId,
  questId:actor.questId,sessionId});
 assert.equal(result.ok,true);assert.equal(result.npcId,actor.npcId);
 assert.equal(await bridge.resolveTrustedInteraction({...actor}),null);
});
test('17.8 unauthorized in-process subject never records an NPC interaction',async()=>{
 const h=harness();const r=await h.host.recordServerInteraction({
  serverRequestContext:{},questId:actor.questId,npcId:actor.npcId});
 assert.equal(r.ok,false);
 const bridge=wrap(h);assert.equal(await bridge.resolveTrustedInteraction(actor),null);
});
test('17.8 browser coordinates or fake signed sessions are never accepted by record()',async()=>{
 const h=harness();
 for(const patch of [
  {player:{x:2,z:0}},{npcPosition:{x:2,z:0}},
  {questId:'<script>'},{npcId:'invalid npc'}]){
  const r=await h.record(patch);
  assert.equal(r.ok,false);
 }
 const forged=harness({identity:{actionSessionId:'fake'}});
 assert.equal((await forged.record()).ok,false);
});
test('17.8 faraway, dead player, stale tick and blocked collision all fail',async()=>{
 for(const opts of [{player:{x:30,z:0}}, {hp:0}, {tick:now-2000}, {blocked:true}]){
  const h=harness(opts),r=await h.record();
  assert.equal(r.ok,false,JSON.stringify(opts));
 }
});
test('17.8 rejects non-sealed, forged-epoch or wrong-fingerprint NPC spawn',async()=>{
 for(const patch of [{sealed:false},{source:'client_npc_click'},
  {instanceEpoch:'epoch-wrong'}, {mapFingerprint:'b'.repeat(64)},
  {position:{x:Infinity,z:0}}]){
  const h=harness({spawn:patch});
  assert.equal((await h.record()).ok,false,JSON.stringify(patch));
 }
});
test('17.8 wrong actor, wrong character, mismatched action session cannot record',async()=>{
 for(const identity of [{accountId:'attacker'}, {characterId:'attacker'},
  {authenticated:false},{identitySource:'client-position'}]){
  const h=harness({identity});assert.equal((await h.record()).ok,false,JSON.stringify(identity));
 }
});
test('17.8 action session mismatch cannot claim a different authenticated player receipt',async()=>{
 const h=harness({identity:{actionSessionId:'qb174-'+'e'.repeat(64)}});
 assert.equal((await h.record()).ok,true);
 const b=wrap(h);assert.equal(await b.resolveTrustedInteraction(actor),null);
});
test('17.8 exclusive lease loss immediately refuses records, snapshot and LOS',async()=>{
 const h=harness();assert.equal((await h.record()).ok,true);
 h.setLease(false);assert.equal((await h.record()).ok,false);
 const b=wrap(h);assert.equal(await b.resolveTrustedInteraction(actor),null);
});
test('17.8 receipt expiry and incorrect player/epoch never pass 17.7 bridge',async()=>{
 const h=harness();assert.equal((await h.record()).ok,true);
 const q={...actor};
 const consumed=await h.host.consumeServerNpcInteraction(q);
 assert.equal(consumed?.consumed,true);
 const info={...actor,receiptId:consumed.receiptId,worldInstanceId:scope.instanceId,
  worldEpoch:scope.instanceEpoch,worldTick:consumed.worldTick};
 assert.equal((await h.host.readServerWorldSnapshot({...info,worldTick:1})),null);
 assert.equal((await h.host.verifyServerLineOfSight({...info,
  player:{x:999,y:0,z:0},npc:{x:2,y:0,z:0}})),null);
 h.advance(6000);
 assert.equal((await h.host.readServerWorldSnapshot(info)),null);
});
test('17.8 one-use consumption prevents concurrent duplicate claims',async()=>{
 const h=harness();assert.equal((await h.record()).ok,true);
 const [a,b]=await Promise.all([
  h.host.consumeServerNpcInteraction(actor),h.host.consumeServerNpcInteraction(actor)]);
 assert.equal([a,b].filter(Boolean).length,1);
 assert.equal(await h.host.consumeServerNpcInteraction(actor),null);
});
test('17.8 NPC snapshot and LOS are pinned to original 13.6 tick, not later browser pose',async()=>{
 const h=harness();assert.equal((await h.record()).ok,true);
 const receipt=await h.host.consumeServerNpcInteraction(actor);
 h.move({x:90,z:90});h.setTick(now);
 const key={...actor,receiptId:receipt.receiptId,worldInstanceId:scope.instanceId,
  worldEpoch:scope.instanceEpoch,worldTick:receipt.worldTick};
 const snap=await h.host.readServerWorldSnapshot(key);
 assert.equal(snap.player.x,0);
 assert.equal(snap.npc.x,2);
 const los=await h.host.verifyServerLineOfSight({...key,player:snap.player,npc:snap.npc});
 assert.equal(los.visible,true);
});
test('17.8 shutdown revokes all pending evidence and future interactions',async()=>{
 const h=harness();assert.equal((await h.record()).ok,true);
 h.host.shutdown();
 assert.equal((await h.record()).ok,false);
 assert.equal(await h.host.consumeServerNpcInteraction(actor),null);
});

test('18.1 pairing rotation clears all unconsumed 17.8 NPC receipts',async()=>{
 const h=harness();
 assert.equal((await h.record()).ok,true);
 h.host.invalidatePendingInteractions();
 assert.equal(await h.host.consumeServerNpcInteraction(actor),null);
 const fresh=await h.record();
 assert.equal(fresh.ok,true);
 const consumed=await h.host.consumeServerNpcInteraction(actor);
 assert.equal(consumed?.receiptId,fresh.receiptId);
});
test('18.1 invalidating an in-flight NPC spawn cannot recreate stale evidence',async()=>{
 let entered,release;
 const waiting=new Promise(resolve=>{entered=resolve});
 const blocked=new Promise(resolve=>{release=resolve});
 let pause=true;
 const h=harness({resolveSpawn:async spawn=>{
  if(pause){entered();await blocked;}
  return spawn;
 }});
 const pending=h.record();
 await waiting;
 h.host.invalidatePendingInteractions();
 pause=false;
 release();
 const denied=await pending;
 assert.equal(denied.ok,false);
 assert.equal(await h.host.consumeServerNpcInteraction(actor),null);
 assert.equal((await h.record()).ok,true);
});
