import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestbookDelivery849,PRIVATE_DELIVERY_LIMITS_849}
 from '../privateQuestbookDelivery849.mjs';

const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const context=Object.freeze({privileged:'world-849'});
const scope=Object.freeze({ownerId:'owner849',characterId:'hero849',
 instanceId:'world-instance-849',instanceEpoch:'world-epoch-849',
 mapFingerprint:'a'.repeat(64)});
const request=Object.freeze({privateEdge:'verified-by-backend'});
const viewer=()=>({authenticated:true,
 identitySource:'independent-server-edge-849',credentialVerified:true,
 originApproved:true,csrfVerified:true,readOnly:true,method:'GET',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 worldSessionId:'world-session-849',actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'84984984-8498-4498-8498-849849849849',expiresAtMs:1200000});
const enemy=()=>({id:'wolf1',x:1,z:2,hp:18,maxHp:30,alive:true,
 pendingImpactAt:null,serverSecret:'never'});
const snapshot=()=>({eventSeq:5,serverTime:1000,
 player:{x:0,z:0,hp:95,maxHp:100,stamina:90,facing:0,lastIntentSeq:1,
  serverPassword:'HIDDEN'},enemies:[enemy()],internalWorldKey:'HIDDEN'});
const objective=()=>({questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
 status:'accepted',current:2,required:3,targetReached:false,
 receiptId:'SECRET'});
const result=()=>({ok:true,version:'84.8',privateServerOnly:true,
 productionReady:false,rewardsIssued:false,rewardAuthorized:false,
 snapshot:snapshot(),questbook:{objectives:[objective()],
  objectiveTargetOnly:true,turnInAuthorized:false,killReceipt:'SECRET'},
 events:[],nextSeq:5,reset:true,gap:false,hasMore:false,
 ownerId:'SECRET',actionSessionId:'SECRET'});
const evt=(seq=6)=>({seq,kind:'player_strike',serverTime:1001,
 damage:12,targetId:'wolf1',serverReceipt:'SECRET'});
function make(){
 const state={clock:1000000,edge:viewer(),seq:5,calls:[],
  next:null,hold:null,shutdowns:0,authCount:0,throwRead:false};
 const view={version:'84.8',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  featureEnabledInLiveGame:false,credentialDeliveredToBrowser:false,
  hostedWorkerInstalled:false,
  async open(){state.calls.push('open');return result()},
  async read(){state.calls.push('read');if(state.hold)await state.hold;
   if(state.throwRead)throw Error('backend unavailable');
   if(state.next)return state.next;
   state.seq++;return {...result(),snapshot:{...snapshot(),eventSeq:state.seq},
    events:[evt(state.seq)],nextSeq:state.seq,reset:false};},
  async shutdown(){state.calls.push('shutdown');state.shutdowns++;return true},
 };
 const verifyEdgeRequest=async arg=>{
  assert.equal(arg.serverRequestContext,context);
  assert.equal(arg.edgeContext,request);
  assert.ok(['open','poll'].includes(arg.operation));
  state.authCount++;
  return state.edge;
 };
 const delivery=createGame3DPrivateQuestbookDelivery849({
  enabled:true,view,scope,serverRequestContext:context,
  verifyEdgeRequest,now:()=>state.clock,
 });
 return {delivery,view,state};
}

test('84.9 opens verified private presentation without returning handles or server context',async()=>{
 const {delivery,state}=make();
 const r=await delivery.open({edgeContext:request});
 assert.equal(r.ok,true);
 assert.equal(r.version,'84.9');
 assert.equal(r.payload.protocol,'game3d-private-presentation-849');
 assert.equal(r.cacheControl,'no-store');
 assert.equal(r.contentType,'application/json');
 assert.equal(r.payload.snapshot.player.hp,95);
 assert.equal(r.payload.snapshot.player.serverPassword,undefined);
 assert.equal(r.payload.snapshot.enemies[0].serverSecret,undefined);
 assert.equal(r.payload.ownerId,undefined);
 assert.equal(r.payload.actionSessionId,undefined);
 assert.equal(r.payload.questbook.objectives[0].receiptId,undefined);
 assert.equal(state.authCount,2);
 assert.deepEqual(state.calls,['open']);
 assert.equal(delivery.publicTransportInstalled,false);
});

