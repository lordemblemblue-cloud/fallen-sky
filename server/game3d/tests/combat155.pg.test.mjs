import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateEncounter136}
 from '../privateWorldEncounter136.mjs';
import {createGame3DPrivateWorldOwner138}
 from '../privateWorldOwner138.mjs';
import {createGame3DPrivateCombatQuestScheduler155}
 from '../privateCombatQuestScheduler155.mjs';

const dbUrl=process.env.GAME3D_155_DISPOSABLE_PG_URL;
const fp='a'.repeat(64),origin={x:0,z:0};
let serial=0;
const actors=(tier='normal')=>({
 player:{position:{x:0,z:0},hp:100,stats:{maxHP:100,damage:45,defense:10}},
 enemies:[{id:'wolf_155',position:{x:2,z:0},home:{x:2,z:0},hp:30,
  tier,aiProfile:'standard',isBoss:false,
  stats:{maxHP:30,damage:6,defense:2}}]
});
async function fixture(pool,{tier='normal',damage=35}={}){
 const index=++serial;
 const scope={instanceId:'instance-155-'+index,
  instanceEpoch:'epoch-155-01',holderId:'worker-155-01',
  ownerId:'owner155',characterId:'hero155_'+index,mapFingerprint:fp};
 // Isolate repeatable acceptance tests to different actual character rows.
 await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id,xp_total) VALUES($1,$2,0)`,
   [scope.ownerId,scope.characterId]);
 const a=actors(tier);
 await pool.query(`INSERT INTO game3d_private_world_seed_142
 (instance_id,owner_id,character_id,map_id,map_fingerprint,revision,
  world_origin_x,world_origin_z,actors_json,source_kind,sealed)
 VALUES($1,$2,$3,'wolfveil-v1',$4,1,0,0,$5::jsonb,
  'trusted_server_world_provisioner',true)`,[
  scope.instanceId,scope.ownerId,scope.characterId,fp,JSON.stringify(a)]);
 let allowProjection=true,allowCommit=true;
 const auth=async({operation,scope:request,ownerId,characterId})=>{
  if(request)return request.instanceId===scope.instanceId&&
   request.ownerId===scope.ownerId&&
   (operation!=='commit_private_world_kills'||allowCommit);
  if(ownerId!==scope.ownerId||characterId!==scope.characterId)return false;
  if(operation==='project_committed_quest_kill')return allowProjection;
  return ['accept_private_server_quest','read_private_server_quests',
   'read_committed_quest_progress'].includes(operation);
 };
 const authenticate=async context=>context?.trusted===true?{
  authenticated:true,identitySource:'trusted-server-session',
  accountId:scope.ownerId,characterId:scope.characterId}:null;
 const encounter=await createGame3DPrivateEncounter136({
  instanceId:scope.instanceId,ownerId:scope.ownerId,
  characterId:scope.characterId,worldOrigin:origin,
  mapWorld:{id:'wolfveil-v1',fingerprint:fp,
   valid:p=>Number.isFinite(p.x)&&Number.isFinite(p.z),
   height:()=>0,move:(_,n)=>n,canStrike:()=>true},
  attestWorldSnapshot:async()=>({ok:true,
   provenance:'authoritative-world-simulation',
   instanceId:scope.instanceId,ownerId:scope.ownerId,
   characterId:scope.characterId,mapId:'wolfveil-v1',
   mapFingerprint:fp,worldOrigin:origin,...a}),
  resolveAuthenticatedSubject:authenticate,
  resolvePlayerStrike:()=>({damage}),resolveEnemyStrike:()=>({damage:5}),
  now:Date.now,
 });
 const owner=await createGame3DPrivateWorldOwner138({
  encounter,pool,scope,authorizeServerOperation:auth,
  resolveAuthenticatedSubject:authenticate,now:Date.now,leaseMs:20000
 });
 const scheduler=createGame3DPrivateCombatQuestScheduler155({
  pool,owner,encounter,scope,authorizeServerOperation:auth
 });
 const connect=async()=>{
  const r=await scheduler.connect({serverRequestContext:{trusted:true}});
  assert.equal(r.ok,true);
  return r.connectionId;
 };
 const strike=async(connectionId)=>{
  const ctx={serverRequestContext:{trusted:true},connectionId};
  assert.equal((await scheduler.setInput({...ctx,
   input:{seq:1,x:0,z:0,facing:Math.PI/2}})).ok,true);
  assert.equal((await scheduler.submit({...ctx,intent:{
   action:'basic',targetId:'wolf_155',weaponPath:'damage',
   intentId:'intent_155_00001',intentSeq:1
  }})).ok,true);
 };
 return {scope,scheduler,encounter,connect,strike,
  setProjection:ok=>{allowProjection=ok},
  setCommit:ok=>{allowCommit=ok}};
}
test('15.5 actual 13.8 owner → 13.6 tick → 15.3 receipt → 15.2 quest credit',
 {skip:!dbUrl,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_scheduler_155_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:dbUrl,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:dbUrl,max:14,
   options:'-c search_path='+schema});
  await pool.query(`CREATE TABLE game3d_trusted_character(
   owner_id text NOT NULL,character_id text NOT NULL,
   xp_total bigint NOT NULL DEFAULT 0,revision bigint NOT NULL DEFAULT 0,
   PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable'; END;$$`);
  await pool.query(`INSERT INTO game3d_trusted_character
    VALUES('owner155','hero155',0,0)`);
  for(const name of [
   '028_combat137_world_instance_leases.sql',
   '029_combat138_checkpoint_digest.sql',
   '032_combat142_trusted_world_seeds.sql',
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql'
  ])await pool.query(await readFile(
   new URL('../sql/'+name,import.meta.url),'utf8'));

  await t.test('accepted quest and server hit produces one durable credit, no rewards',async()=>{
   const f=await fixture(pool);
   const s=f.scheduler;
   assert.equal((await s.accept({questId:'axe_q_first_patrol',
    objectives:[{count:1}],reward:{xp:500000}})).accepted,true);
   const connectionId=await f.connect();
   await f.strike(connectionId);
   const r=await s.advance();
   assert.equal(r.ok,true,JSON.stringify(r));
   assert.equal(r.killReceiptsCommitted,1);
   assert.equal(r.progressSynchronized,true);
   assert.deepEqual(r.newCredits.map(x=>x.questId),['axe_q_first_patrol']);
   assert.equal(r.progress[0].current,1);
   assert.equal(r.progress[0].required,3);
   assert.equal(r.rewardsIssued,false);
   const again=await s.reconcile();
   assert.equal(again.ok,true);
   assert.equal(again.newCredits.length,0);
   const q=(await s.read()).quests;
   assert.deepEqual(q.map(x=>x.id),['axe_q_first_patrol']);
   assert.equal((await s.accept({questId:'axe_q_first_elite'})).reason,
    'quest_prerequisite_unfinished');
   assert.equal((await s.release()),true);
  });
  await t.test('DB projection failure pauses simulation and recovery replays durable receipt',async()=>{
   const f=await fixture(pool);
   const s=f.scheduler;
   assert.equal((await s.accept({questId:'axe_q_first_patrol'})).ok,true);
   const connectionId=await f.connect();
   await f.strike(connectionId);
   f.setProjection(false);
   const failure=await s.advance();
   assert.equal(failure.ok,false);
   assert.equal(failure.reason,'private_quest_reconciliation_failed');
   const cursor=f.encounter.snapshot().eventSeq;
   assert.equal((await s.advance()).reason,'private_quest_reconciliation_required');
   assert.equal(f.encounter.snapshot().eventSeq,cursor);
   const committed=await pool.query(`SELECT count(*)::int AS n
    FROM game3d_private_world_kill_receipt_152
    WHERE instance_id=$1`,[f.scope.instanceId]);
   assert.equal(committed.rows[0].n,1);
   f.setProjection(true);
   const restored=await s.reconcile();
   assert.equal(restored.ok,true);
   assert.equal(restored.newCredits.length,1);
   assert.equal(restored.progress[0].current,1);
   assert.equal((await s.reconcile()).newCredits.length,0);
   assert.equal((await s.release()),true);
  });
  await t.test('lease-fenced issuer rejection stops scheduler without fake credit',async()=>{
   const f=await fixture(pool);
   assert.equal((await f.scheduler.accept({questId:'axe_q_first_patrol'})).ok,true);
   const connectionId=await f.connect();
   await f.strike(connectionId);
   f.setCommit(false);
   const r=await f.scheduler.advance();
   assert.equal(r.reason,'private_kill_commit_unauthorized');
   assert.equal((await f.scheduler.advance()).reason,'private_quest_scheduler_stopped');
   const n=await pool.query(`SELECT count(*)::int AS n
    FROM game3d_private_world_kill_receipt_152
    WHERE instance_id=$1`,[f.scope.instanceId]);
   assert.equal(n.rows[0].n,0);
  });
  await t.test('unaccepted kills never auto-accept a quest or credit its objective',async()=>{
   const f=await fixture(pool);
   const connectionId=await f.connect();
   await f.strike(connectionId);
   const r=await f.scheduler.advance();
   assert.equal(r.ok,true);
   assert.equal(r.killReceiptsCommitted,1);
   assert.equal(r.newCredits.length,0);
   assert.deepEqual((await f.scheduler.read()).quests,[]);
   assert.equal((await f.scheduler.release()),true);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('15.5 is private, read-only for rewards and has no public route',()=>{
 const source=readFileSync(new URL('../privateCombatQuestScheduler155.mjs',import.meta.url),'utf8');
 assert.match(source,/owner\.advance\(\)/);
 assert.match(source,/killWriter\.commit\(\)/);
 assert.match(source,/ledger\.project/);
 assert.match(source,/FOR SHARE/);
 assert.doesNotMatch(source,/createServer\(|awardXP\(|grantQuestReward\(|grantItem\(|localStorage|window\./);
});
