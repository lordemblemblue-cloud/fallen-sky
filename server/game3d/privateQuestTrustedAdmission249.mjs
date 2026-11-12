// Combat / Quest 24.9–25.2 — original Base44/world verified private admission.
// Server-owned contexts only. No browser credentials, new tickets or public route.
import {randomBytes} from 'node:crypto';
import {withPrivateLoopbackDeadline228}
 from './privateLoopbackDeadline228.mjs';
import {createPrivateTransportAuthority191}
 from './privateTransportAuthority191.mjs';
import {createGame3DPrivateQuestIngress211}
 from './privateQuestIngress211.mjs';
import {isRecord,validScope190}
 from './privateTransportContract190.mjs';

const FIELDS=Object.freeze(['authenticated','identitySource','ownerId',
 'characterId','expiresAtMs','serverTransportContext',
 'serverReconnectContext','serverReadContext']);
const exact=(x,fields)=>isRecord(x)&&Object.keys(x).length===fields.length&&
 fields.every(k=>Object.hasOwn(x,k));

export async function createGame3DPrivateQuestTrustedAdmission249({
 enabled=false,pairing180,worldStage180,serverRequestContext,scope,
 questTransport199,resolvePrivateBackendContext249,now=Date.now,
 attestationTimeoutMs=1500,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !validScope190(scope)||!isRecord(serverRequestContext)||
    questTransport199?.version!=='19.9'||
    questTransport199.privateServerOnly!==true||
    questTransport199.publicRouteInstalled!==false||
    questTransport199.transportBindingCreated!==false||
    questTransport199.resumeCombatAuthorized!==false||
    typeof questTransport199.attach!=='function'||
    typeof resolvePrivateBackendContext249!=='function'||typeof now!=='function'||
    !Number.isInteger(attestationTimeoutMs)||attestationTimeoutMs<100||
    attestationTimeoutMs>3000)
  throw Error('24.9 requires original 18.0 authority, 19.9 and independent backend contexts');
 // 25.1: fail permanently closed if backend clock is invalid or rewinds.
 let lastClock=null,clockFailed=false;
 const clock=()=>{
  if(clockFailed)return null;
  let t;
  try{t=now()}catch{clockFailed=true;return null}
  if(!Number.isSafeInteger(t)||t<=0||
     (lastClock!==null&&t<lastClock)){clockFailed=true;return null;}
  lastClock=t;return t;
 };
 // Reuse the original 19.1 pairing/lease implementation; never self-assert auth.
 const authority=await createPrivateTransportAuthority191({
  enabled:true,pairing180,worldStage180,serverRequestContext,scope,now:clock,
 });
 let stopped=false,claimed=false,connecting=false,ingress=null;
 // 26.5: losing the explicit staging fence is an irreversible denial,
 // even if an operator later accidentally resets the environment flag.
 let stageRevoked=false;
 const stillStaging=()=>{
  if(stageRevoked||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging')
   stageRevoked=true;
  return !stageRevoked;
 };
 const inspect=async request=>{
  if(stopped||!stillStaging()||!request||typeof request!=='object')return null;
  let context;
  try{context=await resolvePrivateBackendContext249(request)}catch{return null}
  const t=clock();
  if(stopped||t===null||!exact(context,FIELDS)||
     context.authenticated!==true||
     context.identitySource!=='trusted-private-backend-context-249'||
     context.ownerId!==scope.ownerId||context.characterId!==scope.characterId||
     !Number.isSafeInteger(context.expiresAtMs)||context.expiresAtMs<=t||
     context.expiresAtMs>t+30000||
     !isRecord(context.serverTransportContext)||
     !isRecord(context.serverReconnectContext)||
     !isRecord(context.serverReadContext)||
     new Set([context.serverTransportContext,
      context.serverReconnectContext,context.serverReadContext]).size!==3||
     context.serverTransportContext===serverRequestContext||
     context.serverReconnectContext===serverRequestContext||
     context.serverReadContext===serverRequestContext)return null;
  // 26.3: snapshot server-owned references BEFORE asynchronous authority reads.
  // A mutable resolver result cannot silently rewrite our original pin.
  const checked=Object.freeze({expiresAtMs:context.expiresAtMs,
   serverTransportContext:context.serverTransportContext,
   serverReconnectContext:context.serverReconnectContext,
   serverReadContext:context.serverReadContext});
  const [a,b,c]=await Promise.all([
   authority.verify(checked.serverTransportContext),
   authority.verify(checked.serverReconnectContext),
   authority.verify(checked.serverReadContext),
  ]);
  if(stopped||!a||!b||!c||
     context.expiresAtMs!==checked.expiresAtMs||
     context.serverTransportContext!==checked.serverTransportContext||
     context.serverReconnectContext!==checked.serverReconnectContext||
     context.serverReadContext!==checked.serverReadContext||
     !await authority.stillOriginal())return null;
  const expiresAtMs=Math.min(checked.expiresAtMs,
   a.expiresAtMs,b.expiresAtMs,c.expiresAtMs);
  const current=clock();
  return current!==null&&expiresAtMs>current?
   Object.freeze({context:checked,expiresAtMs}):null;
 };
 const attest=request=>withPrivateLoopbackDeadline228(
  ()=>inspect(request),{timeoutMs:attestationTimeoutMs}).catch(()=>null);
 const resolveBackendAdmission=async request=>{
  if(stopped||!stillStaging()||claimed||connecting||!request||typeof request!=='object')return null;
  connecting=true;
  try{
   // Unauthenticated requests must not exhaust a valid one-use world admission.
   const initial=await attest(request);
   if(!initial||stopped)return null;
   // Reserve before creating the original 21.1/19.9 one-use consumer.
   claimed=true;
  // 25.0: opaque transport ID is generated by the server; no client claim.
  const transportId='tx-'+randomBytes(16).toString('hex');
  const originalContext=initial.context;
  const expiresAtMs=initial.expiresAtMs;
  // 26.1: pin the independently verified context OBJECTS for the lifetime
  // of this single original reconnect. A different trusted context for the
  // same account is not permission to silently move an attached socket.
  const refresh=async()=>{
   const proof=await attest(request);
   const t=clock();
   return !stopped&&stillStaging()&&proof&&t!==null&&proof.expiresAtMs>t&&
    proof.expiresAtMs<=expiresAtMs&&
    proof.context.expiresAtMs<=originalContext.expiresAtMs&&
    proof.context.serverTransportContext===originalContext.serverTransportContext&&
    proof.context.serverReconnectContext===originalContext.serverReconnectContext&&
    proof.context.serverReadContext===originalContext.serverReadContext?proof:null;
  };
  const resolveAuthenticatedTransport211=async({serverTransportContext}={})=>{
   if(stopped||serverTransportContext!==originalContext.serverTransportContext)
    return null;
   const proof=await refresh();
   if(!proof||!await authority.verify(originalContext.serverReadContext))return null;
   return Object.freeze({authenticated:true,
    identitySource:'trusted-private-transport-211',transportId,
    ownerId:scope.ownerId,characterId:scope.characterId,
    expiresAtMs,serverReadContext:originalContext.serverReadContext});
  };
  ingress=createGame3DPrivateQuestIngress211({enabled:true,
   questTransport199,scope,resolveAuthenticatedTransport211,now:clock});
  const authenticateUpgrade=async originalRequest=>{
   if(stopped||originalRequest!==request)return null;
   const proof=await refresh();
   if(!proof||!await authority.verify(originalContext.serverReconnectContext))
    return null;
   return Object.freeze({authenticated:true,
    identitySource:'trusted-private-socket-upgrade-213',
    ownerId:scope.ownerId,characterId:scope.characterId,
    transportId,expiresAtMs,
    serverTransportContext:originalContext.serverTransportContext,
    serverReconnectContext:originalContext.serverReconnectContext});
  };
  // Re-attest before exposing the provider after async factory work.
  if(!await authenticateUpgrade(request)||stopped){
   ingress.close();return null;
  }
  return Object.freeze({scope:Object.freeze({ownerId:scope.ownerId,
   characterId:scope.characterId}),ingress211:ingress,authenticateUpgrade});
  }finally{connecting=false}
 };
 const shutdown=()=>{
  if(stopped)return false;
  stopped=true;
  try{ingress?.close()}catch{}
  authority.shutdown();
  return true;
 };
 return Object.freeze({version:'24.9',resolveBackendAdmission,shutdown,
  privateServerOnly:true,publicRouteInstalled:false,
  transportBindingCreated:false,resumeCombatAuthorized:false,
  rewardsIssued:false,productionReady:false});
}
