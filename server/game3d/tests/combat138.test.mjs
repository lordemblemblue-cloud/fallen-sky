import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DWorldLeaseWriter138}
 from '../worldLeaseWriter138.mjs';
import {createGame3DPrivateWorldOwner138}
 from '../privateWorldOwner138.mjs';

const scope={instanceId:'world-1234',instanceEpoch:'epoch-00000002',
 holderId:'worker-00000002',ownerId:'owner1',
 characterId:'hero1',mapFingerprint:'a'.repeat(64)};
function fakeDb(rows=[]) {
 const calls=[];let releases=0;
 const db={connect:async()=>({query:async(sql,params)=>{
  calls.push({sql,params});
  const next=rows.shift()||[];
  return {rowCount:next.length,rows:next};
 },release:()=>{releases++}})};
 return {db,calls,get releases(){return releases}};
}
const leaseRow=(token='2')=>({
 instance_id:scope.instanceId,instance_epoch:scope.instanceEpoch,
 holder_id:scope.holderId,owner_id:scope.ownerId,
 character_id:scope.characterId,map_fingerprint:scope.mapFingerprint,
 fencing_token:token,expires_at_ms:'900000000000'
});
const factory=(f,authorization=async()=>true)=>
 createGame3DWorldLeaseWriter138({
  pool:f.db,authorizeServerOperation:authorization});

