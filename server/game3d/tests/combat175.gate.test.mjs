import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DNpcInteractionGate175}
 from '../privateNpcInteractionGate175.mjs';
const clock=1793667600000;
const sessionId='qb174-'+'a'.repeat(64);
const actor={ownerId:'owner175',characterId:'hero175',questId:'echo_branch_hidden_echo',sessionId};
const event=extra=>({source:'trusted-server-npc-interaction-175',worldVerified:true,
 ...actor,npcId:'archer_noor',worldInstanceId:'world-175',
 interactionId:'npc-action-175',occurredAtMs:clock-1000,
 player:{x:0,y:0,z:0},npc:{x:3,y:0,z:0},lineOfSight:true,...extra});
const gate=(e=event())=>createGame3DNpcInteractionGate175({
 now:()=>clock,resolveTrustedInteraction:async()=>e
});
test('17.5 requires explicit backend resolver; frontend cannot supply source',()=>{
 assert.throws(()=>createGame3DNpcInteractionGate175(),/trusted world resolver/);
 assert.throws(()=>createGame3DNpcInteractionGate175({resolveTrustedInteraction:()=>{},
  maxDistance:999}),/bounded proximity/);
});
test('17.5 recognizes only server catalog quest-to-NPC mapping',async()=>{
 const g=gate();const r=await g.validate(actor);
 assert.equal(r.ok,true);assert.equal(r.npcId,'archer_noor');
 assert.equal(g.clientCoordinatesAccepted,false);
 assert.equal(g.productionReady,false);
});
test('17.5 forbids fabricated catalog quest or wrong recipient NPC',async()=>{
 assert.equal((await gate().validate({...actor,questId:'fake_quest'})).ok,false);
 assert.equal((await gate(event({npcId:'archer_kira'})).validate(actor)).ok,false);
});
test('17.5 event expiry, future time and replay all fail closed',async()=>{
 const g=gate();assert.equal((await g.validate(actor)).ok,true);
 assert.equal((await g.validate(actor)).reason,'npc_interaction_replayed');
 for(const e of [event({occurredAtMs:clock+1}),
  event({occurredAtMs:clock-5001})]){
  assert.equal((await gate(e).validate(actor)).ok,false);
 }
});
test('17.5 proximity 3D sphere, LOS, server provenance, actor and session are required',async()=>{
 const wrong=[{npc:{x:9,y:0,z:0}},{npc:{x:3,y:5,z:0}},
  {lineOfSight:false},{source:'browser-event'},
  {characterId:'hero-b'},{sessionId:'qb174-'+'b'.repeat(64)},
  {worldVerified:false},{worldInstanceId:'bad'},
  {player:{x:Infinity,y:0,z:0}}];
 for(const w of wrong){
  const answer=await gate(event(w)).validate(actor);
  assert.equal(answer.ok,false,JSON.stringify(w));
 }
});
test('17.5 world lookup errors and unavailable receipt do not authorize',async()=>{
 const a=createGame3DNpcInteractionGate175({now:()=>clock,
  resolveTrustedInteraction:async()=>{throw Error('disconnected')}});
 assert.equal((await a.validate(actor)).reason,'trusted_world_unavailable');
 assert.equal((await gate(null).validate(actor)).ok,false);
});
