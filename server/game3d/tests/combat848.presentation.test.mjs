import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateQuestbookPresentation848,
 PRIVATE_QUESTBOOK_PRESENTATION_LIMITS_848}
 from '../privateQuestbookPresentation848.mjs';

const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({ownerId:'owner848',characterId:'hero848',
 instanceId:'world-instance-848',instanceEpoch:'world-epoch-848',
 mapFingerprint:'a'.repeat(64)});
const context=Object.freeze({trustedServerSession:'do_not_expose'});
const handle=Object.freeze({generation:'private-handle-848'});
const viewer=()=>({authenticated:true,
 identitySource:'base44-verified-action-session-179',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 worldSessionId:'world-session-848',actionSessionId:'qb174-'+'c'.repeat(64),
 leaseNonce:'84884884-8488-4488-8488-848848848848',expiresAtMs:1010000});
const enemy=()=>({id:'wolf1',x:1,z:2,hp:14,maxHp:30,
 alive:true,pendingImpactAt:null,adminOnly:'private'});
const snapshot=(eventSeq=2)=>({eventSeq,serverTime:1000,
 player:{x:0,z:1,hp:90,maxHp:100,stamina:72,facing:0,lastIntentSeq:1,
  ownerId:'never-to-browser'},
 enemies:[enemy()],serverSessionId:'hidden',adminSecret:'hidden'});
const objective=(current=2)=>({questId:'axe_q_first_patrol',
 objectiveId:'patrol_kills',status:'accepted',current,required:3,
 receiptId:'worldkill-private',serverKillContext:'hidden'});
const event=(seq=3,change={})=>({seq,kind:'player_strike',serverTime:1000,
 targetId:'wolf1',damage:10,killed:false,serverReceiptId:'SECRET',...change});
const defaultFrame=(after=2)=>({ok:true,version:'84.6',
 privateServerOnly:true,rewardsIssued:false,rewardAuthorized:false,
 productionReady:false,
 snapshot:snapshot(3),events:[event(3)],nextSeq:3,
 reset:false,gap:false,hasMore:false,
 objectives:[objective()],privateWorldNonce:'do-not-share'});
function fixture(options={}){
 const state={calls:[],ctxChecks:0,viewer:viewer(),
 frame:null,hold:null,shutdowns:0,failed:false,
 handle,openFailure:false};
 const host={version:'84.6',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async open(){state.calls.push(['open']);
   return state.openFailure?{ok:false,version:'84.6'}:
    {ok:true,version:'84.6',privateServerOnly:true,
     rewardsIssued:false,handle:state.handle,snapshot:snapshot(),
     serverSession:'SECRET'};},
  async frame({handle,afterSeq}){state.calls.push(['frame',handle,afterSeq]);
   if(state.hold)await state.hold;
   return state.frame??defaultFrame(afterSeq);},
  async disconnect({handle}){state.calls.push(['disconnect',handle]);
   return {ok:true,rewardsIssued:false};},
  async shutdown(){state.calls.push(['shutdown']);state.shutdowns++;
   return true;},
 };
 const verifyAuthorizedReader=async received=>{
  assert.equal(received,context);
  state.ctxChecks++;
  return state.viewer;
 };
 const presentation=createGame3DPrivateQuestbookPresentation848({
  enabled:true,host,scope,serverRequestContext:context,
  verifyAuthorizedReader,now:()=>1000000,
 });
 return {host,state,presentation};
}

test('84.8 opens the original 84.6 host without leaking private handles',async()=>{
 const {state,presentation}=fixture();
 const result=await presentation.open();
 assert.equal(result.ok,true);
 assert.equal(result.version,'84.8');
 assert.equal(result.nextSeq,2);
 assert.equal(result.snapshot.player.hp,90);
 assert.equal(result.snapshot.player.ownerId,undefined);
 assert.equal(result.snapshot.enemies[0].adminOnly,undefined);
 assert.equal(result.handle,undefined);
 assert.equal(result.connectionId,undefined);
 assert.equal(result.serverSession,undefined);
 assert.equal(result.questbook.objectiveTargetOnly,true);
 assert.equal(result.questbook.turnInAuthorized,false);
 assert.deepEqual(state.calls,[['open']]);
 assert.equal(state.ctxChecks,2);
});

