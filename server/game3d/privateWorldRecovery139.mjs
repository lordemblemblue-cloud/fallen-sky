// Combat Foundation 13.9 — private, single-owner restorable encounter.
// Wraps the original 13.6 combat simulator + 13.7 sync. No second tick loop,
// public WS, character data migration, loot, XP, AGP or live deployment.
import {createGame3DWorldLeaseWriter138} from './worldLeaseWriter138.mjs';
import {createGame3DWorldLeaseReader137} from './worldLeaseRead137.mjs';
import {createGame3DPrivateWorldSync137} from './privateWorldSync137.mjs';
import {createGame3DRecoveryStore139} from './privateWorldRecoveryStore139.mjs';

export async function createGame3DPrivateWorldRecovery139({
 pool,scope,createEncounter,resolveAuthenticatedSubject,
 authorizeServerOperation,now=Date.now,leaseMs=10000
}={}){
 if(!scope||typeof createEncounter!=='function'||
   typeof resolveAuthenticatedSubject!=='function'||
   typeof authorizeServerOperation!=='function'||
   typeof now!=='function'||!Number.isInteger(leaseMs)||
   leaseMs<1000||leaseMs>30000)
  throw Error('13.9 requires private server worker, encounter factory and trusted session');
 // Server-fixed identity; callers cannot mutate the scope after ownership.
 scope=Object.freeze({
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
  holderId:scope.holderId,ownerId:scope.ownerId,
  characterId:scope.characterId,mapFingerprint:scope.mapFingerprint
 });
 const writer=createGame3DWorldLeaseWriter138({
  pool,authorizeServerOperation
 });
 const reader=createGame3DWorldLeaseReader137({pool});
 const store=createGame3DRecoveryStore139({pool,authorizeServerOperation});
 const lease=await writer.acquire({scope,ttlMs:leaseMs});
 if(!lease)throw Error('13.9 world instance owned or unavailable');
 let stream,encounter,restored=false;
 try{
  const recovered=await store.load({
   scope,fencingToken:lease.fencingToken
  });
  // The callback must be a trusted SERVER attester that reconstructs the
  // same actor IDs, stats, world origin and map fingerprint. It never receives
  // a client checkpoint and never skips the underlying 13.6 attestation.
  encounter=await createEncounter({scope});
  if(encounter?.version!=='13.6'||
     encounter.privateServerOnly!==true||
     encounter.instanceId!==scope.instanceId||
     encounter.mapFingerprint!==scope.mapFingerprint||
     typeof encounter.exportCheckpoint139!=='function'||
     typeof encounter.restoreCheckpoint139!=='function')
   throw Error('13.9 private encounter factory did not re-attest the world');
  if(recovered){
   encounter.restoreCheckpoint139(recovered);
   restored=true;
  }
  // Persist the re-attested fresh/restored baseline under the NEW fencing
  // token before connecting any player. This fences the previous worker.
  if(!await store.persist({scope,fencingToken:lease.fencingToken,
      checkpoint:encounter.exportCheckpoint139()}))
   throw Error('13.9 baseline commit rejected');
  stream=await createGame3DPrivateWorldSync137({
   encounter,...scope,resolveAuthenticatedSubject,
   verifyLease:reader.verify,now
  });
 }catch(error){
  try{await writer.release({scope,fencingToken:lease.fencingToken})}
  catch{}
  throw error;
 }
 let stopped=false;let tail=Promise.resolve();
 const serial=fn=>{
  const next=tail.then(fn,fn);
  tail=next.catch(()=>{});
  return next;
 };
 const refused=reason=>({ok:false,reason,
  rewardsIssued:false,productionReady:false});
 const forwarded=(method,args)=>serial(async()=>{
  if(stopped)return refused('world_instance_fenced');
  return stream[method](args);
 });
 const advance=()=>serial(async()=>{
  if(stopped)return refused('world_instance_fenced');
  const renewed=await writer.renew({
   scope,fencingToken:lease.fencingToken,ttlMs:leaseMs
  }).catch(()=>null);
  if(!renewed){stopped=true;return refused('world_instance_lease_lost')}
  const result=await stream.advance();
  if(!result.ok){
   if(result.reason==='world_instance_lease_lost')stopped=true;
   return result;
  }
  // The tick result cannot be observed through polling until the full
  // checkpoint is committed; all exported operations use one serial queue.
  // A failed/rotated lease or failed write permanently fences this worker.
  let persisted=false;
  try{
   persisted=await store.persist({
    scope,fencingToken:lease.fencingToken,
    checkpoint:encounter.exportCheckpoint139()
   });
  }catch{}
  if(!persisted){
   stopped=true;
   return refused('world_state_commit_failed');
  }
  return {...result,recoveryCheckpointCommitted:true,
   rewardsIssued:false,productionReady:false};
 });
 const release=()=>serial(async()=>{
  if(stopped)return false;
  stopped=true;
  return writer.release({
   scope,fencingToken:lease.fencingToken
  }).catch(()=>false);
 });
 return Object.freeze({
  version:'13.9',instanceId:scope.instanceId,
  fencingToken:lease.fencingToken,restoredAtStart:restored,
  connect:args=>forwarded('connect',args),
  poll:args=>forwarded('poll',args),
  setInput:args=>forwarded('setInput',args),
  submit:args=>forwarded('submit',args),
  disconnect:args=>forwarded('disconnect',args),
  advance,release,
  privateServerOnly:true,
  serverCheckpointRecoverySourceAvailable:true,
  publicTransportInstalled:false,
  multiplayerReplicationEnabled:false,
  rewardWriterEnabled:false,productionReady:false,
 });
}
