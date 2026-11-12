// Combat Foundation 5.2 — source-only deferred beta contracts.
// DO NOT run until private beta, consistent with owner testing preference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createGame3DCompletionSource} from '../serverCompletionSource.mjs';

const base=()=>({
  ownerId:'cf52-owner',characterId:'cf52-character',
  completionId:'cf52-encounter-'+randomUUID(),sourceKind:'encounter',
});
const receiptDigest=context=>createHash('sha256')
  .update(context.completionId).digest('hex');
const testOracle=async({context})=>({
  ok:true,provenance:'committed-simulation-receipt',
  ...context,receiptDigest:receiptDigest(context),
  awards:[{awardIndex:0,definitionId:'training-blade-preview-v1'}],
});
test('missing committed simulator verifier refuses completion mint',async()=>{
  const fake={connect:async()=>{throw Error('must not connect')},
    query:async()=>({rows:[],rowCount:0})};
  const source=createGame3DCompletionSource({pool:fake});
  assert.equal(source.enabled,false);
  await assert.rejects(()=>source.commitCompletion(base()),
    /verifier missing/);
  await assert.rejects(()=>source.commitCompletion({
    ...base(),sourceKind:'browser'}),
    /Invalid completion context/);
  await assert.rejects(()=>source.issueCommittedAward({
    completionId:'bad',awardIndex:-1}),/Invalid committed award/);
});
const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('event source persists completion; only verified award can mint once',
  async()=>{
    const {default:pg}=await import('pg');
    const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,
      max:3});
    const entry={...base(),ownerId:'cf52-'+randomUUID(),
      characterId:'hero-'+randomUUID()};
    const s=createGame3DCompletionSource({
      pool,confirmSimulation:testOracle,
    });
    try{
      await s.initialize();
      await pool.query(
        'INSERT INTO game3d_trusted_character(owner_id,character_id) '+
        'VALUES($1,$2)',[entry.ownerId,entry.characterId]);
      const first=await s.commitCompletion(entry);
      assert.equal(first.created,true);
      const replay=await s.commitCompletion(entry);
      assert.equal(replay.created,false);
      assert.equal(replay.sourceDigest,first.sourceDigest);
      const issued=await s.issueCommittedAward({
        completionId:entry.completionId,awardIndex:0});
      const repeated=await s.issueCommittedAward({
        completionId:entry.completionId,awardIndex:0});
      assert.equal(repeated.itemInstanceId,issued.itemInstanceId);
      assert.equal(repeated.created,false);
      await assert.rejects(()=>s.issueCommittedAward({
        completionId:entry.completionId,awardIndex:1}),
        /Award index absent/);
      await assert.rejects(()=>s.proveCompletion({
        client:{query:(...args)=>pool.query(...args)},
        claim:{...entry,definitionId:'forged-sword',awardIndex:0},
      }),/cannot authorize/);
      await assert.rejects(()=>pool.query(
        'DELETE FROM game3d_server_completion_source WHERE completion_id=$1',
        [entry.completionId]),/append-only/);
    }finally{
      // Append-only evidence remains in disposable beta DB by design.
      await pool.end();
    }
  }
);
beta('receipt conflicts and identity misbinding fail closed',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,
    max:3});
  const entry={...base(),ownerId:'cf52-'+randomUUID(),
    characterId:'hero-'+randomUUID()};
  try{
    await pool.query('INSERT INTO game3d_trusted_character'+
      '(owner_id,character_id) VALUES($1,$2)',
      [entry.ownerId,entry.characterId]);
    const s=createGame3DCompletionSource({
      pool,confirmSimulation:async({context})=>({
        ...(await testOracle({context})),
        awards:[{awardIndex:0,definitionId:'training-blade-preview-v1'}],
      }),
    });
    await s.commitCompletion(entry);
    const differing=createGame3DCompletionSource({
      pool,confirmSimulation:async({context})=>({
        ...(await testOracle({context})),
        awards:[{awardIndex:0,definitionId:'forged-sword'}],
      }),
    });
    await assert.rejects(()=>differing.commitCompletion(entry),
      /Conflicting completion receipt replay/);
    const identity={...entry,ownerId:'another-owner'};
    await assert.rejects(()=>s.commitCompletion(identity),
      /foreign key|violates foreign key|Conflicting completion/);
  }finally{await pool.end();}
});
