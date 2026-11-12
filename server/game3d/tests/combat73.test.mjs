// Combat 7.3 source-only beta contract (execution deferred).
import test from 'node:test';import assert from 'node:assert/strict';
import {reviewCompletionAwardGaps} from '../awardGapReview.mjs';
const base={owner_id:'o1',character_id:'c1',
 completion_id:'quest-1',source_kind:'quest',
 awards:[{awardIndex:0,definitionId:'sword'}]};
const ctx={ownerId:'o1',characterId:'c1',completionId:'quest-1'};
const simulation={completion_id:'quest-1'};
test('orphan item must not be recorded as merely missing an event',()=>{
 const row={completion:base,simulation,award:base.awards[0],
  event:null,issued:{owner_id:'o1',character_id:'c1'}};
 const x=reviewCompletionAwardGaps({...ctx,rows:[row]});
 assert.equal(x.ok,false);assert.equal(x.reason,'orphan_item_without_event');
});
test('mismatched item issuance is not safe even with a matching event',()=>{
 const row={completion:base,simulation,award:base.awards[0],
  event:{owner_id:'o1',character_id:'c1',completion_id:'quest-1',
   source_kind:'quest',event_id:'evt1',
   award_index:0,definition_id:'sword'},
  issued:{owner_id:'intruder',character_id:'c1',
   source_kind:'quest',definition_id:'sword',
   source_event_id:'evt1',award_index:0}};
 const x=reviewCompletionAwardGaps({...ctx,rows:[row]});
 assert.equal(x.ok,false);
 assert.equal(x.reason,'issued_item_source_binding_mismatch');
});
