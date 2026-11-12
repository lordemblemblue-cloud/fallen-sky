import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateEncounter136}
 from '../privateWorldEncounter136.mjs';
import {createGame3DPrivateWorldRecovery139}
 from '../privateWorldRecovery139.mjs';
import {createGame3DRecoveryStore139,checksumPrivateCheckpoint139}
 from '../privateWorldRecoveryStore139.mjs';

const base={
 instanceId:'world-1234',instanceEpoch:'epoch-00000001',
 holderId:'worker-00000001',ownerId:'owner1',characterId:'hero1',
 mapFingerprint:'a'.repeat(64)
};
const playerContext={auth:true};
const serverAuth=async ctx=>ctx?.auth?{
 authenticated:true,identitySource:'trusted-server-session',
 accountId:base.ownerId,characterId:base.characterId}:null;
function mockPg(){
 let clock=Date.now(),lease=null,record=null,released=0;
 let refuseWrites=false;
 const calls=[];
 const scopeMatches=(s,a)=>s&&s.instance_id===a[0]&&
  s.instance_epoch===a[1]&&s.holder_id===a[2]&&
  s.owner_id===a[3]&&s.character_id===a[4]&&
  s.map_fingerprint===a[5];
 const active=(p)=>scopeMatches(lease,p)&&
  lease.fencing_token===Number(p[6])&&lease.expires_at_ms>clock;
 const leaseRow=()=>({
  ...lease,
  fencing_token:String(lease.fencing_token),
  expires_at_ms:String(lease.expires_at_ms)
 });
 const db={connect:async()=>({
  async query(sql,p=[]){
   calls.push({sql,params:p});
   if(sql.startsWith('BEGIN')||sql.startsWith('COMMIT')||
      sql.startsWith('ROLLBACK'))return {rowCount:0,rows:[]};
   if(sql.includes('INSERT INTO game3d_combat_world_instance_lease')){
    if(!lease){
     lease={instance_id:p[0],instance_epoch:p[1],holder_id:p[2],
      owner_id:p[3],character_id:p[4],map_fingerprint:p[5],
      fencing_token:1,expires_at_ms:clock+p[6]};
    }else if(lease.expires_at_ms<=clock&&
      lease.instance_epoch!==p[1]&&
      lease.owner_id===p[3]&&lease.character_id===p[4]&&
      lease.map_fingerprint===p[5]){
     lease={...lease,instance_epoch:p[1],holder_id:p[2],
      fencing_token:lease.fencing_token+1,expires_at_ms:clock+p[6]};
    }else return {rowCount:0,rows:[]};
    return {rowCount:1,rows:[leaseRow()]};
   }
   if(sql.includes('UPDATE game3d_combat_world_instance_lease SET')){
    if(!active(p))return {rowCount:0,rows:[]};
    if(sql.includes('expires_at=clock_timestamp(),')){
     lease.expires_at_ms=clock;
     return {rowCount:1,rows:[{
      instance_id:lease.instance_id,fencing_token:String(lease.fencing_token)
     }]};
    }
    lease.expires_at_ms=clock+p[7];
    return {rowCount:1,rows:[leaseRow()]};
   }
   if(sql.includes('FROM game3d_combat_world_instance_lease WHERE instance_id=$1')){
    return {rowCount:scopeMatches(lease,p)&&lease.expires_at_ms>clock?1:0,
      rows:scopeMatches(lease,p)&&lease.expires_at_ms>clock?[leaseRow()]:[]};
   }
   if(sql.includes('FROM game3d_combat_world_recovery_139 r')){
    if(!active(p)||!record)return {rowCount:0,rows:[]};
    return {rowCount:1,rows:[{
     ...record,
     fencing_token:String(record.fencing_token),
     event_seq:String(record.event_seq)
    }]};
   }
   if(sql.includes('INSERT INTO game3d_combat_world_recovery_139')){
    if(refuseWrites||!active(p)||record&&record.fencing_token>Number(p[6]))
     return {rowCount:0,rows:[]};
    const checkpoint_json=JSON.parse(p[8]);
    record={instance_id:p[0],instance_epoch:p[1],holder_id:p[2],
     owner_id:p[3],character_id:p[4],map_fingerprint:p[5],
     fencing_token:Number(p[6]),event_seq:Number(p[7]),
     checkpoint_json,checkpoint_sha256:p[9]};
    return {rowCount:1,rows:[{
     instance_id:record.instance_id,instance_epoch:record.instance_epoch,
     fencing_token:String(record.fencing_token),
     event_seq:String(record.event_seq),
     checkpoint_sha256:record.checkpoint_sha256
    }]};
   }
   throw Error('Unexpected SQL '+sql.slice(0,110));
  },
  release(){released++}
 })};
 return {db,calls,now:()=>clock,advanceClock:n=>{clock+=n},
  get lease(){return lease},get record(){return record},
  get released(){return released},
  corrupt:fn=>{record=fn(record)},
  failWrites:v=>{refuseWrites=v}};
}
async function encounterFactory(t,scope){
 const map={id:'map-test',fingerprint:scope.mapFingerprint,
  valid:p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z),
  height:()=>0,canStrike:()=>true,move:(_from,to)=>to};
 return createGame3DPrivateEncounter136({
  instanceId:scope.instanceId,ownerId:scope.ownerId,
  characterId:scope.characterId,worldOrigin:{x:0,z:0},
  mapWorld:map,now:t,resolveAuthenticatedSubject:serverAuth,
  attestWorldSnapshot:async()=>({
   ok:true,provenance:'authoritative-world-simulation',
   instanceId:scope.instanceId,ownerId:scope.ownerId,
   characterId:scope.characterId,mapId:map.id,
   mapFingerprint:map.fingerprint,worldOrigin:{x:0,z:0},
   player:{position:{x:0,z:0},hp:100,
    stats:{maxHP:100,damage:10,defense:5}},
   enemies:[{id:'wolf1',position:{x:2,z:0},home:{x:2,z:0},
    hp:30,stats:{maxHP:30,damage:4,defense:2},
    tier:'normal',aiProfile:'standard'}]
  }),
  resolvePlayerStrike:()=>({damage:12}),
  resolveEnemyStrike:()=>({damage:5})
 });
}
function runOwner(pg,scope=base){
 return createGame3DPrivateWorldRecovery139({
  pool:pg.db,scope,now:pg.now,
  createEncounter:({scope:s})=>encounterFactory(pg.now,s),
  resolveAuthenticatedSubject:serverAuth,
  authorizeServerOperation:async()=>true
 });
}
test('13.9 canonical checkpoint hash is order independent and bounded',()=>{
 const a=checksumPrivateCheckpoint139({b:{z:3,a:1},a:[1,2]});
 const c=checksumPrivateCheckpoint139({a:[1,2],b:{a:1,z:3}});
 assert.equal(a.sha256,c.sha256);
 assert.equal(a.json,c.json);
 assert.throws(()=>checksumPrivateCheckpoint139({bad:Infinity}));
 assert.throws(()=>checksumPrivateCheckpoint139({blob:'z'.repeat(140000)}));
});
test('13.9 private source writes under exact lease row lock and never grants',()=>{
 const sql=readFileSync(new URL('../sql/030_combat139_world_recovery.sql',
  import.meta.url),'utf8');
 assert.match(sql,/checkpoint_json jsonb NOT NULL/);
 assert.match(sql,/fencing_token bigint NOT NULL/);
 assert.doesNotMatch(sql,/GRANT INSERT|GRANT UPDATE|GRANT DELETE/);
 const writer=readFileSync(new URL('../privateWorldRecoveryStore139.mjs',
  import.meta.url),'utf8');
 assert.match(writer,/FOR UPDATE/);
 assert.match(writer,/FOR SHARE/);
 assert.match(writer,/prior.fencing_token<EXCLUDED.fencing_token/);
 assert.match(writer,/prior.event_seq<=EXCLUDED.event_seq/);
 assert.match(writer,/expires_at>clock_timestamp\(\)/);
});
test('13.9 recovers HP, dead enemies and intent sequence after lease takeover',async()=>{
 const pg=mockPg();const first=await runOwner(pg);
 assert.equal(first.restoredAtStart,false);
 const opened=await first.connect({serverRequestContext:playerContext});
 assert.equal(opened.ok,true);
 assert.equal((await first.setInput({
  serverRequestContext:playerContext,connectionId:opened.connectionId,
  input:{seq:1,x:0,z:0,facing:Math.PI/2}
 })).ok,true);
 assert.equal((await first.submit({
  serverRequestContext:playerContext,connectionId:opened.connectionId,
  intent:{action:'basic',intentId:'attack-000001',intentSeq:1,
   targetId:'wolf1',weaponPath:'damage'}
 })).ok,true);
 pg.advanceClock(100);
 const step=await first.advance();
 assert.equal(step.ok,true);
 assert.equal(step.recoveryCheckpointCommitted,true);
 assert.equal(step.snapshot.enemies[0].hp,18);
 assert.equal(pg.record.checkpoint_json.player.lastIntentSeq,1);
 assert.equal(pg.record.checkpoint_json.eventSeq,1);
 assert.equal(await first.release(),true);
 const secondScope={...base,instanceEpoch:'epoch-00000002',
  holderId:'worker-00000002'};
 pg.advanceClock(1500);
 const next=await runOwner(pg,secondScope);
 assert.equal(next.restoredAtStart,true);
 assert.equal(next.fencingToken,2);
 const resumed=await next.connect({serverRequestContext:playerContext});
 assert.equal(resumed.ok,true);
 assert.equal(resumed.nextIntentSeq,2);
 assert.equal(resumed.snapshot.eventSeq,1);
 assert.equal(resumed.snapshot.enemies[0].hp,18);
 // An abandoned connection cannot drive the new owner.
 const old=await first.submit({serverRequestContext:playerContext,
  connectionId:opened.connectionId,intent:{action:'basic',
   intentId:'attack-000002',intentSeq:2,targetId:'wolf1',
   weaponPath:'damage'}});
 assert.equal(old.ok,false);
 // An already committed intent cannot damage the NPC twice.
 assert.equal((await next.submit({serverRequestContext:playerContext,
  connectionId:resumed.connectionId,
  intent:{action:'basic',intentId:'attack-000001',
   intentSeq:1,targetId:'wolf1',weaponPath:'damage'}})).ok,true);
 pg.advanceClock(500);
 const replay=await next.advance();
 assert.equal(replay.ok,true);
 assert.equal(replay.snapshot.enemies[0].hp,18);
 assert.equal(replay.snapshot.player.lastIntentSeq,1);
 assert.equal(replay.replies[0].damage,12);
 assert.equal(replay.snapshot.rewardsIssued,false);
 assert.equal(next.rewardWriterEnabled,false);
 assert.equal(next.publicTransportInstalled,false);
});
test('13.9 refuses duplicate active worker, invalid checkpoint and bad checksum',async()=>{
 const pg=mockPg();const first=await runOwner(pg);
 await assert.rejects(runOwner(pg,{
  ...base,instanceEpoch:'epoch-00000002',holderId:'worker-00000002'
 }),/owned or unavailable/);
 await first.release();
 pg.corrupt(r=>({...r,checkpoint_json:{
  ...r.checkpoint_json,player:{...r.checkpoint_json.player,hp:999}
 }}));
 pg.advanceClock(10);
 await assert.rejects(runOwner(pg,{
  ...base,instanceEpoch:'epoch-00000003',holderId:'worker-00000003'
 }),/checksum mismatch/);
});
test('13.9 checkpoint failure fences inputs and cannot expose uncommitted tick',async()=>{
 const pg=mockPg();const owner=await runOwner(pg);
 const open=await owner.connect({serverRequestContext:playerContext});
 pg.failWrites(true);
 pg.advanceClock(50);
 const step=await owner.advance();
 assert.equal(step.ok,false);
 assert.equal(step.reason,'world_state_commit_failed');
 assert.equal((await owner.poll({
  serverRequestContext:playerContext,
  connectionId:open.connectionId,afterSeq:open.cursor
 })).reason,'world_instance_fenced');
 assert.equal((await owner.submit({
  serverRequestContext:playerContext,connectionId:open.connectionId,
  intent:{action:'basic',intentId:'attack-000002',intentSeq:1,
   targetId:'wolf1',weaponPath:'damage'}
 })).ok,false);
 assert.equal(pg.record.checkpoint_json.eventSeq,0);
});
test('13.9 checkpoint restoration rejects tampered actor state',async()=>{
 const pg=mockPg();const first=await runOwner(pg);
 await first.release();pg.advanceClock(30);
 pg.corrupt(r=>{
  const checkpoint_json={...r.checkpoint_json,
   enemies:r.checkpoint_json.enemies.map(e=>({...e,
    position:{x:9999999,z:0}}))};
  return {...r,checkpoint_json,
   checkpoint_sha256:checksumPrivateCheckpoint139(checkpoint_json).sha256};
 });
 await assert.rejects(runOwner(pg,{
  ...base,instanceEpoch:'epoch-00000004',holderId:'worker-00000004'
 }),/invalid world actor checkpoint/);
});
