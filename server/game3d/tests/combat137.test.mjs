import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DWorldLeaseReader137}
 from '../worldLeaseRead137.mjs';
import {createGame3DPrivateWorldSync137}
 from '../privateWorldSync137.mjs';
import {createGame3DPrivateEncounter136}
 from '../privateWorldEncounter136.mjs';

const IDS={ownerId:'owner1',characterId:'hero1',
 instanceId:'world-1234',instanceEpoch:'epoch-00000001',
 holderId:'worker-00000001',mapFingerprint:'a'.repeat(64)};
const client={auth:true};
const bad={auth:false};
function makeFakeEncounter(){
 const state={hp:100,lastIntentSeq:7,eventSeq:0,time:1000,
  resetCount:0,tickCount:0,events:[],inputs:[],intents:[],
  unsafe:false,corrupt:false};
 const encounter={
  version:'13.6',privateServerOnly:true,instanceId:IDS.instanceId,
  mapId:'mock-map',mapFingerprint:IDS.mapFingerprint,
  resetConnection(){state.resetCount++;return {lastIntentSeq:state.lastIntentSeq}},
  snapshot(){return {instanceId:IDS.instanceId,
   player:{x:0,z:0,hp:state.hp,maxHp:100,stamina:100,
    facing:0,lastIntentSeq:state.lastIntentSeq},
   enemies:[{id:'wolf1',x:3,z:0,hp:20,maxHp:20,
    alive:true,pendingImpactAt:null}],
   eventSeq:state.eventSeq,serverTime:state.time,
   rewardsIssued:state.unsafe,productionReady:false}},
  getEventsAfter(cursor){return state.events.slice(-100).filter(e=>e.seq>cursor)},
  async setInput({input}){state.inputs.push(input);
   return {ok:true,inputSeq:input.seq}},
  async submit({intent}){state.intents.push(intent);
   return {ok:true,queued:true}},
  tick(){state.tickCount++;state.time+=50;state.eventSeq++;
   state.events.push({
    seq:state.eventSeq,serverTime:state.time,
    instanceId:IDS.instanceId,kind:'enemy_telegraph',
    enemyId:'wolf1',impactAt:state.time+700,
    variant:'focused',
    xpAuthorized:state.corrupt,rewardAuthorized:false,
    lootAuthorized:false,currencyAuthorized:false,
   });return [{ok:true,kind:'tick',rewardsIssued:false}]},
 };
 return {encounter,state};
}
async function fixture({
 initialLease=null,subject=async ctx=>ctx?.auth?
  {authenticated:true,identitySource:'trusted-server-session',
   accountId:IDS.ownerId,characterId:IDS.characterId}:null,
 fake=makeFakeEncounter()
}={}){
 let now=1000,leaseCalls=0;
 let lease=initialLease??{
  ok:true,source:'trusted-world-instance-lease',
  exclusive:true,committed:true,...IDS,
  fencingToken:9,expiresAt:2000,
 };
 const verifyLease=async()=>{leaseCalls++;return {...lease}};
 const sync=await createGame3DPrivateWorldSync137({
  encounter:fake.encounter,...IDS,
  verifyLease,resolveAuthenticatedSubject:subject,
  now:()=>now,
 });
 return {sync,state:fake.state,advanceClock:n=>{now+=n},
  setLease:x=>{lease={...lease,...x}},
  get leaseCalls(){return leaseCalls}};
}
test('13.7 refuses missing lease and untrusted factories',async()=>{
 const fake=makeFakeEncounter();
 await assert.rejects(createGame3DPrivateWorldSync137({
  ...IDS,encounter:fake.encounter,
  resolveAuthenticatedSubject:async()=>null,
 }),/requires private encounter/);
 await assert.rejects(createGame3DPrivateWorldSync137({
  ...IDS,encounter:fake.encounter,
  resolveAuthenticatedSubject:async()=>null,
  verifyLease:async()=>({...IDS,ok:true,source:'client_verified',
   exclusive:true,committed:true,fencingToken:1,expiresAt:2000}),
  now:()=>1000,
 }),/cannot establish exclusive instance lease/);
 await assert.rejects(createGame3DPrivateWorldSync137({
  ...IDS,encounter:fake.encounter,
  resolveAuthenticatedSubject:async()=>null,
  verifyLease:async()=>({...IDS,ok:true,
   source:'trusted-world-instance-lease',
   exclusive:false,committed:true,fencingToken:1,expiresAt:2000}),
  now:()=>1000,
 }),/cannot establish exclusive instance lease/);
});
test('13.7 never attaches a lease to the wrong world map',async()=>{
 const fake=makeFakeEncounter();
 fake.encounter.mapFingerprint='b'.repeat(64);
 await assert.rejects(createGame3DPrivateWorldSync137({
  ...IDS,encounter:fake.encounter,
  resolveAuthenticatedSubject:async()=>null,
  verifyLease:async()=>({ok:true,
   source:'trusted-world-instance-lease',
   exclusive:true,committed:true,...IDS,
   fencingToken:1,expiresAt:2000}),
  now:()=>1000,
 }),/requires private encounter/);
});
test('13.7 reconnect resets ephemeral input, preserves HP and intent receipt',async()=>{
 const f=await fixture();
 assert.equal((await f.sync.connect({serverRequestContext:bad})).ok,false);
 assert.equal(f.state.resetCount,0);
 const first=await f.sync.connect({serverRequestContext:client});
 assert.equal(first.ok,true);
 assert.equal(first.nextIntentSeq,8);
 assert.equal(first.snapshot.player.hp,100);
 assert.equal(f.state.resetCount,1);
 f.state.hp=73;
 const second=await f.sync.connect({serverRequestContext:client});
 assert.equal(second.ok,true);
 assert.notEqual(second.connectionId,first.connectionId);
 assert.equal(second.snapshot.player.hp,73);
 assert.equal(second.nextIntentSeq,8);
 assert.equal(f.state.resetCount,2);
 assert.equal((await f.sync.setInput({
  serverRequestContext:client,connectionId:first.connectionId,
  input:{seq:1,x:0,z:1,facing:0},
 })).reason,'stale_world_connection');
 assert.equal((await f.sync.setInput({
  serverRequestContext:client,connectionId:second.connectionId,
  input:{seq:1,x:0,z:1,facing:0},
 })).ok,true);
});
test('13.7 rejects impersonation, stale tokens and invalid cursor',async()=>{
 const f=await fixture();
 const c=await f.sync.connect({serverRequestContext:client});
 assert.equal((await f.sync.poll({
  serverRequestContext:bad,connectionId:c.connectionId,afterSeq:0,
 })).reason,'unauthenticated_world_sync');
 assert.equal((await f.sync.poll({
  serverRequestContext:client,connectionId:'fake',afterSeq:0,
 })).reason,'stale_world_connection');
 for(const value of [-1,0.5,NaN,'0',null]){
  const r=await f.sync.poll({serverRequestContext:client,
   connectionId:c.connectionId,afterSeq:value});
  assert.equal(r.reason,'invalid_world_event_cursor');
 }
 assert.equal((await f.sync.poll({serverRequestContext:client,
  connectionId:c.connectionId,afterSeq:1000
 })).reason,'future_world_event_cursor');
});
test('13.7 serializes advancement and replays bounded ordered events',async()=>{
 const f=await fixture(),c=await f.sync.connect({serverRequestContext:client});
 assert.equal((await f.sync.advance()).ok,true);
 assert.equal((await f.sync.advance()).ok,true);
 assert.equal(f.state.tickCount,2);
 const first=await f.sync.poll({serverRequestContext:client,
  connectionId:c.connectionId,afterSeq:c.cursor});
 assert.equal(first.ok,true);
 assert.deepEqual(first.events.map(e=>e.seq),[1,2]);
 assert.equal(first.nextSeq,2);
 assert.equal(first.snapshot.eventSeq,2);
 assert.equal(first.events[0].xpAuthorized,false);
 const again=await f.sync.poll({serverRequestContext:client,
  connectionId:c.connectionId,afterSeq:first.nextSeq});
 assert.deepEqual(again.events,[]);
 assert.equal(again.nextSeq,2);
 const both=await Promise.all([f.sync.advance(),f.sync.advance()]);
 assert.equal(both.every(x=>x.ok),true);
 assert.equal(f.state.tickCount,4);
});
test('13.7 stream pages at 40 events and resyncs after ring eviction',async()=>{
 const f=await fixture(),c=await f.sync.connect({serverRequestContext:client});
 for(let i=0;i<43;i++)await f.sync.advance();
 const page=await f.sync.poll({serverRequestContext:client,
  connectionId:c.connectionId,afterSeq:0});
 assert.equal(page.events.length,40);
 assert.equal(page.hasMore,true);
 assert.equal(page.nextSeq,40);
 const rest=await f.sync.poll({serverRequestContext:client,
  connectionId:c.connectionId,afterSeq:40});
 assert.equal(rest.events.length,3);
 assert.equal(rest.hasMore,false);
 for(let i=0;i<70;i++)await f.sync.advance();
 const gap=await f.sync.poll({serverRequestContext:client,
  connectionId:c.connectionId,afterSeq:0});
 assert.equal(gap.ok,true);
 assert.equal(gap.gap,true);
 assert.equal(gap.reset,true);
 assert.equal(gap.nextSeq,113);
 assert.deepEqual(gap.events,[]);
});
test('13.7 loses lease permanently on epoch/holder/fencing mismatch',async()=>{
 for(const mismatch of [{instanceEpoch:'epoch-00000002'},
  {holderId:'another-worker'}, {fencingToken:10},
  {exclusive:false},{committed:false},{source:'browser-claim'}]){
  const f=await fixture(),c=await f.sync.connect({serverRequestContext:client});
  f.setLease(mismatch);
  const before=f.state.tickCount;
  assert.equal((await f.sync.advance()).reason,
   'world_instance_lease_lost',JSON.stringify(mismatch));
  assert.equal(f.state.tickCount,before);
  assert.equal(f.state.resetCount,2);
  assert.equal((await f.sync.connect({
   serverRequestContext:client,
  })).reason,'world_instance_lease_lost');
  assert.equal((await f.sync.submit({
   serverRequestContext:client,connectionId:c.connectionId,
   intent:{action:'basic'},
  })).reason,'world_instance_lease_lost');
 }
});
test('13.7 denies expired or overly long leases and disconnected ticks',async()=>{
 const f=await fixture();
 assert.equal((await f.sync.advance()).reason,'world_instance_disconnected');
 const c=await f.sync.connect({serverRequestContext:client});
 assert.equal((await f.sync.disconnect({serverRequestContext:client,
  connectionId:c.connectionId})).ok,true);
 assert.equal((await f.sync.advance()).reason,'world_instance_disconnected');
 const connected=await f.sync.connect({serverRequestContext:client});
 f.advanceClock(1000);
 assert.equal((await f.sync.poll({serverRequestContext:client,
  connectionId:connected.connectionId,afterSeq:0
 })).reason,'world_instance_lease_lost');
 const badDuration=await fixture({
  initialLease:{ok:true,source:'trusted-world-instance-lease',
   exclusive:true,committed:true,...IDS,fencingToken:1,
   expiresAt:1000000},
 }).then(()=>null,err=>err);
 assert.match(badDuration.message,/exclusive instance lease/);
});
test('13.7 corrupt event or unsafe snapshot permanently fences replay',async()=>{
 const f=await fixture(),c=await f.sync.connect({serverRequestContext:client});
 await f.sync.advance();
 f.state.corrupt=true;
 const badEvent=await f.sync.poll({serverRequestContext:client,
  connectionId:c.connectionId,afterSeq:0});
 // The event was emitted before the corrupted flag; append a new one.
 assert.equal(badEvent.ok,true);
 await f.sync.advance();
 assert.equal((await f.sync.poll({serverRequestContext:client,
  connectionId:c.connectionId,afterSeq:1
 })).reason,'world_event_stream_corrupt');
 const g=await fixture();
 g.state.unsafe=true;
 assert.equal((await g.sync.connect({
  serverRequestContext:client,
 })).reason,'invalid_private_world_snapshot');
 // One reset at connection attempt and one on fail-closed fencing.
 assert.equal(g.state.resetCount,2);
});
test('13.7 has no live browser socket, grant writer or public deployment',async()=>{
 const f=await fixture();
 for(const name of ['publicSocket','creditXP','mintItem','writeWorldKill',
  'recordQuest','grantAGP','claimLease','startServer']){
  assert.equal(name in f.sync,false,name);
 }
 assert.equal(f.sync.publicTransportInstalled,false);
 assert.equal(f.sync.worldBroadcastEnabled,false);
 assert.equal(f.sync.durableLeaseWriterInstalled,false);
 assert.equal(f.sync.multiplayerPlayerReplicationEnabled,false);
 assert.equal(f.sync.productionReady,false);
});

