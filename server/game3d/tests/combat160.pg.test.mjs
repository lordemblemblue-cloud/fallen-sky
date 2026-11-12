// Game 3D 16.0: real PostgreSQL READ-ONLY progression policy verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateQuestAcceptance154}
 from '../privateQuestAcceptance154.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from '../privateQuestTurnIn156.mjs';
import {createGame3DPrivateQuestRewardPlan157}
 from '../privateQuestRewardPlan157.mjs';
import {createGame3DPrivateQuestXPSettlement158}
 from '../privateQuestXPSettlement158.mjs';
import {createGame3DPrivateQuestNonXPReview159}
 from '../privateQuestNonXPReview159.mjs';
import {createGame3DPrivateProgressionPolicy160}
 from '../privateProgressionPolicy160.mjs';

const pgUrl=process.env.GAME3D_160_DISPOSABLE_PG_URL;
const a={ownerId:'owner160',characterId:'hero160'};
const b={ownerId:'owner160b',characterId:'hero160b'};
let seq=0;
const grants=new Set([
 'accept_private_server_quest','project_committed_quest_kill',
 'turn_in_private_server_quest','plan_verified_private_quest_reward',
 'settle_verified_private_quest_xp','review_private_quest_nonxp',
 'read_private_progression_policy',
]);
const operator=async({operation,ownerId,characterId})=>
 ownerId===a.ownerId&&characterId===a.characterId&&grants.has(operation);
