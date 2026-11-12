// Combat Foundation 13.7 — private, opt-in world-instance sync protocol.
// Wraps (never replaces) the single-writer 13.6 encounter. No public network
// listener, live game-client cutover, DB lease acquisition, or reward writer.
import {randomUUID} from 'node:crypto';

export const WORLD_SYNC_POLICY_137=Object.freeze({
 protocol:1,maxReplayEvents:40,maxStoredEvents:100,
 maxLeaseMs:30000,
});
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const actorId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const seq=x=>Number.isSafeInteger(x)&&x>=0;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const denied=reason=>({ok:false,reason,version:'13.7',
 replayAuthorized:false,worldAuthorityVerified:false,
 rewardsIssued:false,productionReady:false});
const validLease=(lease,scope,at,fencingToken)=>{
 if(!lease||lease.ok!==true||lease.source!=='trusted-world-instance-lease'||
    lease.exclusive!==true||lease.committed!==true||
    lease.instanceId!==scope.instanceId||
    lease.instanceEpoch!==scope.instanceEpoch||
    lease.holderId!==scope.holderId||
    lease.ownerId!==scope.ownerId||
    lease.characterId!==scope.characterId||
    lease.mapFingerprint!==scope.mapFingerprint||
    !Number.isSafeInteger(lease.fencingToken)||lease.fencingToken<1||
    (fencingToken!==null&&lease.fencingToken!==fencingToken)||
    !Number.isSafeInteger(lease.expiresAt)||
    lease.expiresAt<=at||
    lease.expiresAt-at>WORLD_SYNC_POLICY_137.maxLeaseMs)
   return false;
 return true;
};
const statusFields=Object.freeze([
 'seq','serverTime','instanceId','kind','targetId','enemyId','tier',
 'damage','enemyHp','playerHp','critical','killed','serverKillCommitted',
 'variant','impactAt','facingYaw','arcDegrees',
 'xpAuthorized','lootAuthorized','currencyAuthorized',
]);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function wireEvent(entry){
 if(!entry||!seq(entry.seq)||!finite(entry.serverTime)||
    typeof entry.kind!=='string')throw Error('invalid_private_combat_event');
 const out={};
 for(const key of statusFields){
  if(!own(entry,key))continue;
  const value=entry[key];
  if(value===null||typeof value==='string'||typeof value==='boolean'||
     (typeof value==='number'&&Number.isFinite(value)))out[key]=value;
  else throw Error('invalid_private_event_value');
 }
 // Strictly keep all payout claims disabled even on trusted internal events.
 if(out.xpAuthorized!==false||out.lootAuthorized!==false||
    out.currencyAuthorized!==false)
  throw Error('unsafe_private_combat_event');
 return out;
}
function wireSnapshot(encounter,scope){
 const source=encounter.snapshot();
 if(source?.instanceId!==scope.instanceId||
    source.rewardsIssued!==false||source.productionReady!==false||
    !seq(source.eventSeq)||!finite(source.serverTime)||
    !source.player||!Array.isArray(source.enemies)||
    source.enemies.length>16)
  throw Error('invalid_private_world_snapshot');
 const player=source.player;
 for(const field of ['x','z','hp','maxHp','stamina','facing']){
  if(!finite(player[field]))throw Error('invalid_private_world_player');
 }
 if(!seq(player.lastIntentSeq))throw Error('invalid_private_world_intents');
 const enemies=source.enemies.map(e=>{
  if(typeof e?.id!=='string'||!actorId(e.id)||!finite(e.x)||!finite(e.z)||
     !finite(e.hp)||!finite(e.maxHp)||typeof e.alive!=='boolean'||
     !(e.pendingImpactAt===null||finite(e.pendingImpactAt)))
    throw Error('invalid_private_world_enemy');
  return {id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,
   alive:e.alive,pendingImpactAt:e.pendingImpactAt};
 });
 return {protocol:WORLD_SYNC_POLICY_137.protocol,
  version:'13.7',instanceId:scope.instanceId,
  instanceEpoch:scope.instanceEpoch,
  mapFingerprint:scope.mapFingerprint,
  eventSeq:source.eventSeq,serverTime:source.serverTime,
  player:{x:player.x,z:player.z,hp:player.hp,
   maxHp:player.maxHp,stamina:player.stamina,
   facing:player.facing,lastIntentSeq:player.lastIntentSeq},
  enemies,rewardsIssued:false,productionReady:false};
}

