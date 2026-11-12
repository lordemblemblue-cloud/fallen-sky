// Source-only Combat Foundation 4.3 tests. Do not execute until beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTerminalLifecycleArchive,verifyStoredLifecycle}
  from '../lifecycleArchive.mjs';
import {validateCommittedDuelArchive}
  from '../../../base44/shared/duelArchiveProjection.mjs';
import {createPgCombatLedger} from '../transactionalLedger.mjs';

const sample=(duelId='duel-43')=>{
  const players=[{id:'alpha',hp:76,maxHp:100},{id:'bravo',hp:0,maxHp:100}];
  return {duelId,epoch:'epoch-43',ledgerOnly:true,
    kind:'settle',sequence:1,resultId:duelId+':epoch-43:7',
    snapshot:{matchId:duelId,seq:7,status:'finished',winnerId:'alpha',
      finishReason:'knockout',players},
    checkpoint:{state:{status:'finished',sequence:7,
      actors:players.map(p=>({id:p.id,hp:p.hp}))}},
  };
};
test('terminal lifecycle includes one immutable result with rewards forbidden',()=>{
  const p=sample(),a=createTerminalLifecycleArchive(p);
  assert.equal(a.winnerId,'alpha');
  assert.equal(a.loserId,'bravo');
  assert.equal(a.rewardEligibility,'unverified_account');
  assert.equal(a.rewardsIssued,false);
  const row={duel_id:a.duelId,epoch:a.epoch,result_id:a.resultId,
    report_sequence:a.reportSequence,simulation_sequence:a.simulationSequence,
    player_a_id:a.playerAId,player_b_id:a.playerBId,
    winner_id:a.winnerId,loser_id:a.loserId,finish_reason:a.finishReason,
    outcome:a.outcome,reward_eligibility:'unverified_account',rewards_issued:false};
  assert.equal(verifyStoredLifecycle(row,p),true);
  assert.equal(verifyStoredLifecycle({...row,result_id:'altered'},p),false);
  assert.throws(()=>createTerminalLifecycleArchive({...p,
    snapshot:{...p.snapshot,winnerId:'stranger'}}),/winner/);
});
test('authenticated archive check rejects forged winner and stale sequence',()=>{
  const p=sample(),a=createTerminalLifecycleArchive(p);
  const archive={status:'archived',duelId:p.duelId,epoch:p.epoch,
    resultId:p.resultId,reportSequence:1,simulationSequence:7,
    players:['alpha','bravo'],winnerId:a.winnerId,loserId:a.loserId,
    draw:false,finishReason:'knockout',
    rewardEligibility:'unverified_account',
    rewardsEligible:false,rewardsIssued:false};
  const duel={id:p.duelId,dedicated_mode:'dedicated',dedicated_epoch:p.epoch,
    challenger_id:'alpha',opponent_id:'bravo'};
  const args={archive,duel,snapshot:p.snapshot,epoch:p.epoch,
    resultId:p.resultId,reportSequence:1,simulationSequence:7};
  assert.equal(validateCommittedDuelArchive(args).ok,true);
  assert.equal(validateCommittedDuelArchive({...args,
    archive:{...archive,winnerId:'bravo'}}).ok,false);
  assert.equal(validateCommittedDuelArchive({...args,
    archive:{...archive,rewardsIssued:true}}).ok,false);
  assert.equal(validateCommittedDuelArchive({...args,reportSequence:2}).ok,false);
});
const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('committed PG terminal, journal and archive are atomic and unique',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const duelId='cf43-'+randomUUID(),p=sample(duelId);
  const ledger=createPgCombatLedger({pool,ownerId:'cf43-'+randomUUID(),
    journalEnabled:true,ledgerOnlyEnabled:true,lifecycleArchiveEnabled:true});
  try{
    await ledger.initialize();
    const lease=await ledger.acquire(duelId,p.epoch);
    assert.ok(lease);
    await ledger.recordReport(p,lease);
    await ledger.recordReport(p,lease);
    const view=await ledger.readLatest(duelId);
    assert.equal(view.settled,true);
    assert.equal(view.lifecycleArchive.winnerId,'alpha');
    assert.equal(view.lifecycleArchive.rewardEligibility,'unverified_account');
    assert.equal(view.lifecycleArchive.rewardsIssued,false);
    assert.equal(await ledger.acquire(duelId,p.epoch),null);
    await assert.rejects(()=>ledger.recordReport({...p,
      resultId:'different'},lease),/Conflicting/);
    await ledger.ackReport(p,{mode:'journal-only'});
    assert.equal((await ledger.readLatest(duelId)).deliveryAcknowledged,true);
  }finally{
    await pool.query('DELETE FROM game3d_duel_lifecycle_archive WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[duelId]);
    await pool.end();
  }
});