test('13.8 requires server-controlled authority and database',()=>{
 assert.throws(()=>createGame3DWorldLeaseWriter138({}),
  /requires private PostgreSQL/);
 assert.throws(()=>createGame3DWorldLeaseWriter138({
  pool:{connect:async()=>({})}}),/server authorization/);
});
test('13.8 validates input before any database mutation',async()=>{
 const f=fakeDb(),writer=factory(f);
 for(const bad of [null,{...scope,instanceId:'bad'},{
   ...scope,ownerId:'__anon__'},{
   ...scope,mapFingerprint:'wrong'}]){
  assert.equal(await writer.acquire({scope:bad}),null);
  assert.equal(await writer.renew({scope:bad,fencingToken:2}),null);
  assert.equal(await writer.release({scope:bad,fencingToken:2}),false);
 }
 for(const ttlMs of [0,999,30001,1.5,'1000']){
  assert.equal(await writer.acquire({scope,ttlMs}),null);
 }
 assert.equal(await writer.recordCheckpointDigest({
  scope,fencingToken:2,eventSeq:-1,snapshotSha256:'b'.repeat(64)}),false);
 assert.equal(await writer.recordCheckpointDigest({
  scope,fencingToken:2,eventSeq:1,snapshotSha256:'forged'}),false);
 assert.equal(f.calls.length,0);
});
test('13.8 authorization failure never queries database',async()=>{
 const f=fakeDb(),w=factory(f,async()=>false);
 assert.equal(await w.acquire({scope}),null);
 assert.equal(await w.renew({scope,fencingToken:2}),null);
 assert.equal(await w.release({scope,fencingToken:2}),false);
 assert.equal(await w.recordCheckpointDigest({scope,fencingToken:2,
  eventSeq:0,snapshotSha256:'b'.repeat(64)}),false);
 assert.equal(f.calls.length,0);
});
test('13.8 acquire uses atomic upsert and returns committed scoped lease',async()=>{
 const f=fakeDb([[leaseRow()]]),w=factory(f);
 const row=await w.acquire({scope,ttlMs:2000});
 assert.equal(row.ok,true);
 assert.equal(row.fencingToken,2);
 assert.equal(row.source,'trusted-world-instance-lease');
 assert.equal(row.committed,true);
 assert.match(f.calls[0].sql,/ON CONFLICT \(instance_id\) DO UPDATE/);
 assert.match(f.calls[0].sql,/lease\.expires_at <= clock_timestamp\(\)/);
 assert.match(f.calls[0].sql,/lease\.fencing_token\+1/);
 assert.match(f.calls[0].sql,/lease\.owner_id=EXCLUDED\.owner_id/);
 assert.match(f.calls[0].sql,/lease\.map_fingerprint=EXCLUDED\.map_fingerprint/);
 assert.deepEqual(f.calls[0].params,[scope.instanceId,
  scope.instanceEpoch,scope.holderId,scope.ownerId,
  scope.characterId,scope.mapFingerprint,2000]);
 assert.equal(f.releases,1);
});
test('13.8 competing worker cannot acquire unexpired lease',async()=>{
 const f=fakeDb([[]]),w=factory(f);
 assert.equal(await w.acquire({scope}),null);
 assert.equal(f.calls.length,1);
 assert.match(f.calls[0].sql,/lease\.instance_epoch <> EXCLUDED\.instance_epoch/);
 assert.equal(f.releases,1);
});
test('13.8 renew and release require exact holder, epoch and token',async()=>{
 const f=fakeDb([[leaseRow()],[{
   instance_id:scope.instanceId,fencing_token:'2'}]]),w=factory(f);
 assert.equal((await w.renew({scope,fencingToken:2})).fencingToken,2);
 assert.equal(await w.release({scope,fencingToken:2}),true);
 assert.match(f.calls[0].sql,/AND fencing_token=\$7::bigint/);
 assert.match(f.calls[0].sql,/expires_at>clock_timestamp\(\)/);
 assert.match(f.calls[1].sql,/AND fencing_token=\$7::bigint/);
 assert.match(f.calls[1].sql,/expires_at=clock_timestamp\(\)/);
 assert.equal(f.releases,2);
});
test('13.8 stale token and ambiguous database result fail closed',async()=>{
 const f=fakeDb([[],[leaseRow('3')],[],[]]),w=factory(f);
 assert.equal(await w.renew({scope,fencingToken:2}),null);
 assert.equal(await w.renew({scope,fencingToken:2}),null);
 assert.equal(await w.release({scope,fencingToken:2}),false);
 assert.equal(await w.recordCheckpointDigest({scope,fencingToken:2,
  eventSeq:10,snapshotSha256:'b'.repeat(64)}),false);
 assert.equal(f.releases,4);
});
test('13.8 checkpoint writes lock active lease and fence out stale epoch',async()=>{
 const cp={instance_id:scope.instanceId,instance_epoch:scope.instanceEpoch,
  fencing_token:'2',event_seq:'7',snapshot_sha256:'c'.repeat(64)};
 const f=fakeDb([[cp]]),w=factory(f);
 assert.equal(await w.recordCheckpointDigest({scope,fencingToken:2,
  eventSeq:7,snapshotSha256:'c'.repeat(64)}),true);
 const sql=f.calls[0].sql;
 assert.match(sql,/WITH locked AS MATERIALIZED/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/expires_at>clock_timestamp\(\)/);
 assert.match(sql,/fencing_token=\$7::bigint/);
 assert.match(sql,/old\.fencing_token < EXCLUDED\.fencing_token/);
 assert.match(sql,/old\.event_seq<=EXCLUDED\.event_seq/);
 assert.match(sql,/FROM locked/);
 assert.equal(f.releases,1);
});
test('13.8 private migration and source contain no player transport or payouts',()=>{
 const sql=readFileSync(new URL(
  '../sql/029_combat138_checkpoint_digest.sql',import.meta.url),'utf8');
 assert.match(sql,/REFERENCES\s+game3d_combat_world_instance_lease/);
 assert.match(sql,/fencing_token bigint NOT NULL/);
 assert.match(sql,/snapshot_sha256 text NOT NULL/);
 assert.doesNotMatch(sql,/GRANT INSERT|GRANT UPDATE|GRANT DELETE/);
 const f=fakeDb(),w=factory(f);
 assert.equal(w.publicTransportInstalled,false);
 assert.equal(w.rewardWriterEnabled,false);
 assert.equal(w.checkpointRestorationAvailable,false);
 assert.equal(w.productionReady,false);
 for(const name of ['startServer','grantXP','awardLoot','restoreEncounter']){
  assert.equal(name in w,false);
 }
});

