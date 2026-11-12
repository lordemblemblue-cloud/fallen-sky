// 15.9: real PostgreSQL test, temporary schema only, no production account.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile as readAsync} from 'node:fs/promises';
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

const url=process.env.GAME3D_159_DISPOSABLE_PG_URL;
const a={ownerId:'owner159',characterId:'hero159'};
const b={ownerId:'owner159b',characterId:'hero159b'};
let seq=0;
const auth=async({ownerId,characterId,operation})=>
 ownerId===a.ownerId&&characterId===a.characterId&&[
  'accept_private_server_quest','read_private_server_quests',
  'project_committed_quest_kill','read_committed_quest_progress',
  'turn_in_private_server_quest','read_private_quest_turnins',
  'plan_verified_private_quest_reward','read_private_quest_reward_plans',
  'settle_verified_private_quest_xp','read_private_quest_xp_settlements',
  'review_private_quest_nonxp','read_private_quest_nonxp_reviews'
 ].includes(operation);
const receipt=async(pool,tier='normal')=>{
 const id='receipt-159-'+(++seq);
 await pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
 map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
 server_kill_committed)
 VALUES($1,$2,$3,'world-159','epoch-159',$4,$5,$6,$7,
 'server-committed-private-pve-kill',true)`,
 [id,a.ownerId,a.characterId,'a'.repeat(64),seq,'wolf_'+seq,tier]);
 return id;
};
test('15.9 non-XP reward review only after trusted XP, never spendable',
 {skip:!url,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_nonxp_159_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:url,max:12,
   options:'-c search_path='+schema});
  await pool.query(await readAsync(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'append only'; END;$$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '038_combat157_private_reward_plans.sql',
   '039_combat158_private_quest_xp_settlement.sql',
   '040_combat159_private_nonxp_reward_review.sql',
  ])await pool.query(await readAsync(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id) VALUES($1,$2),($3,$4)`,
   [a.ownerId,a.characterId,b.ownerId,b.characterId]);
  const accept=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:auth});
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:auth});
  const turnin=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:auth});
  const plans=createGame3DPrivateQuestRewardPlan157({
   pool,authorizeServerOperation:auth});
  const xp=createGame3DPrivateQuestXPSettlement158({
   pool,authorizeServerOperation:auth});
  const reviews=createGame3DPrivateQuestNonXPReview159({
   pool,authorizeServerOperation:auth});
  const credited=async(tier='normal')=>ledger.project({
   ...a,receiptId:await receipt(pool,tier)});
  const count=async table=>Number((await pool.query(
   'SELECT COUNT(*)::int AS n FROM '+table
  )).rows[0].n);
  const character=async()=> (await pool.query(`
   SELECT xp_total::text AS xp,revision::text AS revision
   FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2`,
   [a.ownerId,a.characterId])).rows[0];

  await t.test('reject unknown/foreign quests and missing trusted settlements',async()=>{
   assert.equal((await reviews.review({...a,questId:'evil_fake_quest'})).reason,
    'unknown_private_quest');
   assert.equal((await reviews.review({...b,questId:'axe_q_first_patrol'})).reason,
    'private_nonxp_review_unauthorized');
   assert.equal((await reviews.readReviews(b)).reason,
    'private_nonxp_read_unauthorized');
   assert.equal((await reviews.review({...a,questId:'axe_q_first_patrol',
    statPoints:9999,contribution:99999,factionId:'AXE_Faction_3'})).reason,
    'verified_nonxp_source_missing_or_modified');
   assert.equal(await count('game3d_private_quest_nonxp_review_159'),0);
  });
  await t.test('accepted, credited, turned-in and planned alone cannot create review',async()=>{
   assert.equal((await accept.accept({...a,questId:'axe_q_first_patrol'})).ok,true);
   for(let i=0;i<3;i++)assert.equal((await credited()).ok,true);
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_patrol'})).ok,true);
   assert.equal((await plans.plan({...a,questId:'axe_q_first_patrol'})).ok,true);
   assert.equal((await reviews.review({...a,questId:'axe_q_first_patrol'})).reason,
    'verified_nonxp_source_missing_or_modified');
   assert.equal(await count('game3d_private_quest_nonxp_review_159'),0);
  });
  await t.test('after XP, three concurrent reviews create one non-spendable record',async()=>{
   const paid=await xp.settleXP({...a,questId:'axe_q_first_patrol'});
   assert.equal(paid.ok,true);
   assert.equal(paid.xpAmount,80);
   const results=await Promise.all([
    reviews.review({...a,questId:'axe_q_first_patrol',
     pointsAmount:9999,contributionAmount:9999,reputationAmount:9999}),
    reviews.review({...a,questId:'axe_q_first_patrol'}),
    reviews.review({...a,questId:'axe_q_first_patrol'})
   ]);
   assert(results.every(r=>r.ok),JSON.stringify(results));
   assert.equal(results.filter(r=>r.alreadyReviewed===false).length,1);
   assert.equal(results.filter(r=>r.alreadyReviewed===true).length,2);
   assert.deepEqual(results[0].proposedNonSpendable,{
    statPoints:1,characterContribution:10,factionReputation:5
   });
   assert(results.every(r=>r.grantsIssued===false&&
    r.claimable===false&&r.spendable===false));
   assert.equal(await count('game3d_private_quest_nonxp_review_159'),1);
   assert.deepEqual(await character(),{xp:'80',revision:'1'});
   assert.equal((await reviews.readReviews(a)).reviews[0].spendable,false);
  });
  await t.test('elite follows real completion/XP; no duplicate point balances',async()=>{
   assert.equal((await accept.accept({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await credited('normal')).credited.length,0);
   assert.equal((await credited('elite')).credited.length,1);
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await plans.plan({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await reviews.review({...a,questId:'axe_q_first_elite'})).reason,
    'verified_nonxp_source_missing_or_modified');
   assert.equal((await xp.settleXP({...a,questId:'axe_q_first_elite'})).ok,true);
   const r=await reviews.review({...a,questId:'axe_q_first_elite'});
   assert.equal(r.ok,true);
   assert.deepEqual(r.proposedNonSpendable,{
    statPoints:2,characterContribution:20,factionReputation:10
   });
   assert.deepEqual((await reviews.readReviews(a)).reviews.map(v=>v.questId),
    ['axe_q_first_patrol','axe_q_first_elite']);
   assert.deepEqual(await character(),{xp:'220',revision:'2'},
    'review itself does not change character XP or revision');
  });
  await t.test('immutability, non-spendable constraints and foreign keys block fraud',async()=>{
   await assert.rejects(pool.query(`
    UPDATE game3d_private_quest_nonxp_review_159 SET points_amount=999`));
   await assert.rejects(pool.query(`
    DELETE FROM game3d_private_quest_nonxp_review_159`));
   await assert.rejects(pool.query(`
    UPDATE game3d_private_quest_nonxp_review_159 SET points_posted=true`));
   await assert.rejects(pool.query(`
    INSERT INTO game3d_private_quest_nonxp_review_159
    (owner_id,character_id,quest_id,reward_revision,xp_grant_event_id,
     points_amount,contribution_amount,reputation_amount,policy_status,
     nonspendable,source_kind)
    VALUES($1,$2,'axe_q_first_patrol','axe-private-pve-rewards-157-v1',
    'unknown-grant-159',1,10,5,'awaiting-separate-authorities',true,
    'verified-private-quest-nonxp-review')`,[b.ownerId,b.characterId]));
   assert.equal(await count('game3d_private_quest_nonxp_review_159'),2);
   assert.deepEqual(await character(),{xp:'220',revision:'2'});
  });
  await t.test('changed source status or reward revision rejects replay fail closed',async()=>{
   await pool.query(`UPDATE game3d_private_quest_acceptance_154
    SET status='abandoned' WHERE owner_id=$1 AND character_id=$2
    AND quest_id='axe_q_first_elite'`,[a.ownerId,a.characterId]);
   assert.equal((await reviews.review({...a,questId:'axe_q_first_elite'})).reason,
    'verified_nonxp_source_missing_or_modified');
   assert.equal(await count('game3d_private_quest_nonxp_review_159'),2);
  });
  await t.test('server operator denial blocks recording and private reads',async()=>{
   const blocked=createGame3DPrivateQuestNonXPReview159({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await blocked.review({...a,questId:'axe_q_first_patrol'})).reason,
    'private_nonxp_review_unauthorized');
   assert.equal((await blocked.readReviews(a)).reason,
    'private_nonxp_read_unauthorized');
   assert.equal(blocked.contributionWriterEnabled,false);
   assert.equal(blocked.factionReputationWriterEnabled,false);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('15.9 cannot grant browser contribution/reputation, items or XP',()=>{
 const s=readFileSync(new URL('../privateQuestNonXPReview159.mjs',import.meta.url),'utf8');
 assert.match(s,/game3d_private_quest_xp_settlement_158/);
 assert.match(s,/awaiting-separate-authorities/);
 assert.doesNotMatch(s,/addContribution\(|addAXEFactionReputation\(|awardXP\(|grantItem\(|addGold\(|createServer\(|localStorage|window\./);
});
