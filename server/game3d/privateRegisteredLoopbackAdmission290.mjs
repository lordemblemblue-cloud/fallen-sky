// 29.0: link a *verified* request registration to existing 22.6/23.2 loopback admission.
// Does not start a socket listener; external private backend auth remains mandatory.
import {createPrivateTrustedGatewayFactory280}
 from './privateTrustedGatewayFactory280.mjs';

export async function createPrivateRegisteredLoopbackAdmission290(options={}){
 const original=await createPrivateTrustedGatewayFactory280(options);
 let closed=false,claiming=false,consumed=false,registeredRequest=null;
 const resolveBackendAdmission=async request=>{
  if(closed||claiming||consumed||!request||typeof request!=='object')return null;
  claiming=true;
  try{
   // Register only if the independently injected original-world verifier accepts.
   // Anonymous requests must never consume a real 19.9 one-use reconnect proof.
   if(!await original.registerAuthenticatedUpgrade(request)||closed)return null;
   registeredRequest=request;
   const admission=await original.resolveBackendAdmission(request);
   if(closed||admission?.scope===undefined){
    original.revoke(request);return null;
   }
   consumed=true;
   return admission;
  }catch{
   if(registeredRequest===request)original.revoke(request);
   return null;
  }finally{claiming=false}
 };
 const revoke=request=>{
  const result=original.revoke(request);
  if(result){closed=true;registeredRequest=null;original.shutdown()}
  return result;
 };
 const shutdown=()=>{
  if(closed)return false;
  closed=true;registeredRequest=null;original.shutdown();return true;
 };
 return Object.freeze({version:'29.0',resolveBackendAdmission,revoke,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,listenerInstalled:false,
  transportBindingCreated:false,resumeCombatAuthorized:false,
  rewardsIssued:false,productionReady:false});
}
