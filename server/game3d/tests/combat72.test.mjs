// 7.2 source regression tests; execution deferred to private beta.
import test from 'node:test';import assert from 'node:assert/strict';
import {verifyItemIssuanceReplay} from '../itemProvenance.mjs';
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../../base44/shared/duelJournalProof.mjs';
const claim={ownerId:'owner1',characterId:'hero1',
 sourceEventId:'event-one',definitionId:'basic-sword',
 sourceKind:'quest',awardIndex:0};
test('existing item must match exact trusted source digest',()=>{
 const sourceDigest='f'.repeat(64);
 const claim_digest=createHash('sha256').update(stableJournalJSON({
  ...claim,sourceDigest})).digest('hex');
 const row={owner_id:claim.ownerId,character_id:claim.characterId,
  source_event_id:claim.sourceEventId,definition_id:claim.definitionId,
  source_kind:claim.sourceKind,award_index:0,source_digest:sourceDigest,
  claim_digest};
 assert.equal(verifyItemIssuanceReplay(row,claim,sourceDigest),true);
 assert.equal(verifyItemIssuanceReplay(row,claim,'a'.repeat(64)),false);
 assert.equal(verifyItemIssuanceReplay({...row,owner_id:'intruder'},
  claim,sourceDigest),false);
});
