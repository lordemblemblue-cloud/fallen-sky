// Combat Foundation 5.4 source-only provenance review tests (defer to beta).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../../base44/shared/duelJournalProof.mjs';
import {verifyItemProvenanceChain,createGame3DProvenanceReviewer}
  from '../itemProvenanceReview.mjs';
const hash=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
const fixture=()=>{
  const ownerId='owner-one',characterId='hero-one',
    completionId='quest-001',sourceKind='quest',awardIndex=0,
    definitionId='preview-blade';
  const awards=[{awardIndex,definitionId}];
  const s={completion_id:completionId,simulation_id:'world-01',
    simulation_tick:10,owner_id:ownerId,character_id:characterId,
    source_kind:sourceKind,awards,evidence_digest:'f'.repeat(64)};
  s.receipt_digest=hash({completionId,simulationId:s.simulation_id,
    simulationTick:s.simulation_tick,ownerId,characterId,
    sourceKind,awards,evidenceDigest:s.evidence_digest});
  const c={completion_id:completionId,owner_id:ownerId,
    character_id:characterId,source_kind:sourceKind,awards,
    receipt_digest:s.receipt_digest};
  c.source_digest=hash({ownerId,characterId,completionId,sourceKind,
    receiptDigest:c.receipt_digest,awards});
  const e={event_id:'0e82d8df-5d30-4082-b67b-2185a0c568ad',
    owner_id:ownerId,character_id:characterId,
    completion_id:completionId,source_kind:sourceKind,
    definition_id:definitionId,award_index:awardIndex,
    proof_digest:c.source_digest};
  e.event_digest=hash({ownerId,characterId,completionId,sourceKind,
    definitionId,awardIndex,proofDigest:e.proof_digest});
  const i={item_instance_id:'102cdfe4-b740-4f9e-8a41-9f0e9f0d3455',
    owner_id:ownerId,character_id:characterId,
    definition_id:definitionId,source_kind:sourceKind,
    source_event_id:e.event_id,award_index:awardIndex,
    source_digest:e.event_digest};
  i.claim_digest=hash({ownerId,characterId,sourceEventId:i.source_event_id,
    definitionId,sourceKind,awardIndex,sourceDigest:i.source_digest});
  return {issued:i,event:e,completion:c,simulation:s};
};
test('full committed chain has consistent hashes, never awards rewards',()=>{
  const a=verifyItemProvenanceChain(fixture());
  assert.equal(a.ok,true);
  assert.equal(a.provenanceConsistencyVerified,true);
  assert.equal(a.simulationAuthenticityVerified,false);
  assert.equal(a.gearEffectsEnabled,false);
  assert.equal(a.rewardsEligible,false);
});
test('tampered item and missing source rows fail closed',()=>{
  const f=fixture();
  assert.equal(verifyItemProvenanceChain({...f,event:null}).ok,false);
  assert.equal(verifyItemProvenanceChain({...f,issued:{
    ...f.issued,definition_id:'fake-legendary'}}).ok,false);
  assert.equal(verifyItemProvenanceChain({...f,completion:{
    ...f.completion,source_digest:'a'.repeat(64)}}).ok,false);
  assert.equal(verifyItemProvenanceChain({...f,simulation:{
    ...f.simulation,simulation_tick:11}}).ok,false);
});
test('private reviewer refuses malformed request before database',async()=>{
  const pool={connect:async()=>{throw Error('must not connect')}};
  const reviewer=createGame3DProvenanceReviewer({pool});
  await assert.rejects(()=>reviewer.readIssuedItem({ownerId:'__anon__',
    characterId:'hero',itemInstanceId:'102cdfe4-b740-4f9e-8a41-9f0e9f0d3455'
  }),/Invalid provenance review identity/);
});
