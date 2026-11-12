// 28.0 — compose original 18.0/19.1/19.9/21.1/24.9 safely for existing 23.2 loopback.
// This does NOT start a listener or implement external Base44 sign-in.
import {createPrivateRequestBinder272} from './privateRequestBinder272.mjs';
import {createGame3DPrivateQuestTrustedAdmission249}
 from './privateQuestTrustedAdmission249.mjs';

export async function createPrivateTrustedGatewayFactory280(options={}){
 const binder=await createPrivateRequestBinder272(options);
 let provider;
 try{
  provider=await createGame3DPrivateQuestTrustedAdmission249({
   ...options,enabled:true,
   resolvePrivateBackendContext249:binder.resolvePrivateBackendContext249,
  });
 }catch(error){binder.shutdown();throw error}
 let closed=false;
 const revoke=request=>{
  const result=binder.revoke(request);
  if(result)provider.shutdown();
  return result;
 };
 const shutdown=()=>{
  if(closed)return false;
  closed=true;binder.shutdown();provider.shutdown();return true;
 };
 return Object.freeze({version:'28.0',
  registerAuthenticatedUpgrade:request=>closed?Promise.resolve(false):binder.register(request),
  resolveBackendAdmission:request=>closed?Promise.resolve(null):
   provider.resolveBackendAdmission(request),
  revoke,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,
  listenerInstalled:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
