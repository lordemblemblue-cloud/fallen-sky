// Source-only Combat Foundation 4.0 contracts. Do not execute until beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {signedCombatReadInput,verifyCombatRead} from '../authoritativeRead.mjs';
import {createPgCombatLedger} from '../transactionalLedger.mjs';

const secret='a-private-32-character-or-longer-beta-test-key';
test('server-only combat read requires matching path, timestamp, and signature',()=>{
  const path='/internal/game3d/duel-state?duelId=duel-40';
  const now=1793570000000;
  const at=String(now);
  const sign=url=>createHmac('sha256',secret)
    .update(signedCombatReadInput(at,url)).digest('hex');
  const req={url:path,headers:{
    'x-game3d-read-time':at,
    'x-game3d-read-signature':sign(path),
  }};
  assert.equal(verifyCombatRead(req,secret,{now:()=>now}),true);
  assert.equal(verifyCombatRead({...req,url:path+'-forged'},secret,
    {now:()=>now}),false);
  assert.equal(verifyCombatRead(req,secret,{now:()=>now+30001}),false);
  assert.equal(verifyCombatRead({...req,headers:{...req.headers,
    'x-game3d-read-signature':'0'.repeat(64)}},secret,{now:()=>now}),false);
});
const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('committed read is immutable across subsequent asynchronous Base44 projection',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const duelId='cf40-'+randomUUID(),epoch='cf40-epoch';
  const ledger=createPgCombatLedger({pool,ownerId:'cf40-'+randomUUID(),
    journalEnabled:true});
  const actors=[{id:'a',x:0,z:0,hp:90,stamina:100,will:98},
    {id:'b',x:3,z:0,hp:75,stamina:88,will:70}];
  const payload={duelId,epoch,kind:'checkpoint',sequence:1,
    snapshot:{matchId:duelId,seq:3,status:'active',
      players:actors.map(a=>({...a,maxHp:100}))},
    checkpoint:{state:{status:'active',sequence:3,actors}},
  };
  try{
    await ledger.initialize();
    const lease=await ledger.acquire(duelId,epoch);
    await ledger.recordReport(payload,lease);
    const view=await ledger.readLatest(duelId);
    assert.equal(view.authoritative,true);
    assert.equal(view.snapshot.players[0].hp,90);
    assert.equal(view.projectionAcknowledged,false);
    assert.equal(view.reportSequence,1);
    await ledger.ackReport(payload);
    assert.equal((await ledger.readLatest(duelId)).projectionAcknowledged,true);
    assert.equal(await ledger.readLatest('nonexistent-'+randomUUID()),null);
  }finally{
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[duelId]);
    await pool.end();
  }
});
