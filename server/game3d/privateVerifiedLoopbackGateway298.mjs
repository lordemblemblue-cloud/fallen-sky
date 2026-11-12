// 29.8–30.0: compose independent backend verification with original 29.0
// admission. This is a factory, not a socket listener or Base44 client.
import {createPrivateBackendIdentity293}
 from './privateBackendIdentity293.mjs';
import {createPrivateRegisteredLoopbackAdmission290}
 from './privateRegisteredLoopbackAdmission290.mjs';

export async function createPrivateVerifiedLoopbackGateway298(options={}){
 const identity=createPrivateBackendIdentity293(options);
 let gateway;
 try{
  gateway=await createPrivateRegisteredLoopbackAdmission290({
   ...options,verifyAuthenticatedUpgrade271:
    identity.verifyAuthenticatedUpgrade271,
  });
 }catch(error){identity.shutdown();throw error}
 let closed=false;
 const resolveBackendAdmission=async request=>{
  if(closed)return null;
  const value=await gateway.resolveBackendAdmission(request);
  return closed?null:value;
 };
 const revoke=request=>{
  const a=identity.revoke(request);
  const b=gateway.revoke(request);
  return a||b;
 };
 const shutdown=()=>{
  if(closed)return false;
  closed=true;identity.shutdown();gateway.shutdown();return true;
 };
 return Object.freeze({version:'29.8',resolveBackendAdmission,revoke,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,listenerInstalled:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