test('84.9 polls read-only Questbook data with bounded event projection',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 const a=await delivery.poll({edgeContext:request});
 assert.equal(a.ok,true);
 assert.equal(a.payload.events[0].seq,6);
 assert.equal(a.payload.events[0].serverReceipt,undefined);
 assert.equal(a.payload.questbook.objectives[0].current,2);
 assert.equal(a.payload.questbook.turnInAuthorized,false);
 assert.equal(a.payload.snapshot.player.serverPassword,undefined);
 assert.equal(a.payload.nextSeq,6);
 assert.deepEqual(state.calls,['open','read']);
 assert.equal(state.authCount,4);
});

test('84.9 fixed 500ms rate limit blocks rapid duplicate reads',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 assert.equal((await delivery.poll({edgeContext:request})).ok,true);
 state.clock+=200;
 const rate=await delivery.poll({edgeContext:request});
 assert.equal(rate.ok,false);
 assert.equal(rate.reason,'private_delivery_rate_limited');
 assert.equal(rate.retryAfterMs,300);
 assert.deepEqual(state.calls,['open','read']);
 state.clock+=300;
 assert.equal((await delivery.poll({edgeContext:request})).ok,true);
 assert.deepEqual(state.calls,['open','read','read']);
});

test('84.9 enforces per-minute read budget even with passing interval',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 for(let i=0;i<PRIVATE_DELIVERY_LIMITS_849.maxPollsPerMinute;i++){
  assert.equal((await delivery.poll({edgeContext:request})).ok,true);
  state.clock+=PRIVATE_DELIVERY_LIMITS_849.minPollMs;
 }
 const blocked=await delivery.poll({edgeContext:request});
 assert.equal(blocked.reason,'private_delivery_budget_exhausted');
 assert.equal(blocked.retryAfterMs>0,true);
 state.clock+=60000;
 assert.equal((await delivery.poll({edgeContext:request})).ok,true);
});

test('84.9 foreign account at open is rejected without evicting private owner',async()=>{
 const {delivery,state}=make();state.edge={...viewer(),accountId:'other'};
 const r=await delivery.open({edgeContext:request});
 assert.equal(r.reason,'private_edge_authentication_failed');
 assert.equal(state.shutdowns,0);
 assert.deepEqual(state.calls,[]);
 state.edge=viewer();
 assert.equal((await delivery.open({edgeContext:request})).ok,true);
 assert.equal(state.calls.includes('open'),true);
 await delivery.shutdown();
});

test('84.9 missing origin, CSRF, verified credentials or GET refuses',async()=>{
 for(const patch of [{originApproved:false},{csrfVerified:false},
  {credentialVerified:false},{method:'POST'},{readOnly:false},
  {identitySource:'browser-claimed'}]){
  const {delivery,state}=make();state.edge={...viewer(),...patch};
  assert.equal((await delivery.open({edgeContext:request})).reason,
   'private_edge_authentication_failed');
  assert.equal(state.shutdowns,0);
  assert.deepEqual(state.calls,[]);
 }
});

test('84.9 revoked or rotated session cannot receive an in-flight frame',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 let release;state.hold=new Promise(resolve=>{release=resolve});
 const p=delivery.poll({edgeContext:request});
 await new Promise(resolve=>setImmediate(resolve));
 state.edge={...viewer(),leaseNonce:'74984984-8498-4498-8498-849849849849'};
 release();
 const r=await p;
 assert.equal(r.ok,false);
 assert.equal(r.reason,'private_edge_session_changed');
 assert.equal(state.shutdowns,1);
 assert.equal((await delivery.poll({edgeContext:request})).reason,'private_delivery_closed');
});

