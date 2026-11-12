// Combat / Quest 16.1 — disposable PostgreSQL only, no player accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateStatAllocation161}
 from '../privateStatAllocation161.mjs';
import {createGame3DPrivateProgressionPolicy160}
 from '../privateProgressionPolicy160.mjs';
const pgURL=process.env.GAME3D_161_DISPOSABLE_PG_URL;
const a={ownerId:'owner161',characterId:'hero161'};
const b={ownerId:'owner161b',characterId:'hero161b'};
const allowed=async({operation,ownerId,characterId})=>
 ownerId===a.ownerId&&characterId===a.characterId&&[
 'allocate_private_level_stat_points','read_private_level_stat_allocations',
 'read_private_progression_policy'].includes(operation);
const act=(key,statKey='strength',points=1,scope=a)=>({
 ...scope,allocationId:key,statKey,points
});
test('16.1 trusted stat point allocation — PostgreSQL real transactions',
 {skip:!pgURL,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_stats_161_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgURL,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:pgURL,max:14,
   options:'-c search_path='+schema});
  await pool.query(await readFile(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable server journal'; END;$$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '038_combat157_private_reward_plans.sql',
   '039_combat158_private_quest_xp_settlement.sql',
   '040_combat159_private_nonxp_reward_review.sql',
   '041_combat161_private_stat_allocations.sql'
  ])await pool.query(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
  await pool.query(`INSERT INTO game3d_trusted_character(owner_id,character_id)
   VALUES ($1,$2),($3,$4)`,
   [a.ownerId,a.characterId,b.ownerId,b.characterId]);
  const writer=createGame3DPrivateStatAllocation161({
   pool,authorizeServerOperation:allowed});
  const policy=createGame3DPrivateProgressionPolicy160({
   pool,authorizeServerOperation:allowed});
  const state=async()=>(await pool.query(`
   SELECT xp_total::text AS xp,revision::text AS revision
   FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2`,
   [a.ownerId,a.characterId])).rows[0];
  const count=async()=>Number((await pool.query(`
   SELECT count(*)::int AS n FROM game3d_private_stat_allocation_161`
  )).rows[0].n);
  await t.test('reject unauthorized characters, forged stats, negative points and bad IDs',async()=>{
   assert.equal((await writer.allocate(act('intent-161-foreign','strength',1,b))).reason,
    'private_stat_allocation_unauthorized');
   assert.equal((await writer.allocate(act('intent-161-wrong','critChance',1))).reason,
    'invalid_private_stat_allocation_intent');
   assert.equal((await writer.allocate(act('intent-161-negative','strength',-1))).reason,
    'invalid_private_stat_allocation_intent');
   assert.equal((await writer.allocate(act('intent-161-huge','strength',100))).reason,
    'invalid_private_stat_allocation_intent');
   assert.equal((await writer.allocate(act('../bad','strength',1))).reason,
    'invalid_private_stat_allocation_intent');
   assert.equal((await writer.readAllocations(b)).reason,
    'private_stat_allocation_read_unauthorized');
   assert.equal(await count(),0);
  });
  await t.test('level 1 has no spendable points and no legacy client point import',async()=>{
   const read=await writer.readAllocations(a);
   assert.equal(read.ok,true);
   assert.equal(read.level,1);
   assert.equal(read.levelEarnedPoints,0);
   assert.equal(read.availablePoints,0);
   assert.equal(read.allocationsByStat.strength,0);
   assert.equal(read.questBonusPointsSpendable,false);
   assert.equal((await writer.allocate(act('intent-161-too-early'))).reason,
    'insufficient_verified_level_stat_points');
   assert.deepEqual(await state(),{xp:'0',revision:'0'});
  });
  // An ephemeral, trusted-character XP fixture is a *test setup*, not a
  // public or client update/XP settlement method.
  await pool.query(`UPDATE game3d_trusted_character SET xp_total=220
   WHERE owner_id=$1 AND character_id=$2`,[a.ownerId,a.characterId]);
  await t.test('level 2 yields exactly 3 server-earned points, independently of proposed quest bonuses',async()=>{
   const preview=await writer.readAllocations(a);
   assert.equal(preview.level,2);
   assert.equal(preview.levelEarnedPoints,3);
   assert.equal(preview.availablePoints,3);
   assert.equal(preview.questBonusPointsSpendable,false);
   const first=await writer.allocate(act('intent-161-first','constitution',1));
   assert.equal(first.ok,true);
   assert.equal(first.allocated,true);
   assert.equal(first.allocationsByStat.constitution,1);
   assert.equal(first.availablePoints,2);
   assert.equal(first.characterRevision,'1');
   assert.deepEqual(await state(),{xp:'220',revision:'1'});
   const policyView=await policy.readPolicy(a);
   assert.equal(policyView.ok,true);
   assert.equal(policyView.preview.levelEarnedStatPointCeiling,3);
   assert.equal(policyView.preview.availableStatPoints,null,
    'legacy 16.0 read-only model has not been cut over to this server ledger');
  });
  await t.test('retrying the same allocation ID is exactly once; mismatched replay is rejected',async()=>{
   const before=await count();
   const replay=await writer.allocate(act('intent-161-first','constitution',1));
   assert.equal(replay.ok,true);
   assert.equal(replay.allocated,false);
   assert.equal(replay.alreadyAllocated,true);
   assert.equal((await writer.allocate(act('intent-161-first','focus',1))).reason,
    'conflicting_private_stat_allocation_replay');
   assert.equal((await writer.allocate(act('intent-161-first','constitution',2))).reason,
    'conflicting_private_stat_allocation_replay');
   assert.equal(await count(),before);
   assert.deepEqual(await state(),{xp:'220',revision:'1'});
  });
  await t.test('simultaneous different allocations cannot exceed server level budget',async()=>{
   const results=await Promise.all([
    writer.allocate(act('intent-161-parallel-a','strength',2)),
    writer.allocate(act('intent-161-parallel-b','dexterity',2)),
   ]);
   assert.equal(results.filter(x=>x.allocated===true).length,1);
   assert.equal(results.filter(x=>x.reason==='insufficient_verified_level_stat_points').length,1);
   const latest=await writer.readAllocations(a);
   assert.equal(latest.spentPoints,3);
   assert.equal(latest.availablePoints,0);
   assert.equal(latest.allocationsByStat.constitution,1);
   assert.equal(latest.allocationsByStat.strength+
    latest.allocationsByStat.dexterity,2);
   assert.equal((await writer.allocate(act('intent-161-overflow','focus',1))).reason,
    'insufficient_verified_level_stat_points');
   assert.equal(await count(),2);
   assert.deepEqual(await state(),{xp:'220',revision:'2'});
  });
  await t.test('level 3 gains 3 more private level points; four valid stat keys',async()=>{
   await pool.query(`UPDATE game3d_trusted_character SET xp_total=500
    WHERE owner_id=$1 AND character_id=$2`,[a.ownerId,a.characterId]);
   const read=await writer.readAllocations(a);
   assert.equal(read.level,4,
    '10.4 policy level 4 at XP 500: thresholds 100+125+150');
   assert.equal(read.levelEarnedPoints,9);
   assert.equal(read.availablePoints,6);
   const items=await Promise.all([
    writer.allocate(act('intent-161-spirit','focus',3)),
    writer.allocate(act('intent-161-dexterity','dexterity',2)),
   ]);
   assert(items.every(x=>x.ok));
   assert.equal((await writer.readAllocations(a)).availablePoints,1);
   assert.equal((await writer.allocate(act('intent-161-last','strength',1))).ok,true);
   const final=await writer.readAllocations(a);
   assert.equal(final.spentPoints,9);
   assert.equal(final.availablePoints,0);
   assert.equal(final.allocationsByStat.focus,3);
   assert.equal(await count(),5);
  });
  await t.test('DB update failure rolls back allocation event before any points are spent',async()=>{
   await pool.query(`UPDATE game3d_trusted_character SET xp_total=650
    WHERE owner_id=$1 AND character_id=$2`,[a.ownerId,a.characterId]);
   await pool.query(`CREATE FUNCTION game3d_test_fail_stat_revision()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture rollback'; END;$$`);
   await pool.query(`CREATE TRIGGER test_161_reject_character_revision
    BEFORE UPDATE OF revision ON game3d_trusted_character
    FOR EACH ROW EXECUTE FUNCTION game3d_test_fail_stat_revision()`);
   const before=await count();
   assert.equal((await writer.allocate(act('intent-161-rollback','focus',1))).reason,
    'private_stat_allocation_transaction_failed');
   assert.equal(await count(),before);
   await pool.query(`DROP TRIGGER test_161_reject_character_revision
    ON game3d_trusted_character`);
  });
  await t.test('immutable journal and composite FK prevent retroactive edits or fake owners',async()=>{
   await assert.rejects(pool.query(`UPDATE game3d_private_stat_allocation_161
    SET points=99`));
   await assert.rejects(pool.query(`DELETE FROM game3d_private_stat_allocation_161`));
   await assert.rejects(pool.query(`INSERT INTO game3d_private_stat_allocation_161
    (owner_id,character_id,allocation_id,stat_key,points,
     character_revision_before,character_revision_after,
     source_kind,policy_version)
    VALUES('unowned161','missing161','intent-161-forge','strength',
    1,0,1,'trusted-private-level-stat-allocation',
    'game3d-private-stat-allocation-161-v1')`));
   assert.equal(await count(),5);
  });
  await t.test('server authorization refusal cannot access allocation state',async()=>{
   const blocked=createGame3DPrivateStatAllocation161({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await blocked.allocate(act('intent-161-denied'))).reason,
    'private_stat_allocation_unauthorized');
   assert.equal((await blocked.readAllocations(a)).reason,
    'private_stat_allocation_read_unauthorized');
   assert.equal(writer.browserStoreConnected,false);
   assert.equal(writer.questBonusPointWriterEnabled,false);
   assert.equal(writer.productionReady,false);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('16.1 stat keys match current Character menu and do not mutate browser state',()=>{
 const source=readFileSync(new URL('../privateStatAllocation161.mjs',import.meta.url),'utf8');
 const root=new URL('../../../',import.meta.url);
 const ui=readFileSync(new URL('src/components/game3d/axe/services/AXECharacterWorkspace.jsx',
  root),'utf8');
 for(const key of ['strength','dexterity','constitution','focus']){
  assert.match(ui,new RegExp("key:'"+key+"'"));
  assert.match(source,new RegExp("'"+key+"'"));
 }
 assert.match(source,/LEVEL_STAT_POINTS_POLICY_160/);
 assert.doesNotMatch(source,/localStorage|window\.|applyAttributeAllocationPlan\(|addContribution\(|addAXEFactionReputation\(|createServer\(/);
});
