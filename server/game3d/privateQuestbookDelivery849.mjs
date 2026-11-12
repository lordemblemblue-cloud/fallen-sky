// Game 3D Combat / Quest 84.9 — server-owned delivery contract only.
// No HTTP endpoint, WebSocket, bearer-token issuer, or live GameView switch.
// The original 84.8 read model owns the server cursor and world session.
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const TARGET=/^[A-Za-z0-9_.:-]{1,160}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(value,keys)=>obj(value)&&Object.keys(value).length===keys.length&&
 Object.keys(value).every(k=>keys.includes(k));
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const deny=(reason,retryAfterMs=0)=>Object.freeze({ok:false,version:'84.9',reason,
 retryAfterMs,privateServerOnly:true,productionReady:false,
 rewardsIssued:false,rewardAuthorized:false});
export const PRIVATE_DELIVERY_LIMITS_849=Object.freeze({
 minPollMs:500,maxPollsPerMinute:90,maxPending:4,
 maxResponseBytes:65536,maxSessionAgeMs:900000,
 maxEvents:40,maxEnemies:16,maxObjectives:128,
});
const goodScope=s=>obj(s)&&[s.ownerId,s.characterId].every(x=>
 typeof x==='string'&&WHO.test(x)&&!['__anon__','__default__','__dev_test__'].includes(x))&&
 [s.instanceId,s.instanceEpoch].every(x=>typeof x==='string'&&KEY.test(x))&&
 typeof s.mapFingerprint==='string'&&HASH.test(s.mapFingerprint);
const goodEdge=(v,s,at)=>obj(v)&&v.authenticated===true&&
 v.identitySource==='independent-server-edge-849'&&
 v.credentialVerified===true&&v.originApproved===true&&
 v.csrfVerified===true&&v.readOnly===true&&v.method==='GET'&&
 v.accountId===s.ownerId&&v.characterId===s.characterId&&
 v.worldInstanceId===s.instanceId&&v.worldEpoch===s.instanceEpoch&&
 typeof v.worldSessionId==='string'&&KEY.test(v.worldSessionId)&&
 typeof v.actionSessionId==='string'&&ACTION.test(v.actionSessionId)&&
 typeof v.leaseNonce==='string'&&UUID.test(v.leaseNonce)&&
 integer(v.expiresAtMs)&&v.expiresAtMs>at&&
 v.expiresAtMs<=at+PRIVATE_DELIVERY_LIMITS_849.maxSessionAgeMs;
const generation=v=>Object.freeze({accountId:v.accountId,
 characterId:v.characterId,worldInstanceId:v.worldInstanceId,
 worldEpoch:v.worldEpoch,worldSessionId:v.worldSessionId,
 actionSessionId:v.actionSessionId,leaseNonce:v.leaseNonce});
const same=(a,b)=>obj(a)&&obj(b)&&Object.keys(a).every(k=>a[k]===b[k]);
const validPlayer=p=>obj(p)&&
 ['x','z','hp','maxHp','stamina','facing'].every(k=>finite(p[k]))&&
 integer(p.lastIntentSeq)&&p.maxHp>0&&p.hp>=0&&p.hp<=p.maxHp&&p.stamina>=0;
const validEnemy=e=>obj(e)&&typeof e.id==='string'&&TARGET.test(e.id)&&
 ['x','z','hp','maxHp'].every(k=>finite(e[k]))&&e.maxHp>0&&
 e.hp>=0&&e.hp<=e.maxHp&&typeof e.alive==='boolean'&&
 (e.pendingImpactAt===null||finite(e.pendingImpactAt));
const validSnapshot=s=>obj(s)&&integer(s.eventSeq)&&finite(s.serverTime)&&
 validPlayer(s.player)&&Array.isArray(s.enemies)&&
 s.enemies.length<=PRIVATE_DELIVERY_LIMITS_849.maxEnemies&&
 s.enemies.every(validEnemy);
