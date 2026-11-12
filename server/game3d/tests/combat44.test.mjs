// Combat Foundation 4.4 source-only verification cases.
// Do not run until isolated beta, including disposable PostgreSQL tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildRewardReview,verifyRewardReviewRow,BLOCKERS} from '../rewardEvidence.mjs';
import {createPgCombatLedger} from '../transactionalLedger.mjs';
import {createTerminalLifecycleArchive} from '../lifecycleArchive.mjs';

const terminal=(duelId='cf44-test')=>{
  const players=[{id:'player-a',hp:80,maxHp:100},
    {id:'player-b',hp:0,maxHp:100}];
  return {duelId,epoch:'cf44-epoch',ledgerOnly:true,
    sequence:1,kind:'settle',resultId:duelId+':terminal:1',
    snapshot:{matchId:duelId,seq:9,status:'finished',
      winnerId:'player-a',finishReason:'knockout',players},
    checkpoint:{state:{sequence:9,status:'finished',
      actors:players.map(x=>({id:x.id,hp:x.hp}))}},
  };
};
test('archived outcome proof does not make combat rewards eligible',()=>{
  const archive=createTerminalLifecycleArchive(terminal());
  const result=buildRewardReview(archive);
  assert.equal(result.outcomeVerified,true);
  assert.equal(result.eligible,false);
  assert.equal(result.rewardsIssued,false);
  assert.deepEqual(result.blockers,BLOCKERS);
  assert.equal(verifyRewardReviewRow({
    duel_id:archive.duelId,result_id:archive.resultId,
    review_status:'blocked_account_unverified',
    account_stats_verified:false,loadout_verified:false,
    ranked_policy_verified:false,eligible:false,rewards_issued:false,
  },archive),true);
  assert.equal(verifyRewardReviewRow({
    duel_id:archive.duelId,result_id:archive.resultId,
    review_status:'blocked_account_unverified',
    account_stats_verified:false,loadout_verified:false,
    ranked_policy_verified:false,eligible:true,rewards_issued:false,
  },archive),false);
  assert.throws(()=>buildRewardReview({...archive,rewardsIssued:true}),
    /Invalid archived result/);
});
const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('transactional unique review and participant history survive duplicates',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const duelId='cf44-'+randomUUID();
  const payload=terminal(duelId);
  const ledger=createPgCombatLedger({pool,ownerId:'cf44-worker-'+randomUUID(),
    journalEnabled:true,ledgerOnlyEnabled:true,
    lifecycleArchiveEnabled:true,rewardReviewEnabled:true});
  try{
    await ledger.initialize();
    const lease=await ledger.acquire(duelId,payload.epoch);
    assert.ok(lease);
    await ledger.recordReport(payload,lease);
    await ledger.recordReport(payload,lease);
    const found=await ledger.listArchivedForPlayer('player-a',25);
    const item=found.find(x=>x.duelId===duelId);
    assert.equal(item.personalOutcome,'win');
    assert.equal(item.opponentId,'player-b');
    assert.equal(item.rewardReview.eligible,false);
    assert.equal(item.rewardReview.rewardsIssued,false);
    const lost=(await ledger.listArchivedForPlayer('player-b',25))
      .find(x=>x.duelId===duelId);
    assert.equal(lost.personalOutcome,'loss');
    assert.equal(lost.opponentId,'player-a');
    assert.equal((await ledger.listArchivedForPlayer('outsider',25))
      .some(x=>x.duelId===duelId),false);
    const view=await ledger.readLatest(duelId);
    assert.equal(view.rewardReview.outcomeVerified,true);
    assert.equal(view.rewardReview.eligible,false);
    assert.equal((await pool.query(
      'SELECT COUNT(*)::int AS total FROM game3d_duel_reward_review WHERE duel_id=$1',
      [duelId])).rows[0].total,1);
    await ledger.ackReport(payload,{mode:'journal-only'});
    assert.equal((await ledger.readLatest(duelId)).deliveryAcknowledged,true);
  }finally{
    await pool.query('DELETE FROM game3d_duel_reward_review WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lifecycle_archive WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[duelId]);
    await pool.end();
  }
});
