// Game 3D Combat / Quest 84.2 — bounded, PRIVATE projection of server-verified
// kill contexts into the existing 18.5/15.2 objective-credit journal.
// The 18.4 resolver and 18.5 immutable lease binding remain the authority.
// No client kills, HTTP routes, new receipts, quest completion or rewards.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(key=>keys.includes(key));
const RECEIPT=/^worldkill-[a-f0-9]{64}$/;
export const GAME3D_QUEST_BATCH_LIMIT_842=16;

const denied=(reason,projectedReceipts=0)=>Object.freeze({
 ok:false,version:'84.2',reason,projectedReceipts,
 // Earlier independent PostgreSQL transactions may have committed. The
 // caller must reconcile via the original server receipt authority.
 partialProjection:projectedReceipts>0,
 privateServerOnly:true,rewardsIssued:false,rewardAuthorized:false,
 questTurnInCommitted:false,productionReady:false,
});

export function createGame3DPrivateQuestObjectiveBatch842({
 projectCommittedKill,readProgress,isStopped,
}={}){
 if(typeof projectCommittedKill!=='function'||
    typeof readProgress!=='function'||typeof isStopped!=='function')
  throw Error('84.2 requires trusted 18.5 private quest progression');

 const projectBatch=async request=>{
  if(isStopped())return denied('private_quest_batch_stopped');
  if(!exact(request,['serverRequestContext','serverKillContexts'])||
     !object(request.serverRequestContext)||
     !Array.isArray(request.serverKillContexts)||
     request.serverKillContexts.length<1||
     request.serverKillContexts.length>GAME3D_QUEST_BATCH_LIMIT_842||
     !request.serverKillContexts.every(object))
   return denied('trusted_kill_batch_required');

  const seen=new Set(),newCredits=[];
  for(const serverKillContext of request.serverKillContexts){
   if(isStopped())return denied('private_quest_batch_stopped',seen.size);
   let projected;
   try{
    projected=await projectCommittedKill(Object.freeze({
     serverRequestContext:request.serverRequestContext,serverKillContext,
    }));
   }catch{return denied('private_quest_batch_projection_unavailable',seen.size)}
   if(isStopped())return denied('private_quest_batch_stopped',seen.size);
   if(projected?.ok!==true||projected.rewardAuthorized!==false||
      projected.rewardsIssued!==false||
      projected.questTurnInCommitted!==false||
      !RECEIPT.test(projected.receiptId)||
      !Array.isArray(projected.credited))
    return denied('private_quest_batch_projection_denied',seen.size);
   // The 15.2 DB uniqueness constraint is authoritative. A duplicate
   // receipt can be re-projected safely, but may not add a second credit.
   if(seen.has(projected.receiptId)){
    if(projected.credited.length!==0)
     return denied('duplicate_receipt_added_credit',seen.size);
    continue;
   }
   seen.add(projected.receiptId);
   newCredits.push(...projected.credited);
  }
  if(isStopped())return denied('private_quest_batch_stopped',seen.size);
  let progress;
  try{
   progress=await readProgress(Object.freeze({
    serverRequestContext:request.serverRequestContext,
   }));
  }catch{return denied('private_quest_batch_read_unavailable',seen.size)}
  if(isStopped())return denied('private_quest_batch_stopped',seen.size);
  if(progress?.ok!==true||progress.rewardAuthorized!==false||
     progress.rewardsIssued!==false||!Array.isArray(progress.objectives))
   return denied('private_quest_batch_read_denied',seen.size);
  return Object.freeze({ok:true,version:'84.2',
   projectedReceipts:seen.size,
   newCredits:Object.freeze([...newCredits]),
   objectives:Object.freeze([...progress.objectives]),
   partialProjection:false,questTurnInCommitted:false,
   privateServerOnly:true,rewardsIssued:false,rewardAuthorized:false,
   productionReady:false,
  });
 };
 return Object.freeze({version:'84.2',projectBatch,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  rewardWriterInstalled:false,productionReady:false});
}
