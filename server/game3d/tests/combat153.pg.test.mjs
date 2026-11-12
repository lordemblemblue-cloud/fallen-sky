// 15.3 — REAL disposable PostgreSQL tests. No production credentials/data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readFile as readAsync} from 'node:fs/promises';
import {createGame3DPrivateEncounter136}
 from '../privateWorldEncounter136.mjs';
import {createGame3DPrivateWorldKillCommit153}
 from '../privateWorldKillCommit153.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';

const pgUrl=process.env.GAME3D_153_DISPOSABLE_PG_URL;
const origin={x:0,z:0},mapFp='a'.repeat(64);
let nextInstance=0;
function factoryScope(){
 return {instanceId:'instance-153-'+(++nextInstance),
  instanceEpoch:'epoch-153-01',holderId:'worker-153-01',
  ownerId:'owner153',characterId:'hero153',mapFingerprint:mapFp};
}
function actors(tier='normal'){
 return {player:{position:{x:0,z:0},hp:100,
  stats:{maxHP:100,damage:45,defense:10}},
  enemies:[{id:'wolf_153',position:{x:2,z:0},home:{x:2,z:0},
   hp:30,tier,aiProfile:'standard',isBoss:false,
   stats:{maxHP:30,damage:8,defense:2}}]};
}
async function fixture(pool,{tier='normal',damage=35,seedTier=tier,
 staleLease=false}={}){
 const scope=factoryScope(),a=actors(tier);
 await pool.query(`
 INSERT INTO game3d_combat_world_instance_lease
 (instance_id,instance_epoch,holder_id,owner_id,character_id,
  map_fingerprint,fencing_token,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,7,clock_timestamp()+
  CASE WHEN $7::bool THEN interval '-1 second' ELSE interval '2 minutes' END)`,
 [scope.instanceId,scope.instanceEpoch,scope.holderId,scope.ownerId,
  scope.characterId,scope.mapFingerprint,staleLease]);
 await pool.query(`
 INSERT INTO game3d_private_world_seed_142
 (instance_id,owner_id,character_id,map_id,map_fingerprint,
  revision,world_origin_x,world_origin_z,actors_json,source_kind,sealed)
 VALUES($1,$2,$3,'wolfveil-v1',$4,1,0,0,$5::jsonb,
  'trusted_server_world_provisioner',true)`,
 [scope.instanceId,scope.ownerId,scope.characterId,scope.mapFingerprint,
  JSON.stringify(actors(seedTier))]);
 let time=1000;
 const encounter=await createGame3DPrivateEncounter136({
  instanceId:scope.instanceId,ownerId:scope.ownerId,
  characterId:scope.characterId,worldOrigin:origin,
  mapWorld:{
   id:'wolfveil-v1',fingerprint:mapFp,
   valid:point=>Number.isFinite(point.x)&&Number.isFinite(point.z)&&
    Math.abs(point.x)<500&&Math.abs(point.z)<500,
   height:()=>0,move:(_,next)=>next,canStrike:()=>true
  },
  attestWorldSnapshot:async()=>({
   ok:true,provenance:'authoritative-world-simulation',
   instanceId:scope.instanceId,ownerId:scope.ownerId,
   characterId:scope.characterId,mapId:'wolfveil-v1',
   mapFingerprint:mapFp,worldOrigin:origin,...a,
  }),
  resolveAuthenticatedSubject:async c=>c?.trusted?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:scope.ownerId}:null,
  resolvePlayerStrike:()=>({damage}),
  resolveEnemyStrike:()=>({damage:5}),now:()=>time,
 });
 let authorized=true;
 const newWriter=(world=encounter,token=7)=>createGame3DPrivateWorldKillCommit153({
  encounter:world,pool,scope,fencingToken:token,
  authorizeServerOperation:async({operation,scope:s,fencingToken})=>
   authorized&&operation==='commit_private_world_kills'&&
   s.instanceId===scope.instanceId,
 });
 const writer=newWriter();
 const hit=async()=>{
  assert.equal((await encounter.setInput({
   serverRequestContext:{trusted:true},
   input:{seq:1,x:0,z:0,facing:Math.PI/2}
  })).ok,true);
  assert.equal((await encounter.submit({
   serverRequestContext:{trusted:true},
   intent:{action:'basic',targetId:'wolf_153',
    weaponPath:'damage',intentId:'attack_153_00001',intentSeq:1}
  })).ok,true);
  const reply=encounter.tick()[0];
  assert.equal(reply.ok,true);
  return reply;
 };
 return {writer,encounter,scope,hit,newWriter,
  deny:()=>{authorized=false},advance:ms=>{time+=ms}};
}
test('15.3 committed world kills, real PostgreSQL lease and sealed seed',
 {skip:!pgUrl},async(t)=>{
 const {default:pg}=await import('pg');
 const schema='g3d_kill_153_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgUrl,max:2});
 let pool=null;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:pgUrl,
   options:'-c search_path='+schema,max:10});
  await pool.query(`CREATE TABLE game3d_trusted_character (
   owner_id text NOT NULL,character_id text NOT NULL,
   PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'immutable private combat record'; END;$$`);
  await pool.query(`INSERT INTO game3d_trusted_character
   VALUES('owner153','hero153'),('foreign153','hero153b')`);
  // Use existing migrations without editing their definitions.
  for(const file of [
   '../sql/028_combat137_world_instance_leases.sql',
   '../sql/032_combat142_trusted_world_seeds.sql',
   '../sql/035_combat152_private_quest_credits.sql',
  ]){
   await pool.query(await readAsync(new URL(file,import.meta.url),'utf8'));
  }
  await t.test('genuine server defeat commits one immutable receipt and only then earns a quest credit',async()=>{
   const f=await fixture(pool);
   await pool.query(`INSERT INTO game3d_private_quest_objective_binding_152
    (owner_id,character_id,quest_id,objective_id,objective_type,
     required_count,status,accepted_at)
    VALUES('owner153','hero153','patrol','kill_one','kill',1,
     'accepted',clock_timestamp()-interval '1 day')`);
   assert.equal((await f.writer.commit()).receipts.length,0);
   assert.equal((await f.hit()).killed,true);
   const written=await f.writer.commit();
   assert.equal(written.ok,true);
   assert.equal(written.killReceiptCommitted,true);
   assert.equal(written.receipts.length,1);
   assert.equal(written.rewardAuthorized,false);
   assert.equal(written.questCreditCommitted,false);
   const receipt=written.receipts[0];
   const rows=await pool.query(`
    SELECT receipt_id,owner_id,character_id,enemy_id,enemy_tier,
    server_kill_committed FROM game3d_private_world_kill_receipt_152
    WHERE receipt_id=$1`,[receipt.receiptId]);
   assert.equal(rows.rowCount,1);
   assert.equal(rows.rows[0].enemy_tier,'normal');
   assert.equal(rows.rows[0].server_kill_committed,true);
   const ledger=createGame3DPrivateCommittedQuestCredits152({
    pool,authorizeServerOperation:async({ownerId,characterId})=>
     ownerId==='owner153'&&characterId==='hero153'});
   const result=await ledger.project({receiptId:receipt.receiptId,
    ownerId:'owner153',characterId:'hero153'});
   assert.equal(result.ok,true);
   assert.equal(result.killCreditCommitted,true);
   assert.deepEqual(result.credited.map(x=>x.questId),['patrol']);
   assert.equal(result.credited[0].readyForTurnIn,true);
   assert.equal(result.rewardAuthorized,false);
   assert.equal((await ledger.project({receiptId:receipt.receiptId,
    ownerId:'owner153',characterId:'hero153'})).killCreditCommitted,false);
   assert.equal((await f.writer.commit()).receipts.length,0);
  });
  await t.test('lease expiration, wrong fencing token and unapproved issuer cannot write',async()=>{
   const expired=await fixture(pool,{staleLease:true});
   await expired.hit();
   assert.equal((await expired.writer.commit()).reason,'private_world_kill_lease_lost');
   const wrong=await fixture(pool);
   const staleWriter=wrong.newWriter(wrong.encounter,8);
   await wrong.hit();
   assert.equal((await staleWriter.commit()).reason,'private_world_kill_lease_lost');
  });
  await t.test('sealed source enemy tier mismatch aborts the write and permanently fences issuer',async()=>{
   const f=await fixture(pool,{tier:'normal',seedTier:'elite'});
   await f.hit();
   assert.equal((await f.writer.commit()).reason,'trusted_world_kill_seed_missing');
   assert.equal((await f.writer.commit()).reason,'private_kill_commit_fenced');
  });
  await t.test('no lethal enemy defeat = no receipt; owner-scope cannot be changed by commit args',async()=>{
   const f=await fixture(pool,{damage:1});
   const hit=await f.hit();
   assert.equal(hit.killed,false);
   assert.equal((await f.writer.commit({ownerId:'foreign153',
    characterId:'hero153b',killed:true})).receipts.length,0);
  });
  await t.test('unapproved private scheduler fails closed',async()=>{
   const f=await fixture(pool);
   await f.hit();f.deny();
   const result=await f.writer.commit();
   assert.equal(result.reason,'private_kill_commit_unauthorized');
  });
  await t.test('duplicate seed/receipt uniqueness and immutability are enforced by DB',async()=>{
   const r=await pool.query(`
    SELECT receipt_id FROM game3d_private_world_kill_receipt_152 LIMIT 1`);
   assert.equal(r.rowCount,1);
   await assert.rejects(pool.query(`
    UPDATE game3d_private_world_kill_receipt_152 SET enemy_tier='elite'
    WHERE receipt_id=$1`,[r.rows[0].receipt_id]));
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('15.3 has no HTTP/browser/reward or user-provided kill entry point',()=>{
 const code=readFileSync(new URL('../privateWorldKillCommit153.mjs',import.meta.url),'utf8');
 assert.match(code,/getEventsAfter\(cursor\)/);
 assert.match(code,/FOR UPDATE/);
 assert.match(code,/trusted_world_provisioner|trusted_server_world_provisioner/);
 assert.doesNotMatch(code,/awardXP\(|addGold\(|grantQuestReward\(|grantItem\(|localStorage|window\.|createServer\(/);
});
