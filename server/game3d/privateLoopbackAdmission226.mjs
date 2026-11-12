// 22.6 - server-owned per-upgrade admission; never derive owner or character from a WS frame.
import {attestPrivateSocket213} from './privateSocketAuthority213.mjs';
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
export async function resolvePrivateLoopbackAdmission226({
 request,resolveBackendAdmission,now=Date.now,
}={}){
 if(typeof resolveBackendAdmission!=='function'||!request)return null;
 let candidate;
 try{candidate=await resolveBackendAdmission(request)}catch{return null}
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
    !safeId(candidate.scope?.ownerId)||!safeId(candidate.scope?.characterId)||
    typeof candidate.authenticateUpgrade!=='function'||
    candidate.ingress211?.version!=='21.1'||
    candidate.ingress211.privateServerOnly!==true||
    candidate.ingress211.publicRouteInstalled!==false||
    candidate.ingress211.transportBindingCreated!==false||
    candidate.ingress211.resumeCombatAuthorized!==false||
    typeof candidate.ingress211.bind!=='function'||
    typeof candidate.ingress211.receive!=='function'||
    typeof candidate.ingress211.close!=='function')return null;
 const before=await attestPrivateSocket213({
  authenticateUpgrade:candidate.authenticateUpgrade,request,
  scope:candidate.scope,now,
 });
 if(!before)return null;
 // Return only backend-owned references, not any browser-originating data.
 return Object.freeze({scope:Object.freeze({ownerId:candidate.scope.ownerId,
  characterId:candidate.scope.characterId}),
  ingress211:candidate.ingress211,
  authenticateUpgrade:candidate.authenticateUpgrade,
  transportId:before.transportId,expiresAtMs:before.expiresAtMs});
}
