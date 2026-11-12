// Combat / Quest 18.9 — compose the REAL 18.0 Base44/world pairing
// with the ORIGINAL 18.8 PostgreSQL ticket consumer and 18.7 read-only
// reconnect. No new session issuer, browser route or movement gateway.
import {createGame3DPrivateReconnectBackend189}
 from './privateReconnectBackend189.mjs';
import {createGame3DPrivateQuestReconnectStaging188}
 from './privateQuestReconnectStaging188.mjs';

const denied=reason=>Object.freeze({ok:false,version:'18.9',reason,
 privateServerOnly:true,publicRouteInstalled:false,
 transportBindingCreated:false,worldLeaseRestored:false,
 resumeCombatAuthorized:false,rewardsIssued:false,
 productionReady:false});

export async function createGame3DPrivateQuestReconnectStaging189({
 pairing180,worldStage180,serverRequestContext,scope,
 issuerPool,consumerPool,reconnectSchema,
 progressionPool,progressionSchema,
 now=Date.now,enabled=false,
}={}){
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    pairing180?.version!=='18.0'||
    pairing180.privateServerOnly!==true||
    pairing180.publicPlayerRouteInstalled!==false||
    typeof consumerPool?.connect!=='function')
  throw Error('18.9 requires original verified pairing and distinct restricted PostgreSQL clients');
 let backend=null,underlying=null;
 try{
  backend=await createGame3DPrivateReconnectBackend189({
   enabled:true,pairing180,worldStage180,serverRequestContext,
   scope,ticketReaderPool:consumerPool,now,
  });
  if(backend?.version!=='18.9'||
     backend.privateServerOnly!==true||
     backend.publicRouteInstalled!==false||
     backend.ticketIdsDeliveredToBrowser!==false||
     backend.usesExistingDurableTicket188!==true)
   throw Error('18.9 missing isolated trusted pairing-backed ticket store');
  underlying=await createGame3DPrivateQuestReconnectStaging188({
   enabled:true,worldStage180,serverRequestContext,scope,
   issuerPool,consumerPool,reconnectSchema,
   progressionPool,progressionSchema,now,
   storeIssuedReconnectTicket188:backend.storeIssuedReconnectTicket188,
   resolveTrustedBase44Action188:backend.resolveTrustedBase44Action188,
   resolveTrustedReconnectTicket188:backend.resolveTrustedReconnectTicket188,
  });
  if(underlying?.version!=='18.8'||
     underlying.privateServerOnly!==true||
     underlying.publicRouteInstalled!==false||
     underlying.transportBindingCreated!==false||
     underlying.worldLeaseRestored!==false||
     underlying.resumeCombatAuthorized!==false||
     underlying.rewardsIssued!==false||
     typeof underlying.issue!=='function'||
     typeof underlying.verifyReconnect!=='function'||
     typeof underlying.shutdown!=='function')
   throw Error('18.9 refuses unsafe original Questbook reconnect service');
  let stopped=false;
  const issue=async request=>{
   if(stopped)return denied('backend_reconnect_closed');
   const result=await underlying.issue(request);
   if(stopped||result?.ok!==true||
      result.credentialsDeliveredToBrowser!==false||
      Object.hasOwn(result,'ticketId'))
    return denied('trusted_ticket_not_stored');
   return Object.freeze({ok:true,version:'18.9',
    ticketStoredInExistingPg188:true,credentialsDeliveredToBrowser:false,
    privateServerOnly:true,publicRouteInstalled:false,
    transportBindingCreated:false,worldLeaseRestored:false,
    resumeCombatAuthorized:false,rewardsIssued:false,
    productionReady:false});
  };
  const verifyReconnect=async request=>{
   if(stopped)return denied('backend_reconnect_closed');
   const result=await underlying.verifyReconnect(request);
   if(stopped||result?.ok!==true||
      result.authenticatedReconnect!==true||
      result.questProgressSynchronized!==true||
      result.transportBindingCreated!==false||
      result.worldLeaseRestored!==false||
      result.resumeCombatAuthorized!==false||
      result.rewardsIssued!==false)
    return denied('trusted_original_world_reconnect_denied');
   return Object.freeze({...result,version:'18.9',
    privateServerOnly:true,publicRouteInstalled:false,
    transportBindingCreated:false,worldLeaseRestored:false,
    resumeCombatAuthorized:false,rewardsIssued:false,
    productionReady:false});
  };
  const shutdown=()=>{
   stopped=true;
   underlying.shutdown();
   backend.shutdown();
  };
  return Object.freeze({version:'18.9',issue,verifyReconnect,shutdown,
   privateServerOnly:true,publicRouteInstalled:false,
   authenticatedBackendRequired:true,publicPlayerRouteInstalled:false,
   transportBindingCreated:false,worldLeaseRestored:false,
   resumeCombatAuthorized:false,rewardsIssued:false,
   productionReady:false});
 }catch(error){underlying?.shutdown();backend?.shutdown();throw error}
}
