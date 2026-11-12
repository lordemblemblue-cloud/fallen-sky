// Game 3D Combat / Quest 84.8 — read-only, private Questbook/world projection.
// This is NOT an HTTP endpoint, browser bridge, auth issuer or game scheduler.
// Original 84.6 -> 84.5 -> 84.4 -> 18.5 authorities remain unchanged.
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TARGET=/^[A-Za-z0-9_.:-]{1,160}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const denied=reason=>Object.freeze({ok:false,version:'84.8',reason,
 privateServerOnly:true,rewardsIssued:false,rewardAuthorized:false,
 productionReady:false});
export const PRIVATE_QUESTBOOK_PRESENTATION_LIMITS_848=Object.freeze({
 maxEvents:40,maxEnemies:16,maxObjectives:128,maxSessionAgeMs:900000,
});
const who=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const key=x=>typeof x==='string'&&KEY.test(x);
const target=x=>typeof x==='string'&&TARGET.test(x);
const safeScope=s=>obj(s)&&who(s.ownerId)&&who(s.characterId)&&
 key(s.instanceId)&&key(s.instanceEpoch)&&
 typeof s.mapFingerprint==='string'&&HASH.test(s.mapFingerprint);
const safePlayer=p=>obj(p)&&
 ['x','z','hp','maxHp','stamina','facing'].every(k=>finite(p[k]))&&
 integer(p.lastIntentSeq)&&p.maxHp>0&&p.hp>=0&&p.hp<=p.maxHp&&
 p.stamina>=0;
const safeEnemy=e=>obj(e)&&target(e.id)&&
 ['x','z','hp','maxHp'].every(k=>finite(e[k]))&&
 e.maxHp>0&&e.hp>=0&&e.hp<=e.maxHp&&
 typeof e.alive==='boolean'&&
 (e.pendingImpactAt===null||finite(e.pendingImpactAt));
const safeSnapshot=s=>obj(s)&&integer(s.eventSeq)&&finite(s.serverTime)&&
 safePlayer(s.player)&&Array.isArray(s.enemies)&&
 s.enemies.length<=PRIVATE_QUESTBOOK_PRESENTATION_LIMITS_848.maxEnemies&&
 s.enemies.every(safeEnemy);
const cloneSnapshot=s=>Object.freeze({eventSeq:s.eventSeq,serverTime:s.serverTime,
 player:Object.freeze(Object.fromEntries(
  ['x','z','hp','maxHp','stamina','facing','lastIntentSeq']
   .map(k=>[k,s.player[k]]))),
 enemies:Object.freeze(s.enemies.map(e=>Object.freeze({
  id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,alive:e.alive,
  pendingImpactAt:e.pendingImpactAt,
 }))),
});
const safeObjective=o=>obj(o)&&key(o.questId)&&key(o.objectiveId)&&
 typeof o.status==='string'&&/^[a-z][a-z_]{0,47}$/.test(o.status)&&
 integer(o.current)&&Number.isSafeInteger(o.required)&&
 o.required>=1&&o.required<=10000&&o.current<=o.required;
const snapshotObjectives=items=>{
 const seen=new Set();
 if(!Array.isArray(items)||
    items.length>PRIVATE_QUESTBOOK_PRESENTATION_LIMITS_848.maxObjectives||
    !items.every(o=>{
     if(!safeObjective(o))return false;
     const id=o.questId+'\0'+o.objectiveId;
     if(seen.has(id))return false;
     seen.add(id);return true;
    }))return null;
 // A reached objective target does NOT indicate a server-authorized
 // quest turn-in: the original 15.6 fresh NPC event is still required.
 const ordered=[...items].sort((a,b)=>a.questId.localeCompare(b.questId)||
  a.objectiveId.localeCompare(b.objectiveId));
 return Object.freeze(ordered.map(o=>Object.freeze({
  questId:o.questId,objectiveId:o.objectiveId,status:o.status,
  current:o.current,required:o.required,targetReached:o.current===o.required,
 })));
};
const EVENT_FIELDS=Object.freeze(['seq','kind','serverTime','targetId',
 'enemyId','tier','damage','enemyHp','playerHp','critical','killed','impactAt']);
const safeEvent=e=>obj(e)&&integer(e.seq)&&
 typeof e.kind==='string'&&/^[a-z][a-z_]{0,63}$/.test(e.kind)&&
 finite(e.serverTime)&&
 ['targetId','enemyId'].every(k=>e[k]===undefined||target(e[k]))&&
 (e.tier===undefined||typeof e.tier==='string'&&
  /^[A-Za-z][A-Za-z_]{0,31}$/.test(e.tier))&&
 ['damage','enemyHp','playerHp','impactAt'].every(
  k=>e[k]===undefined||finite(e[k]))&&
 ['critical','killed'].every(k=>e[k]===undefined||typeof e[k]==='boolean');
