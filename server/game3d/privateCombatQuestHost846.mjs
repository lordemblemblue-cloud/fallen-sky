// Game 3D Combat / Quest 84.6 — in-process PRIVATE gameplay host.
// The ORIGINAL 13.7/13.8/15.3/18.5/84.5 path remains authoritative.
// This module does not start a server, socket, timer, quest writer or rewards.
import {randomUUID} from 'node:crypto';

const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const TARGET=/^[A-Za-z0-9_.:-]{1,160}$/;
const INTENT=/^[A-Za-z0-9_-]{8,72}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(value,keys)=>object(value)&&
 Object.keys(value).length===keys.length&&
 Object.keys(value).every(k=>keys.includes(k));
const seq=x=>Number.isSafeInteger(x)&&x>=0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const bounded=(x,min,max)=>finite(x)&&x>=min&&x<=max;
const denied=reason=>Object.freeze({ok:false,version:'84.6',reason,
 privateServerOnly:true,rewardsIssued:false,rewardAuthorized:false,
 productionReady:false});
export const PRIVATE_GAMEPLAY_LIMITS_846=Object.freeze({
 maxEvents:40,maxEnemies:16,maxObjectives:128,
});
const validSnapshot=(s,scope)=>s?.protocol===1&&s.version==='13.7'&&
 s.instanceId===scope.instanceId&&s.instanceEpoch===scope.instanceEpoch&&
 s.mapFingerprint===scope.mapFingerprint&&seq(s.eventSeq)&&finite(s.serverTime)&&
 s.rewardsIssued===false&&Array.isArray(s.enemies)&&
 s.enemies.length<=PRIVATE_GAMEPLAY_LIMITS_846.maxEnemies&&
 object(s.player)&&
 ['x','z','hp','maxHp','stamina','facing'].every(k=>finite(s.player[k]))&&
 seq(s.player.lastIntentSeq)&&
 s.enemies.every(e=>typeof e?.id==='string'&&TARGET.test(e.id)&&
  ['x','z','hp','maxHp'].every(k=>finite(e[k]))&&
  typeof e.alive==='boolean'&&
  (e.pendingImpactAt===null||finite(e.pendingImpactAt)));
const projectSnapshot=(s)=>Object.freeze({
 eventSeq:s.eventSeq,serverTime:s.serverTime,
 player:Object.freeze({
  x:s.player.x,z:s.player.z,hp:s.player.hp,maxHp:s.player.maxHp,
  stamina:s.player.stamina,facing:s.player.facing,
  lastIntentSeq:s.player.lastIntentSeq,
 }),
 enemies:Object.freeze(s.enemies.map(e=>Object.freeze({
  id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,
  alive:e.alive,pendingImpactAt:e.pendingImpactAt,
 }))),
});
const EVENT_FIELDS=['seq','kind','serverTime','targetId','enemyId',
 'tier','damage','enemyHp','playerHp','critical','killed','impactAt'];
const validEvent=(e,scope)=>object(e)&&
 seq(e.seq)&&typeof e.kind==='string'&&e.kind.length<=64&&
 finite(e.serverTime)&&e.instanceId===scope.instanceId&&
 e.xpAuthorized===false&&e.lootAuthorized===false&&
 e.currencyAuthorized===false&&
 EVENT_FIELDS.every(key=>e[key]===undefined||e[key]===null||
  typeof e[key]==='string'||typeof e[key]==='boolean'||finite(e[key]));
const projectEvent=(e)=>Object.freeze(Object.fromEntries(
 EVENT_FIELDS.filter(key=>e[key]!==undefined).map(key=>[key,e[key]])));
const validObjective=o=>object(o)&&
 typeof o.questId==='string'&&KEY.test(o.questId)&&
 typeof o.objectiveId==='string'&&KEY.test(o.objectiveId)&&
 typeof o.status==='string'&&o.status.length<=48&&
 Number.isSafeInteger(o.current)&&Number.isSafeInteger(o.required)&&
 o.current>=0&&o.required>=1&&o.required<=10000&&o.current<=o.required;
const projectObjectives=rows=>Object.freeze(rows.map(o=>Object.freeze({
 questId:o.questId,objectiveId:o.objectiveId,status:o.status,
 current:o.current,required:o.required,
})));

