// 24.1 TEST-ONLY: deterministic, separately injected two-player backend identities.
// This is deliberately NOT real Base44, PG16, a login provider or production code.
import {createGame3DPrivateQuestIngress211}
 from '../../privateQuestIngress211.mjs';

export function createFakeTwoPlayerBackend241(assignments=['ownerA','ownerB']){
 let next=0,serial=0;
 const revoked=new Set(),records=new WeakMap();
 const issued=[];
 const resolveBackendAdmission=async request=>{
  if(records.has(request))return records.get(request).admission;
  const ownerId=assignments[next++];
  if(typeof ownerId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId))
   return null;
  const serialId=(++serial).toString(16).padStart(32,'0');
  const characterId=ownerId+'Hero',transportId='tx-'+serialId;
  const expiresAtMs=Date.now()+20000;
  const scope=Object.freeze({ownerId,characterId});
  const serverTransportContext=Object.freeze({testContext:'private-transport',serialId});
  const serverReconnectContext=Object.freeze({testContext:'one-use-reconnect',serialId});
  const serverReadContext=Object.freeze({testContext:'original-read',serialId});
  let active=true,nextSeq=1;
  const questTransport199=Object.freeze({
   version:'19.9',privateServerOnly:true,publicRouteInstalled:false,
   transportBindingCreated:false,resumeCombatAuthorized:false,
   async attach({serverReconnectContext:ctx}={}){
    if(ctx!==serverReconnectContext||revoked.has(ownerId)||!active)
     return {ok:false};
    return Object.freeze({ok:true,version:'19.9',
     transportBindingCreated:false,resumeCombatAuthorized:false,
     privateHandle:Object.freeze({
      get active(){return active&&!revoked.has(ownerId)},
      close(){active=false},
      async read({serverReadContext:readCtx,frame}={}){
       if(readCtx!==serverReadContext||revoked.has(ownerId)||!active||
          frame?.op!=='questbook.read'||frame.seq!==nextSeq++)
        return Object.freeze({ok:false});
       return Object.freeze({ok:true,operation:'questbook.snapshot',seq:frame.seq,
        staticReconnectSnapshot:true,transportBindingCreated:false,
        worldLeaseRestored:false,resumeCombatAuthorized:false,rewardsIssued:false,
        objectives:Object.freeze([Object.freeze({questId:'quest_'+ownerId,
         objectiveId:'wolfs',type:'kill',status:'accepted',
         current:ownerId==='ownerA'?1:2,required:3})])});
      },
     })});
   },
  });
  const ingress211=createGame3DPrivateQuestIngress211({
   enabled:true,questTransport199,scope,
   resolveAuthenticatedTransport211:async({serverTransportContext:ctx})=>{
    if(ctx!==serverTransportContext||revoked.has(ownerId)||!active)return null;
    return Object.freeze({authenticated:true,
     identitySource:'trusted-private-transport-211',transportId,
     ownerId,characterId,expiresAtMs,serverReadContext});
   },
  });
  const authenticateUpgrade=async original=>{
   if(original!==request||revoked.has(ownerId)||!active)return null;
   return Object.freeze({authenticated:true,
    identitySource:'trusted-private-socket-upgrade-213',
    transportId,ownerId,characterId,expiresAtMs,
    serverTransportContext,serverReconnectContext});
  };
  const admission=Object.freeze({scope,ingress211,authenticateUpgrade});
  records.set(request,{ownerId,admission});issued.push({ownerId,transportId});
  return admission;
 };
 return Object.freeze({
  resolveBackendAdmission,
  revoke(ownerId){revoked.add(ownerId)},
  issued:()=>issued.map(x=>Object.freeze({...x})),
 });
}
