// 32.0–32.2: one-account-across-workers fence in front of original PG/read-only chain.
// The account-fence writer pool must be distinct from the restricted 18.3 reader.
import {createPrivateAccountFence313} from './privateAccountFence313.mjs';
import {createPrivatePgVerifiedGateway310} from './privatePgVerifiedGateway310.mjs';
import {createPrivateAccountHeartbeat330} from './privateAccountHeartbeat330.mjs';
import {createPrivateQuestReadFence343} from './privateQuestReadFence343.mjs';
import {withPrivateLoopbackDeadline228} from './privateLoopbackDeadline228.mjs';

const DENIED=Object.freeze({ok:false,version:'32.0',
 reason:'original_account_fence_unavailable',privateServerOnly:true,
 publicRouteInstalled:false,resumeCombatAuthorized:false,
 rewardsIssued:false,productionReady:false});
export async function createPrivateAccountFencedGateway320(options={}){
 if(!Number.isInteger(options.operationTimeoutMs??3000)||
    (options.operationTimeoutMs??3000)<100||
    (options.operationTimeoutMs??3000)>3000||
    options.accountFencePool===options.pool||
    typeof options.verifyOriginalAccount313!=='function'||
    (options.enableAutomaticRenewal===true &&
      (!Number.isInteger(options.heartbeatIntervalMs??5000)||
       (options.heartbeatIntervalMs??5000)*3>(options.ttlMs??15000))))
  throw Error('32.0 requires separate private PG account-fence role and original auth');
 const fence=await createPrivateAccountFence313({
  ...options,pool:options.accountFencePool,
  verifyOriginal:options.verifyOriginalAccount313,
 });
 let parent;
 try{parent=await createPrivatePgVerifiedGateway310(options)}
 catch(error){await fence.shutdown();throw error}
 let closed=false,busy=false,admitted=false,wrappedIngress=null;
 let originalAdmission=null,admittedRequest=null,renewing=false,heartbeat=null;
 let pinnedProof=null,binding=false,bound=false,readFence=null;
 const shutdown=async()=>{
  if(closed)return false;
  closed=true;
  heartbeat?.stop();
  readFence?.close();
  try{wrappedIngress?.close()}catch{}
  try{parent.shutdown()}catch{}
  await fence.shutdown();return true;
 };
 // 32.8: renewal is privileged and must pass original Base44/world/PG
 // re-authentication both before AND after the atomic DB CAS.
 // 34.4: bound each independent auth/PG operation. A timed-out callback
 // cannot subsequently return an allowed reply from this gateway.
 const bounded=async execute=>{
  try{return await withPrivateLoopbackDeadline228(execute,{
   timeoutMs:options.operationTimeoutMs??3000})}
  catch{return null}
 };
 const verifyFence=()=>bounded(()=>fence.verify());
 const renewAccountClaim=async()=>{
  if(closed||!admitted||!pinnedProof||!originalAdmission||renewing||!admittedRequest)
   return false;
  renewing=true;
  try{
   const before=await bounded(()=>originalAdmission.authenticateUpgrade(admittedRequest));
   if(!before||closed||!await verifyFence()){
    void shutdown();return false;
   }
   if(!await bounded(()=>fence.renew())||closed){void shutdown();return false;}
   const after=await bounded(()=>originalAdmission.authenticateUpgrade(admittedRequest));
   if(!after||closed||before.transportId!==after.transportId||
      before.ownerId!==after.ownerId||
      before.characterId!==after.characterId||
      !await verifyFence()){
    void shutdown();return false;
   }
   return true;
  }catch{void shutdown();return false}
  finally{renewing=false}
 };
 if(options.enableAutomaticRenewal===true){
  try{
   heartbeat=createPrivateAccountHeartbeat330({enabled:true,
    ttlMs:options.ttlMs??15000,
    intervalMs:options.heartbeatIntervalMs??5000,
    renewTimeoutMs:options.heartbeatTimeoutMs??Math.min(3000,Math.floor((options.ttlMs??15000)/3)),
    renew:renewAccountClaim,onFailure:shutdown});
  }catch(error){await shutdown();throw error}
 }
 const guarded=async execute=>{
  if(closed||!await verifyFence())return DENIED;
  const reply=await bounded(execute);
  if(closed||!reply||!await verifyFence())return DENIED;
  return reply.ok===true?reply:DENIED;
 };
 const resolveBackendAdmission=async request=>{
  if(closed||busy||admitted)return null;
  busy=true;
  try{
   if(!await bounded(()=>fence.acquire())){await shutdown();return null}
   if(closed)return null;
   const original=await bounded(()=>parent.resolveBackendAdmission(request));
   if(!original||closed||!await verifyFence()){
    await shutdown();return null;
   }
   const ingress=original.ingress211;
   if(ingress?.version!=='21.1'||ingress.privateServerOnly!==true||
      ingress.publicRouteInstalled!==false||
      ingress.resumeCombatAuthorized!==false||
      typeof ingress.bind!=='function'||typeof ingress.receive!=='function'||
      typeof ingress.close!=='function'){
    await shutdown();return null;
   }
   admitted=true;
   admittedRequest=request;
   originalAdmission=original;
   wrappedIngress=ingress;
   const wrapped=Object.freeze({version:'21.1',
    privateServerOnly:true,publicRouteInstalled:false,
    transportBindingCreated:false,resumeCombatAuthorized:false,
    bind:async context=>{
     if(binding||bound||closed||!pinnedProof)return DENIED;
     binding=true;
     try{
      if(!pinnedProof||!context||
        context.serverTransportContext!==pinnedProof.serverTransportContext||
        context.serverReconnectContext!==pinnedProof.serverReconnectContext){
      void shutdown();return DENIED;
     }
     const result=await guarded(()=>ingress.bind(context));
      if(result.ok!==true){void shutdown();return result;}
      if(heartbeat&&!heartbeat.start()&&!heartbeat.snapshot().active){
       void shutdown();return DENIED;
      }
      if(closed)return DENIED;
      bound=true;
      return result;
     }finally{binding=false}
    },
    // 34.5–34.7: fail replay, out-of-order and concurrent reads before
    // invoking the existing, independently authorized read-only ingress.
    receive:async context=>{
     if(!bound||closed||!readFence)return DENIED;
     const ticket=readFence.begin(context);
     if(!ticket){void shutdown();return DENIED;}
     const result=await guarded(()=>ingress.receive(context));
     if(!readFence.finish(ticket,result.ok===true)){
      void shutdown();return DENIED;
     }
     return closed?DENIED:result;
    },
    close:()=>{void shutdown()},
   });
   return Object.freeze({scope:original.scope,ingress211:wrapped,
    authenticateUpgrade:async req=>{
     if(closed||!await verifyFence())return null;
     let proof;
     try{proof=await bounded(()=>original.authenticateUpgrade(req))}catch{return null}
     if(!proof||closed||!await verifyFence()){
      void shutdown();return null;
     }
     // 33.7: the same original server request must never silently switch
     // authenticated account/character/transport or extend its initial expiry.
     if(pinnedProof && (proof.transportId!==pinnedProof.transportId||
       proof.ownerId!==pinnedProof.ownerId||
       proof.characterId!==pinnedProof.characterId||
       !Number.isSafeInteger(proof.expiresAtMs)||
       proof.expiresAtMs>pinnedProof.expiresAtMs||
       proof.serverTransportContext!==pinnedProof.serverTransportContext||
       proof.serverReconnectContext!==pinnedProof.serverReconnectContext)){
      void shutdown();return null;
     }
     if(!pinnedProof){
      pinnedProof=Object.freeze({
       transportId:proof.transportId,ownerId:proof.ownerId,
       characterId:proof.characterId,expiresAtMs:proof.expiresAtMs,
       serverTransportContext:proof.serverTransportContext,
       serverReconnectContext:proof.serverReconnectContext});
      readFence=createPrivateQuestReadFence343({
       serverTransportContext:proof.serverTransportContext});
     }
     return proof;
    }});
  }catch{await shutdown();return null}
  finally{busy=false}
 };
 const revoke=request=>{
  if(closed)return false;
  const revoked=parent.revoke(request);
  if(revoked)void shutdown();
  return revoked;
 };
 return Object.freeze({version:'32.0',resolveBackendAdmission,revoke,shutdown,
  renewAccountClaim,get heartbeat(){return heartbeat?.snapshot()??null},
  privateServerOnly:true,publicRouteInstalled:false,
  listenerInstalled:false,schemaMigrated:false,
  resumeCombatAuthorized:false,rewardsIssued:false,
  productionReady:false});
}
