// 15.8 — real disposable PostgreSQL, no live player database.
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
import {createPgTrustedCharacterLedger}
 from '../trustedCharacterLedger.mjs';

const pgUrl=process.env.GAME3D_158_DISPOSABLE_PG_URL;
const a={ownerId:'owner158',characterId:'hero158'};
const b={ownerId:'owner158b',characterId:'hero158b'};
let seq=0;
const auth=async({operation,ownerId,characterId})=>
 ownerId===a.ownerId&&characterId===a.characterId&&[
 'accept_private_server_quest','read_private_server_quests',
 'project_committed_quest_kill','read_committed_quest_progress',
 'turn_in_private_server_quest','read_private_quest_turnins',
 'plan_verified_private_quest_reward','read_private_quest_reward_plans',
 'settle_verified_private_quest_xp','read_private_quest_xp_settlements'
 ].includes(operation);
async function insertReceipt(pool,tier='normal'){
 const id='receipt-158-'+(++seq);
 await pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq,enemy_id,enemy_tier,
  source_kind,server_kill_committed)
 VALUES($1,$2,$3,'world-158','epoch-158',$4,$5,$6,$7,
  'server-committed-private-pve-kill',true)`,
 [id,a.ownerId,a.characterId,'d'.repeat(64),seq,'enemy_'+seq,tier]);
 return id;
}
test('15.8 private XP settlement uses canonical trusted event/character ledger',
 {skip:!pgUrl,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_xp_158_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgUrl,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:pgUrl,max:12,
   options:'-c search_path='+schema});
  // Use actual canonical 5.0 character/event/item schemas, plus 15.2-15.8.
  for(const file of [
   '008_combat50_verified_event_provenance.sql',
  ])await pool.query(await readAsync(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'append only'; END;$$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '038_combat157_private_reward_plans.sql',
   '039_combat158_private_quest_xp_settlement.sql',
  ])await pool.query(await readAsync(
   new URL('../sql/'+file,import.meta.url),'utf8'));
  await pool.query(`INSERT INTO game3d_trusted_character
    (owner_id,character_id) VALUES($1,$2),($3,$4)`,
    [a.ownerId,a.characterId,b.ownerId,b.characterId]);
  const accepted=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:auth});
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:auth});
  const turnin=createGame3DPrivateQuestTurnIn156({
   pool,authorizeServerOperation:auth});
  const plans=createGame3DPrivateQuestRewardPlan157({
   pool,authorizeServerOperation:auth});
  const payout=createGame3DPrivateQuestXPSettlement158({
   pool,authorizeServerOperation:auth});
  const count=async table=>Number((await pool.query(
   'SELECT COUNT(*)::integer AS n FROM '+table
  )).rows[0].n);
  const state=async()=> (await pool.query(`
   SELECT xp_total::text AS xp,revision::text AS rev
   FROM game3d_trusted_character
   WHERE owner_id=$1 AND character_id=$2`,
   [a.ownerId,a.characterId])).rows[0];
  const defeat=async tier=>ledger.project({
   ...a,receiptId:await insertReceipt(pool,tier||'normal')});
  await t.test('no plan, wrong character or forged quest cannot grant XP',async()=>{
   assert.equal((await payout.settleXP({...a,questId:'fake_quest_158'})).reason,
    'quest_xp_not_in_server_catalog');
   assert.equal((await payout.settleXP({...b,questId:'axe_q_first_patrol'})).reason,
    'private_quest_xp_unauthorized');
   assert.equal((await payout.settleXP({...a,questId:'axe_q_first_patrol',
    xpAmount:9999999,items:['infinite'] })).reason,
    'verified_quest_reward_plan_missing_or_modified');
   assert.deepEqual(await state(),{xp:'0',rev:'0'});
   assert.equal(await count('game3d_trusted_grant_event'),0);
  });
  await t.test('credit and turn-in alone cannot pay XP without a 15.7 plan',async()=>{
   assert.equal((await accepted.accept({...a,questId:'axe_q_first_patrol'})).ok,true);
   for(let i=0;i<3;i++)assert.equal((await defeat('normal')).ok,true);
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_patrol'})).ok,true);
   assert.equal((await payout.settleXP({...a,questId:'axe_q_first_patrol'})).reason,
    'verified_quest_reward_plan_missing_or_modified');
   assert.deepEqual(await state(),{xp:'0',rev:'0'});
  });
  await t.test('concurrent settlement pays 80 XP exactly once, and uses canonical event digest',async()=>{
   assert.equal((await plans.plan({...a,questId:'axe_q_first_patrol'})).ok,true);
   const attempts=await Promise.all([
    payout.settleXP({...a,questId:'axe_q_first_patrol',
     xpAmount:99999999,reward:{xp:99999999}}),
    payout.settleXP({...a,questId:'axe_q_first_patrol'}),
    payout.settleXP({...a,questId:'axe_q_first_patrol'})
   ]);
   assert(attempts.every(x=>x.ok),JSON.stringify(attempts));
   assert.equal(attempts.filter(x=>x.xpApplied).length,1);
   assert.equal(attempts.filter(x=>x.alreadySettled).length,2);
   assert(attempts.every(x=>x.totalXP==='80'&&x.level===1));
   assert(attempts.every(x=>!x.pointsApplied&&!x.reputationApplied&&
     !x.contributionApplied&&!x.itemsIssued&&!x.currencyIssued));
   assert.deepEqual(await state(),{xp:'80',rev:'1'});
   assert.equal(await count('game3d_trusted_grant_event'),1);
   assert.equal(await count('game3d_private_quest_xp_settlement_158'),1);
   const canonical=createPgTrustedCharacterLedger({pool});
   const review=await canonical.readCharacter(a.ownerId,a.characterId);
   assert.equal(review.xpTotal,80);
   assert.equal(review.trustedEventCount,1);
   assert.equal(review.revision,1);
   assert.equal(review.rewardsIssued,false,'5.0 review does not certify other rewards');
  });
  await t.test('elite completion unlocks independent 140 XP payout once',async()=>{
   assert.equal((await accepted.accept({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await defeat('normal')).credited.length,0);
   assert.deepEqual((await defeat('elite')).credited.map(x=>x.questId),
    ['axe_q_first_elite']);
   assert.equal((await turnin.turnIn({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await plans.plan({...a,questId:'axe_q_first_elite'})).ok,true);
   const result=await payout.settleXP({...a,questId:'axe_q_first_elite'});
   assert.equal(result.ok,true);
   assert.equal(result.xpAmount,140);
   assert.equal(result.xpApplied,true);
   assert.equal(result.totalXP,'220');
   assert.equal(result.level,2,'existing level curve uses committed XP');
   assert.equal((await payout.settleXP({...a,questId:'axe_q_first_elite'})).xpApplied,false);
   assert.deepEqual(await state(),{xp:'220',rev:'2'});
   const rows=(await payout.readSettledXP(a)).settlements;
   assert.deepEqual(rows.map(x=>[x.questId,x.xpAmount]),
    [['axe_q_first_patrol',80],['axe_q_first_elite',140]]);
  });
  await t.test('immutable settlement cannot be modified or replayed as extra XP',async()=>{
   await assert.rejects(pool.query(`
    UPDATE game3d_private_quest_xp_settlement_158 SET xp_amount=9999`));
   await assert.rejects(pool.query(`
    DELETE FROM game3d_private_quest_xp_settlement_158`));
   await assert.rejects(pool.query(`
    UPDATE game3d_private_quest_xp_settlement_158
     SET points_credited=true`));
   assert.equal(await count('game3d_private_quest_xp_settlement_158'),2);
   assert.equal(await count('game3d_trusted_grant_event'),2);
   assert.deepEqual(await state(),{xp:'220',rev:'2'});
  });
  await t.test('plan/head mismatch cannot issue additional settlement and remains fail-closed',async()=>{
   await pool.query(`
    UPDATE game3d_private_quest_acceptance_154 SET status='abandoned'
    WHERE owner_id=$1 AND character_id=$2 AND quest_id='axe_q_first_elite'`,
    [a.ownerId,a.characterId]);
   assert.equal((await payout.settleXP({...a,questId:'axe_q_first_elite'})).reason,
    'verified_quest_reward_plan_missing_or_modified');
   assert.deepEqual(await state(),{xp:'220',rev:'2'});
  });
  await t.test('privileged authorizer deny blocks both read and attempted settlement',async()=>{
   const blocked=createGame3DPrivateQuestXPSettlement158({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await blocked.settleXP({...a,questId:'axe_q_first_patrol'})).reason,
    'private_quest_xp_unauthorized');
   assert.equal((await blocked.readSettledXP(a)).reason,
    'private_quest_xp_read_unauthorized');
   assert.deepEqual(await state(),{xp:'220',rev:'2'});
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('15.8 source has no browser, wallets or other reward writers',()=>{
 const source=readFileSync(new URL('../privateQuestXPSettlement158.mjs',import.meta.url),'utf8');
 assert.match(source,/validateTrustedGameEvent/);
 assert.match(source,/game3d_trusted_grant_event/);
 assert.match(source,/game3d_trusted_character/);
 assert.match(source,/game3d_private_quest_xp_settlement_158/);
 assert.doesNotMatch(source,/grantItem\(|addGold\(|createServer\(|window\.|localStorage/);
});
