// 31.0: original 29.8 backend-session adapter PLUS restricted PG lease proof.
// A failed PG read irrevocably closes this single-world staging handoff.
// No new socket listener, public route, ticket issuer, or combat authority.
import {createPrivatePgLeaseGuard303} from './privatePgLeaseGuard303.mjs';
import {createPrivateVerifiedLoopbackGateway298}
 from './privateVerifiedLoopbackGateway298.mjs';

const denied=Object.freeze({ok:false,version:'31.0',reason:'original_pg_session_unavailable',
 privateServerOnly:true,publicRouteInstalled:false,
 resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
export async function createPrivatePgVerifiedGateway310(options={}){
 const guard=await createPrivatePgLeaseGuard303(options);
 let parent;
 try{parent=await createPrivateVerifiedLoopbackGateway298(options)}
 catch(e){guard.shutdown();throw e}
 let stopped=false,revoked=false,consuming=false,issued=false;
 let activeRequest=null,activeIngress=null;
 const shutdown=()=>{
  if(stopped)return false;
  stopped=true;revoked=true;
  try{activeIngress?.close()}catch{}
  parent.shutdown();guard.shutdown();return true;
 };
 const revoke=request=>{
  const result=parent.revoke(request);
  if(request===activeRequest)shutdown();
  return result;
 };
 const refuse=()=>{shutdown();return null};
 const guardRead=async(fn)=>{
  if(stopped||revoked||!await guard.verify())return denied;
  let result;
  try{result=await fn()}catch{return denied}
  if(stopped||revoked||!await guard.verify())return denied;
  return result;
 };
 const resolveBackendAdmission=async request=>{
  if(stopped||revoked||consuming||issued)return null;
  consuming=true;
  try{
   if(!await guard.verify())return refuse();
   const admission=await parent.resolveBackendAdmission(request);
   if(!admission)return null;
   if(stopped||!await guard.verify())return refuse();
   const original=admission.ingress211;
   if(!original||original.version!=='21.1'||
      typeof original.bind!=='function'||typeof original.receive!=='function'||
      typeof original.close!=='function'||
      original.privateServerOnly!==true||original.publicRouteInstalled!==false||
      original.transportBindingCreated!==false||original.resumeCombatAuthorized!==false)
    return refuse();
   activeRequest=request;activeIngress=original;issued=true;
   const ingress211=Object.freeze({
    version:'21.1',privateServerOnly:true,publicRouteInstalled:false,
    transportBindingCreated:false,resumeCombatAuthorized:false,
    bind:async context=>{
     const result=await guardRead(()=>original.bind(context));
     if(result?.ok!==true){shutdown();return denied}
     return result;
    },
    receive:async context=>{
     const result=await guardRead(()=>original.receive(context));
     if(result?.ok!==true){shutdown();return denied}
     return result;
    },
    close:shutdown,
   });
   const authenticateUpgrade=async req=>{
    if(stopped||!await guard.verify())return refuse();
    const proof=await admission.authenticateUpgrade(req);
    if(!proof||stopped||!await guard.verify())return refuse();
    return proof;
   };
   return Object.freeze({scope:admission.scope,ingress211,
    authenticateUpgrade});
  }catch{return refuse()}
  finally{consuming=false}
 };
 return Object.freeze({version:'31.0',resolveBackendAdmission,revoke,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,
  listenerInstalled:false,roleGranted:false,leaseIssued:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