const cloneEvent=e=>Object.freeze(Object.fromEntries(
 EVENT_FIELDS.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])));
const safeViewer=(v,scope,at)=>obj(v)&&v.authenticated===true&&
 v.identitySource==='base44-verified-action-session-179'&&
 v.accountId===scope.ownerId&&v.characterId===scope.characterId&&
 v.worldInstanceId===scope.instanceId&&v.worldEpoch===scope.instanceEpoch&&
 key(v.worldSessionId)&&typeof v.actionSessionId==='string'&&
 ACTION.test(v.actionSessionId)&&typeof v.leaseNonce==='string'&&
 UUID.test(v.leaseNonce)&&integer(v.expiresAtMs)&&v.expiresAtMs>at&&
 v.expiresAtMs<=at+PRIVATE_QUESTBOOK_PRESENTATION_LIMITS_848.maxSessionAgeMs;
const generation=v=>Object.freeze({accountId:v.accountId,
 characterId:v.characterId,worldInstanceId:v.worldInstanceId,
 worldEpoch:v.worldEpoch,worldSessionId:v.worldSessionId,
 actionSessionId:v.actionSessionId,leaseNonce:v.leaseNonce});
const same=(a,b)=>!!a&&!!b&&Object.keys(a).every(k=>a[k]===b[k]);

