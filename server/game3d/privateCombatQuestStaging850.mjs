// Game 3D 85.0 — private preview composition, explicitly disabled by default.
// No HTTP server is created or mounted; caller must own a loopback-only server.
import {createGame3DPrivateCombatQuestStaging849}
 from './privateCombatQuestStaging849.mjs';
import {createGame3DPrivateQuestbookPreviewTransport850}
 from './privateQuestbookPreviewTransport850.mjs';

export async function createGame3DPrivateCombatQuestStaging850(options={}){
 if(options?.enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    process.env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850!=='enabled'||
    typeof options.verifyGatewayRequest!=='function'||
    typeof options.verifyEdgeRequest!=='function'||
    typeof options.verifyAuthorizedReader!=='function'||
    !options.scope||typeof options.scope!=='object'||
    !options.serverRequestContext||
    typeof options.serverRequestContext!=='object')
  throw Error('85.0 requires private staging, independent gateway auth and original 84.9 delivery');
 const delivery=await createGame3DPrivateCombatQuestStaging849(options);
 try{
  return createGame3DPrivateQuestbookPreviewTransport850({
   enabled:true,delivery,scope:options.scope,
   serverRequestContext:options.serverRequestContext,
   verifyGatewayRequest:options.verifyGatewayRequest,
   now:options.now??Date.now,
   requestTimeoutMs:options.requestTimeoutMs??2500,
   idleTimeoutMs:options.idleTimeoutMs??30000,
  });
 }catch(error){
  await delivery.shutdown();
  throw error;
 }
}
