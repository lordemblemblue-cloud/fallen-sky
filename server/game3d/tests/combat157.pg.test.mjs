// Game 3D Quest 15.7 — real, disposable PostgreSQL tests. Never live DB.
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
import {PRIVATE_QUEST_REWARDS_157}
 from '../privateQuestRewardCatalog157.mjs';

const dbUrl=process.env.GAME3D_157_DISPOSABLE_PG_URL;
const a={ownerId:'owner157',characterId:'hero157'};
const b={ownerId:'owner157b',characterId:'hero157b'};
const scopeOK=({ownerId,characterId})=>
 ownerId===a.ownerId&&characterId===a.characterId;
let seq=0;
async function insertReceipt(pool,tier='normal'){
 const id='receipt-157-'+(++seq);
 await pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq,enemy_id,enemy_tier,
  source_kind,server_kill_committed)
 VALUES($1,$2,$3,'world-157','epoch-157',$4,$5,$6,$7,
  'server-committed-private-pve-kill',true)`,
 [id,a.ownerId,a.characterId,'d'.repeat(64),seq,'enemy_'+seq,tier]);
 return id;
}
test('15.7 quest reward plans are immutable, private and never payable',
 {skip:!dbUrl,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_reward_157_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:dbUrl,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:dbUrl,max:12,
   options:'-c search_path='+schema});
  await pool.query(`CREATE TABLE game3d_trusted_character (
   owner_id text NOT NULL, character_id text NOT NULL,
   xp_total bigint NOT NULL DEFAULT 0,
   revision bigint NOT NULL DEFAULT 0,
   PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'append only'; END;$$`);
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id,xp_total) VALUES ($1,$2,0),($3,$4,0)`,
   [a.ownerId,a.characterId,b.ownerId,b.characterId]);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '038_combat157_private_reward_plans.sql',
  ])await pool.query(await readAsync(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  const authorize=async({operation,...who})=>
   scopeOK(who)&&[
    'accept_private_server_quest','read_private_server_quests',
    'project_committed_quest_kill','read_committed_quest_progress',
    'turn_in_private_server_quest','read_private_quest_turnins',
    'plan_verified_private_quest_reward','read_private_quest_reward_plans',
   ].includes(operation);
  const acceptance=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:authorize});
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:authorize});
  const turnin=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:authorize});
  const planner=createGame3DPrivateQuestRewardPlan157({
   pool,authorizeServerOperation:authorize});
  const defeat=async(tier='normal')=>ledger.project({
   ...a,receiptId:await insertReceipt(pool,tier)});
  const planCount=async()=>Number((await pool.query(`
   SELECT count(*)::int AS n FROM game3d_private_quest_reward_plan_157
  `)).rows[0].n);

  await t.test('missing turn-in, foreign character and unsupported quest never plan',async()=>{
   assert.equal((await planner.plan({...a,questId:'fake_reward_157'})).reason,
    'quest_reward_not_in_private_catalog');
   assert.equal((await planner.plan({...b,questId:'axe_q_first_patrol'})).reason,
    'private_reward_plan_unauthorized');
   assert.equal((await planner.plan({...a,questId:'axe_q_first_patrol'})).reason,
    'verified_quest_turnin_missing');
   assert.equal((await planner.readPlans(b)).reason,
    'private_reward_plan_read_unauthorized');
   assert.equal(await planCount(),0);
   assert.equal(planner.settle,undefined);
   assert.equal(planner.grantXP,undefined);
   assert.equal(planner.settlementWriterEnabled,false);
  });
  await t.test('accepted, incomplete or credited-but-not-turned-in quest is not payable',async()=>{
   assert.equal((await acceptance.accept({...a,questId:'axe_q_first_patrol'})).ok,true);
   assert.equal((await planner.plan({...a,questId:'axe_q_first_patrol'})).ok,false);
   for(let i=0;i<3;i++){
    const r=await defeat();
    assert.equal(r.ok,true);
   }
   assert.equal((await planner.plan({...a,questId:'axe_q_first_patrol'})).reason,
    'verified_quest_turnin_missing');
   assert.equal(await planCount(),0);
  });
  await t.test('once verified, concurrent plans use only pinned catalog amounts',async()=>{
   const turn=await turnin.turnIn({...a,questId:'axe_q_first_patrol'});
   assert.equal(turn.ok,true);
   const requests=await Promise.all([
    planner.plan({...a,questId:'axe_q_first_patrol',
     reward:{xp:9999999,currency:9999999},xp:9999999}),
    planner.plan({...a,questId:'axe_q_first_patrol',
     items:['infinite-legendary'],points:9999999}),
    planner.plan({...a,questId:'axe_q_first_patrol'})
   ]);
   assert(requests.every(r=>r.ok));
   assert.equal(requests.filter(r=>r.alreadyPlanned===false).length,1);
   assert.equal(requests.filter(r=>r.alreadyPlanned===true).length,2);
   assert(requests.every(r=>r.rewardIssued===false&&r.claimable===false&&
    r.settlementAuthorized===false));
   assert.deepEqual(requests[0].proposedReward,
    {xp:80,points:1,contribution:10,reputation:5});
   assert.equal(await planCount(),1);
   const view=await planner.readPlans(a);
   assert.equal(view.ok,true);
   assert.deepEqual(view.plans.map(p=>[p.questId,p.proposedReward.xp]),
    [['axe_q_first_patrol',80]]);
   assert.equal(view.plans[0].claimable,false);
  });
  await t.test('private elite prerequisite and elite defeat can plan second quest',async()=>{
   assert.equal((await acceptance.accept({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await defeat('normal')).credited.length,0);
   assert.equal((await planner.plan({...a,questId:'axe_q_first_elite'})).reason,
    'verified_quest_turnin_missing');
   const e=await defeat('elite');
   assert.equal(e.ok,true);
   assert.deepEqual(e.credited.map(c=>c.questId),['axe_q_first_elite']);
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_elite'})).ok,true);
   const result=await planner.plan({...a,questId:'axe_q_first_elite'});
   assert.equal(result.ok,true);
   assert.deepEqual(result.proposedReward,
    {xp:140,points:2,contribution:20,reputation:10});
   assert.equal(await planCount(),2);
  });
  await t.test('immutable plan cannot be changed, deleted or forged for other character',async()=>{
   await assert.rejects(pool.query(`
    UPDATE game3d_private_quest_reward_plan_157 SET xp_amount=99999
    WHERE owner_id=$1 AND quest_id='axe_q_first_patrol'`,[a.ownerId]));
   await assert.rejects(pool.query(`
    DELETE FROM game3d_private_quest_reward_plan_157
    WHERE owner_id=$1 AND quest_id='axe_q_first_patrol'`,[a.ownerId]));
   await assert.rejects(pool.query(`
    INSERT INTO game3d_private_quest_reward_plan_157
    (owner_id,character_id,quest_id,catalog_revision,reward_revision,
     xp_amount,points_amount,contribution_amount,reputation_amount,
     source_kind)
    VALUES($1,$2,'axe_q_first_patrol','axe-private-pve-154-v1',
    'axe-private-pve-rewards-157-v1',80,1,10,5,
    'verified-private-quest-turnin-plan')`,[b.ownerId,b.characterId]));
   await assert.rejects(pool.query(`
    UPDATE game3d_private_quest_reward_plan_157 SET reward_issued=true`));
   await assert.rejects(pool.query(`
    UPDATE game3d_private_quest_reward_plan_157 SET plan_only=false`));
   assert.equal(await planCount(),2);
  });
  await t.test('mismatched completed quest state is rejected, not silently paid',async()=>{
   await pool.query(`UPDATE game3d_private_quest_acceptance_154
    SET status='abandoned'
    WHERE owner_id=$1 AND character_id=$2 AND quest_id='axe_q_first_elite'`,
    [a.ownerId,a.characterId]);
   const result=await planner.plan({...a,questId:'axe_q_first_elite'});
   assert.equal(result.ok,false);
   assert.equal(result.reason,'verified_quest_turnin_missing');
   assert.equal(await planCount(),2);
  });
  await t.test('unauthorized privileged operation cannot read or plan',async()=>{
   const blocked=createGame3DPrivateQuestRewardPlan157({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await blocked.plan({...a,questId:'axe_q_first_patrol'})).reason,
    'private_reward_plan_unauthorized');
   assert.equal((await blocked.readPlans(a)).reason,
    'private_reward_plan_read_unauthorized');
   assert.equal(await planCount(),2);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('15.7 reward catalog mirrors two existing AXE reward designs, no grants',()=>{
 const source=readFileSync(new URL('../../../src/components/game3d/axe/quests/AXEQuestFramework.js',
  import.meta.url),'utf8');
 assert.match(source,/id: 'axe_q_first_patrol'[\s\S]*?reward: \{ xp: 80, points: 1, contribution: 10, reputation: 5 \}/);
 assert.match(source,/id: 'axe_q_first_elite'[\s\S]*?reward: \{ xp: 140, points: 2, contribution: 20, reputation: 10 \}/);
 assert.deepEqual(PRIVATE_QUEST_REWARDS_157.axe_q_first_patrol,
  {xp:80,points:1,contribution:10,reputation:5,items:[],currency:0});
 assert.deepEqual(PRIVATE_QUEST_REWARDS_157.axe_q_first_elite,
  {xp:140,points:2,contribution:20,reputation:10,items:[],currency:0});
 const src=readFileSync(new URL('../privateQuestRewardPlan157.mjs',import.meta.url),'utf8');
 assert.match(src,/getPrivateQuestReward157/);
 assert.match(src,/verified_quest_turnin_missing/);
 assert.doesNotMatch(src,/awardXP\(|addGold\(|grantItem\(|grantQuestReward\(|localStorage|window\.|createServer\(/);
});
