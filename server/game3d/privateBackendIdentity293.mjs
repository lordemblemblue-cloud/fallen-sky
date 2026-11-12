// 29.3–29.7: translate an INDEPENDENTLY authenticated backend session into
// the exact original 27.1 private request contract. No browser credential parser.
import {isRecord,validScope190} from './privateTransportContract190.mjs';
import {checkTrustedRequest271,sameTrustedRequest271,isServerRequest271}
 from './privateRequestContract271.mjs';
import {withPrivateLoopbackDeadline228}
 from './privateLoopbackDeadline228.mjs';

const FIELDS=['authenticated','identitySource','ownerId','characterId',
 'expiresAtMs','serverTransportContext','serverReconnectContext',
 'serverReadContext'];
const exact=x=>isRecord(x)&&Object.keys(x).length===FIELDS.length&&
 FIELDS.every(k=>Object.hasOwn(x,k));

export function createPrivateBackendIdentity293({enabled=false,scope,
 serverRequestContext,verifyServerSession293,now=Date.now,timeoutMs=1000}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !validScope190(scope)||!isRecord(serverRequestContext)||
    typeof verifyServerSession293!=='function'||typeof now!=='function'||
    !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3000)
  throw Error('29.3 requires independently authenticated private world session backend');
 let closed=false,stageLost=false,clockBroken=false,lastTime=null;
 const pinned=new WeakMap(),revoked=new WeakSet(),inFlight=new WeakSet();
 const stage=()=>{
  if(process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging')stageLost=true;
  return !closed&&!stageLost;
 };
 const clock=()=>{
  if(clockBroken)return null;
  let t;try{t=now()}catch{clockBroken=true;return null}
  if(!Number.isSafeInteger(t)||t<=0||(lastTime!==null&&t<lastTime)){
   clockBroken=true;return null;
  }
  lastTime=t;return t;
 };
 const revoke=request=>{
  if(!isServerRequest271(request))return false;
  const wasPinned=pinned.has(request);
  pinned.delete(request);revoked.add(request);
  return wasPinned;
 };
 const verifyAuthenticatedUpgrade271=async request=>{
  if(!stage()||!isServerRequest271(request)||revoked.has(request)||
     inFlight.has(request))return null;
  if(clock()===null)return null;
  // Never allow two async identity lookups to race on one request object.
  inFlight.add(request);
  try{
   let receipt;
   try{receipt=await withPrivateLoopbackDeadline228(
     ()=>verifyServerSession293(request),{timeoutMs});}
   catch{return null}
   const at=clock();
   if(!stage()||at===null||revoked.has(request)||!exact(receipt)||
      receipt.authenticated!==true||
      receipt.identitySource!=='original-base44-world-session-293'){
    // An established session cannot be revived after backend logout or expiry.
    if(pinned.has(request))revoke(request);
    return null;
   }
   const candidate=checkTrustedRequest271({
    authenticated:true,identitySource:'trusted-private-upgrade-271',
    ownerId:receipt.ownerId,characterId:receipt.characterId,
    expiresAtMs:receipt.expiresAtMs,
    serverTransportContext:receipt.serverTransportContext,
    serverReconnectContext:receipt.serverReconnectContext,
    serverReadContext:receipt.serverReadContext,
   },scope,serverRequestContext,at);
   if(!candidate){if(pinned.has(request))revoke(request);return null;}
   const previous=pinned.get(request);
   if(previous&&!sameTrustedRequest271(previous,candidate)){
    revoke(request);return null;
   }
   if(!previous)pinned.set(request,candidate);
   // Returned claim is not an authentication grant: 27.2 subsequently
   // verifies all three contexts against the ORIGINAL 18.0/19.1 authority.
   return Object.freeze({authenticated:true,
    identitySource:'trusted-private-upgrade-271',
    ...candidate});
  }finally{inFlight.delete(request)}
 };
 const shutdown=()=>{
  if(closed)return false;closed=true;return true;
 };
 return Object.freeze({version:'29.3',verifyAuthenticatedUpgrade271,revoke,
  shutdown,privateServerOnly:true,publicRouteInstalled:false,
  realBackendSessionConnected:false, // injected source must supply real authority
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
