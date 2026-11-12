// Combat 13.8 private lifecycle for the existing 13.6 encounter + 13.7
// snapshot stream. This is NOT a hosted world instance or public transport.
// Only a trusted server scheduler may create and advance this session.
import {createHash} from 'node:crypto';
import {createGame3DPrivateWorldSync137}
 from './privateWorldSync137.mjs';
import {createGame3DWorldLeaseReader137}
 from './worldLeaseRead137.mjs';
import {createGame3DWorldLeaseWriter138}
 from './worldLeaseWriter138.mjs';

export async function createGame3DPrivateWorldOwner138({
 encounter,pool,scope,resolveAuthenticatedSubject,authorizeServerOperation,
 now=Date.now,leaseMs=10000
}={}) {
 if (!scope || typeof resolveAuthenticatedSubject!=='function' ||
     typeof authorizeServerOperation!=='function' ||
     !Number.isInteger(leaseMs) || leaseMs<1000 || leaseMs>30000)
  throw Error('13.8 requires private worker scope and authority');
 // Caller-owned scope objects may be mutated after construction. Pin this
 // worker to the original immutable instance/epoch/character/map identity.
 scope=Object.freeze({
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
  holderId:scope.holderId,ownerId:scope.ownerId,
  characterId:scope.characterId,mapFingerprint:scope.mapFingerprint
 });
 const writer=createGame3DWorldLeaseWriter138({
  pool,authorizeServerOperation});
 const reader=createGame3DWorldLeaseReader137({pool});
 const lease=await writer.acquire({scope,ttlMs:leaseMs});
 if (!lease)throw Error('13.8 world instance already owned or unavailable');
 let stream;
 try {
  stream=await createGame3DPrivateWorldSync137({
   encounter,...scope,now,resolveAuthenticatedSubject,
   verifyLease:reader.verify
  });
 }catch(error) {
  try {await writer.release({scope,fencingToken:lease.fencingToken})}
  catch {}
  throw error;
 }
 let stopped=false;
 let tail=Promise.resolve();
 const serial=fn=>{
  const result=tail.then(fn,fn);
  tail=result.catch(()=>{});
  return result;
 };
 const lost=()=>({
  ok:false,reason:'world_instance_lease_lost',rewardsIssued:false,
  productionReady:false
 });
 // A scheduler calls advance, NEVER a connected browser. Renew is acquired
 // before each advance; 13.7 still independently verifies the live DB lease.
 const advance=()=>serial(async()=>{
  if(stopped)return lost();
  const next=await writer.renew({
   scope,fencingToken:lease.fencingToken,ttlMs:leaseMs
  }).catch(()=>null);
  if(!next){stopped=true;return lost()}
  const tick=await stream.advance();
  if(!tick.ok) {
   if(tick.reason==='world_instance_lease_lost')stopped=true;
   return tick;
  }
  const data={
   instanceId:scope.instanceId,
   instanceEpoch:scope.instanceEpoch,
   eventSeq:tick.eventSeq,
   player:tick.snapshot.player,
   enemies:tick.snapshot.enemies
  };
  const digest=createHash('sha256')
   .update(JSON.stringify(data)).digest('hex');
  // Metadata audit only: absence or write failure is surfaced, and this
  // cannot restore HP, AI, position, rewards or queued actions after a crash.
  const checkpointDigestRecorded=await writer.recordCheckpointDigest({
   scope,fencingToken:lease.fencingToken,
   eventSeq:tick.eventSeq,snapshotSha256:digest
  }).catch(()=>false);
  if(!checkpointDigestRecorded){
   stopped=true;
   return {ok:false,reason:'world_checkpoint_write_failed',
    checkpointDigestRecorded:false,rewardsIssued:false,
    productionReady:false};
  }
  return {...tick,checkpointDigestRecorded:true,
   productionReady:false,rewardsIssued:false};
 });
 // All player-facing calls share the same lifecycle boundary as advance
 // and release, so a shutdown or failed checkpoint cannot accept new input.
 const allowedCall=(name,args)=>serial(async()=> {
  if(stopped)return lost();
  return stream[name](args);
 });
 const release=()=>serial(async()=>{
  if(stopped)return false;
  stopped=true;
  return writer.release({
   scope,fencingToken:lease.fencingToken
  }).catch(()=>false);
 });
 return Object.freeze({
  version:'13.8',
  connect:args=>allowedCall('connect',args),
  poll:args=>allowedCall('poll',args),
  setInput:args=>allowedCall('setInput',args),
  submit:args=>allowedCall('submit',args),
  disconnect:args=>allowedCall('disconnect',args),
  advance,release,
  privateServerOnly:true,instanceId:scope.instanceId,
  fencingToken:lease.fencingToken,
  releaseGate:'private-beta-only',rewardWriterEnabled:false,
  publicTransportInstalled:false,liveWorldIntegration:false,
  checkpointRestorationAvailable:false,productionReady:false
 });
}
