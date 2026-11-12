// 27.1 — server-owned request binding contract for the ORIGINAL private world.
// Contract validation is not a substitute for server-side Base44 authentication.
import {isRecord,validScope190} from './privateTransportContract190.mjs';

const keys=['authenticated','identitySource','ownerId','characterId','expiresAtMs',
 'serverTransportContext','serverReconnectContext','serverReadContext'];

export function isServerRequest271(request){
 return request!==null && typeof request==='object' && !Array.isArray(request);
}

export function checkTrustedRequest271(claim,scope,originalContext,at){
 if(!isRecord(claim) || Object.keys(claim).length!==keys.length ||
    !keys.every(k=>Object.hasOwn(claim,k)) || !validScope190(scope) ||
    claim.authenticated!==true ||
    claim.identitySource!=='trusted-private-upgrade-271' ||
    claim.ownerId!==scope.ownerId || claim.characterId!==scope.characterId ||
    !Number.isSafeInteger(at) || at<=0 ||
    !Number.isSafeInteger(claim.expiresAtMs) ||
    claim.expiresAtMs<=at || claim.expiresAtMs>at+30000 ||
    !isRecord(claim.serverTransportContext) ||
    !isRecord(claim.serverReconnectContext) ||
    !isRecord(claim.serverReadContext)) return null;
 const contexts=[claim.serverTransportContext,claim.serverReconnectContext,
  claim.serverReadContext];
 if(new Set(contexts).size!==3 || contexts.includes(originalContext))return null;
 return Object.freeze({ownerId:claim.ownerId,characterId:claim.characterId,
  expiresAtMs:claim.expiresAtMs,
  serverTransportContext:claim.serverTransportContext,
  serverReconnectContext:claim.serverReconnectContext,
  serverReadContext:claim.serverReadContext});
}

export function sameTrustedRequest271(a,b){
 return a && b && a.ownerId===b.ownerId && a.characterId===b.characterId &&
  b.expiresAtMs<=a.expiresAtMs &&
  a.serverTransportContext===b.serverTransportContext &&
  a.serverReconnectContext===b.serverReconnectContext &&
  a.serverReadContext===b.serverReadContext;
}
