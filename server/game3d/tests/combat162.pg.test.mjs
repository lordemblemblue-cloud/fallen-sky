// Game 3D 16.2 — actual throwaway PostgreSQL transactions, NEVER live data.
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
import {createGame3DPrivateContributionLedger162}
 from '../privateContributionLedger162.mjs';

const pgURL=process.env.GAME3D_162_DISPOSABLE_PG_URL;
const a={ownerId:'owner162',characterId:'hero162'};
const b={ownerId:'owner162b',characterId:'hero162b'};
let seq=0;
const approvedOps=new Set([
 'accept_private_server_quest','project_committed_quest_kill',
 'turn_in_private_server_quest','plan_verified_private_quest_reward',
 'settle_verified_private_quest_xp','review_private_quest_nonxp',
 'credit_verified_quest_contribution','spend_private_contribution',
 'refund_private_contribution','read_private_contribution',
]);
const auth=async({operation,ownerId,characterId})=>
 ownerId===a.ownerId&&characterId===a.characterId&&approvedOps.has(operation);
const spend=(spendId,amount)=>({spendId,approved:true,amount});
const makeReceipt=async(pool,tier='normal')=>{
 const id='receipt-162-'+(++seq);
 await pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
 map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
 server_kill_committed)
 VALUES($1,$2,$3,'world-162','epoch-162',$4,$5,$6,$7,
 'server-committed-private-pve-kill',true)`,
 [id,a.ownerId,a.characterId,'c'.repeat(64),seq,'enemy_'+seq,tier]);
 return id;
};
test('16.2 trusted Contribution Points: PostgreSQL quest credit, spend, refund',
 {skip:!pgURL,timeout:120000},async t=>{
 const {default:pg}=await import('pg');
 const schema='g3d_cp_162_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgURL,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:pgURL,max:16,
   options:'-c search_path='+schema});
  await pool.query(await readAsync(new URL(
   '../sql/008_combat50_verified_event_provenance.sql',import.meta.url),'utf8'));
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'immutable private journal'; END;$$`);
  for(const file of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql',
   '037_combat156_private_quest_turnin.sql',
   '038_combat157_private_reward_plans.sql',
   '039_combat158_private_quest_xp_settlement.sql',
   '040_combat159_private_nonxp_reward_review.sql',
   '041_combat161_private_stat_allocations.sql',
   '042_combat162_private_contribution_ledger.sql'
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
  const plan=createGame3DPrivateQuestRewardPlan157({
   pool,authorizeServerOperation:auth});
  const xp=createGame3DPrivateQuestXPSettlement158({
   pool,authorizeServerOperation:auth});
  const review=createGame3DPrivateQuestNonXPReview159({
   pool,authorizeServerOperation:auth});
  const invoices=new Map([
   ['spend-162-early',spend('spend-162-early',1)],
   ['spend-162-seven',spend('spend-162-seven',7)],
   ['spend-162-a',spend('spend-162-a',18)],
   ['spend-162-b',spend('spend-162-b',18)],
   ['spend-162-rollback',spend('spend-162-rollback',1)],
  ]);
  const approvedRefunds=new Set(['refund-162-seven','refund-162-repeat',
   'refund-162-rollback']);
  const contribution=createGame3DPrivateContributionLedger162({
   pool,authorizeServerOperation:auth,
   resolveApprovedSpend:async({spendId})=>invoices.get(spendId),
   verifyApprovedRefund:async({refundId})=>approvedRefunds.has(refundId)
  });
  const count=async table=>Number((await pool.query(
   'SELECT COUNT(*)::int AS n FROM '+table)).rows[0].n);
  const defeat=async(tier='normal')=>ledger.project({
   ...a,receiptId:await makeReceipt(pool,tier)});
  const complete=async questId=>{
   assert.equal((await turnin.turnIn({...a,questId})).ok,true);
   assert.equal((await plan.plan({...a,questId})).ok,true);
   assert.equal((await xp.settleXP({...a,questId})).ok,true);
   assert.equal((await review.review({...a,questId})).ok,true);
  };
  const wallet=async()=>{
   const r=await contribution.readAccount(a);
   assert.equal(r.ok,true,JSON.stringify(r));
   return r;
  };
  await t.test('private account starts at zero; no automatic legacy 10,000 CP',async()=>{
   const r=await wallet();
   assert.equal(r.balance,0);
   assert.equal(r.lifetimeEarned,0);
   assert.equal(r.legacyBalanceImported,false);
   assert.equal(r.legacyMigrationStatus,'unreconciled');
   assert.equal(contribution.legacyStartingCPAutoGranted,false);
   assert.equal((await contribution.spend({...a,spendId:'spend-162-early'})).reason,
    'insufficient_private_contribution_balance');
   assert.equal(await count('game3d_private_contribution_account_162'),0);
  });
  await t.test('unknown/foreign quest cannot credit; no XP/quest completion yet',async()=>{
   assert.equal((await contribution.creditQuest({...b,
    questId:'axe_q_first_patrol'})).reason,
    'private_contribution_credit_unauthorized');
   assert.equal((await contribution.creditQuest({...a,
    questId:'fake_quest_162'})).reason,
    'private_contribution_transaction_failed');
   assert.equal((await contribution.creditQuest({...a,
    questId:'axe_q_first_patrol'})).reason,
    'private_contribution_transaction_failed');
   assert.equal(await count('game3d_private_contribution_event_162'),0);
   assert.equal((await contribution.readAccount(b)).reason,
    'private_contribution_read_unauthorized');
  });
  await t.test('completed patrol grants exactly 10 private CP, once',async()=>{
   assert.equal((await accept.accept({...a,questId:'axe_q_first_patrol'})).ok,true);
   for(let i=0;i<3;i++)assert.equal((await defeat()).ok,true);
   await complete('axe_q_first_patrol');
   const r=await contribution.creditQuest({...a,questId:'axe_q_first_patrol',
    amount:999999,cp:999999});
   assert.equal(r.ok,true);
   assert.equal(r.posted,true);
   assert.equal(r.balance,10);
   assert.equal(r.lifetimeEarned,10);
   assert.equal(r.legacyBalanceImported,false);
   const replay=await contribution.creditQuest({...a,questId:'axe_q_first_patrol'});
   assert.equal(replay.ok,true);
   assert.equal(replay.alreadyPosted,true);
   assert.equal(replay.posted,false);
   assert.equal((await wallet()).balance,10);
   assert.equal(await count('game3d_private_contribution_event_162'),1);
  });
  await t.test('approved spend cannot use browser amount, and ID is exactly once',async()=>{
   const r=await contribution.spend({...a,spendId:'spend-162-seven',amount:1});
   assert.equal(r.ok,true);
   assert.equal(r.amount,7);
   assert.equal(r.balance,3);
   assert.equal(r.lifetimeSpent,7);
   const retry=await contribution.spend({...a,spendId:'spend-162-seven'});
   assert.equal(retry.alreadyPosted,true);
   assert.equal(retry.balance,3);
   invoices.set('spend-162-seven',spend('spend-162-seven',8));
   assert.equal((await contribution.spend({...a,spendId:'spend-162-seven'})).reason,
    'conflicting_contribution_operation_replay');
   invoices.set('spend-162-seven',spend('spend-162-seven',7));
   assert.equal((await wallet()).balance,3);
  });
  await t.test('only authorized full refund of original spend; double refund rejected',async()=>{
   assert.equal((await contribution.refund({...a,
    refundId:'refund-162-unapproved',spendId:'spend-162-seven'})).reason,
    'trusted_refund_not_approved');
   assert.equal((await contribution.refund({...a,refundId:'refund-162-seven',
    spendId:'spend-162-seven',amount:99999})).balance,10);
   assert.equal((await contribution.refund({...a,refundId:'refund-162-seven',
    spendId:'spend-162-seven'})).alreadyPosted,true);
   assert.equal((await contribution.refund({...a,refundId:'refund-162-repeat',
    spendId:'spend-162-seven'})).reason,
    'invalid_private_contribution_refund');
   assert.equal((await wallet()).lifetimeRefunded,7);
   assert.equal((await wallet()).balance,10);
  });
  await t.test('second legitimate elite quest contributes 20 CP, no duplicated first quest',async()=>{
   assert.equal((await accept.accept({...a,questId:'axe_q_first_elite'})).ok,true);
   assert.equal((await defeat('normal')).credited.length,0);
   assert.equal((await defeat('elite')).credited.length,1);
   await complete('axe_q_first_elite');
   const r=await contribution.creditQuest({...a,questId:'axe_q_first_elite'});
   assert.equal(r.ok,true);
   assert.equal(r.amount,20);
   assert.equal(r.balance,30);
   assert.equal((await contribution.creditQuest({...a,
    questId:'axe_q_first_patrol'})).alreadyPosted,true);
   assert.equal((await wallet()).lifetimeEarned,30);
  });
  await t.test('parallel approved spends cannot overspend balance',async()=>{
   const result=await Promise.all([
    contribution.spend({...a,spendId:'spend-162-a'}),
    contribution.spend({...a,spendId:'spend-162-b'})
   ]);
   assert.equal(result.filter(r=>r.posted).length,1);
   assert.equal(result.filter(r=>r.reason==='insufficient_private_contribution_balance').length,1);
   assert.equal((await wallet()).balance,12);
   assert.equal((await wallet()).lifetimeSpent,25);
  });
  await t.test('wallet DB update failure rolls back new spending event',async()=>{
   await pool.query(`CREATE FUNCTION game3d_162_test_fail_account_update()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'test rollback'; END;$$`);
   await pool.query(`CREATE TRIGGER cp_162_fixture_failure
    BEFORE UPDATE OF revision ON game3d_private_contribution_account_162
    FOR EACH ROW EXECUTE FUNCTION game3d_162_test_fail_account_update()`);
   const before=await count('game3d_private_contribution_event_162');
   assert.equal((await contribution.spend({...a,
    spendId:'spend-162-rollback'})).reason,
    'private_contribution_transaction_failed');
   assert.equal(await count('game3d_private_contribution_event_162'),before);
   assert.equal((await wallet()).balance,12);
   await pool.query(`DROP TRIGGER cp_162_fixture_failure
    ON game3d_private_contribution_account_162`);
  });
  await t.test('append-only journal and computed-balance audit reject tampering',async()=>{
   await assert.rejects(pool.query(`
    UPDATE game3d_private_contribution_event_162 SET amount=999`));
   await assert.rejects(pool.query(`
    DELETE FROM game3d_private_contribution_event_162`));
   await pool.query(`
    UPDATE game3d_private_contribution_account_162
    SET balance=balance+1,lifetime_earned=lifetime_earned+1
    WHERE owner_id=$1 AND character_id=$2`,[a.ownerId,a.characterId]);
   assert.equal((await contribution.readAccount(a)).reason,
    'private_contribution_read_failed');
   await pool.query(`
    UPDATE game3d_private_contribution_account_162
    SET balance=balance-1,lifetime_earned=lifetime_earned-1
    WHERE owner_id=$1 AND character_id=$2`,[a.ownerId,a.characterId]);
   assert.equal((await wallet()).balance,12);
  });
  await t.test('missing spend/refund approvals and false operator are fail-closed',async()=>{
   const noInvoice=createGame3DPrivateContributionLedger162({
    pool,authorizeServerOperation:auth});
   assert.equal((await noInvoice.spend({...a,spendId:'spend-162-noapproval'})).reason,
    'trusted_spend_source_not_installed');
   assert.equal((await noInvoice.refund({...a,refundId:'refund-162-missing',
    spendId:'spend-162-a'})).reason,
    'trusted_refund_source_not_installed');
   const denied=createGame3DPrivateContributionLedger162({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await denied.creditQuest({...a,
    questId:'axe_q_first_patrol'})).reason,
    'private_contribution_credit_unauthorized');
   assert.equal((await denied.readAccount(a)).reason,
    'private_contribution_read_unauthorized');
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});
test('16.2 does not auto-import browser starting 10,000 or expose public wallet',()=>{
 const src=readFileSync(new URL('../privateContributionLedger162.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../../../src/components/game3d/progression/contributionStore.jsx',
  import.meta.url),'utf8');
 assert.match(ui,/const STARTING_CP = 10000/);
 assert.match(src,/legacyStartingCPAutoGranted:false/);
 assert.match(src,/verifiedQuest/);
 assert.doesNotMatch(src,/localStorage|window\.|setContribution\(|addContribution\(|getContributionState\(|createServer\(/);
});