// End-to-end source-level seam: wrap the real 13.6 worker without creating a
// second NPC loop, public socket or standalone reward stream.
test('13.7 connects 13.6 real encounter, advances attacks and resets inputs',async()=>{
 let t=1000;
 const map={id:'map-test',fingerprint:IDS.mapFingerprint,
  valid:p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z),
  height:()=>0,canStrike:()=>true,move:(_from,to)=>to};
 const subject=async ctx=>ctx?.auth?{
  authenticated:true,identitySource:'trusted-server-session',
  accountId:IDS.ownerId,characterId:IDS.characterId}:null;
 const world=await createGame3DPrivateEncounter136({
  instanceId:IDS.instanceId,ownerId:IDS.ownerId,
  characterId:IDS.characterId,worldOrigin:{x:0,z:0},mapWorld:map,
  attestWorldSnapshot:async()=>({
   ok:true,provenance:'authoritative-world-simulation',
   instanceId:IDS.instanceId,ownerId:IDS.ownerId,
   characterId:IDS.characterId,worldOrigin:{x:0,z:0},
   mapId:map.id,mapFingerprint:map.fingerprint,
   player:{position:{x:0,z:0},hp:100,
    stats:{maxHP:100,damage:10,defense:5}},
   enemies:[{id:'wolf1',position:{x:2,z:0},
    home:{x:2,z:0},hp:30,
    stats:{maxHP:30,damage:4,defense:2},
    tier:'normal',aiProfile:'standard'}],
  }),
  resolveAuthenticatedSubject:subject,
  resolvePlayerStrike:()=>({damage:12}),
  resolveEnemyStrike:()=>({damage:5}),now:()=>t,
 });
 const sync=await createGame3DPrivateWorldSync137({
  encounter:world,...IDS,now:()=>t,
  resolveAuthenticatedSubject:subject,
  verifyLease:async()=>({ok:true,source:'trusted-world-instance-lease',
   exclusive:true,committed:true,...IDS,
   fencingToken:1,expiresAt:t+2000}),
 });
 const first=await sync.connect({serverRequestContext:client});
 assert.equal(first.nextIntentSeq,1);
 assert.equal((await sync.setInput({serverRequestContext:client,
  connectionId:first.connectionId,
  input:{seq:1,x:0,z:0,facing:Math.PI/2}})).ok,true);
 assert.equal((await sync.submit({serverRequestContext:client,
  connectionId:first.connectionId,
  intent:{action:'basic',intentId:'intent123456',
   intentSeq:1,targetId:'wolf1',weaponPath:'damage'}})).ok,true);
 const step=await sync.advance();
 assert.equal(step.ok,true);
 assert.equal(step.replies[0].damage,12);
 assert.equal(step.snapshot.enemies[0].hp,18);
 const events=await sync.poll({serverRequestContext:client,
  connectionId:first.connectionId,afterSeq:first.cursor});
 assert.equal(events.events.some(e=>e.kind==='player_strike'),true);
 const reconnect=await sync.connect({serverRequestContext:client});
 assert.equal(reconnect.ok,true);
 assert.equal(reconnect.nextIntentSeq,2);
 assert.equal(reconnect.snapshot.enemies[0].hp,18);
 assert.equal((await sync.setInput({serverRequestContext:client,
  connectionId:reconnect.connectionId,
  input:{seq:1,x:0,z:0,facing:Math.PI/2}})).ok,true);
 assert.equal((await sync.submit({serverRequestContext:client,
  connectionId:first.connectionId,
  intent:{action:'basic',intentId:'intent123457',
   intentSeq:2,targetId:'wolf1',weaponPath:'damage'}}))
  .reason,'stale_world_connection');
});

