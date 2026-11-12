import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DTrustedNpcWorldBridge177}
 from '../trustedNpcWorldBridge177.mjs';
import {createGame3DNpcInteractionGate175}
 from '../privateNpcInteractionGate175.mjs';
const now=Date.UTC(2026,10,2,23,0);
const request=Object.freeze({ownerId:'owner177',characterId:'hero177',
 questId:'echo_ch_14_first_echo',npcId:'archer_lyra',
 sessionId:'qb174-'+'a'.repeat(64)});
const receipt=(over={})=>({source:'server-world-npc-event-177',
 consumed:true,actorAuthenticated:true,intent:'npc_interact',
 ownerId:request.ownerId,characterId:request.characterId,
 questId:request.questId,npcId:request.npcId,
 actionSessionId:request.sessionId,
 worldInstanceId:'world-instance-177',worldEpoch:'epoch-game-177',
 worldTick:200,receiptId:'npc-interact-177',occurredAtMs:now-600,...over});
const state=(over={})=>({source:'server-world-snapshot-177',
 serverAuthenticated:true,ownerId:request.ownerId,characterId:request.characterId,
 actionSessionId:request.sessionId,npcId:request.npcId,npcSpawnVerified:true,
 worldInstanceId:'world-instance-177',worldEpoch:'epoch-game-177',
 worldTick:200,player:{x:6,y:5,z:-2},npc:{x:6,y:5,z:-3},...over});
const sight=(over={})=>({source:'server-world-collision-177',visible:true,
 worldInstanceId:'world-instance-177',worldEpoch:'epoch-game-177',
 worldTick:200,...over});
