// 27.2–27.9 — private request object bound to original verified 18.0 world.
// No browser credential parser, HTTP route, Base44 login provider, or reward writer.
import {createPrivateTransportAuthority191}
 from './privateTransportAuthority191.mjs';
import {isRecord,validScope190} from './privateTransportContract190.mjs';
import {withPrivateLoopbackDeadline228} from './privateLoopbackDeadline228.mjs';
import {isServerRequest271,checkTrustedRequest271,sameTrustedRequest271}
 from './privateRequestContract271.mjs';

export async function createPrivateRequestBinder272({enabled=false,scope,
 pairing180,worldStage180,serverRequestContext,
 verifyAuthenticatedUpgrade271,now=Date.now,timeoutMs=1500}={}){
 if(enabled!==true || process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging' ||
    !validScope190(scope) || !isRecord(serverRequestContext) ||
    typeof verifyAuthenticatedUpgrade271!=='function' ||
    typeof now!=='function' || !Number.isInteger(timeoutMs) ||
    timeoutMs<100 || timeoutMs>3000)
  throw Error('27.2 requires original 18.0 pairing and an independent authenticated upgrade verifier');
 const authority=await createPrivateTransportAuthority191({enabled:true,
  scope,pairing180,worldStage180,serverRequestContext,now});
 let active=null,closed=false,stageLost=false,clockBroken=false,lastTime=null,
  registering=false,registeringRequest=null;
 const refused=new WeakSet();
 const stage=()=>{
  if(process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging')stageLost=true;
  return !closed&&!stageLost;
 };
 const time=()=>{
  if(clockBroken)return null;
  let t;try{t=now()}catch{clockBroken=true;return null}
  if(!Number.isSafeInteger(t)||t<=0 || (lastTime!==null&&t<lastTime)){
   clockBroken=true;return null;
  }
  lastTime=t;return t;
 };
 const evidence=async(request)=>{
  if(!stage() || !isServerRequest271(request))return null;
  const firstTime=time();if(firstTime===null)return null;
  let supplied;
  try{
   supplied=await verifyAuthenticatedUpgrade271(request);
  }catch{return null}
  const at=time();if(at===null)return null;
  const pinned=checkTrustedRequest271(supplied,scope,serverRequestContext,at);
  if(!pinned)return null;
  const responses=await Promise.all([
   authority.verify(pinned.serverTransportContext),
   authority.verify(pinned.serverReconnectContext),
   authority.verify(pinned.serverReadContext),
  ]);
  const end=time();
  // A caller cannot mutate the alleged trusted middleware result during awaits.
  if(!stage() || end===null || !responses.every(Boolean) ||
     !sameTrustedRequest271(pinned,supplied) ||
     !await authority.stillOriginal())return null;
  const expiresAtMs=Math.min(pinned.expiresAtMs,...responses.map(r=>r.expiresAtMs));
  if(expiresAtMs<=end)return null;
  return Object.freeze({...pinned,expiresAtMs});
 };
 const check=request=>withPrivateLoopbackDeadline228(
  ()=>evidence(request),{timeoutMs}).catch(()=>null);
 const register=async request=>{
  // 27.4: a failed/anonymous attempt cannot consume the next real connection.
  if(!stage() || registering || active || !isServerRequest271(request) ||
     refused.has(request))return false;
  registering=true;registeringRequest=request;
  try{
   const value=await check(request);
   if(!stage() || active || !value || refused.has(request) ||
      registeringRequest!==request)return false;
   active=Object.freeze({request,value});
   return true;
  }finally{registering=false;registeringRequest=null}
 };
 const resolvePrivateBackendContext249=async request=>{
  if(!stage() || !active || request!==active.request)return null;
  const registered=active;
  const proof=await check(request);
  if(!stage() || active!==registered || refused.has(request))return null;
  if(!proof || !sameTrustedRequest271(registered.value,proof)){
   revoke(request);return null;
  }
  return Object.freeze({authenticated:true,
   identitySource:'trusted-private-backend-context-249',
   ownerId:scope.ownerId,characterId:scope.characterId,
   expiresAtMs:Math.min(active.value.expiresAtMs,proof.expiresAtMs),
   serverTransportContext:active.value.serverTransportContext,
   serverReconnectContext:active.value.serverReconnectContext,
   serverReadContext:active.value.serverReadContext});
 };
 const revoke=request=>{
  if(registeringRequest===request){
   refused.add(request);registeringRequest=null;return true;
  }
  if(!active || active.request!==request)return false;
  refused.add(request);active=null;return true;
 };
 const shutdown=()=>{
  if(closed)return false;
  closed=true;if(active)revoke(active.request);
  authority.shutdown();return true;
 };
 return Object.freeze({version:'27.2',register,
  resolvePrivateBackendContext249,revoke,shutdown,
  get registered(){return active!==null},
  privateServerOnly:true,publicRouteInstalled:false,
  transportBindingCreated:false,resumeCombatAuthorized:false,
  rewardsIssued:false,productionReady:false});
}
