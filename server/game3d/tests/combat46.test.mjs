// Combat Foundation 4.6. Source-only contracts; execution deferred to beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {evaluateDedicatedAdmission}
  from '../../../base44/shared/duelAdmissionPreflight.mjs';
import {createPgCombatLedger} from '../transactionalLedger.mjs';

const duel={id:'cf46-duel',dedicated_mode:'dedicated',status:'active',
  dedicated_epoch:'epoch-cf46'};
const proof=(status,other={})=>({authoritative:true,duelId:duel.id,
  status,...other});
test('preflight accepts first admission and current matching journal epoch',()=>{
  assert.equal(evaluateDedicatedAdmission({duel,preflight:proof('absent')}).ok,true);
  assert.equal(evaluateDedicatedAdmission({duel,preflight:proof('active',{
    epoch:duel.dedicated_epoch,reportSequence:3,
  })}).ok,true);
});
test('archived PostgreSQL terminal always denies new combat tickets',()=>{
  const result=evaluateDedicatedAdmission({duel,preflight:proof('archived',{
    epoch:duel.dedicated_epoch,resultId:'cf46-final-1',
    reportSequence:8,rewardsIssued:false,
  })});
  assert.equal(result.ok,false);
  assert.equal(result.code,'dedicated_match_archived');
});
test('fail closed on unavailable authority, bad epoch and malformed archive',()=>{
  assert.equal(evaluateDedicatedAdmission({duel,preflight:null}).ok,false);
  assert.equal(evaluateDedicatedAdmission({duel,preflight:proof('active',{
    epoch:'prior-owner',reportSequence:1,
  })}).ok,false);
  assert.equal(evaluateDedicatedAdmission({duel,preflight:proof('archived',{
    epoch:duel.dedicated_epoch,resultId:'cf46-final-1',
    reportSequence:8,rewardsIssued:true,
  })}).ok,false);
  assert.equal(evaluateDedicatedAdmission({duel,preflight:proof('unknown')}).ok,false);
  assert.equal(evaluateDedicatedAdmission({duel:{...duel,status:'finished'},
    preflight:proof('absent')}).ok,false);
});
const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('PostgreSQL preflight is absent, active, then permanently archived',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const duelId='cf46-'+randomUUID(),epoch='epoch-cf46';
  const ledger=createPgCombatLedger({
    pool,ownerId:'worker-'+randomUUID(),journalEnabled:true,
    ledgerOnlyEnabled:true,lifecycleArchiveEnabled:true,
    rewardReviewEnabled:true,
  });
  const players=[{id:'one',hp:64,maxHp:100},{id:'two',hp:0,maxHp:100}];
  const report={duelId,epoch,ledgerOnly:true,kind:'settle',
    sequence:1,resultId:duelId+':terminal-1',
    snapshot:{matchId:duelId,status:'finished',seq:9,
      winnerId:'one',finishReason:'knockout',players},
    checkpoint:{state:{status:'finished',sequence:9,
      actors:players.map(p=>({id:p.id,hp:p.hp}))}},
  };
  try{
    await ledger.initialize();
    assert.equal((await ledger.inspectAdmission(duelId)).status,'absent');
    const owner=await ledger.acquire(duelId,epoch);
    assert.equal((await ledger.inspectAdmission(duelId)).status,'active');
    await ledger.recordReport(report,owner);
    const archive=await ledger.inspectAdmission(duelId);
    assert.equal(archive.status,'archived');
    assert.equal(archive.resultId,report.resultId);
    assert.equal(archive.rewardsIssued,false);
    await ledger.ackReport(report,{mode:'journal-only'});
    assert.equal((await ledger.inspectAdmission(duelId)).status,'archived');
    assert.equal(await ledger.acquire(duelId,epoch),null);
  }finally{
    await pool.query('DELETE FROM game3d_duel_reward_review WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lifecycle_archive WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[duelId]);
    await pool.end();
  }
});
