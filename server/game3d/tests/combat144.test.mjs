import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createPrivateWorldViewStore144,
 projectPrivateWorldSnapshot144,
 projectPrivateWorldEvents144,
} from '../../../src/components/game3d/network/privateWorldViewModel144.mjs';
import {createPrivateWorldClient144}
 from '../../../src/components/game3d/network/privateWorldClient144.mjs';

const instanceId='world-144-0001',instanceEpoch='epoch-144-0001';
const mapFingerprint='a'.repeat(64);
const connectionId='12345678-1234-1234-1234-123456789012';
const snapshot=(eventSeq=0,hp=100)=>({
 protocol:1,version:'13.7',instanceId,instanceEpoch,
 mapFingerprint,eventSeq,serverTime:1000+eventSeq*50,
 player:{x:1,z:2,hp,maxHp:100,stamina:90,facing:0,
  lastIntentSeq:0},
 enemies:[{id:'wolf1',x:3,z:2,hp:30,maxHp:30,
  alive:true,pendingImpactAt:null}],
 rewardsIssued:false,productionReady:false,
});
const connection=(s=snapshot())=>({
 ok:true,reset:true,version:'13.7',connectionId,
 snapshot:s,cursor:s.eventSeq,
 nextIntentSeq:s.player.lastIntentSeq+1,
 rewardsIssued:false,productionReady:false,
});
const event=(seq,kind='player_strike')=>({
 seq,serverTime:1000+seq*50,instanceId,kind,
 targetId:'wolf1',damage:5,enemyHp:25,
 serverKillCommitted:false,
 xpAuthorized:false,lootAuthorized:false,currencyAuthorized:false,
});
const page=(s,events=[],after=0,overrides={})=>({
 ok:true,reset:false,gap:false,snapshot:s,events,
 nextSeq:events.at(-1)?.seq??after,
 hasMore:(events.at(-1)?.seq??after)<s.eventSeq,
 rewardsIssued:false,productionReady:false,
 ...overrides,
});
const view=()=>createPrivateWorldViewStore144({
 instanceId,instanceEpoch,mapFingerprint,
});
test('14.4 projects only server-authoritative HP, positions and enemies',()=>{
 const s=projectPrivateWorldSnapshot144({
  ...snapshot(),xp:1000000,loot:{grant:'sword'},
  player:{...snapshot().player,agp:1000,bonusDamage:9999},
  enemies:[{...snapshot().enemies[0],clientCurrency:100000}],
 },{instanceId,instanceEpoch,mapFingerprint});
 assert.deepEqual(Object.keys(s.player).sort(),[
  'facing','hp','lastIntentSeq','maxHp','stamina','x','z'].sort());
 assert.deepEqual(Object.keys(s.enemies[0]).sort(),[
  'alive','hp','id','maxHp','pendingImpactAt','x','z'].sort());
 assert.equal(s.rewardsIssued,false);
 assert.equal(s.canAwardProgression,false);
 assert.equal(s.canChangeGameWorld,false);
 assert.equal(Object.isFrozen(s),true);
});
test('14.4 denies identity, replay, rewards and invalid enemy state',()=>{
 for(const fake of [
  {...snapshot(),instanceId:'other-144'},
  {...snapshot(),instanceEpoch:'different-144'},
  {...snapshot(),mapFingerprint:'b'.repeat(64)},
  {...snapshot(),rewardsIssued:true},
  {...snapshot(),productionReady:true},
  {...snapshot(),player:{...snapshot().player,hp:101}},
  {...snapshot(),enemies:[{...snapshot().enemies[0],hp:0,alive:true}]},
  {...snapshot(),enemies:[...snapshot().enemies,...snapshot().enemies]},
 ]){
  assert.throws(()=>projectPrivateWorldSnapshot144(fake,{
   instanceId,instanceEpoch,mapFingerprint,
  }),/14.4/);
 }
 assert.throws(()=>projectPrivateWorldEvents144([
  {...event(1),xpAuthorized:true},
 ],{instanceId,afterSeq:0,maxSeq:1}),/14.4/);
 assert.throws(()=>projectPrivateWorldEvents144([
  {...event(1),serverKillCommitted:true},
 ],{instanceId,afterSeq:0,maxSeq:1}),/14.4/);
});
test('14.4 never double-plays a combat event and rejects out of order',()=>{
 const v=view();v.connected(connection());
 const seen=[];const unsubscribe=v.subscribe(s=>seen.push(s));
 v.received(page(snapshot(2),[event(1),event(2)],0));
 assert.deepEqual(v.getState().effects.map(e=>e.seq),[1,2]);
 assert.equal(v.getState().cursor,2);
 v.received(page(snapshot(2),[],2));
 assert.deepEqual(v.getState().effects,[]);
 assert.throws(()=>v.received(page(snapshot(3),[event(2)],2)),
  /invalid_private_event_stream/);
 assert.equal(v.getState().cursor,2);
 assert.throws(()=>v.received(page(snapshot(1),[],2)),
  /stale_private_snapshot/);
 unsubscribe();
 assert.ok(seen.length>=2);
});
test('14.4 pages large streams and uses full state reset on ring gaps',()=>{
 const v=view();v.connected(connection());
 v.received(page(snapshot(43),Array.from({length:40},(_,i)=>event(i+1)),0));
 assert.equal(v.getState().cursor,40);
 assert.equal(v.getState().effects.length,40);
 v.received(page(snapshot(43),[event(41),event(42),event(43)],40));
 assert.equal(v.getState().cursor,43);
 assert.equal(v.getState().snapshot.eventSeq,43);
 v.received(page(snapshot(120,70),[],43,{
  reset:true,gap:true,nextSeq:120,hasMore:false,
 }));
 assert.equal(v.getState().cursor,120);
 assert.equal(v.getState().snapshot.player.hp,70);
 assert.deepEqual(v.getState().effects,[]);
 assert.equal(v.getState().lastError,'event_gap_resynced');
 const renewed=connection({...snapshot(120,55),
  player:{...snapshot().player,lastIntentSeq:3}});
 v.connected(renewed);
 assert.equal(v.getState().nextInputSeq,1);
 assert.equal(v.getState().nextIntentSeq,4);
 assert.equal(v.getState().cursor,120);
});
function fakeTransport(responses){
 const calls=[];
 const fetchImpl=async(url,args)=>{
  calls.push({url,args});
  const next=responses.shift();
  if(next instanceof Error)throw next;
  if(!next)throw Error('fixture_missing_reply');
  return {ok:next.ok===true,
   json:async()=>next,
  };
 };
 return {fetchImpl,calls};
}
function client(responses,{tokenProvider=async()=> 't'.repeat(43)}={}){
 const net=fakeTransport(responses);
 const v=view();
 const c=createPrivateWorldClient144({
  port:31337,tokenProvider,fetchImpl:net.fetchImpl,
  createIntentId:()=> '12345678-0000-4444-9999-123456789abc',view:v,
 });
 return {c,v,...net};
}
test('14.4 serialized loopback connect, commands and poll keep rewards off',async()=>{
 const replies=[connection(),
  {ok:true,inputSeq:1,rewardsIssued:false},
  {ok:true,queued:true,rewardsIssued:false},
  page({...snapshot(1,90),
   player:{...snapshot(1,90).player,lastIntentSeq:1}},
   [event(1)],0),
  {ok:true,disconnected:true,rewardsIssued:false},
 ];
 const {c,v,calls}=client(replies);
 await c.connect();
 assert.equal(c.getState().mode,'connected');
 await c.input({x:0,z:0.5,facing:Math.PI/2});
 assert.equal(c.getState().nextInputSeq,2);
 const queued=await c.attack({targetId:'wolf1'});
 assert.equal(queued.queued,true);
 assert.equal(queued.hitConfirmed,false);
 assert.equal(c.getState().nextIntentSeq,2);
 await c.poll();
 assert.equal(v.getState().snapshot.player.hp,90);
 assert.equal(v.getState().effects.length,1);
 assert.equal(calls.every(x=>
  x.url.startsWith('http://127.0.0.1:31337/private-game3d/140/')),true);
 assert.deepEqual(calls.map(x=>x.url.split('/').at(-1)),[
  'connect','input','intent','poll']);
 assert.equal(calls[2].args.body.includes('damage'),true);
 await c.disconnect();
 assert.equal(c.getState().mode,'disconnected');
 assert.equal(c.mutatesPlayerHUD,false);
 assert.equal(c.rewardWriterEnabled,false);
});
test('14.4 rejects failed attack reply and reconnects without guessing hit',async()=>{
 const denied={ok:false,reason:'stale_world_connection',
  rewardsIssued:false,productionReady:false};
 const x=client([connection(),denied,
  connection({...snapshot(5),player:{
   ...snapshot().player,lastIntentSeq:4,
  }})]);
 await x.c.connect();
 await assert.rejects(x.c.attack({targetId:'wolf1'}),
  /stale_world_connection/);
 assert.equal(x.c.getState().mode,'disconnected');
 await x.c.connect();
 assert.equal(x.c.getState().nextIntentSeq,5);
 assert.equal(x.c.getState().cursor,5);
 assert.deepEqual(x.c.getState().effects,[]);
});
test('14.4 refuses invalid credentials and never sends a request',async()=>{
 const x=client([],{tokenProvider:()=> 'short'});
 await assert.rejects(x.c.connect(),/missing_trusted_private_bearer/);
 assert.equal(x.calls.length,0);
 assert.equal(x.c.getState().mode,'disconnected');
 assert.throws(()=>createPrivateWorldClient144({
  port:0,tokenProvider:()=>'',fetchImpl:async()=>{},
 }),/requires private loopback/);
});
test('14.4 never sends untrusted health, XP or reward operations',async()=>{
 const x=client([connection()]);
 await x.c.connect();
 assert.equal('setHP' in x.c,false);
 assert.equal('grantXP' in x.c,false);
 assert.equal('spawnEnemy' in x.c,false);
 assert.equal('renewLease' in x.c,false);
 assert.equal('applyWorldSnapshot' in x.c,false);
 assert.equal(x.c.publicWorldMounted,false);
 assert.equal(x.c.automaticPollingEnabled,false);
});
