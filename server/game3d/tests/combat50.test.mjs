// Combat Foundation 5.0 — source-only private beta tests. DO NOT RUN until beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPgItemProvenance,validateItemIssuanceClaim}
  from '../itemProvenance.mjs';

const sample = eventId => ({
  ownerId:'cf50-owner',characterId:'cf50-character',
  definitionId:'sword-basic',sourceKind:'quest',
  sourceEventId:eventId,awardIndex:0,
});
test('browser-provided item IDs and unverifiable events cannot become grants',()=>{
  assert.equal(validateItemIssuanceClaim(sample('quest-event')),true);
  assert.equal(validateItemIssuanceClaim({...sample('quest-event'),ownerId:'__anon__'}),false);
  assert.equal(validateItemIssuanceClaim({...sample('quest-event'),sourceKind:'browser-save'}),false);
  assert.equal(validateItemIssuanceClaim({...sample('quest-event'),awardIndex:-1}),false);
  assert.equal(validateItemIssuanceClaim({...sample('quest-event'),definitionId:';DROP TABLE'}),false);
});
test('issuance refuses absent trusted verifier before database writes',async()=>{
  const pool={connect:async()=>{throw Error('should never connect')},
    query:async()=>({rowCount:0,rows:[]})};
  const store=createPgItemProvenance({pool});
  await assert.rejects(
    ()=>store.issueItem(sample('sample-event')),
    /trusted server-event verifier/);
  await assert.rejects(
    ()=>store.changeEquipment({ownerId:'cf50-owner',
      characterId:'cf50-character',equipmentSlot:'weapon',
      operationId:'op-1',expectedRevision:0}),
    /trusted account authorization/);
});

const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('trusted issuance is idempotent and equipment is revision-fenced',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const claim=sample('cf50-quest-'+randomUUID());
  // TEST-ONLY oracle. Production must query a committed, server-origin event
  // in the same transaction. This stub is never installed by the game server.
  const store=createPgItemProvenance({pool,
    verifySource:async({claim:c})=>({
      ok:true,ownerId:c.ownerId,characterId:c.characterId,
      sourceDigest:'b'.repeat(64)}),
    authorizeEquipment:async()=>true,
  });
  try{
    await store.initialize();
    const issued=await store.issueItem(claim);
    assert.equal(issued.created,true);
    const replay=await store.issueItem(claim);
    assert.equal(replay.created,false);
    assert.equal(replay.itemInstanceId,issued.itemInstanceId);
    await assert.rejects(
      ()=>store.issueItem({...claim,definitionId:'other-sword'}),
      /Conflicting item issuance/);
    let state=await store.readEquipment(claim);
    assert.equal(state.revision,0);
    assert.equal(state.equipped.length,0);
    const equipped=await store.changeEquipment({
      ownerId:claim.ownerId,characterId:claim.characterId,
      equipmentSlot:'weapon',itemInstanceId:issued.itemInstanceId,
      operationId:'cf50-equip-'+randomUUID(),expectedRevision:0});
    assert.equal(equipped.revision,1);
    state=await store.readEquipment(claim);
    assert.equal(state.equipped.length,1);
    assert.equal(state.equipped[0].definitionId,claim.definitionId);
    assert.equal(state.combatStatsVerified,false);
    assert.equal(state.rewardEligible,false);
    await assert.rejects(()=>store.changeEquipment({
      ownerId:claim.ownerId,characterId:claim.characterId,
      equipmentSlot:'offhand',itemInstanceId:issued.itemInstanceId,
      operationId:'cf50-other-slot-'+randomUUID(),expectedRevision:1,
    }),/another slot/);
    await assert.rejects(()=>store.changeEquipment({
      ownerId:'another-owner',characterId:claim.characterId,
      equipmentSlot:'weapon',itemInstanceId:issued.itemInstanceId,
      operationId:'cf50-theft-'+randomUUID(),expectedRevision:0,
    }),/not issued to this character/);
    await assert.rejects(()=>store.changeEquipment({
      ownerId:claim.ownerId,characterId:claim.characterId,
      equipmentSlot:'weapon',itemInstanceId:null,
      operationId:'cf50-stale-'+randomUUID(),expectedRevision:0,
    }),/Stale equipment revision/);
  }finally{
    // Append-only evidence is intentionally retained on a disposable DB.
    await pool.end();
  }
});