const validObjective=o=>obj(o)&&
 ['questId','objectiveId'].every(k=>typeof o[k]==='string'&&KEY.test(o[k]))&&
 typeof o.status==='string'&&/^[a-z][a-z_]{0,47}$/.test(o.status)&&
 integer(o.current)&&integer(o.required)&&o.required>=1&&
 o.required<=10000&&o.current<=o.required&&
 o.targetReached===(o.current===o.required);
const eventKeys=['seq','kind','serverTime','targetId','enemyId','tier',
 'damage','enemyHp','playerHp','critical','killed','impactAt'];
const validEvent=e=>obj(e)&&integer(e.seq)&&
 typeof e.kind==='string'&&/^[a-z][a-z_]{0,63}$/.test(e.kind)&&
 finite(e.serverTime)&&
 ['targetId','enemyId'].every(k=>e[k]===undefined||
 typeof e[k]==='string'&&TARGET.test(e[k]))&&
 (e.tier===undefined||typeof e.tier==='string'&&
 /^[A-Za-z][A-Za-z_]{0,31}$/.test(e.tier))&&
 ['damage','enemyHp','playerHp','impactAt'].every(k=>e[k]===undefined||finite(e[k]))&&
 ['critical','killed'].every(k=>e[k]===undefined||typeof e[k]==='boolean');
const shape=r=>{
 if(r?.ok!==true||r.version!=='84.8'||
    r.privateServerOnly!==true||r.productionReady!==false||
    r.rewardsIssued!==false||r.rewardAuthorized!==false||
    !validSnapshot(r.snapshot)||!integer(r.nextSeq)||
    r.nextSeq>r.snapshot.eventSeq||
    typeof r.reset!=='boolean'||typeof r.hasMore!=='boolean'||
    (r.gap!==undefined&&typeof r.gap!=='boolean')||
    !Array.isArray(r.events)||r.events.length>PRIVATE_DELIVERY_LIMITS_849.maxEvents||
    !r.events.every(validEvent)||
    !obj(r.questbook)||r.questbook.objectiveTargetOnly!==true||
    r.questbook.turnInAuthorized!==false||
    !Array.isArray(r.questbook.objectives)||
    r.questbook.objectives.length>PRIVATE_DELIVERY_LIMITS_849.maxObjectives||
    !r.questbook.objectives.every(validObjective))return null;
 const p=r.snapshot.player;
 const snap=Object.freeze({eventSeq:r.snapshot.eventSeq,
  serverTime:r.snapshot.serverTime,
  player:Object.freeze({x:p.x,z:p.z,hp:p.hp,maxHp:p.maxHp,
   stamina:p.stamina,facing:p.facing,lastIntentSeq:p.lastIntentSeq}),
  enemies:Object.freeze(r.snapshot.enemies.map(e=>Object.freeze({
   id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,
   alive:e.alive,pendingImpactAt:e.pendingImpactAt,
  }))),
 });
 const objectives=Object.freeze(r.questbook.objectives.map(o=>Object.freeze({
  questId:o.questId,objectiveId:o.objectiveId,status:o.status,
  current:o.current,required:o.required,targetReached:o.targetReached,
 })));
 const events=Object.freeze(r.events.map(e=>Object.freeze(Object.fromEntries(
  eventKeys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])))));
 return Object.freeze({protocol:'game3d-private-presentation-849',
  snapshot:snap,questbook:Object.freeze({objectives,
   objectiveTargetOnly:true,turnInAuthorized:false}),events,
  nextSeq:r.nextSeq,reset:r.reset,gap:r.gap===true,hasMore:r.hasMore});
};

