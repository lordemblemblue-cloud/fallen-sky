// Game 3D 85.5: original 84.8 reader must release the world when fenced.
// Only the original 84.6 authority is faked, never the 84.8 reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestbookPresentation848}
 from '../privateQuestbookPresentation848.mjs';

const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope=Object.freeze({ownerId:'owner855',characterId:'hero855',
 instanceId:'world-instance-855',instanceEpoch:'world-epoch-855',
 mapFingerprint:'a'.repeat(64)});
const trustedContext=Object.freeze({authoritative:'world'});
const reader=()=>({authenticated:true,
 identitySource:'base44-verified-action-session-179',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 worldSessionId:'world-session-855',
 actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'85585585-5855-4855-8855-855855855855',
 expiresAtMs:1020000});
const frame=(extra={})=>({
 ok:true,version:'84.6',privateServerOnly:true,
 rewardsIssued:false,rewardAuthorized:false,productionReady:false,
 reset:false,gap:false,hasMore:false,nextSeq:1,
 snapshot:{eventSeq:1,serverTime:1000,
  player:{x:0,z:0,hp:100,maxHp:100,stamina:90,facing:0,lastIntentSeq:0},
  enemies:[]},
 events:[{seq:1,kind:'player_strike',serverTime:1000}],
 objectives:[],...extra,
});
function make(){
 const state={viewer:reader(),calls:[],denyHostOpen:false,
  nextFrame:frame(),gate:null,now:1000000};
 const host={version:'84.6',privateServerOnly:true,
  publicPlayerRouteInstalled:false,publicTransportInstalled:false,
  credentialDeliveredToBrowser:false,hostedWorkerInstalled:false,
  async open(){state.calls.push('open');
   if(state.denyHostOpen)throw Error('world startup failed');
   return {ok:true,version:'84.6',privateServerOnly:true,
    rewardsIssued:false,handle:Object.freeze({secret:'opaque'}),
    snapshot:{eventSeq:0,serverTime:1000,
     player:{x:0,z:0,hp:100,maxHp:100,stamina:90,facing:0,lastIntentSeq:0},
     enemies:[]}}},
  async frame(){state.calls.push('frame');
   if(state.gate)await state.gate;
   return state.nextFrame},
  async disconnect(){state.calls.push('disconnect');
   return {ok:true,rewardsIssued:false}},
  async shutdown(){state.calls.push('shutdown');return true},
 };
 const presentation=createGame3DPrivateQuestbookPresentation848({
  enabled:true,host,scope,serverRequestContext:trustedContext,
  verifyAuthorizedReader:async ctx=>{
   assert.equal(ctx,trustedContext);
   return state.viewer;
  },now:()=>state.now,
 });
 return {state,presentation};
}
test('85.5 preauthorization denial cannot open or close a world that never started',async()=>{
 const x=make();x.state.viewer={...reader(),accountId:'other'};
 assert.equal((await x.presentation.open()).reason,'private_viewer_session_unverified');
 assert.deepEqual(x.state.calls,[]);
 assert.equal((await x.presentation.shutdown()),true);
 assert.deepEqual(x.state.calls,['shutdown']);
});
test('85.5 post-open viewer rotation shuts down the original world exactly once',async()=>{
 const x=make();await x.presentation.open();
 x.state.viewer={...reader(),leaseNonce:'75585585-5855-4855-8855-855855855855'};
 const result=await x.presentation.read();
 assert.equal(result.reason,'private_viewer_session_rotated');
 assert.deepEqual(x.state.calls,['open','shutdown']);
 assert.equal(await x.presentation.shutdown(),false);
 assert.equal(x.state.calls.filter(x=>x==='shutdown').length,1);
});
test('85.5 malformed combat event fences world and refuses further frame reads',async()=>{
 const x=make();await x.presentation.open();
 x.state.nextFrame=frame({events:[{seq:1,kind:'unsafe<script>',serverTime:1000}]});
 assert.equal((await x.presentation.read()).reason,'invalid_private_world_event');
 assert.deepEqual(x.state.calls,['open','frame','shutdown']);
 assert.equal((await x.presentation.read()).reason,'private_view_closed');
 assert.equal(await x.presentation.shutdown(),false);
 assert.equal(x.state.calls.filter(x=>x==='shutdown').length,1);
});
test('85.5 original host open rejection releases a possibly half-open private world',async()=>{
 const x=make();x.state.denyHostOpen=true;
 assert.equal((await x.presentation.open()).reason,'private_world_open_unavailable');
 assert.deepEqual(x.state.calls,['open','shutdown']);
 assert.equal((await x.presentation.open()).reason,'private_view_closed');
 assert.equal(await x.presentation.shutdown(),false);
});
test('85.5 pending frame after session revocation discards data and shuts host',async()=>{
 const x=make();await x.presentation.open();
 let release;x.state.gate=new Promise(resolve=>{release=resolve});
 const pending=x.presentation.read();
 await new Promise(resolve=>setImmediate(resolve));
 x.state.viewer={...reader(),characterId:'another'};
 release();
 assert.equal((await pending).reason,'private_viewer_session_rotated');
 assert.deepEqual(x.state.calls,['open','frame','shutdown']);
});
test('85.5 normal close retains original single shutdown semantics',async()=>{
 const x=make();await x.presentation.open();
 assert.equal(await x.presentation.shutdown(),true);
 assert.equal(await x.presentation.shutdown(),false);
 assert.deepEqual(x.state.calls,['open','shutdown']);
});
process.on('exit',()=>{
 if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
 else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
});
