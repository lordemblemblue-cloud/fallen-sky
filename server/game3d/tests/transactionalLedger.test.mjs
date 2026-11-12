// Combat Foundation 3.8 — real PostgreSQL integration source for isolated beta.
// DO NOT RUN until beta and only against an explicitly disposable staging DB.
// Requires manually applying sql/001_combat38_staging.sql beforehand.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPgCombatLedger} from '../transactionalLedger.mjs';

const url=process.env.GAME3D_TEST_PG_URL;
const beta=url?test:test.skip;
const final=duelId=>({
  duelId,epoch:'beta-epoch-1',kind:'settle',sequence:1,
  resultId:duelId+':beta-epoch-1:1',
  snapshot:{status:'finished',players:[]},
  checkpoint:{state:{status:'finished',actors:[]}},
});

beta('transactional leases fence rival workers and terminal staging survives restart',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:url,max:3});
  const id='test-3-8-'+randomUUID();
  const one=createPgCombatLedger({pool,ownerId:'worker-one-'+randomUUID()});
  const two=createPgCombatLedger({pool,ownerId:'worker-two-'+randomUUID()});
  try{
    await one.initialize();
    const a=await one.acquire(id,'beta-epoch-1');
    assert.ok(a?.fence);
    assert.equal(await two.acquire(id,'beta-epoch-1'),null);
    assert.equal(await one.renew(a),true);
    const report=final(id);
    await one.stage(report,a);
    await one.stage(report,a);
    assert.ok((await two.pending()).some(p=>p.resultId===report.resultId));
    await two.ack((await two.pending()).find(p=>p.resultId===report.resultId));
    assert.equal((await one.pending()).some(p=>p.resultId===report.resultId),false);
    assert.equal(await two.acquire(id,'beta-epoch-2'),null,
      'a settled duel ID is permanently fenced against reuse');
  }finally{
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[id]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[id]);
    await pool.end();
  }
});

beta('expired owner cannot renew or stage after fencing token changes',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:url,max:3});
  const id='test-3-8-'+randomUUID();
  const one=createPgCombatLedger({pool,ownerId:'worker-one-'+randomUUID()});
  const two=createPgCombatLedger({pool,ownerId:'worker-two-'+randomUUID()});
  try{
    const a=await one.acquire(id,'beta-epoch-1');
    // Test-only expiry simulation: never modify live combat leases manually.
    await pool.query(
      "UPDATE game3d_duel_lease SET expires_at=clock_timestamp()-interval '1 second' WHERE duel_id=$1",
      [id]);
    const b=await two.acquire(id,'beta-epoch-1');
    assert.ok(BigInt(b.fence)>BigInt(a.fence));
    assert.equal(await one.renew(a),false);
    await assert.rejects(()=>one.stage(final(id),a),/lease lost/);
    await two.stage(final(id),b);
    await two.ack(final(id));
  }finally{
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[id]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[id]);
    await pool.end();
  }
});