test('84.9 rejects expiry and inconsistent world instance independently',async()=>{
 for(const patch of [
  {expiresAtMs:999999},{worldEpoch:'other-epoch'},{characterId:'other'},
  {worldSessionId:'x'},
 ]){
  const {delivery,state}=make();state.edge={...viewer(),...patch};
  assert.equal((await delivery.open({edgeContext:request})).ok,false);
 }
});

test('84.9 transient 84.8 read refusal is safely retryable after interval',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 state.next={ok:false,version:'84.8',reason:'private_world_frame_not_ready'};
 assert.equal((await delivery.poll({edgeContext:request})).reason,'private_view_not_ready');
 state.next=null;state.clock+=500;
 assert.equal((await delivery.poll({edgeContext:request})).ok,true);
 assert.equal(state.shutdowns,0);
});

test('84.9 malformed quest data and reward claims fail closed',async()=>{
 for(const patch of [
  {rewardAuthorized:true},
  {rewardsIssued:true},
  {questbook:{objectives:[{...objective(),current:4}],objectiveTargetOnly:true,turnInAuthorized:false}},
  {questbook:{objectives:[objective()],objectiveTargetOnly:true,turnInAuthorized:true}},
  {snapshot:{...snapshot(),player:{...snapshot().player,hp:-5}}},
  {events:[{...evt(),damage:Infinity}]},
 ]){
  const {delivery,state}=make();await delivery.open({edgeContext:request});
  state.next={...result(),snapshot:{...snapshot(),eventSeq:6},
   events:[evt()],nextSeq:6,reset:false,...patch};
  assert.equal((await delivery.poll({edgeContext:request})).reason,'private_view_payload_unverified');
  assert.equal(state.shutdowns,1);
 }
});

test('84.9 never leaks oversized frame after bounded JSON serialization',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 state.next={...result(),snapshot:{...snapshot(),enemies:Array.from({length:16},(_,i)=>({
  ...enemy(),id:'wolf_'+i.toString().padStart(3,'0'),
 }))},questbook:{objectives:Array.from({length:128},(_,i)=>({
  ...objective(),objectiveId:'objective_'+i.toString().padStart(3,'0'),
  questId:'axe_q_first_patrol',
 })),objectiveTargetOnly:true,turnInAuthorized:false},
  events:Array.from({length:40},(_,i)=>({...evt(),seq:6+i})),
  nextSeq:45,reset:false};
 state.next.snapshot={...state.next.snapshot,eventSeq:45};
 const r=await delivery.poll({edgeContext:request});
 assert.equal(r.ok,true);
 assert.equal(Buffer.byteLength(JSON.stringify(r.payload))<=
  PRIVATE_DELIVERY_LIMITS_849.maxResponseBytes,true);
});

test('84.9 serial lane bounds pending requests even on a stalled upstream read',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 let release;state.hold=new Promise(resolve=>{release=resolve});
 const work=delivery.poll({edgeContext:request});
 await new Promise(resolve=>setImmediate(resolve));
 const more=Array.from({length:PRIVATE_DELIVERY_LIMITS_849.maxPending},()=>
  delivery.poll({edgeContext:request}));
 const overflow=await delivery.poll({edgeContext:request});
 assert.equal(overflow.reason,'private_delivery_queue_full');
 release();await work;
 await Promise.all(more);
 assert.equal(state.calls.filter(x=>x==='read').length,1);
});


test('84.9 rejects caller-supplied identities, cursors and actions',async()=>{
 const {delivery,state}=make();
 assert.equal((await delivery.open({edgeContext:request,ownerId:'other'})).reason,
  'invalid_private_delivery_request');
 assert.equal(state.authCount,0);
 assert.equal((await delivery.open({edgeContext:request})).ok,true);
 assert.equal((await delivery.poll({edgeContext:request,afterSeq:0})).reason,
  'invalid_private_delivery_request');
 assert.equal((await delivery.poll({edgeContext:request,intent:{damage:100}})).ok,false);
 assert.deepEqual(state.calls,['open']);
});

