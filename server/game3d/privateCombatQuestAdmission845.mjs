// Game 3D Combat / Quest 84.5 — server-held, authenticated admission to the
// ORIGINAL 84.4 combat scheduler. No public route, player token, or new writer.
import {createGame3DPrivateCombatQuestStaging844}
 from './privateCombatQuestScheduler844.mjs';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const WORLD=/^[A-Za-z0-9_.:-]{8,128}$/;
const who=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k));
const denied=reason=>Object.freeze({ok:false,version:'84.5',reason,
 privateServerOnly:true,rewardsIssued:false,rewardAuthorized:false,
 productionReady:false});
const same=(a,b)=>!!a&&!!b&&
 ['ownerId','characterId','worldInstanceId','worldEpoch',
  'serverSessionId','actionSessionId','leaseNonce','expiresAtMs']
 .every(key=>a[key]===b[key]);

// This adapter accepts no caller-supplied account, session, server context,
// receipt, or quest fields. The host owns the context and input trust boundary.
// The original 13.7 owner still validates connection IDs and command semantics.
export function createGame3DPrivateCombatQuestAdmission845({
 pump,worldStage180,serverRequestContext,scope,
 resolveTrustedWorldPrincipal,resolveVerifiedBase44ActionSession,
 verifySessionActive,now=Date.now,enabled=false,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    pump?.version!=='84.4'||pump.privateServerOnly!==true||
    pump.publicPlayerRouteInstalled!==false||
    pump.publicTransportInstalled!==false||
    pump.independentKillWriterCreated!==false||
    ['connect','setInput','submit','poll','disconnect','advance','recover','shutdown']
     .some(key=>typeof pump[key]!=='function')||
    worldStage180?.version!=='18.0'||worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    !obj(serverRequestContext)||!obj(scope)||
    !who(scope.ownerId)||!who(scope.characterId)||
    typeof scope.instanceId!=='string'||!WORLD.test(scope.instanceId)||
    typeof scope.instanceEpoch!=='string'||!WORLD.test(scope.instanceEpoch)||
    [resolveTrustedWorldPrincipal,resolveVerifiedBase44ActionSession,
     verifySessionActive,now].some(fn=>typeof fn!=='function'))
  throw Error('84.5 requires private original scheduler and independent world/Base44 admission');
 const pinned=Object.freeze({ownerId:scope.ownerId,characterId:scope.characterId,
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch});
 let stopped=false,halted=false,leasePinned=null,connectionId=null;
 let shutdownRequested=false;
 let lane=Promise.resolve();
 const serial=(fn,allowShutdown=false)=>{
  if(shutdownRequested&&!allowShutdown)
   return Promise.resolve(denied('private_session_admission_stopped'));
  const guard=()=>shutdownRequested&&!allowShutdown
   ? denied('private_session_admission_stopped') : fn();
  const call=lane.then(guard,guard);
  lane=call.then(()=>{},()=>{});return call;
 };
 const clock=()=>{const v=now();return Number.isSafeInteger(v)&&v>0?v:0};
 const attest=async()=>{
  if(stopped||halted||!clock())return null;
  let world,action,lease;
  try{
   [world,action]=await Promise.all([
    resolveTrustedWorldPrincipal(serverRequestContext),
    resolveVerifiedBase44ActionSession(serverRequestContext),
   ]);
   const at=clock();
   if(world?.authenticated!==true||
      world.identitySource!=='trusted-server-session'||
      world.accountId!==pinned.ownerId||world.characterId!==pinned.characterId||
      action?.authenticated!==true||
      action.identitySource!=='base44-verified-action-session-179'||
      action.accountId!==pinned.ownerId||action.characterId!==pinned.characterId||
      typeof world.serverSessionId!=='string'||!WORLD.test(world.serverSessionId)||
      action.worldSessionId!==world.serverSessionId||
      typeof action.actionSessionId!=='string'||!ACTION.test(action.actionSessionId)||
      !Number.isSafeInteger(world.expiresAtMs)||
      !Number.isSafeInteger(action.expiresAtMs)||
      world.expiresAtMs<=at||action.expiresAtMs<=at||
      world.expiresAtMs>at+900000||action.expiresAtMs>at+900000)
    return null;
   if(await verifySessionActive(Object.freeze({
    ownerId:pinned.ownerId,characterId:pinned.characterId,
    instanceId:pinned.instanceId,serverSessionId:world.serverSessionId,
    actionSessionId:action.actionSessionId,
   }))!==true)return null;
   lease=await worldStage180.resolveCurrentWorldLease183({serverRequestContext});
   if(!obj(lease)||lease.ownerId!==pinned.ownerId||
      lease.characterId!==pinned.characterId||
      lease.worldInstanceId!==pinned.instanceId||
      lease.worldEpoch!==pinned.instanceEpoch||
      lease.serverSessionId!==world.serverSessionId||
      lease.actionSessionId!==action.actionSessionId||
      typeof lease.leaseNonce!=='string'||!UUID.test(lease.leaseNonce)||
      !Number.isSafeInteger(lease.expiresAtMs)||
      lease.expiresAtMs<=clock()||
      lease.expiresAtMs>Math.min(world.expiresAtMs,action.expiresAtMs))return null;
   if(leasePinned&&!same(leasePinned,lease))return null;
   if(!leasePinned)leasePinned=Object.freeze({...lease});
   return Object.freeze({...lease});
  }catch{return null}
 };
 const verifyResponse=(result,operation)=>result?.ok===true&&
  result.rewardsIssued===false&&result.rewardAuthorized!==true&&
  (operation!=='advance'&&operation!=='recover'||
   (result.version==='84.4'&&result.progressSynchronized===true));
 const invoke=(operation,args,expectedConnection=null)=>serial(async()=>{
  if(stopped)return denied('private_session_admission_stopped');
  if(halted)return denied('private_session_admission_halted');
  // Queued reconnects can rotate the connection while another request waits.
  // Revalidate against the CURRENT server-held connection inside the lane.
  if(expectedConnection!==null&&connectionId!==expectedConnection)
   return denied('stale_private_world_connection');
  const before=await attest();
  if(shutdownRequested)return denied('private_session_admission_stopped');
  if(!before){halted=true;return denied('private_world_or_base44_session_unverified')}
  let result;
  try{result=await pump[operation](args)}
  catch{
   if(shutdownRequested)return denied('private_session_admission_stopped');
   halted=true;return denied('private_world_operation_unavailable');
  }
  if(shutdownRequested)return denied('private_session_admission_stopped');
  const after=await attest();
  if(shutdownRequested)return denied('private_session_admission_stopped');
  if(!after||!same(before,after)){
   halted=true;connectionId=null;
   return denied('private_session_changed_during_operation');
  }
  if(!verifyResponse(result,operation))
   return denied('private_world_operation_refused');
  if(operation==='connect'){
   if(typeof result.connectionId!=='string'||!UUID.test(result.connectionId)){
    halted=true;return denied('private_connection_token_unverified');
   }
   connectionId=result.connectionId;
  }
  if(operation==='disconnect')connectionId=null;
  // This reply is still private data for the trusted backend. It is not
  // suitable for returning directly to a browser/player route.
  return Object.freeze({...result,version:'84.5',privateServerOnly:true,
   productionReady:false});
 });
 const attached=(args,keys)=>exact(args,keys)&&
  typeof args.connectionId==='string'&&
  connectionId!==null&&args.connectionId===connectionId;
 const inputCall=(name,args,keys,extra)=>{
  if(shutdownRequested)return Promise.resolve(denied('private_session_admission_stopped'));
  if(!attached(args,keys))return Promise.resolve(denied('stale_private_world_connection'));
  if(extra==='afterSeq'&&(!Number.isSafeInteger(args.afterSeq)||args.afterSeq<0))
   return Promise.resolve(denied('invalid_private_event_cursor'));
  if((extra==='input'||extra==='intent')&&!obj(args[extra]))
   return Promise.resolve(denied('invalid_private_world_command'));
  return invoke(name,{...args,serverRequestContext},args.connectionId);
 };
 const shutdown=()=>{
  shutdownRequested=true;
  return serial(async()=>{
   if(stopped)return false;
   stopped=true;connectionId=null;
   try{return await pump.shutdown()===true}catch{return false}
  },true);
 };
 return Object.freeze({version:'84.5',
  connect:()=>invoke('connect',{serverRequestContext}),
  setInput:args=>inputCall('setInput',args,['connectionId','input'],'input'),
  submit:args=>inputCall('submit',args,['connectionId','intent'],'intent'),
  poll:args=>inputCall('poll',args,['connectionId','afterSeq'],'afterSeq'),
  disconnect:args=>inputCall('disconnect',args,['connectionId']),
  // PRIVATE scheduler invokes these; never expose them as player actions.
  advance:()=>invoke('advance'),recover:()=>invoke('recover'),shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicTransportInstalled:false,credentialDeliveredToBrowser:false,
  hostedWorkerInstalled:false,rewardWriterInstalled:false,
  productionReady:false});
}

// Opt-in composition using the existing 84.4 single-writer staging factory.
// Auth callbacks MUST be independently backed by world and Base44 stores.
export async function createGame3DPrivateCombatQuestStaging845(options={}){
 if(options?.enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    [options.resolveTrustedWorldPrincipal,
     options.resolveVerifiedBase44ActionSession,
     options.verifySessionActive].some(fn=>typeof fn!=='function'))
  throw Error('84.5 requires explicit private staging and two independent session authorities');
 const pump=await createGame3DPrivateCombatQuestStaging844(options);
 try{return createGame3DPrivateCombatQuestAdmission845({...options,pump})}
 catch(error){await pump.shutdown();throw error}
}