test('13.8 private lifecycle pins instance scope, ticks and fences after release',async()=>{
 const pinned={...scope};const clock=Date.now();
 const lease={...leaseRow('1'),expires_at_ms:String(clock+10000)};
 const executed=[];let ticks=0;
 const pool={connect:async()=>({query:async(sql,params)=>{
  executed.push({sql,params});
  if(sql.includes('INSERT INTO game3d_combat_world_instance_lease'))
   return {rowCount:1,rows:[lease]};
  if(sql.includes('SELECT instance_id,instance_epoch') &&
     sql.includes('FROM game3d_combat_world_instance_lease'))
   return {rowCount:1,rows:[lease]};
  if(sql.includes('UPDATE game3d_combat_world_instance_lease SET') &&
     sql.includes('expires_at=clock_timestamp(), updated_at'))
   return {rowCount:1,rows:[{instance_id:scope.instanceId,fencing_token:'1'}]};
  if(sql.includes('UPDATE game3d_combat_world_instance_lease SET'))
   return {rowCount:1,rows:[lease]};
  if(sql.includes('INSERT INTO game3d_combat_world_checkpoint_138'))
   return {rowCount:1,rows:[{
     instance_id:scope.instanceId,instance_epoch:pinned.instanceEpoch,
     fencing_token:'1',event_seq:'0',
     snapshot_sha256:params[8]
   }]};
  if(sql.startsWith('BEGIN')||sql.startsWith('COMMIT'))
   return {rowCount:0,rows:[]};
  throw Error('Unexpected SQL: '+sql.slice(0,50));
 },release:()=>{}})};
 const encounter={
  version:'13.6',privateServerOnly:true,
  instanceId:scope.instanceId,mapId:'test-map',
  mapFingerprint:pinned.mapFingerprint,
  resetConnection:()=>{},
  snapshot:()=>({
   instanceId:scope.instanceId,eventSeq:0,serverTime:clock,
   player:{x:0,z:0,hp:100,maxHp:100,stamina:100,
    facing:0,lastIntentSeq:0},
   enemies:[],rewardsIssued:false,productionReady:false}),
  getEventsAfter:()=>[],
  setInput:async()=>({ok:true}),
  submit:async()=>({ok:true}),
  tick:()=>{ticks++;return []}
 };
 const owner=await createGame3DPrivateWorldOwner138({
  encounter,pool,scope:pinned,now:()=>clock,
  authorizeServerOperation:async()=>true,
  resolveAuthenticatedSubject:async()=>({
   authenticated:true,identitySource:'trusted-server-session',
   accountId:scope.ownerId,characterId:scope.characterId
  })
 });
 pinned.instanceId='tampered-after-factory';
 const connected=await owner.connect({serverRequestContext:{}});
 assert.equal(connected.ok,true,JSON.stringify(connected));
 assert.equal(connected.snapshot.instanceId,scope.instanceId);
 const tick=await owner.advance();
 assert.equal(tick.ok,true);
 assert.equal(tick.checkpointDigestRecorded,true);
 assert.equal(ticks,1);
 assert.equal(await owner.release(),true);
 assert.equal((await owner.advance()).reason,'world_instance_lease_lost');
 assert.equal((await owner.connect({serverRequestContext:{}})).ok,false);
 assert.equal(ticks,1);
 assert.ok(executed.some(c=>c.sql.includes('INSERT INTO game3d_combat_world_checkpoint_138')));
 assert.ok(executed.every(c=>!c.params || c.params[0]!==pinned.instanceId));
});
test('13.8 staged Artemis hunt never trusts generic kill or local payouts',()=>{
 const dialogue=readFileSync(new URL(
  '../../../src/components/game3d/npc/CinematicQuestDialogue.jsx',import.meta.url),'utf8');
 const world=readFileSync(new URL(
  '../../../src/components/game3d/GameWorld3D.jsx',import.meta.url),'utf8');
 const quests=readFileSync(new URL(
  '../../../src/components/game3d/questData.jsx',import.meta.url),'utf8');
 assert.match(dialogue,/acceptLivingQuestIntoBook\(\)/);
 assert.match(dialogue,/rewardAuthority: 'server_pending'/);
 assert.match(dialogue,/LIVING_QUEST_ID/);
 assert.match(world,/if \(!pendingCinematicHunt\) reportWeaponKill/);
 assert.match(world,/if \(!pendingCinematicHunt\) \{/);
 assert.match(world,/if \(!pendingCinematicHunt && \(closestEnemy\.metadata/);
 assert.match(quests,/q_living_bleeding_moon/);
 assert.match(quests,/targetId: 'kali_bleeding_moon_demon'/);
 assert.match(quests,/reward: \{ xp: 0, points: 0 \}/);
});