async function makeKill(pool,tier='normal'){
 const id='receipt-160-'+(++seq);
 await pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,server_kill_committed)
 VALUES($1,$2,$3,'world-160','epoch-160',$4,$5,$6,$7,
  'server-committed-private-pve-kill',true)`,
 [id,a.ownerId,a.characterId,'d'.repeat(64),seq,'wolf_'+seq,tier]);
 return id;
}
test('16.0 actual private 5.0+15.2–15.9 progression read model',
 {skip:!pgUrl,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_policy_160_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgUrl,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:pgUrl,
   options:'-c search_path='+schema,max:12});
  await pool.query(await readFile(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'private immutable journal'; END;$$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '038_combat157_private_reward_plans.sql',
   '039_combat158_private_quest_xp_settlement.sql',
   '040_combat159_private_nonxp_reward_review.sql'
  ])await pool.query(await readFile(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id) VALUES($1,$2),($3,$4)`,
   [a.ownerId,a.characterId,b.ownerId,b.characterId]);
  const acceptance=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:operator});
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:operator});
  const completion=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:operator});
  const plans=createGame3DPrivateQuestRewardPlan157({
   pool,authorizeServerOperation:operator});
  const xp=createGame3DPrivateQuestXPSettlement158({
   pool,authorizeServerOperation:operator});
  const reviews=createGame3DPrivateQuestNonXPReview159({
   pool,authorizeServerOperation:operator});
  const budget=createGame3DPrivateProgressionPolicy160({
   pool,authorizeServerOperation:operator});
  const defeat=async tier=>ledger.project({...a,
   receiptId:await makeKill(pool,tier)});
  const complete=async questId=>{
   assert.equal((await completion.turnIn({...a,questId})).ok,true);
   assert.equal((await plans.plan({...a,questId})).ok,true);
   assert.equal((await xp.settleXP({...a,questId})).ok,true);
  };
  const read=async()=>{
   const r=await budget.readPolicy(a);
   assert.equal(r.ok,true,JSON.stringify(r));
   return r.preview;
  };
  await t.test('unverified operator, other character and invalid identifiers cannot read',async()=>{
   const blocked=createGame3DPrivateProgressionPolicy160({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await blocked.readPolicy(a)).reason,
    'private_progression_read_unauthorized');
   assert.equal((await budget.readPolicy(b)).reason,
    'private_progression_read_unauthorized');
   assert.equal((await budget.readPolicy({ownerId:'x/../../z',characterId:'hero160'})).reason,
    'private_progression_identity_invalid');
   assert.equal(budget.statPointWriterEnabled,false);
   assert.equal(budget.contributionWriterEnabled,false);
   assert.equal(budget.browserStoreConnected,false);
  });
  await t.test('new trusted character starts level1, zero XP, zero reviewed quest rewards',async()=>{
   const p=await read();
   assert.equal(p.level,1);
   assert.equal(p.committedXP,'0');
   assert.equal(p.levelEarnedStatPointCeiling,0);
   assert.equal(p.totalPotentialStatPointCeiling,0);
   assert.equal(p.reviewedQuestContribution,0);
   assert.equal(p.reviewedQuestFactionReputation,0);
   assert.equal(p.allXPSettlementsReviewed,true);
   assert.equal(p.availableStatPoints,null);
   assert.equal(p.spendableContributionBalance,null);
   assert.equal(p.noLegacyBalanceImported,true);
  });
  await t.test('a completed patrol without non-XP review is marked incomplete coverage',async()=>{
   assert.equal((await acceptance.accept({...a,questId:'axe_q_first_patrol'})).ok,true);
   for(let i=0;i<3;i++)assert.equal((await defeat('normal')).ok,true);
   await complete('axe_q_first_patrol');
   const p=await read();
   assert.equal(p.committedXP,'80');
   assert.equal(p.questsWithSettledXP,1);
   assert.equal(p.reviewsRecorded,0);
   assert.equal(p.allXPSettlementsReviewed,false);
   assert.equal(p.verifiedQuestBonusPointCeiling,0);
   assert.equal(p.availableStatPoints,null);
  });
  await t.test('verified 15.9 review maps to nonspendable point/Contribution/reputation ceilings',async()=>{
   assert.equal((await reviews.review({...a,questId:'axe_q_first_patrol'})).ok,true);
   const p=await read();
   assert.equal(p.level,1);
   assert.equal(p.verifiedQuestBonusPointCeiling,1);
   assert.equal(p.reviewedQuestContribution,10);
   assert.equal(p.reviewedQuestFactionReputation,5);
   assert.equal(p.totalPotentialStatPointCeiling,1);
   assert.equal(p.allXPSettlementsReviewed,true);
   assert.equal(p.availableStatPoints,null);
   assert.equal(p.spendableContributionBalance,null);
   assert.equal(p.factionReputationBalance,null);
   assert.equal(p.migrationRequired,true);
  });
  await t.test('elite reward raises verified XP level and existing 3-points-per-level ceiling',async()=>{
   assert.equal((await acceptance.accept({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await defeat('normal')).credited.length,0);
   assert.equal((await defeat('elite')).credited.length,1);
   await complete('axe_q_first_elite');
   assert.equal((await reviews.review({...a,questId:'axe_q_first_elite'})).ok,true);
   const p=await read();
   assert.equal(p.level,2);
   assert.equal(p.committedXP,'220');
   assert.equal(p.characterRevision,'2');
   assert.equal(p.levelEarnedStatPointCeiling,3);
   assert.equal(p.verifiedQuestBonusPointCeiling,3);
   assert.equal(p.totalPotentialStatPointCeiling,6);
   assert.equal(p.reviewedQuestContribution,30);
   assert.equal(p.reviewedQuestFactionReputation,15);
   assert.equal(p.reviewsRecorded,2);
   assert.equal(p.questsWithSettledXP,2);
   assert.equal(p.allXPSettlementsReviewed,true);
   assert.equal(p.statAllocationEnabled,false);
   assert.equal(p.contributionSpendingEnabled,false);
  });
  await t.test('a modified underlying trusted quest state prevents policy projection',async()=>{
   await pool.query(`UPDATE game3d_private_quest_acceptance_154
    SET status='abandoned' WHERE owner_id=$1 AND character_id=$2
     AND quest_id='axe_q_first_elite'`,[a.ownerId,a.characterId]);
   const r=await budget.readPolicy(a);
   assert.equal(r.reason,'private_progression_policy_unverified');
   assert.equal(r.spendable,false);
  });
  await t.test('server read-only method never changes canonical trusted XP or revision',async()=>{
   const row=(await pool.query(`
    SELECT xp_total::text AS xp,revision::text AS revision
    FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2`,
    [a.ownerId,a.characterId])).rows[0];
   assert.deepEqual(row,{xp:'220',revision:'2'});
   const n=await pool.query(`
    SELECT COUNT(*)::int AS n FROM game3d_private_quest_nonxp_review_159`);
   assert.equal(n.rows[0].n,2);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('16.0 source matches existing character-store earning model, never spends',()=>{
 const root=new URL('../../../',import.meta.url);
 const source=readFileSync(new URL('../privateProgressionPolicy160.mjs',import.meta.url),'utf8');
 const hud=readFileSync(new URL('src/components/game3d/playerHUDStore.jsx',root),'utf8');
 const cp=readFileSync(new URL('src/components/game3d/progression/contributionStore.jsx',root),'utf8');
 assert.match(hud,/const STAT_POINTS_PER_LEVEL = 3;/);
 assert.match(cp,/const STARTING_CP = 10000;/);
 assert.match(source,/LEVEL_STAT_POINTS_POLICY_160=3/);
 assert.match(source,/REPEATABLE READ READ ONLY/);
 assert.doesNotMatch(source,/addContribution\(|spendContribution\(|allocateStat\(|grantQuestReward\(|addAXEFactionReputation\(|UPDATE game3d_trusted_character|localStorage|window\./);
});