test('84.8 reads server event and committed objective count with private proofs removed',async()=>{
 const {presentation,state}=fixture();
 await presentation.open();
 const result=await presentation.read();
 assert.equal(result.ok,true);
 assert.equal(result.events.length,1);
 assert.equal(result.events[0].seq,3);
 assert.equal(result.events[0].serverReceiptId,undefined);
 assert.equal(result.questbook.objectives[0].current,2);
 assert.equal(result.questbook.objectives[0].targetReached,false);
 assert.equal(result.questbook.objectives[0].receiptId,undefined);
 assert.equal(result.questbook.objectives[0].serverKillContext,undefined);
 assert.equal(result.privateWorldNonce,undefined);
 assert.equal(result.rewardAuthorized,false);
 assert.equal(result.hasMore,false);
 assert.deepEqual(state.calls.map(x=>x[0]),['open','frame']);
 assert.equal(state.calls[1][1],handle);
 assert.equal(state.calls[1][2],2);
});

test('84.8 tracks cursor privately, never accepts a caller-supplied cursor',async()=>{
 const {presentation,state}=fixture();
 await presentation.open();
 assert.equal((await presentation.read()).nextSeq,3);
 state.frame={...defaultFrame(),snapshot:snapshot(4),
  events:[event(4)],nextSeq:4};
 assert.equal((await presentation.read({afterSeq:0,ownerId:'other'})).nextSeq,4);
 assert.deepEqual(state.calls.filter(x=>x[0]==='frame')
  .map(x=>x[2]),[2,3]);
});

test('84.8 supports a genuine reset without replaying stale cosmetic events',async()=>{
 const {presentation,state}=fixture();await presentation.open();
 state.frame={...defaultFrame(),snapshot:snapshot(40),
  reset:true,gap:true,events:[],nextSeq:40,hasMore:false};
 const recovered=await presentation.read();
 assert.equal(recovered.ok,true);
 assert.equal(recovered.reset,true);
 assert.equal(recovered.events.length,0);
 assert.equal(recovered.nextSeq,40);
 state.frame={...defaultFrame(),snapshot:snapshot(41),
  events:[event(41)],nextSeq:41};
 assert.equal((await presentation.read()).nextSeq,41);
 assert.equal(state.calls.at(-1)[2],40);
});

test('84.8 objective target reached never authorizes quest turn-in or rewards',async()=>{
 const {presentation,state}=fixture();await presentation.open();
 state.frame={...defaultFrame(),objectives:[objective(3)]};
 const result=await presentation.read();
 assert.equal(result.ok,true);
 assert.equal(result.questbook.objectives[0].targetReached,true);
 assert.equal(result.questbook.turnInAuthorized,false);
 assert.equal(result.rewardAuthorized,false);
 assert.equal(presentation.rewardWriterInstalled,false);
});

test('84.8 rejects duplicate or forged objectives before returning a view',async()=>{
 const {presentation,state}=fixture();await presentation.open();
 state.frame={...defaultFrame(),objectives:[objective(),objective()]};
 assert.equal((await presentation.read()).reason,'invalid_private_questbook_objectives');
 assert.equal((await presentation.read()).reason,'private_view_closed');
});

test('84.8 rejects invalid event ordering and reward authority',async()=>{
 for(const patch of [
  {events:[event(4),event(3)],nextSeq:3},
  {events:[event(3,{kind:'unsafe<script>'})]},
  {events:[event(3,{damage:Infinity})]},
  {rewardsIssued:true},
  {rewardAuthorized:true},
  {events:[event(3,{targetId:{nested:'danger'}})]},
 ]){
  const {presentation,state}=fixture();await presentation.open();
  state.frame={...defaultFrame(),...patch};
  assert.equal((await presentation.read()).ok,false);
  assert.equal((await presentation.read()).reason,'private_view_closed');
 }
});