test('13.7 PG lease reader verifies exactly scoped fresh DB data, read only',async()=>{
 const calls=[];let released=0;
 const rows={instance_id:IDS.instanceId,instance_epoch:IDS.instanceEpoch,
  holder_id:IDS.holderId,owner_id:IDS.ownerId,
  character_id:IDS.characterId,map_fingerprint:IDS.mapFingerprint,
  fencing_token:'9',expires_at_ms:String(Date.now()+8000)};
 const db={connect:async()=>({query:async(sql,params)=>{
  calls.push({sql,params});
  return sql.startsWith('SELECT instance_id')?
   {rowCount:1,rows:[rows]}:{rowCount:0,rows:[]};
 },release:()=>{released++}})};
 const reader=createGame3DWorldLeaseReader137({pool:db});
 const result=await reader.verify(IDS);
 assert.equal(result.ok,true);
 assert.equal(result.source,'trusted-world-instance-lease');
 assert.equal(result.fencingToken,9);
 assert.equal(result.exclusive,true);
 assert.equal(result.committed,true);
 assert.equal(reader.leaseAcquisitionEnabled,false);
 assert.equal(reader.leaseRenewalEnabled,false);
 assert.equal(calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.deepEqual(calls[1].params,[
  IDS.instanceId,IDS.instanceEpoch,IDS.holderId,
  IDS.ownerId,IDS.characterId,IDS.mapFingerprint,
 ]);
 assert.equal(calls.at(-1).sql,'COMMIT');
 assert.ok(calls.every(x=>!/^INSERT|^UPDATE|^DELETE/.test(x.sql)));
 assert.equal(released,1);
});
test('13.7 PG lease reader denies absent/forged rows and rolls back errors',async()=>{
 for(const row of [null,{...IDS,instance_id:IDS.instanceId,
  instance_epoch:IDS.instanceEpoch,holder_id:IDS.holderId,
  owner_id:IDS.ownerId,character_id:IDS.characterId,
  map_fingerprint:IDS.mapFingerprint,fencing_token:'NaN',
  expires_at_ms:String(Date.now()+8000)}]){
  let release=0;
  const pool={connect:async()=>({query:async sql=>
   sql.startsWith('SELECT instance_id')?
    {rowCount:row?1:0,rows:row?[row]:[]}:
    {rowCount:0,rows:[]},release:()=>{release++}})};
  const r=await createGame3DWorldLeaseReader137({pool}).verify(IDS);
  assert.equal(r,null);
  assert.equal(release,1);
 }
 const calls=[];let released=0;
 const pool={connect:async()=>({query:async sql=>{
  calls.push(sql);
  if(sql.startsWith('SELECT'))throw Error('DB offline');
  return {rowCount:0,rows:[]};
 },release:()=>{released++}})};
 await assert.rejects(createGame3DWorldLeaseReader137({pool})
  .verify(IDS),/DB offline/);
 assert.equal(calls.at(-1),'ROLLBACK');
 assert.equal(released,1);
 assert.equal(await createGame3DWorldLeaseReader137({pool}).verify({
  ...IDS,ownerId:'__anon__',
 }),null);
});
test('13.7 manual migration has a single authoritative instance lease slot',()=>{
 const sql=readFileSync(new URL(
  '../sql/028_combat137_world_instance_leases.sql',import.meta.url),'utf8');
 assert.match(sql,/instance_id text PRIMARY KEY/);
 assert.match(sql,/fencing_token bigint NOT NULL/);
 assert.match(sql,/FOREIGN KEY \(owner_id,character_id\)/);
 assert.doesNotMatch(sql,/GRANT INSERT|GRANT UPDATE|CREATE POLICY/);
});
