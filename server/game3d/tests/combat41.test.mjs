// Combat Foundation 4.1: source-only contracts; tests deferred to beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateLedgerOnlyReceipt} from '../../../base44/shared/duelLedgerReceiptPolicy.mjs';
import {journalPayloadSHA256,journalPayloadFromDelivery}
  from '../../../base44/shared/duelJournalProof.mjs';
import {createPgCombatLedger} from '../transactionalLedger.mjs';

function sample(){
  const actors=[
    {id:'one',x:-3,z:0,hp:82,stamina:100,will:94},
    {id:'two',x:3,z:0,hp:76,stamina:89,will:100},
  ];
  const checkpoint={mapId:'wolfveil-v1',mapFingerprint:'a'.repeat(64),
    instanceId:'instance-cf41-abcdef',spawnPresetId:'wolfveil-south-approach-v1',
    worldOrigin:{x:0,z:-80},
    state:{status:'active',sequence:4,actors}};
  const snapshot={matchId:'cf41-test',status:'active',seq:4,
    mapId:checkpoint.mapId,mapFingerprint:checkpoint.mapFingerprint,
    instanceId:checkpoint.instanceId,spawnPresetId:checkpoint.spawnPresetId,
    players:actors.map(a=>({...a,maxHp:100}))};
  const delivery={duelId:'cf41-test',epoch:'cf41-epoch',kind:'checkpoint',
    ledgerOnly:true,sequence:1,snapshot,checkpoint};
  const duel={id:'cf41-test',status:'active',dedicated_mode:'dedicated',
    dedicated_epoch:'cf41-epoch',challenger_id:'one',opponent_id:'two',
    dedicated_checkpoint:checkpoint};
  return {duel,delivery};
}
test('stable digest strips delivery clock and is independent of object key order',async()=>{
  const {delivery}=sample();
  const digest=await journalPayloadSHA256(delivery);
  assert.match(digest,/^[a-f0-9]{64}$/);
  assert.equal(await journalPayloadSHA256(journalPayloadFromDelivery(
    {...delivery,at:1793570000000})),digest);
  const reversed=Object.fromEntries(Object.entries(delivery).reverse());
  assert.equal(await journalPayloadSHA256(reversed),digest);
});
test('Base44 refuses mismatched committed row, wrong duel binding and forged HP',async()=>{
  const {duel,delivery}=sample();
  const payloadDigest=await journalPayloadSHA256(delivery);
  const proof={success:true,duelId:delivery.duelId,epoch:delivery.epoch,
    sequence:delivery.sequence,simulationSequence:delivery.snapshot.seq,
    kind:'checkpoint',resultId:null,fence:'12',payloadDigest};
  const args={duel,delivery,proof,payloadDigest};
  assert.equal(validateLedgerOnlyReceipt(args).ok,true);
  assert.equal(validateLedgerOnlyReceipt({...args,
    proof:{...proof,payloadDigest:'b'.repeat(64)}}).reason,
    'journal_proof_mismatch');
  assert.equal(validateLedgerOnlyReceipt({...args,
    delivery:{...delivery,epoch:'wrong-epoch'}}).reason,
    'invalid_dedicated_delivery');
  assert.equal(validateLedgerOnlyReceipt({...args,
    delivery:{...delivery,snapshot:{...delivery.snapshot,
      players:[{...delivery.snapshot.players[0],hp:999},delivery.snapshot.players[1]]}}})
    .reason,'invalid_actor_state');
  assert.equal(validateLedgerOnlyReceipt({...args,
    delivery:{...delivery,checkpoint:{...delivery.checkpoint,
      mapFingerprint:'changed'}}}).reason,'immutable_binding_mismatch');
});

const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('ledger-only delivery acknowledgment never marks Base44 as projected',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const id='cf41-'+randomUUID(),epoch='cf41-epoch';
  const ledger=createPgCombatLedger({pool,ownerId:'cf41-worker-'+randomUUID(),
    journalEnabled:true,ledgerOnlyEnabled:true});
  const {delivery}=sample();
  const payload={...delivery,duelId:id,epoch,
    snapshot:{...delivery.snapshot,matchId:id}};
  try{
    await ledger.initialize();
    const lease=await ledger.acquire(id,epoch);
    assert.ok(lease);
    await ledger.recordReport(payload,lease);
    const proof=await ledger.proveReport(id,1);
    assert.equal(proof.payloadDigest,await journalPayloadSHA256(payload));
    assert.equal(proof.fence,lease.fence);
    await assert.rejects(()=>ledger.ackReport(payload),/Mismatched/);
    await ledger.ackReport(payload,{mode:'journal-only'});
    const view=await ledger.readLatest(id);
    assert.equal(view.authoritative,true);
    assert.equal(view.deliveryAcknowledged,true);
    assert.equal(view.deliveryMode,'journal-only');
    assert.equal(view.projectionAcknowledged,false);
    await assert.rejects(()=>ledger.ackReport(payload,
      {mode:'base44-projection'}),/Mismatched/);
  }finally{
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[id]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[id]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[id]);
    await pool.end();
  }
});
