// Combat Foundation 5.1 — deferred source tests. DO NOT RUN until beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {
  createGame3DVerifiedEventBridge,validateVerifiedCompletion
} from '../verifiedGameplayEvents.mjs';

const completionId = () => 'cf51-quest-'+randomUUID();
const claim = (id=completionId()) => ({
  ownerId:'cf51-owner',characterId:'cf51-hero',
  completionId:id,sourceKind:'quest',
  definitionId:'training-blade-preview-v1',awardIndex:0,
});
const proof = c => ({...c,ok:true,
  provenance:'server-committed-gameplay',
  proofDigest:createHash('sha256').update(c.completionId).digest('hex')});

test('committed source proof must exactly match owner, item and completion',()=>{
  const c=claim();
  assert.equal(validateVerifiedCompletion({claim:c,proof:proof(c)}),true);
  assert.equal(validateVerifiedCompletion({claim:c,proof:{...proof(c),
    ownerId:'stranger'}}),false);
  assert.equal(validateVerifiedCompletion({claim:c,proof:{...proof(c),
    awardIndex:1}}),false);
  assert.equal(validateVerifiedCompletion({claim:c,proof:{...proof(c),
    provenance:'browser-character-vault'}}),false);
  assert.equal(validateVerifiedCompletion({claim:c,proof:{...proof(c),
    proofDigest:'no'}}),false);
});
test('without a committed gameplay completion verifier, event minting fails closed',async()=>{
  const pool={connect:async()=>{throw Error('must not connect')},
    query:async()=>({rowCount:0,rows:[]})};
  const bridge=createGame3DVerifiedEventBridge({pool});
  assert.equal(bridge.enabled,false);
  await assert.rejects(()=>bridge.recordCompleted(claim()),
    /verifier is not installed/);
  await assert.rejects(()=>bridge.recordCompleted({...claim(),sourceKind:'browser'}),
    /Invalid completed gameplay claim/);
  await assert.rejects(()=>bridge.issueFromEvent('arbitrary-client-item'),
    /Invalid server gameplay event identity/);
});

const beta=process.env.GAME3D_TEST_PG_URL ? test : test.skip;
beta('committed event is idempotent, minted item is unique, forged claims refused',
async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:2});
  const c=claim(), ownerId='cf51-'+randomUUID(),
    characterId='hero-'+randomUUID();
  const authorized={...c,ownerId,characterId};
  // TEST-ONLY deterministic gameplay oracle. Production MUST replace this
  // with its real committed quest/drop/crafting completion verification.
  const bridge=createGame3DVerifiedEventBridge({
    pool,proveCompletion:async({claim:input})=>proof(input),
  });
  try {
    await bridge.initialize();
    await pool.query(
      'INSERT INTO game3d_trusted_character(owner_id,character_id) '+
      'VALUES($1,$2)',[ownerId,characterId]);
    const first=await bridge.recordCompleted(authorized);
    assert.equal(first.created,true);
    const again=await bridge.recordCompleted(authorized);
    assert.equal(again.created,false);
    assert.equal(first.eventId,again.eventId);
    await assert.rejects(()=>bridge.recordCompleted({
      ...authorized,definitionId:'different-blueprint',
    }),/Conflicting gameplay completion replay/);
    const issued=await bridge.issueFromEvent(first.eventId);
    assert.equal(issued.created,true);
    const replay=await bridge.issueFromEvent(first.eventId);
    assert.equal(replay.created,false);
    assert.equal(issued.itemInstanceId,replay.itemInstanceId);
    await assert.rejects(()=>bridge.verifySource({
      client:{query:(...args)=>pool.query(...args)},
      claim:{ownerId:'stranger',characterId,
        sourceEventId:first.eventId,sourceKind:'quest',
        definitionId:authorized.definitionId,awardIndex:0},
    }),/does not authorize/);
    await assert.rejects(
      ()=>pool.query('DELETE FROM game3d_verified_gameplay_event WHERE event_id=$1',
        [first.eventId]),/append-only/);
  } finally {
    // This is an intentionally append-only, disposable private-beta fixture.
    await pool.end();
  }
});
