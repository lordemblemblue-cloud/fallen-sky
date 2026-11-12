// Game 3D Combat/Quest 84.9 — explicitly gated private staging composition.
// No HTTP listener, WebSocket, public browser route or new gameplay writer.
import {createGame3DPrivateCombatQuestStaging848}
 from './privateCombatQuestStaging848.mjs';
import {createGame3DPrivateQuestbookDelivery849}
 from './privateQuestbookDelivery849.mjs';

export async function createGame3DPrivateCombatQuestStaging849(options={}){
 if(options?.enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    typeof options.verifyEdgeRequest!=='function'||
    typeof options.verifyAuthorizedReader!=='function'||
    !options.scope||typeof options.scope!=='object'||
    !options.serverRequestContext||typeof options.serverRequestContext!=='object')
  throw Error('84.9 requires explicit private staging, original viewer and independent edge authentication');
 const view=await createGame3DPrivateCombatQuestStaging848(options);
 try{
  return createGame3DPrivateQuestbookDelivery849({
   enabled:true,view,scope:options.scope,
   serverRequestContext:options.serverRequestContext,
   verifyEdgeRequest:options.verifyEdgeRequest,
   now:options.now??Date.now,
  });
 }catch(error){
  await view.shutdown();
  throw error;
 }
}
