// Combat / Quest 18.8 — server-only composition of durable PG tickets and
// existing private 18.7 Base44 reconnect / 18.6 credit reconciliation.
// Not a public login, HTTP/WebSocket listener, saved credential or player
// transport. Issued ticket IDs are committed ONLY to a trusted backend store.
import {createGame3DPrivateReconnectTicketLedger188}
 from './privateReconnectTicketLedger188.mjs';
import {createGame3DPrivateQuestReconnect187}
 from './privateQuestReconnect187.mjs';

const denied=reason=>Object.freeze({ok:false,version:'18.8',reason,
 authenticatedReconnect:false,questProgressSynchronized:false,
 transportBindingCreated:false,worldLeaseRestored:false,
 resumeCombatAuthorized:false,rewardsIssued:false,
 privateServerOnly:true,productionReady:false});
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export async function createGame3DPrivateQuestReconnectStaging188({
 worldStage180,serverRequestContext,scope,
 issuerPool,consumerPool,reconnectSchema,
 progressionPool,progressionSchema,
 resolveTrustedBase44Action188,resolveTrustedReconnectTicket188,
 storeIssuedReconnectTicket188,
 now=Date.now,enabled=false,
}={}){
 if(enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    typeof storeIssuedReconnectTicket188!=='function'||
    !object(serverRequestContext)||typeof now!=='function')
  throw Error('18.8 requires original private server and trusted ticket storage');
 let ledger=null,reconnect=null;
 try{
  ledger=await createGame3DPrivateReconnectTicketLedger188({
   enabled:true,worldStage180,serverRequestContext,scope,
   issuerPool,consumerPool,schema:reconnectSchema,
   resolveTrustedBase44Action188,resolveTrustedReconnectTicket188,now,
  });
  if(ledger?.version!=='18.8'||ledger.privateServerOnly!==true||
     ledger.publicRouteInstalled!==false||
     ledger.credentialsDeliveredToBrowser!==false||
     ledger.durableCrossWorkerReplayProtection!==true||
     typeof ledger.issue!=='function'||typeof ledger.consume!=='function')
   throw Error('18.8 durable backend ticket authority missing');
  reconnect=await createGame3DPrivateQuestReconnect187({
   enabled:true,worldStage180,serverRequestContext,scope,
   progressionPool,progressionSchema,now,
   // Exact 18.7 callback contract. Only the PG ticket consumer may
   // attest this proof; the browser can NEVER construct it.
   consumeTrustedBase44Reconnect187:ledger.consume,
  });
  if(reconnect?.version!=='18.7'||reconnect.privateServerOnly!==true||
     reconnect.publicReconnectRouteInstalled!==false||
     reconnect.transportBindingCreated!==false||
     reconnect.worldLeaseRestored!==false||
     typeof reconnect.reconnect!=='function')
   throw Error('18.8 requires existing private 18.7 Questbook reconnection');
 }catch(error){
  reconnect?.shutdown();
  ledger?.shutdown();
  throw error;
 }
 let stopped=false,queue=Promise.resolve();
 const enqueue=fn=>{
  const result=queue.then(fn,fn);
  queue=result.then(()=>{},()=>{});
  return result;
 };
 const issue=(request={})=>enqueue(async()=>{
  if(stopped)return denied('reconnect_session_closed');
  if(!object(request)||Object.keys(request).length!==1||
     !Object.hasOwn(request,'serverAuthContext')||
     !object(request.serverAuthContext))
   return denied('trusted_base44_context_required');
  const entry=await ledger.issue(request);
  if(entry?.ok!==true||typeof entry.ticketId!=='string'||
     entry.credentialsDeliveredToBrowser!==false)
   return denied('durable_reconnect_ticket_not_issued');
  // Ticket ID stays INSIDE a server-managed session store, not on a
  // client request/response, localStorage or browser-accessible cookie.
  let stored=false;
  try{
   stored=await storeIssuedReconnectTicket188(Object.freeze({
    serverAuthContext:request.serverAuthContext,
    ticketId:entry.ticketId,expiresAtMs:entry.expiresAtMs,
   }))===true;
  }catch{}
  if(!stored||stopped)
   return denied('trusted_reconnect_ticket_store_unavailable');
  return Object.freeze({ok:true,version:'18.8',issued:true,
   credentialsDeliveredToBrowser:false,
   privateServerOnly:true,publicRouteInstalled:false,
   worldLeaseRestored:false,transportBindingCreated:false,
   resumeCombatAuthorized:false,rewardsIssued:false,
   productionReady:false});
 });
 const verifyReconnect=(request={})=>enqueue(async()=>{
  if(stopped)return denied('reconnect_session_closed');
  if(!object(request)||Object.keys(request).length!==1||
     !Object.hasOwn(request,'serverReconnectContext')||
     !object(request.serverReconnectContext))
   return denied('trusted_server_reconnect_context_required');
  let result;
  try{result=await reconnect.reconnect(request)}
  catch{return denied('original_world_reconnect_unavailable')}
  if(stopped||result?.ok!==true||
     result.authenticatedReconnect!==true||
     result.questProgressSynchronized!==true||
     result.transportBindingCreated!==false||
     result.worldLeaseRestored!==false||
     result.resumeCombatAuthorized!==false||
     result.rewardsIssued!==false)
   return denied('original_world_reconnect_denied');
  return Object.freeze({...result,version:'18.8',
   authenticatedReconnect:true,questProgressSynchronized:true,
   worldLeaseRestored:false,transportBindingCreated:false,
   resumeCombatAuthorized:false,rewardsIssued:false,
   privateServerOnly:true,productionReady:false});
 });
 const shutdown=()=>{
  stopped=true;
  reconnect.shutdown();
  ledger.shutdown();
 };
 return Object.freeze({version:'18.8',issue,verifyReconnect,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,
  publicPlayerRouteInstalled:false,
  transportBindingCreated:false,worldLeaseRestored:false,
  resumeCombatAuthorized:false,rewardWriterInstalled:false,
  rewardsIssued:false,productionReady:false});
}