test('84.9 rejects fabricated gaps, stale event cursors and missing event pages',async()=>{
 for(const patch of [
  {events:[evt(6)],nextSeq:6,reset:true},
  {events:[evt(6)],nextSeq:4,reset:false},
  {events:[evt(5)],nextSeq:5,reset:false},
  {events:[],nextSeq:6,reset:false},
 ]){
  const {delivery,state}=make();await delivery.open({edgeContext:request});
  state.next={...result(),snapshot:{...snapshot(),eventSeq:8},
   reset:false,events:[evt(6)],nextSeq:6,...patch};
  const r=await delivery.poll({edgeContext:request});
  assert.equal(r.ok,false);
  assert.equal(state.shutdowns,1);
 }
});

test('84.9 caps the actual UTF-8 JSON response size with maximal valid fields',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 const longQuest='q'.repeat(128),longObjective='o'.repeat(128);
 state.next={...result(),snapshot:{...snapshot(),eventSeq:45,
  enemies:Array.from({length:16},(_,i)=>({
   ...enemy(),id:'e'.repeat(154)+String(i).padStart(3,'0'),
  }))},questbook:{objectives:Array.from({length:128},(_,i)=>({
  ...objective(),questId:longQuest,
  objectiveId:longObjective.slice(0,125)+String(i).padStart(3,'0'),
  status:'a'.repeat(47),
 })),objectiveTargetOnly:true,turnInAuthorized:false},
  events:Array.from({length:40},(_,i)=>({...evt(6+i),
   kind:'k'.repeat(63),targetId:'t'.repeat(160),enemyId:'e'.repeat(160),
   tier:'Normal'.padEnd(32,'A'),damage:12,enemyHp:2,playerHp:5,
   critical:false,killed:true,impactAt:1000,
  })),nextSeq:45,reset:false};
 const r=await delivery.poll({edgeContext:request});
 assert.equal(r.reason,'private_view_payload_unverified');
 assert.equal(state.shutdowns,1);
});

test('84.9 shuts down the view exactly once; no browser transport or reward writer',async()=>{
 const {delivery,state}=make();await delivery.open({edgeContext:request});
 assert.equal(await delivery.shutdown(),true);
 assert.equal(await delivery.shutdown(),false);
 assert.equal(state.shutdowns,1);
 assert.equal((await delivery.poll({edgeContext:request})).reason,'private_delivery_closed');
 assert.equal(delivery.publicPlayerRouteInstalled,false);
 assert.equal(delivery.publicTransportInstalled,false);
 assert.equal(delivery.rewardWriterInstalled,false);
 assert.equal(delivery.featureEnabledInLiveGame,false);
});

test('84.9 requires staging, exact 84.8 reader and separate edge verifier',()=>{
 assert.throws(()=>createGame3DPrivateQuestbookDelivery849(),
  /independently authenticated private read-only view/);
 assert.equal(PRIVATE_DELIVERY_LIMITS_849.minPollMs,500);
 assert.equal(PRIVATE_DELIVERY_LIMITS_849.maxPending,4);
});

process.on('exit',()=>{
 if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
});

// Static integration contract: the staging composition must reuse the private
// 84.8 original viewer, not instantiate a parallel writer or web endpoint.
test('84.9 composition references original 84.8 and installs no public endpoint',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../privateCombatQuestStaging849.mjs',import.meta.url),'utf8');
 assert.match(source,/createGame3DPrivateCombatQuestStaging848/);
 assert.match(source,/createGame3DPrivateQuestbookDelivery849/);
 assert.match(source,/verifyEdgeRequest/);
 assert.doesNotMatch(source,/app\.(get|post)\s*\(/);
 assert.doesNotMatch(source,/WebSocketServer/);
});
