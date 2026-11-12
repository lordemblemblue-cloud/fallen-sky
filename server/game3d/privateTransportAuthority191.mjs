// 19.1: re-attest real 18.0 Base44/world pairing for EVERY private request.
import {isRecord,validScope190,validLease190,pinLease190,sameLease190}
 from './privateTransportContract190.mjs';
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
export async function createPrivateTransportAuthority191({
 pairing180,worldStage180,serverRequestContext,scope,
 enabled=false,now=Date.now,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !validScope190(scope)||!isRecord(serverRequestContext)||
    pairing180?.version!=='18.0'||pairing180.privateServerOnly!==true||
    pairing180.publicPlayerRouteInstalled!==false||
    ['resolveTrustedWorldPrincipal','resolveVerifiedBase44ActionSession',
     'verifySessionActive'].some(k=>typeof pairing180[k]!=='function')||
    worldStage180?.version!=='18.0'||
    worldStage180.privateServerOnly!==true||
    worldStage180.publicPlayerRouteInstalled!==false||
    typeof worldStage180.resolveCurrentWorldLease183!=='function'||
    typeof now!=='function')
  throw Error('19.1 requires original private Base44 and world authorities');
 let closed=false;
 const current=async()=>{
  if(closed)return null;
  try{
   const l=await worldStage180.resolveCurrentWorldLease183({serverRequestContext});
   const t=now();
   return Number.isSafeInteger(t)&&validLease190(l,t)&&
    l.ownerId===scope.ownerId&&l.characterId===scope.characterId&&
    l.worldInstanceId===scope.instanceId&&l.worldEpoch===scope.instanceEpoch?l:null;
  }catch{return null}
 };
 const initial=await current();
 if(!initial)throw Error('19.1 original world lease unavailable');
 const original=pinLease190(initial);
 const stillOriginal=async()=>!closed&&sameLease190(original,await current());
 const verify=async context=>{
  if(!isRecord(context)||context===serverRequestContext||
     !await stillOriginal())return null;
  let principal,action;
  try{
   principal=await pairing180.resolveTrustedWorldPrincipal(context);
   action=await pairing180.resolveVerifiedBase44ActionSession(context);
  }catch{return null}
  const t=now();
  if(!isRecord(principal)||!isRecord(action)||
     principal.authenticated!==true||
     principal.identitySource!=='trusted-server-session'||
     action.authenticated!==true||
     action.identitySource!=='base44-verified-action-session-179'||
     principal.accountId!==original.ownerId||
     principal.characterId!==original.characterId||
     principal.serverSessionId!==original.serverSessionId||
     action.accountId!==original.ownerId||
     action.characterId!==original.characterId||
     action.worldSessionId!==original.serverSessionId||
     action.actionSessionId!==original.actionSessionId||
     !KEY.test(principal.serverSessionId)||
     !Number.isSafeInteger(principal.expiresAtMs)||
     !Number.isSafeInteger(action.expiresAtMs)||
     principal.expiresAtMs<=t||action.expiresAtMs<=t||
     principal.expiresAtMs>t+900000||action.expiresAtMs>t+900000)
    return null;
  let active=false;
  try{active=await pairing180.verifySessionActive(Object.freeze({
    ownerId:original.ownerId,characterId:original.characterId,
    instanceId:scope.instanceId,serverSessionId:original.serverSessionId,
    actionSessionId:original.actionSessionId,
  }))===true;}catch{return null}
  if(!active||!await stillOriginal()||
     principal.expiresAtMs<=now()||action.expiresAtMs<=now())
   return null;
  return Object.freeze({expiresAtMs:Math.min(original.expiresAtMs,
   principal.expiresAtMs,action.expiresAtMs)});
 };
 return Object.freeze({version:'19.1',original,verify,stillOriginal,
  shutdown(){closed=true},privateServerOnly:true,publicRouteInstalled:false,
  productionReady:false});
}