function setup({event=receipt(),snapshot=state(),vision=sight(),
 eventFn=null,stateFn=null,sightFn=null,clock=()=>now}={}){
 const calls={consume:0,snapshot:0,sight:0,queries:[]};
 const bridge=createGame3DTrustedNpcWorldBridge177({now:clock,
  consumeServerNpcInteraction:async q=>{calls.consume++;calls.queries.push(q);
   return eventFn?eventFn(q):event},
  readServerWorldSnapshot:async q=>{calls.snapshot++;calls.queries.push(q);
   return stateFn?stateFn(q):snapshot},
  verifyServerLineOfSight:async q=>{calls.sight++;calls.queries.push(q);
   return sightFn?sightFn(q):vision}
 });
 return {bridge,calls};
}
test('17.7 requires three genuine server-side provider callbacks',()=>{
 assert.throws(()=>createGame3DTrustedNpcWorldBridge177(),/trusted world-host operations/);
 assert.throws(()=>createGame3DTrustedNpcWorldBridge177({
  consumeServerNpcInteraction:()=>{},readServerWorldSnapshot:()=>{},
  verifyServerLineOfSight:()=>{},maxDistance:100}),/trusted world-host operations/);
});
test('17.7 valid consumed world receipt integrates with 17.5 quest gate',async()=>{
 const {bridge}=setup();
 const gate=createGame3DNpcInteractionGate175({
  resolveTrustedInteraction:bridge.resolveTrustedInteraction,now:()=>now});
 const answer=await gate.validate(request);
 assert.equal(answer.ok,true);
 assert.equal(answer.worldAttested,true);
 assert.equal(answer.npcId,'archer_lyra');
 assert.equal(bridge.browserCoordinatesAccepted,false);
 assert.equal(bridge.productionReady,false);
});
test('17.7 caller cannot include a browser position or arbitrary extra evidence',async()=>{
 const {bridge,calls}=setup();
 const x=await bridge.resolveTrustedInteraction({...request,player:{x:6,y:5,z:-3}});
 assert.equal(x,null);
 assert.equal(calls.consume,0);
 const good=await bridge.resolveTrustedInteraction(request);
 assert.equal(good.worldVerified,true);
 assert.deepEqual(Object.keys(calls.queries[0]).sort(),
  ['ownerId','characterId','questId','npcId','sessionId'].sort());
});
test('17.7 refuses malformed characters, session, NPC and quest input',async()=>{
 const {bridge,calls}=setup();
 for(const patch of [{ownerId:'__anon__'},{characterId:'not allowed'},
  {questId:'<script>'},{npcId:'>bad<'},{sessionId:'browser-token'}])
  assert.equal(await bridge.resolveTrustedInteraction({...request,...patch}),null);
 assert.equal(calls.consume,0);
});
test('17.7 host event is bound to signed identity, quest, NPC and action session',async()=>{
 for(const patch of [{ownerId:'other'},{characterId:'other'},
  {questId:'echo_ch_15_world_signs'},{npcId:'archer_vex'},
  {actionSessionId:'qb174-'+'b'.repeat(64)}]){
  const {bridge}=setup({event:receipt(patch)});
  assert.equal(await bridge.resolveTrustedInteraction(request),null,JSON.stringify(patch));
 }
});
test('17.7 browser-origin claims cannot be passed off as trusted world receipts',async()=>{
 const bad=[{source:'client-npc-click'},{actorAuthenticated:false},
  {consumed:false},{intent:'player_move'},{player:{x:6,y:5,z:-3}},
  {position:{x:6,y:5,z:-3}},{lineOfSight:true},
  {receiptId:'bad'},{worldInstanceId:'bad'},{worldTick:0}];
 for(const patch of bad){const {bridge}=setup({event:receipt(patch)});
  assert.equal(await bridge.resolveTrustedInteraction(request),null,JSON.stringify(patch));}
});
test('17.7 stale, future and impossible host timestamps are never accepted',async()=>{
 for(const stamp of [now-5001,now+1,NaN]){
  const {bridge}=setup({event:receipt({occurredAtMs:stamp})});
  assert.equal(await bridge.resolveTrustedInteraction(request),null);
 }
});
test('17.7 snapshot requires server ownership, same session and same world tick',async()=>{
 const changes=[{source:'browser-snapshot'},{serverAuthenticated:false},
  {ownerId:'other'},{characterId:'other'},
  {actionSessionId:'qb174-'+'b'.repeat(64)},
  {npcId:'archer_kira'},{npcSpawnVerified:false},
  {worldInstanceId:'other-world-177'},{worldEpoch:'epoch-other-177'},
  {worldTick:201}];
 for(const patch of changes){const {bridge}=setup({snapshot:state(patch)});
  assert.equal(await bridge.resolveTrustedInteraction(request),null,JSON.stringify(patch));}
});
test('17.7 3D range and coordinate checks reject distant/invalid NPCs',async()=>{
 for(const patch of [
  {player:{x:6,y:5,z:30}},
  {npc:{x:6,y:10,z:-3}},
  {player:{x:Infinity,y:5,z:-2}},
  {npc:{x:6,y:5,z:-3,userClaim:'true'}}]){
  const {bridge}=setup({snapshot:state(patch)});
  assert.equal(await bridge.resolveTrustedInteraction(request),null,JSON.stringify(patch));
 }
});
test('17.7 line of sight is computed by the server and must match tick/epoch',async()=>{
 for(const patch of [{visible:false},{source:'browser-raycast'},
  {worldEpoch:'other-epoch'},{worldTick:199},
  {worldInstanceId:'other-world'}]){
  const {bridge}=setup({vision:sight(patch)});
  assert.equal(await bridge.resolveTrustedInteraction(request),null,JSON.stringify(patch));
 }
});
test('17.7 provider failures, missing receipt and late LOS refuse without throwing',async()=>{
 for(const options of [
  {eventFn:()=>{throw Error('offline')}},
  {event:null},
  {stateFn:()=>{throw Error('offline')}},
  {sightFn:()=>{throw Error('offline')}}]){
  const {bridge}=setup(options);
  assert.equal(await bridge.resolveTrustedInteraction(request),null);
 }
 let t=now;
 const {bridge}=setup({clock:()=>t,sightFn:()=>{t+=6000;return sight()}});
 assert.equal(await bridge.resolveTrustedInteraction(request),null);
});
test('17.7 consumes each trusted receipt only once even with concurrent calls',async()=>{
 const {bridge}=setup();
 const [a,b]=await Promise.all([
  bridge.resolveTrustedInteraction(request),bridge.resolveTrustedInteraction(request)]);
 assert.equal([a,b].filter(Boolean).length,1);
 assert.equal(await bridge.resolveTrustedInteraction(request),null);
 bridge.shutdown();
 assert.equal(await bridge.resolveTrustedInteraction(request),null);
});
