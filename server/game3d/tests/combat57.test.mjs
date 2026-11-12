// Combat Foundation 5.7 — source-only beta test contract; not executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCompletionAwardGaps,createGame3DAwardGapReviewer}
 from '../awardGapReview.mjs';
const base={ownerId:'owner1',characterId:'hero1',
 completionId:'quest-001'};
const completion={owner_id:'owner1',character_id:'hero1',
 completion_id:'quest-001',awards:[
  {awardIndex:0,definitionId:'starter-sword'}]};
const simulation={completion_id:'quest-001'};
test('review marks unissued awards and cannot issue rewards',()=>{
 let r=reviewCompletionAwardGaps({...base,rows:[{
   completion,simulation,award:completion.awards[0],
   event:null,issued:null,
 }]});
 assert.equal(r.ok,true);
 assert.equal(r.decisions[0].status,'missing_verified_event');
 assert.equal(r.rewardsIssued,false);
 assert.equal(r.reconciled,false);
 r=reviewCompletionAwardGaps({...base,rows:[{
  completion,simulation,award:completion.awards[0],
  event:{owner_id:'owner1',character_id:'hero1',
   completion_id:'quest-001',award_index:0,
   definition_id:'starter-sword'},issued:null,
 }]});
 assert.equal(r.decisions[0].status,'missing_item_issuance');
});
test('wrong award ID, duplicate rows or foreign owner fail closed',()=>{
 const e={completion,simulation,award:{
  awardIndex:0,definitionId:'forged-sword'},event:null,issued:null};
 assert.equal(reviewCompletionAwardGaps({...base,rows:[e]}).ok,false);
 assert.equal(reviewCompletionAwardGaps({...base,rows:[{
  ...e,award:completion.awards[0],
  event:{owner_id:'intruder',character_id:'hero1',
   completion_id:'quest-001',award_index:0,
   definition_id:'starter-sword'},
 }]}).ok,false);
 assert.equal(reviewCompletionAwardGaps({...base,rows:[]}).ok,false);
});
test('invalid user cannot query private read-only completion audit',async()=>{
 const r=createGame3DAwardGapReviewer({
  pool:{connect:async()=>{throw Error('unexpected database connection')}},});
 await assert.rejects(()=>r.inspect({ownerId:'__anon__',
  characterId:'hero1',completionId:'quest-001'}),/Invalid owner/);
});