test('84.8 rejects mismatched or changing viewer identities',async()=>{
 const {presentation,state}=fixture();
 state.viewer={...viewer(),accountId:'other_owner'};
 assert.equal((await presentation.open()).reason,'private_viewer_session_unverified');
 state.viewer=viewer();
 assert.equal((await presentation.open()).reason,'private_view_closed');
 assert.equal(state.calls.length,0);
});

test('84.8 checks authorization again after an in-flight read and drops its result on rotation',async()=>{
 const {presentation,state}=fixture();await presentation.open();
 let finish;state.hold=new Promise(resolve=>{finish=resolve});
 const work=presentation.read();
 await new Promise(resolve=>setImmediate(resolve));
 state.viewer={...viewer(),leaseNonce:'74884884-8488-4488-8488-848848848848'};
 finish();
 assert.equal((await work).reason,'private_viewer_session_rotated');
 assert.equal((await presentation.read()).reason,'private_view_closed');
});

test('84.8 allows retry of transient host non-ready frame without forging progress',async()=>{
 const {presentation,state}=fixture();await presentation.open();
 state.frame={ok:false,version:'84.6',
  reason:'private_quest_reconciliation_required'};
 assert.equal((await presentation.read()).reason,'private_world_frame_not_ready');
 state.frame=defaultFrame();
 assert.equal((await presentation.read()).nextSeq,3);
 assert.deepEqual(state.calls.filter(x=>x[0]==='frame').map(x=>x[2]),[2,2]);
});

test('84.8 closes host handle and never reopens an old private session',async()=>{
 const {presentation,state}=fixture();await presentation.open();
 assert.equal((await presentation.disconnect()).ok,true);
 assert.equal((await presentation.open()).ok,false);
 assert.equal((await presentation.read()).ok,false);
 assert.deepEqual(state.calls.map(x=>x[0]),['open','disconnect','shutdown']);
 assert.equal(state.calls[1][1],handle);
 assert.equal(state.shutdowns,1);
});

test('84.8 shuts down the original host once, with no browser transport',async()=>{
 const {presentation,state}=fixture();await presentation.open();
 assert.equal(await presentation.shutdown(),true);
 assert.equal(await presentation.shutdown(),false);
 assert.equal(state.shutdowns,1);
 assert.equal(presentation.publicPlayerRouteInstalled,false);
 assert.equal(presentation.publicTransportInstalled,false);
 assert.equal(presentation.hostedWorkerInstalled,false);
 assert.equal(presentation.featureEnabledInLiveGame,false);
 assert.equal(presentation.credentialDeliveredToBrowser,false);
});

test('84.8 refuses default-disabled and untrusted construction',()=>{
 assert.throws(()=>createGame3DPrivateQuestbookPresentation848(),
  /original private world host/);
 assert.throws(()=>createGame3DPrivateQuestbookPresentation848({enabled:false}),
  /original private world host/);
 assert.equal(PRIVATE_QUESTBOOK_PRESENTATION_LIMITS_848.maxEvents,40);
 assert.equal(PRIVATE_QUESTBOOK_PRESENTATION_LIMITS_848.maxObjectives,128);
});

test('84.8 staging factory imports original 84.6 host, installs no route',()=>{
 const source=readFileSync(new URL('../privateCombatQuestStaging848.mjs',import.meta.url),'utf8');
 assert.match(source,/createGame3DPrivateCombatQuestStaging846/);
 assert.match(source,/createGame3DPrivateQuestbookPresentation848/);
 assert.doesNotMatch(source,/app\.(get|post)\s*\(/);
 assert.doesNotMatch(source,/WebSocketServer/);
});

process.on('exit',()=>{
 if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
});
