// 21.3: server-provided authenticated upgrade context; never browser claims.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const TRANSPORT=/^tx-[a-f0-9]{32}$/;
const known=new Set(['__anon__','__default__','__dev_test__']);
export async function attestPrivateSocket213({
 authenticateUpgrade,request,scope,now=Date.now,signal=null,
}={}){
 if(typeof authenticateUpgrade!=='function'||!request||
    !scope||typeof now!=='function'||signal?.aborted)return null;
 let claim;
 try{claim=await authenticateUpgrade(request,{signal})}catch{return null}
 if(signal?.aborted)return null;
 const t=now();
 if(signal?.aborted)return null;
 if(!claim||typeof claim!=='object'||Array.isArray(claim)||
    claim.authenticated!==true||
    claim.identitySource!=='trusted-private-socket-upgrade-213'||
    typeof claim.ownerId!=='string'||!ID.test(claim.ownerId)||
    known.has(claim.ownerId)||claim.ownerId!==scope.ownerId||
    typeof claim.characterId!=='string'||!ID.test(claim.characterId)||
    known.has(claim.characterId)||claim.characterId!==scope.characterId||
    !TRANSPORT.test(claim.transportId)||
    !Number.isSafeInteger(claim.expiresAtMs)||
    !Number.isSafeInteger(t)||claim.expiresAtMs<=t||
    claim.expiresAtMs>t+60000||
    !claim.serverTransportContext||
    typeof claim.serverTransportContext!=='object'||
    Array.isArray(claim.serverTransportContext)||
    !claim.serverReconnectContext||
    typeof claim.serverReconnectContext!=='object'||
    Array.isArray(claim.serverReconnectContext))
   return null;
 return Object.freeze({transportId:claim.transportId,
  ownerId:claim.ownerId,characterId:claim.characterId,
  expiresAtMs:claim.expiresAtMs,
  serverTransportContext:claim.serverTransportContext,
  serverReconnectContext:claim.serverReconnectContext});
}
export const samePrivateSocket213=(a,b,t)=>!!a&&!!b&&
 a.transportId===b.transportId&&a.ownerId===b.ownerId&&
 a.characterId===b.characterId&&b.expiresAtMs<=a.expiresAtMs&&
 Number.isSafeInteger(t)&&t<a.expiresAtMs;