// Lease verifier MUST check a transactionally claimed, exclusive DB lease
// with current epoch + holder + fencing token. A callback returning booleans,
// or a browser-supplied "verified" object, does NOT create that guarantee.
export async function createGame3DPrivateWorldSync137({
 encounter,ownerId,characterId,instanceId,instanceEpoch,holderId,
 mapFingerprint,resolveAuthenticatedSubject,verifyLease,now=Date.now,
}={}){
 if(!encounter||encounter.privateServerOnly!==true||
    encounter.version!=='13.6'||encounter.instanceId!==instanceId||
    encounter.mapFingerprint!==mapFingerprint||
    typeof encounter.mapId!=='string'||
    typeof encounter.tick!=='function'||typeof encounter.snapshot!=='function'||
    typeof encounter.getEventsAfter!=='function'||
    typeof encounter.setInput!=='function'||typeof encounter.submit!=='function'||
    typeof encounter.resetConnection!=='function'||
    !who(ownerId)||!who(characterId)||!key(instanceId)||
    !key(instanceEpoch)||!key(holderId)||!hex(mapFingerprint)||
    typeof resolveAuthenticatedSubject!=='function'||
    typeof verifyLease!=='function'||typeof now!=='function')
  throw Error('13.7 requires private encounter, authenticated session and exclusive lease');
 const scope=Object.freeze({instanceId,instanceEpoch,
  holderId,ownerId,characterId,mapFingerprint});
 let fenced=false,connectionId=null,baselineSeq=0;
 let fencingToken=null;
 // Serializes ALL snapshot, input, reconnect and tick operations, even when
 // their authentication/DB callbacks are async.
 let tail=Promise.resolve();
 const serial=fn=>{
  const result=tail.then(fn,fn);
  tail=result.catch(()=>{});
  return result;
 };
 const stop=()=>{
  fenced=true;connectionId=null;
  encounter.resetConnection();
 };
 const leased=async()=>{
  if(fenced)return false;
  try{
   const at=now();
   if(!Number.isSafeInteger(at)||at<0){stop();return false}
   const lease=await verifyLease(scope);
   if(!validLease(lease,scope,at,fencingToken)){
    stop();return false;
   }
   if(fencingToken===null)fencingToken=lease.fencingToken;
   return true;
  }catch{stop();return false}
 };
 const authorized=async serverRequestContext=>{
  try{
   const user=await resolveAuthenticatedSubject(serverRequestContext);
   return user?.authenticated===true&&
    user.identitySource==='trusted-server-session'&&
    user.accountId===ownerId&&user.characterId===characterId;
  }catch{return false}
 };
 const validate=async(serverRequestContext,requestedId)=>{
  if(!await authorized(serverRequestContext))
   return denied('unauthenticated_world_sync');
  if(!await leased())return denied('world_instance_lease_lost');
  if(!connectionId||requestedId!==connectionId)
   return denied('stale_world_connection');
  return null;
 };
 // Validate the lease at factory construction, before exposing the service.
 if(!await leased())throw Error('13.7 cannot establish exclusive instance lease');
 const connect=({serverRequestContext}={})=>serial(async()=>{
  if(!await authorized(serverRequestContext))
   return denied('unauthenticated_world_sync');
  if(!await leased())return denied('world_instance_lease_lost');
  try{
   encounter.resetConnection();
   const snapshot=wireSnapshot(encounter,scope);
   // A new session supersedes every earlier connection. Always use a full
   // snapshot and reset the client event cursor; never replay stale moves.
   connectionId=randomUUID();
   baselineSeq=snapshot.eventSeq;
   return {ok:true,version:'13.7',connectionId,
    reset:true,snapshot,cursor:baselineSeq,
    nextIntentSeq:snapshot.player.lastIntentSeq+1,
    rewardsIssued:false,productionReady:false};
  }catch{stop();return denied('invalid_private_world_snapshot')}
 });
 const disconnect=({serverRequestContext,connectionId:requestedId}={})=>
  serial(async()=>{
   const error=await validate(serverRequestContext,requestedId);
   if(error)return error;
   connectionId=null;
   encounter.resetConnection();
   return {ok:true,disconnected:true,rewardsIssued:false};
  });
 const setInput=({serverRequestContext,connectionId:requestedId,input}={})=>
  serial(async()=>{
   const error=await validate(serverRequestContext,requestedId);
   if(error)return error;
   return encounter.setInput({serverRequestContext,input});
  });
 const submit=({serverRequestContext,connectionId:requestedId,intent}={})=>
  serial(async()=>{
   const error=await validate(serverRequestContext,requestedId);
   if(error)return error;
   return encounter.submit({serverRequestContext,intent});
  });
 const advance=()=>serial(async()=>{
  // Only the private game-server scheduler should call advance(). No
  // network action is wired here. Never advance a disconnected encounter.
  if(!await leased())return denied('world_instance_lease_lost');
  if(!connectionId)return denied('world_instance_disconnected');
  try{
   const replies=encounter.tick();
   const snapshot=wireSnapshot(encounter,scope);
   return {ok:true,version:'13.7',
    replies,snapshot,eventSeq:snapshot.eventSeq,
    rewardsIssued:false,productionReady:false};
  }catch{stop();return denied('world_encounter_tick_failed')}
 });
 const poll=({serverRequestContext,connectionId:requestedId,
  afterSeq}={})=>serial(async()=>{
   const error=await validate(serverRequestContext,requestedId);
   if(error)return error;
   if(!seq(afterSeq))return denied('invalid_world_event_cursor');
   try{
    const snapshot=wireSnapshot(encounter,scope);
    if(afterSeq>snapshot.eventSeq)
     return denied('future_world_event_cursor');
    const all=encounter.getEventsAfter(0);
    if(!Array.isArray(all)||all.length>WORLD_SYNC_POLICY_137.maxStoredEvents)
     throw Error('invalid event history');
    let previous=-1;
    const clean=all.map(event=>{
     const item=wireEvent(event);
     if(item.instanceId!==instanceId||item.seq<=previous||
        (previous>=0&&item.seq!==previous+1)||
        item.seq>snapshot.eventSeq)throw Error('event identity mismatch');
     previous=item.seq;
     return item;
    });
    // No "invented" replay when the ring has evicted events. New snapshots
    // are authoritative, while stale cosmetic events must be discarded.
    const first=clean[0]?.seq??snapshot.eventSeq+1;
    if(afterSeq<baselineSeq||afterSeq<first-1)
     return {ok:true,version:'13.7',
      reset:true,gap:true,snapshot,events:[],
      nextSeq:snapshot.eventSeq,hasMore:false,
      rewardsIssued:false,productionReady:false};
    const remaining=clean.filter(e=>e.seq>afterSeq);
    const events=remaining.slice(0,WORLD_SYNC_POLICY_137.maxReplayEvents);
    return {ok:true,version:'13.7',reset:false,gap:false,
     snapshot,events,
     nextSeq:events.at(-1)?.seq??afterSeq,
     hasMore:remaining.length>events.length,
     rewardsIssued:false,productionReady:false};
   }catch{stop();return denied('world_event_stream_corrupt')}
  });
 return Object.freeze({version:'13.7',connect,disconnect,setInput,
  submit,advance,poll,privateServerOnly:true,
  sourceMilestone:'13.7',durableLeaseWriterInstalled:false,
  publicTransportInstalled:false,worldBroadcastEnabled:false,
  multiplayerPlayerReplicationEnabled:false,
  rewardWriterEnabled:false,productionReady:false});
}