export function createGame3DPrivateGameplayHost846({
 admission,scope,enabled=false,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    admission?.version!=='84.5'||
    admission.privateServerOnly!==true||
    admission.publicPlayerRouteInstalled!==false||
    admission.publicTransportInstalled!==false||
    admission.credentialDeliveredToBrowser!==false||
    admission.hostedWorkerInstalled!==false||
    ['connect','setInput','submit','poll','disconnect','advance',
     'recover','shutdown'].some(method=>typeof admission[method]!=='function')||
    !object(scope)||typeof scope.instanceId!=='string'||
    typeof scope.instanceEpoch!=='string'||
    typeof scope.mapFingerprint!=='string'||
    !KEY.test(scope.instanceId)||!KEY.test(scope.instanceEpoch)||
    !HASH.test(scope.mapFingerprint))
  throw Error('84.6 requires a private, authenticated 84.5 game world');
 const pinned=Object.freeze({
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
  mapFingerprint:scope.mapFingerprint,
 });
 let stopped=false,fenced=false,recovery=false;
 let shutdownRequested=false;
 let admissionStarted=false,admissionStopped=false;
 let connectionId=null,handle=null,objectives=Object.freeze([]);
 let tail=Promise.resolve();
 const serial=(fn,allowShutdown=false)=>{
  // A shutdown request fences the external API immediately. Work already
  // running stays serialized with the original combat/DB authority.
  if(shutdownRequested&&!allowShutdown)
   return Promise.resolve(denied('private_gameplay_host_closed'));
  const guarded=()=>shutdownRequested&&!allowShutdown
   ? denied('private_gameplay_host_closed') : fn();
  const run=tail.then(guarded,guarded);
  tail=run.then(()=>undefined,()=>undefined);
  return run;
 };
 const active=request=>!stopped&&!fenced&&
  exact(request,['handle'])&&request.handle===handle&&
  handle!==null&&connectionId!==null;
 const checkCommand=(request,extra)=>!stopped&&!fenced&&
  exact(request,['handle',extra])&&request.handle===handle&&
  handle!==null&&connectionId!==null;
 const closeAdmission=async()=>{
  if(admissionStopped)return false;
  admissionStopped=true;
  try{return await admission.shutdown()===true}catch{return false}
 };
 const fail=async reason=>{
  // A queued shutdown owns cleanup; don't publish a later failure result.
  if(shutdownRequested)return denied('private_gameplay_host_closed');
  fenced=true;handle=null;connectionId=null;objectives=Object.freeze([]);
  // Once the original 84.5 admission has been invoked, release its world
  // even when 84.6 is used without an enclosing 84.8/84.9 reader.
  if(admissionStarted)await closeAdmission();
  return denied(reason);
 };
 const terminalAdmission=x=>typeof x?.reason==='string'&&[
  'private_world_or_base44_session_unverified',
  'private_session_changed_during_operation',
  'private_session_admission_halted',
  'private_session_admission_stopped',
 ].includes(x.reason);
 const open=()=>serial(async()=>{
  if(stopped||fenced)return denied('private_gameplay_host_closed');
  if(recovery)return denied('private_quest_reconciliation_required');
  let response;
  admissionStarted=true;
  try{response=await admission.connect()}
  catch{return shutdownRequested?denied('private_gameplay_host_closed'):
   fail('private_world_connect_failed')}
  if(shutdownRequested)return denied('private_gameplay_host_closed');
  if(response?.ok!==true||response.rewardsIssued!==false||
     response.rewardAuthorized===true||
     response.snapshot?.rewardAuthorized===true||
     typeof response.connectionId!=='string'||
     !validSnapshot(response.snapshot,pinned))
   return fail('private_world_open_unverified');
  // Deliberately an in-process, non-serializable object identity.
  // It is NOT a browser session ID or an HTTP authentication token.
  connectionId=response.connectionId;
  handle=Object.freeze({generation:randomUUID()});
  objectives=Object.freeze([]);
  return Object.freeze({ok:true,version:'84.6',handle,
   snapshot:projectSnapshot(response.snapshot),
   privateServerOnly:true,rewardsIssued:false,productionReady:false});
 });
 const setInput=request=>serial(async()=>{
  if(!checkCommand(request,'input'))return denied('inactive_private_world_handle');
  if(recovery)return denied('private_quest_reconciliation_required');
  const input=request.input;
  if(!exact(input,['seq','x','z','facing'])||
     !Number.isSafeInteger(input.seq)||input.seq<1||
     !bounded(input.x,-1,1)||!bounded(input.z,-1,1)||
     !bounded(input.facing,-Math.PI*2,Math.PI*2))
   return denied('invalid_private_movement');
  let response;
  try{response=await admission.setInput({connectionId,input:Object.freeze({...input})})}
  catch{return shutdownRequested?denied('private_gameplay_host_closed'):
   fail('private_movement_transport_failed')}
  if(shutdownRequested)return denied('private_gameplay_host_closed');
  if(terminalAdmission(response))return fail('private_world_session_revoked');
  if(response?.rewardAuthorized===true||response?.rewardsIssued===true)
   return fail('private_movement_reward_authority_invalid');
  if(response?.ok!==true||response.rewardsIssued!==false||
     (response.inputSeq!==undefined&&response.inputSeq!==input.seq))
   return denied('private_movement_refused');
  return Object.freeze({ok:true,version:'84.6',
   inputSeq:response.inputSeq??input.seq,
   privateServerOnly:true,rewardsIssued:false});
 });
 const submit=request=>serial(async()=>{
  if(!checkCommand(request,'intent'))return denied('inactive_private_world_handle');
  if(recovery)return denied('private_quest_reconciliation_required');
  const i=request.intent;
  if(!exact(i,['action','intentId','intentSeq','targetId','weaponPath'])||
     i.action!=='basic'||typeof i.intentId!=='string'||
     !INTENT.test(i.intentId)||
     !Number.isSafeInteger(i.intentSeq)||i.intentSeq<1||
     typeof i.targetId!=='string'||!TARGET.test(i.targetId)||
     !['damage','defense','ranged'].includes(i.weaponPath))
   return denied('invalid_private_attack_intent');
  let response;
  try{response=await admission.submit({connectionId,
   intent:Object.freeze({...i})})}
  catch{return shutdownRequested?denied('private_gameplay_host_closed'):
   fail('private_strike_transport_failed')}
  if(shutdownRequested)return denied('private_gameplay_host_closed');
  if(terminalAdmission(response))return fail('private_world_session_revoked');
  if(response?.rewardAuthorized===true||response?.rewardsIssued===true)
   return fail('private_strike_reward_authority_invalid');
  if(response?.ok!==true||response.rewardsIssued!==false||
     response.queued!==true)
   return denied('private_strike_refused');
  return Object.freeze({ok:true,version:'84.6',
   queued:response.queued===true,privateServerOnly:true,rewardsIssued:false});
 });
 const frame=request=>serial(async()=>{
  if(!checkCommand(request,'afterSeq'))return denied('inactive_private_world_handle');
  if(recovery)return denied('private_quest_reconciliation_required');
  const after=request.afterSeq;
  if(!seq(after))return denied('invalid_private_frame_cursor');
  let response;
  try{response=await admission.poll({connectionId,afterSeq:after})}
  catch{return shutdownRequested?denied('private_gameplay_host_closed'):
   fail('private_frame_transport_failed')}
  if(shutdownRequested)return denied('private_gameplay_host_closed');
  if(response?.ok!==true||response.rewardsIssued!==false||
     response.rewardAuthorized===true||
     response.snapshot?.rewardAuthorized===true||
     !validSnapshot(response.snapshot,pinned)||
     typeof response.reset!=='boolean'||typeof response.gap!=='boolean'||
     typeof response.hasMore!=='boolean'||!seq(response.nextSeq)||
     response.nextSeq>response.snapshot.eventSeq||
     !Array.isArray(response.events)||
     response.events.length>PRIVATE_GAMEPLAY_LIMITS_846.maxEvents)
   return fail('private_frame_unverified');
  if((response.reset||response.gap)&&response.events.length>0)
   return fail('private_frame_reset_conflict');
  if(!response.reset&&!response.gap&&response.nextSeq<after)
   return fail('private_frame_cursor_regression');
  if(response.hasMore&&response.events.length===0)
   return fail('private_frame_empty_page');
  let prev=after;
  for(const event of response.events){
   if(!validEvent(event,pinned)||event.seq<=prev||
      event.seq>response.snapshot.eventSeq)
    return fail('private_frame_event_chain_invalid');
   prev=event.seq;
  }
  if(response.events.length>0&&response.nextSeq!==prev)
   return fail('private_frame_cursor_mismatch');
  return Object.freeze({ok:true,version:'84.6',
   reset:response.reset,gap:response.gap,
   snapshot:projectSnapshot(response.snapshot),
   events:Object.freeze(response.events.map(projectEvent)),
   nextSeq:response.nextSeq,hasMore:response.hasMore,
   objectives,privateServerOnly:true,rewardsIssued:false,
   rewardAuthorized:false,productionReady:false});
 });
 const synchronize=async method=>{
  let response;
  try{response=await admission[method]()}
  catch{
   if(shutdownRequested)return denied('private_gameplay_host_closed');
   recovery=true;return denied('private_quest_sync_failed');
  }
  if(shutdownRequested)return denied('private_gameplay_host_closed');
  if(terminalAdmission(response))return fail('private_world_session_revoked');
  // An outright failed/ambiguous 84.5 operation can still need the
  // original 84.4 replay. An apparently successful response with a bad
  // objective/reward proof is different: it is terminal, never retryable.
  if(response?.ok!==true){
   recovery=true;return denied('private_quest_sync_unverified');
  }
  if(response.version!=='84.5'||
     response.rewardsIssued!==false||
     response.rewardAuthorized!==false||
     response.questTurnInCommitted!==false||
     response.progressSynchronized!==true||
     !seq(response.confirmedEventSeq)||
     (response.worldEventSeq!==undefined&&
      (!seq(response.worldEventSeq)||
       response.confirmedEventSeq>response.worldEventSeq))||
     !Array.isArray(response.objectives)||
     response.objectives.length>PRIVATE_GAMEPLAY_LIMITS_846.maxObjectives||
     !response.objectives.every(validObjective))
   return fail('private_quest_success_proof_invalid');
  objectives=projectObjectives(response.objectives);
  recovery=false;
  return Object.freeze({ok:true,version:'84.6',
   confirmedEventSeq:response.confirmedEventSeq,
   worldEventSeq:seq(response.worldEventSeq)?response.worldEventSeq:null,
   objectives,privateServerOnly:true,
   rewardsIssued:false,rewardAuthorized:false,productionReady:false});
 };
 const advance=()=>serial(async()=>{
  if(stopped||fenced)return denied('private_gameplay_host_closed');
  if(!handle)return denied('inactive_private_world_handle');
  if(recovery)return denied('private_quest_reconciliation_required');
  return synchronize('advance');
 });
 const recover=()=>serial(async()=>{
  if(stopped||fenced)return denied('private_gameplay_host_closed');
  if(!handle)return denied('inactive_private_world_handle');
  return synchronize('recover');
 });
 const disconnect=request=>serial(async()=>{
  if(!active(request))return denied('inactive_private_world_handle');
  if(recovery)return denied('private_quest_reconciliation_required');
  let response;
  try{response=await admission.disconnect({connectionId})}
  catch{return shutdownRequested?denied('private_gameplay_host_closed'):
   fail('private_world_disconnect_failed')}
  if(shutdownRequested)return denied('private_gameplay_host_closed');
  if(response?.ok!==true||response.rewardsIssued!==false)
   return fail('private_world_disconnect_unverified');
  handle=null;connectionId=null;objectives=Object.freeze([]);
  return Object.freeze({ok:true,version:'84.6',
   privateServerOnly:true,rewardsIssued:false});
 });
 const shutdown=()=>{
  shutdownRequested=true;
  return serial(async()=>{
   if(stopped)return false;
   stopped=true;handle=null;connectionId=null;objectives=Object.freeze([]);
   return closeAdmission();
  },true);
 };
 return Object.freeze({version:'84.6',
  open,setInput,submit,frame,advance,recover,disconnect,shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicTransportInstalled:false,hostedWorkerInstalled:false,
  credentialDeliveredToBrowser:false,rewardWriterInstalled:false,
  productionReady:false});
}
