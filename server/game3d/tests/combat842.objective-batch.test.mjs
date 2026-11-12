import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestObjectiveBatch842,GAME3D_QUEST_BATCH_LIMIT_842}
 from '../privateQuestObjectiveBatch842.mjs';

const receipt=n=>'worldkill-'+n.toString(16).padStart(64,'0');
const context=Object.freeze({privateWorld:'server-session-84-2'});
const validProjection=(id,credited=[])=>({ok:true,receiptId:receipt(id),
 credited,rewardAuthorized:false,rewardsIssued:false,questTurnInCommitted:false});
const validRead=(objectives=[])=>({ok:true,objectives,
 rewardAuthorized:false,rewardsIssued:false});
const create=({project,read,stopped=()=>false})=>
 createGame3DPrivateQuestObjectiveBatch842({projectCommittedKill:project,
  readProgress:read,isStopped:stopped});

test('84.2 projects committed server kills in order then reads objective progress',async()=>{
 const calls=[];
 const worker=create({
  project:async r=>{
   assert.equal(r.serverRequestContext,context);
   calls.push(r.serverKillContext.id);
   return validProjection(r.serverKillContext.id,[{
    questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
    count:r.serverKillContext.id,required:3,
   }]);
  },
  read:async r=>{assert.equal(r.serverRequestContext,context);
   calls.push('read');return validRead([{questId:'axe_q_first_patrol',
    objectiveId:'patrol_kills',current:3,required:3}]);},
 });
 const result=await worker.projectBatch({serverRequestContext:context,
  serverKillContexts:[{id:1},{id:2},{id:3}]});
 assert.equal(result.ok,true);assert.equal(result.projectedReceipts,3);
 assert.deepEqual(calls,[1,2,3,'read']);
 assert.equal(result.newCredits.length,3);
 assert.equal(result.objectives[0].current,3);
 assert.equal(result.rewardsIssued,false);
 assert.equal(result.questTurnInCommitted,false);
 assert.equal(worker.publicPlayerRouteInstalled,false);
});

test('84.2 idempotent replay of one receipt does not double-count',async()=>{
 const creditedOnce=new Set();
 const worker=create({project:async r=>{
  const id=r.serverKillContext.id;
  const credited=creditedOnce.has(id)?[]:[{questId:'q',objectiveId:'k'}];
  creditedOnce.add(id);return validProjection(id,credited);
 },read:async()=>validRead([])});
 const run=()=>worker.projectBatch({serverRequestContext:context,
  serverKillContexts:[{id:1},{id:1}]});
 const first=await run(),second=await run();
 assert.equal(first.projectedReceipts,1);
 assert.equal(first.newCredits.length,1);
 assert.equal(second.newCredits.length,0);
 assert.equal(second.ok,true);
});

test('84.2 refuses duplicate receipts if a projector claims another credit',async()=>{
 const worker=create({project:async()=>validProjection(1,[{count:1}]),
  read:async()=>validRead([])});
 const result=await worker.projectBatch({serverRequestContext:context,
  serverKillContexts:[{},{}]});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'duplicate_receipt_added_credit');
 assert.equal(result.partialProjection,true);
});

test('84.2 rejects client-like payloads, extras, empty and oversized batches',async()=>{
 let calls=0;
 const worker=create({project:async()=>{calls++;return validProjection(1)},
  read:async()=>validRead([])});
 const rejected=[null,{}, {serverRequestContext:context,
  serverKillContexts:[]}, {serverRequestContext:context,
  serverKillContexts:[null]}, {serverRequestContext:'browser',
  serverKillContexts:[{}]}, {serverRequestContext:context,
  serverKillContexts:[{}],receiptId:receipt(1)},
  {serverRequestContext:context,
   serverKillContexts:Array.from({length:GAME3D_QUEST_BATCH_LIMIT_842+1},()=>({}))}];
 for(const request of rejected){
  const result=await worker.projectBatch(request);
  assert.equal(result.ok,false);assert.equal(result.projectedReceipts,0);
 }
 assert.equal(calls,0);
});

test('84.2 explicitly reports partial commits if later independent projection fails',async()=>{
 const worker=create({project:async r=>r.serverKillContext.id===2?
  {ok:false,reason:'world_session_unverified'}:validProjection(1),
  read:async()=>{throw Error('should not read on partial failure')}});
 const result=await worker.projectBatch({serverRequestContext:context,
  serverKillContexts:[{id:1},{id:2}]});
 assert.equal(result.ok,false);assert.equal(result.projectedReceipts,1);
 assert.equal(result.partialProjection,true);
 assert.equal(result.rewardsIssued,false);
});

test('84.2 fails closed on unexpected reward authority, stale reads, and shutdown',async()=>{
 let stopped=false;
 const unsafe=create({project:async()=>({...validProjection(1),
  rewardAuthorized:true}),read:async()=>validRead([])});
 assert.equal((await unsafe.projectBatch({serverRequestContext:context,
  serverKillContexts:[{}]})).ok,false);
 const wrongRead=create({project:async()=>validProjection(1),
  read:async()=>({...validRead([]),rewardsIssued:true})});
 const result=await wrongRead.projectBatch({serverRequestContext:context,
  serverKillContexts:[{}]});
 assert.equal(result.ok,false);assert.equal(result.partialProjection,true);
 const stopWorker=create({project:async()=>{stopped=true;return validProjection(1)},
  read:async()=>validRead([]),stopped:()=>stopped});
 assert.equal((await stopWorker.projectBatch({serverRequestContext:context,
  serverKillContexts:[{}]})).reason,'private_quest_batch_stopped');
});