export function createGame3DPrivateQuestbookDelivery849({
 view,scope,serverRequestContext,verifyEdgeRequest,
 now=Date.now,enabled=false,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    view?.version!=='84.8'||view.privateServerOnly!==true||
    view.publicPlayerRouteInstalled!==false||
    view.publicTransportInstalled!==false||
    view.featureEnabledInLiveGame!==false||
    view.credentialDeliveredToBrowser!==false||
    view.hostedWorkerInstalled!==false||
    ['open','read','shutdown'].some(x=>typeof view[x]!=='function')||
    !goodScope(scope)||!obj(serverRequestContext)||
    typeof verifyEdgeRequest!=='function'||typeof now!=='function')
  throw Error('84.9 requires an independently authenticated private read-only view');
 const pinned=Object.freeze({...scope});
 let lastClock=-1,lastPoll=-Infinity,windowStart=-1,polls=0;
 let pending=0,opened=false,stopped=false,fenced=false,shutdownDone=false;
 let shutdownRequested=false;
 let session=null,cursor=0;
 let lane=Promise.resolve();
 const serial=fn=>{
  if(shutdownRequested||stopped)return Promise.resolve(deny('private_delivery_closed'));
  if(pending>=PRIVATE_DELIVERY_LIMITS_849.maxPending)
   return Promise.resolve(deny('private_delivery_queue_full'));
  pending++;
  const work=lane.then(fn,fn);lane=work.then(()=>{},()=>{});
  return work.finally(()=>{pending--});
 };
 const clock=()=>{
  let value;
  try{value=now()}catch{return null}
  if(!integer(value)||value===0||value<lastClock)return null;
  lastClock=value;return value;
 };
 const terminate=async reason=>{
  fenced=true;opened=false;session=null;
  if(!shutdownDone){shutdownDone=true;try{await view.shutdown()}catch{}}
  return deny(reason);
 };
 const auth=async(edgeContext,operation)=>{
  if(!obj(edgeContext))return null;
  let evidence;
  try{
   const at=clock();if(at===null)return false;
   evidence=await verifyEdgeRequest(Object.freeze({
    serverRequestContext,edgeContext,operation,
   }));
   const after=clock();
   if(after===null)return false;
   if(!goodEdge(evidence,pinned,after))return null;
  }catch{return null}
  return generation(evidence);
 };
 const deliver=r=>{
  const payload=shape(r);
  if(!payload)return null;
  const json=JSON.stringify(payload);
  if(Buffer.byteLength(json,'utf8')>PRIVATE_DELIVERY_LIMITS_849.maxResponseBytes)
   return null;
  return Object.freeze({ok:true,version:'84.9',
   payload,cacheControl:'no-store',contentType:'application/json',
   privateServerOnly:true,productionReady:false,
   rewardsIssued:false,rewardAuthorized:false});
 };
 const open=(request)=>serial(async()=>{
  if(stopped||fenced||shutdownRequested)return deny('private_delivery_closed');
  if(!exact(request,['edgeContext']))return deny('invalid_private_delivery_request');
  const {edgeContext}=request;
  if(opened)return deny('private_delivery_already_open');
  const before=await auth(edgeContext,'open');
  if(shutdownRequested)return deny('private_delivery_closed');
  // A rejected initial request has not opened a world. Do not let a
  // foreign/unverified caller consume the owner’s private instance.
  if(before===false)return terminate('private_delivery_clock_invalid');
  if(!before)return deny('private_edge_authentication_failed');
  let r;
  try{r=await view.open()}catch{return terminate('private_view_open_unavailable')}
  if(shutdownRequested)return deny('private_delivery_closed');
  const after=await auth(edgeContext,'open');
  if(shutdownRequested)return deny('private_delivery_closed');
  if(!same(before,after))return terminate('private_edge_session_changed');
  const result=deliver(r);
  if(!result||!result.payload.reset||result.payload.events.length!==0||
     result.payload.nextSeq!==result.payload.snapshot.eventSeq)
   return terminate('private_view_payload_unverified');
  opened=true;session=before;cursor=result.payload.nextSeq;
  return result;
 });
 const poll=(request)=>serial(async()=>{
  if(stopped||fenced||shutdownRequested)return deny('private_delivery_closed');
  if(!exact(request,['edgeContext']))return deny('invalid_private_delivery_request');
  const {edgeContext}=request;
  if(!opened||!session)return deny('private_delivery_not_open');
  // Authenticate before charging this world’s private rate budget.
  // A foreign or invalid caller cannot throttle/evict the current player.
  // A verified change to the *same pinned player’s* authenticated world
  // generation is different: revoke the stale owner and close the view.
  const before=await auth(edgeContext,'poll');
  if(shutdownRequested)return deny('private_delivery_closed');
  if(before===false)return terminate('private_delivery_clock_invalid');
  if(!before)return deny('private_edge_authentication_failed');
  if(!same(session,before))return terminate('private_edge_session_changed');
  const at=clock();
  if(at===null)return terminate('private_delivery_clock_invalid');
  if(windowStart<0||at-windowStart>=60000){windowStart=at;polls=0;}
  const elapsed=at-lastPoll;
  if(elapsed<PRIVATE_DELIVERY_LIMITS_849.minPollMs)
   return deny('private_delivery_rate_limited',PRIVATE_DELIVERY_LIMITS_849.minPollMs-elapsed);
  if(polls>=PRIVATE_DELIVERY_LIMITS_849.maxPollsPerMinute)
   return deny('private_delivery_budget_exhausted',Math.max(0,60000-(at-windowStart)));
  lastPoll=at;polls++;
  let r;
  try{r=await view.read()}catch{return terminate('private_view_read_unavailable')}
  if(shutdownRequested)return deny('private_delivery_closed');
  const after=await auth(edgeContext,'poll');
  if(shutdownRequested)return deny('private_delivery_closed');
  if(!same(session,after))return terminate('private_edge_session_changed');
  // Only an explicitly transient original 84.8 frame refusal is retryable.
  // A rotated, fenced or malformed inner view must terminate this 84.9
  // delivery too; otherwise it could keep an unauthenticated session alive.
  if(r?.ok!==true){
   if(r?.reason==='private_world_frame_not_ready')
    return deny('private_view_not_ready');
   return terminate('private_view_rejected');
  }
  const result=deliver(r);
  if(!result)return terminate('private_view_payload_unverified');
  const frame=result.payload;
  if((frame.reset||frame.gap)&&
     (frame.events.length!==0||frame.hasMore||
      frame.nextSeq!==frame.snapshot.eventSeq))
   return terminate('private_delivery_reset_invalid');
  if(!frame.reset&&!frame.gap){
   if(frame.nextSeq<cursor||(frame.hasMore&&frame.events.length===0))
    return terminate('private_delivery_cursor_regressed');
   let prev=cursor;
   for(const event of frame.events){
    if(event.seq<=prev||event.seq>frame.snapshot.eventSeq)
     return terminate('private_delivery_event_chain_invalid');
    prev=event.seq;
   }
   if((frame.events.length===0&&frame.nextSeq!==cursor)||
      (frame.events.length>0&&prev!==frame.nextSeq))
    return terminate('private_delivery_cursor_mismatch');
  }
  cursor=frame.nextSeq;
  return result;
 });
 const shutdown=()=>{
  // Fence new and already-pending responses immediately; actual shutdown
  // still follows the original serialized read lane to avoid racing writes.
  shutdownRequested=true;
  const job=lane.then(async()=>{
   if(stopped)return false;
   stopped=true;opened=false;session=null;
   if(shutdownDone)return false;
   shutdownDone=true;
   try{return await view.shutdown()===true}catch{return false}
  });
  lane=job.then(()=>{},()=>{});
  return job;
 };
 return Object.freeze({version:'84.9',open,poll,shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicTransportInstalled:false,hostedWorkerInstalled:false,
  credentialDeliveredToBrowser:false,featureEnabledInLiveGame:false,
  rewardWriterInstalled:false,productionReady:false});
}
