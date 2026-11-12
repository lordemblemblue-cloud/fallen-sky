// Combat Foundation 3.9 — source-only integration tests for disposable beta DB.
// Requires both sql/001 and sql/002 migration; never run before beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPgCombatLedger} from '../transactionalLedger.mjs';

const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
const make=(duelId,sequence,simulationSequence,kind='checkpoint')=>{
  const status=kind==='settle'?'finished':'active';
  const actors=[
    {id:'user-a',x:-3,z:0,hp:85,stamina:95,will:87},
    {id:'user-b',x:3,z:0,hp:90,stamina:100,will:93},
  ];
  const snapshot={matchId:duelId,seq:simulationSequence,status,
    players:actors.map(a=>({...a,maxHp:100})),
    mapId:'wolfveil-v1',instanceId:'journal-3-9-instance'};
  const checkpoint={mapId:'wolfveil-v1',instanceId:'journal-3-9-instance',
    worldOrigin:{x:0,z:-80},state:{status,sequence:simulationSequence,actors}};
  return {duelId,epoch:'epoch-journal-39',kind,sequence,snapshot,checkpoint,
    ...(kind==='settle'?{resultId:duelId+':journal:finish'}:{})};
};

beta('transaction journal saves checkpoint and detects duplicate/divergent replay',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const id='beta39-'+randomUUID();
  const ledger=createPgCombatLedger({pool,ownerId:'beta-journal-'+randomUUID(),
    journalEnabled:true});
  try{
    await ledger.initialize();
    const lease=await ledger.acquire(id,'epoch-journal-39');
    assert.ok(lease);
    const first=make(id,1,5);
    await ledger.recordReport(first,lease);
    assert.equal((await ledger.restoreReport(lease)).acked,false);
    await ledger.recordReport(first,lease);
    await assert.rejects(()=>ledger.recordReport({...first,
      snapshot:{...first.snapshot,seq:6},
      checkpoint:{...first.checkpoint,state:{...first.checkpoint.state,sequence:6}}
    },lease),/Conflicting same-sequence/);
    await assert.rejects(()=>ledger.recordReport(make(id,2,6),lease),
      /Previous journal report not acknowledged/);
    await ledger.ackReport(first);
    assert.equal((await ledger.restoreReport(lease)).acked,true);
    await assert.rejects(()=>ledger.recordReport(make(id,2,4),lease),
      /Journal combat state moved backward/);
    const second=make(id,2,6);
    await ledger.recordReport(second,lease);
    await ledger.ackReport(second);
    const finish=make(id,3,7,'settle');
    await ledger.recordReport(finish,lease);
    assert.equal((await ledger.pending()).some(p=>p.resultId===finish.resultId),true);
    await ledger.ackReport(finish);
    assert.equal((await ledger.pending()).some(p=>p.resultId===finish.resultId),false);
    assert.equal(await ledger.acquire(id,'epoch-journal-39'),null);
  }finally{
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[id]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[id]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[id]);
    await pool.end();
  }
});

beta('expired worker cannot commit; the new owner restores last committed checkpoint',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const id='beta39-'+randomUUID();
  const first=createPgCombatLedger({pool,ownerId:'beta-owner-one-'+randomUUID(),
    journalEnabled:true});
  const next=createPgCombatLedger({pool,ownerId:'beta-owner-two-'+randomUUID(),
    journalEnabled:true});
  try{
    const old=await first.acquire(id,'epoch-journal-39');
    const checkpoint=make(id,1,2);
    await first.recordReport(checkpoint,old);
    await first.ackReport(checkpoint);
    await pool.query(
      "UPDATE game3d_duel_lease SET expires_at=clock_timestamp()-interval '1 second' WHERE duel_id=$1",
      [id]);
    const current=await next.acquire(id,'epoch-journal-39');
    assert.ok(BigInt(current.fence)>BigInt(old.fence));
    assert.equal((await next.restoreReport(current)).payload.snapshot.seq,2);
    await assert.rejects(()=>first.recordReport(make(id,2,3),old),/lease lost/);
    const second=make(id,2,3);
    await next.recordReport(second,current);
    assert.equal((await next.restoreReport(current)).acked,false);
  }finally{
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[id]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[id]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[id]);
    await pool.end();
  }
});