export function createGame3DPrivateQuestbookPresentation848({
 host,scope,serverRequestContext,verifyAuthorizedReader,
 now=Date.now,enabled=false,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    host?.version!=='84.6'||host.privateServerOnly!==true||
    host.publicPlayerRouteInstalled!==false||
    host.publicTransportInstalled!==false||
    host.credentialDeliveredToBrowser!==false||
    host.hostedWorkerInstalled!==false||
    ['open','frame','disconnect','shutdown'].some(k=>
     typeof host[k]!=='function')||
    !safeScope(scope)||!obj(serverRequestContext)||
    typeof verifyAuthorizedReader!=='function'||typeof now!=='function')
  throw Error('84.8 requires original private world host and independent verified viewer');
 const pinned=Object.freeze({...scope});
 let handle=null,session=null,closed=false,halted=false,cursor=0;
 let shutdownRequested=false;
 let hostStarted=false,hostShutdown=false;
 let tail=Promise.resolve();
 const serial=fn=>{const work=tail.then(fn,fn);
  tail=work.then(()=>undefined,()=>undefined);return work};
 const fail=async reason=>{
  if(shutdownRequested)return denied('private_view_closed');
  halted=true;handle=null;session=null;
  // A failed inner reader MUST release an already-started original 84.6
  // world, even when there is no enclosing 84.9 delivery instance.
  if(hostStarted&&!hostShutdown){
   hostShutdown=true;
   try{await host.shutdown()}catch{}
  }
  return denied(reason);
 };
 const attest=async()=>{
  let v;
  try{
   const at=now();if(!integer(at)||at===0)return null;
   v=await verifyAuthorizedReader(serverRequestContext);
   if(!safeViewer(v,pinned,now()))return null;
  }catch{return null}
  return generation(v);
 };
 const open=()=>shutdownRequested
  ? Promise.resolve(denied('private_view_closed'))
  : serial(async()=>{
  if(closed||halted||shutdownRequested)return denied('private_view_closed');
  if(handle!==null)return denied('private_view_already_open');
  const first=await attest();
  if(shutdownRequested)return denied('private_view_closed');
  if(!first)return fail('private_viewer_session_unverified');
  let opened;
  hostStarted=true;
  try{opened=await host.open()}catch{return fail('private_world_open_unavailable')}
  if(shutdownRequested)return denied('private_view_closed');
  const after=await attest();
  if(shutdownRequested)return denied('private_view_closed');
  if(!after||!same(first,after))return fail('private_viewer_session_rotated');
  if(opened?.ok!==true||opened.version!=='84.6'||
     opened.privateServerOnly!==true||opened.rewardsIssued!==false||
     !obj(opened.handle)||!safeSnapshot(opened.snapshot))
   return fail('private_world_snapshot_unverified');
  handle=opened.handle;session=first;cursor=opened.snapshot.eventSeq;
  return Object.freeze({ok:true,version:'84.8',
   snapshot:cloneSnapshot(opened.snapshot),
   questbook:Object.freeze({objectives:Object.freeze([]),
    objectiveTargetOnly:true,turnInAuthorized:false}),
   nextSeq:cursor,reset:true,events:Object.freeze([]),hasMore:false,
   privateServerOnly:true,productionReady:false,
   rewardsIssued:false,rewardAuthorized:false});
 });
 const read=()=>shutdownRequested
  ? Promise.resolve(denied('private_view_closed'))
  : serial(async()=>{
  if(closed||halted||shutdownRequested)return denied('private_view_closed');
  if(!handle||!session)return denied('private_view_not_open');
  const first=await attest();
  if(shutdownRequested)return denied('private_view_closed');
  if(!same(session,first))return fail('private_viewer_session_rotated');
  let frame;
  try{frame=await host.frame({handle,afterSeq:cursor})}
  catch{return fail('private_world_frame_unavailable')}
  if(shutdownRequested)return denied('private_view_closed');
  const after=await attest();
  if(shutdownRequested)return denied('private_view_closed');
  if(!same(session,after))return fail('private_viewer_session_rotated');
  if(frame?.ok!==true){
   // The original 84.6 host uses this ONE precise code when an
   // ambiguous 84.4/18.5 receipt replay requires explicit recovery.
   // Any other rejection is terminal: the underlying private world may
   // already be closed or session-fenced, not merely behind on polling.
   if(frame?.reason==='private_quest_reconciliation_required')
    return denied('private_world_frame_not_ready');
   return fail('private_world_frame_rejected');
  }
  if(frame.version!=='84.6'||frame.privateServerOnly!==true||
     frame.rewardsIssued!==false||frame.rewardAuthorized!==false||
     frame.productionReady!==false||!safeSnapshot(frame.snapshot)||
     !integer(frame.nextSeq)||frame.nextSeq>frame.snapshot.eventSeq||
     typeof frame.reset!=='boolean'||typeof frame.gap!=='boolean'||
     typeof frame.hasMore!=='boolean'||
     !Array.isArray(frame.events)||
     frame.events.length>PRIVATE_QUESTBOOK_PRESENTATION_LIMITS_848.maxEvents)
   return fail('unverified_private_world_frame');
  const objectives=snapshotObjectives(frame.objectives);
  if(!objectives)return fail('invalid_private_questbook_objectives');
  if(frame.reset||frame.gap){
   if(frame.events.length!==0||frame.hasMore||
      frame.nextSeq!==frame.snapshot.eventSeq)
    return fail('invalid_private_world_reset');
  }else if(frame.nextSeq<cursor||
           (frame.hasMore&&frame.events.length===0))
   return fail('private_world_frame_cursor_regressed');
  let prev=cursor;
  for(const e of frame.events){
   if(!safeEvent(e)||e.seq<=prev||e.seq>frame.snapshot.eventSeq)
    return fail('invalid_private_world_event');
   prev=e.seq;
  }
  if(frame.events.length>0&&frame.nextSeq!==prev)
   return fail('private_world_frame_sequence_mismatch');
  cursor=frame.nextSeq;
  return Object.freeze({ok:true,version:'84.8',
   snapshot:cloneSnapshot(frame.snapshot),
   events:Object.freeze(frame.events.map(cloneEvent)),
   questbook:Object.freeze({objectives,objectiveTargetOnly:true,
    turnInAuthorized:false}),
   nextSeq:cursor,reset:frame.reset,gap:frame.gap,
   hasMore:frame.hasMore,privateServerOnly:true,productionReady:false,
   rewardsIssued:false,rewardAuthorized:false});
 });
 const disconnect=()=>shutdownRequested
  ? Promise.resolve(denied('private_view_closed'))
  : serial(async()=>{
  if(closed||halted||shutdownRequested)return denied('private_view_closed');
  if(!handle)return denied('private_view_not_open');
  const active=handle;handle=null;session=null;closed=true;
  // This viewer cannot reconnect after disconnect. Returning success
  // without releasing its original 84.6 host would strand the world owner.
  let r,disconnectThrew=false;
  try{r=await host.disconnect({handle:active})}
  catch{disconnectThrew=true}
  // A concurrent explicit shutdown owns teardown once it reaches the lane.
  if(shutdownRequested)return denied('private_view_closed');
  if(!hostShutdown){
   hostShutdown=true;
   let released=false;
   try{released=await host.shutdown()===true}catch{}
   if(shutdownRequested)return denied('private_view_closed');
   if(!released)return denied('private_world_disconnect_cleanup_unverified');
  }
  if(disconnectThrew)return denied('private_world_disconnect_unavailable');
  if(r?.ok!==true||r.rewardsIssued!==false)
   return denied('private_world_disconnect_unverified');
  return Object.freeze({ok:true,version:'84.8',privateServerOnly:true,
   rewardsIssued:false,productionReady:false});
 });
 const shutdown=()=>{
  // Requesting teardown immediately blocks new, queued and in-flight
  // display responses. Real host cleanup still follows the private lane.
  shutdownRequested=true;
  return serial(async()=>{
  closed=true;handle=null;session=null;
  if(hostShutdown)return false;
  hostShutdown=true;
  try{return await host.shutdown()===true}catch{return false}
  });
 };
 return Object.freeze({version:'84.8',open,read,disconnect,shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicTransportInstalled:false,hostedWorkerInstalled:false,
  credentialDeliveredToBrowser:false,featureEnabledInLiveGame:false,
  rewardWriterInstalled:false,productionReady:false});
}
