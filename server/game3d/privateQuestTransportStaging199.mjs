// 19.9: private backend-only Questbook snapshot handoff.
// NOT a WebSocket listener, browser API, combat command gateway or live world restore.
import {isRecord,denyTransport190}
 from './privateTransportContract190.mjs';
import {createPrivateTransportAuthority191}
 from './privateTransportAuthority191.mjs';
import {createPrivateTransportFence192}
 from './privateTransportFence192.mjs';
import {parsePrivateQuestFrame193}
 from './privateTransportFrame193.mjs';
import {createPrivateTransportSequence194}
 from './privateTransportSequence194.mjs';
import {createPrivateTransportBudget195}
 from './privateTransportBudget195.mjs';
import {createPrivateTransportHandle196}
 from './privateTransportHandle196.mjs';
import {sanitizePrivateQuestSnapshot197}
 from './privateTransportSnapshot197.mjs';
import {createPrivateTransportAudit198}
 from './privateTransportAudit198.mjs';

export async function createGame3DPrivateQuestTransportStaging199({
 enabled=false,pairing180,worldStage180,reconnect189,
 serverRequestContext,scope,progressionPool,now=Date.now,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    reconnect189?.version!=='18.9'||
    reconnect189.privateServerOnly!==true||
    reconnect189.publicRouteInstalled!==false||
    reconnect189.transportBindingCreated!==false||
    reconnect189.resumeCombatAuthorized!==false||
    typeof reconnect189.verifyReconnect!=='function')
  throw Error('19.9 requires original 18.9 read-only reconnect staging');
 const authority=await createPrivateTransportAuthority191({
  enabled:true,pairing180,worldStage180,serverRequestContext,scope,now,
 });
 const fence=createPrivateTransportFence192({
  pool:progressionPool,original:authority.original,
  stillOriginal:authority.stillOriginal,
 });
 const audit=createPrivateTransportAudit198();
 let stopped=false,handle=null,serial=Promise.resolve();
 const enqueue=fn=>{
  const task=serial.then(fn,fn);
  serial=task.then(()=>{},()=>{});
  return task;
 };
 const deny=reason=>{audit.mark('denied');return denyTransport190(reason)};
 const attach=request=>enqueue(async()=>{
  if(stopped||handle?.active===true)return deny('closed_or_attachment_exists');
  if(!isRecord(request)||Object.keys(request).length!==1||
     !Object.hasOwn(request,'serverReconnectContext')||
     !isRecord(request.serverReconnectContext))
   return deny('trusted_backend_context_required');
  const ctx=request.serverReconnectContext;
  const before=await authority.verify(ctx);
  if(!before||!await fence.verify())return deny('original_session_not_verified');
  let result;
  try{result=await reconnect189.verifyReconnect(
   Object.freeze({serverReconnectContext:ctx}));
  }catch{return deny('original_reconnect_unavailable')}
  if(result?.ok!==true||result.authenticatedReconnect!==true||
     result.questProgressSynchronized!==true||
     result.transportBindingCreated!==false||
     result.resumeCombatAuthorized!==false||
     result.worldLeaseRestored!==false||result.rewardsIssued!==false)
   return deny('original_reconnect_not_authorized');
  const snapshot=sanitizePrivateQuestSnapshot197(result.progress);
  if(!snapshot)return deny('unsafe_questbook_snapshot');
  const after=await authority.verify(ctx);
  if(!after||!await fence.verify()||stopped)
   return deny('world_revoked_during_attachment');
  const seq=createPrivateTransportSequence194();
  const budget=createPrivateTransportBudget195({now});
  const lifetime=createPrivateTransportHandle196({
   now,expiresAtMs:Math.min(before.expiresAtMs,after.expiresAtMs),
   onClose:()=>{seq.shutdown();budget.shutdown();audit.mark('closed')},
  });
  let readQueue=Promise.resolve(),pendingReads=0;
  const read=request=>{
   if(pendingReads>=8)return Promise.resolve(deny('private_read_queue_full'));
   pendingReads++;
   const task=readQueue.then(async()=>{
    if(!lifetime.active()){
     lifetime.close();audit.mark('expired');
     return deny('private_attachment_expired_or_closed');
    }
    if(!isRecord(request)||Object.keys(request).length!==2||
       !Object.hasOwn(request,'serverReadContext')||
       !Object.hasOwn(request,'frame')||
       !isRecord(request.serverReadContext))
     return deny('trusted_read_context_required');
    const frame=parsePrivateQuestFrame193(request.frame);
    if(!frame||!seq.accept(frame.seq))
     return deny('bad_or_replayed_read_frame');
    if(!budget.allow())return deny('private_read_rate_exceeded');
    if(!await authority.verify(request.serverReadContext)||
       !await fence.verify()){
     lifetime.close();audit.mark('revoked');
     return deny('original_private_session_no_longer_live');
    }
    if(!lifetime.active()||!await authority.stillOriginal()||
       !await fence.verify()){
     lifetime.close();audit.mark('revoked');
     return deny('original_private_session_changed_during_read');
    }
    audit.mark('read');
    return Object.freeze({ok:true,version:'19.9',operation:'questbook.snapshot',
     seq:frame.seq,objectives:snapshot,staticReconnectSnapshot:true,
     privateServerOnly:true,publicRouteInstalled:false,
     transportBindingCreated:false,worldLeaseRestored:false,
     resumeCombatAuthorized:false,rewardsIssued:false,
     productionReady:false});
   },()=>deny('private_read_queue_unavailable'));
   readQueue=task.then(()=>{},()=>{});
   return task.finally(()=>{pendingReads--});
  };
  const close=()=>lifetime.close();
  const privateHandle=Object.freeze({read,close,
   get active(){return lifetime.active()},privateServerOnly:true,
   transportBindingCreated:false,publicRouteInstalled:false});
  handle=privateHandle;
  audit.mark('attached');
  return Object.freeze({ok:true,version:'19.9',
   privateHandle,backendHandleCreated:true,
   transportBindingCreated:false,publicRouteInstalled:false,
   resumeCombatAuthorized:false,rewardsIssued:false,
   productionReady:false});
 });
 const shutdown=()=>{
  stopped=true;handle?.close();fence.shutdown();
  authority.shutdown();audit.mark('shutdown');
 };
 return Object.freeze({version:'19.9',attach,shutdown,
  audit:()=>audit.snapshot(),privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,
  worldLeaseRestored:false,resumeCombatAuthorized:false,
  rewardsIssued:false,productionReady:false});
}
