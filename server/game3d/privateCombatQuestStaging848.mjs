// Game 3D Combat/Quest 84.8 - source-only staging composition.
// Retains original 84.6 authenticated world host; no browser route is installed.
import {createGame3DPrivateCombatQuestStaging846}
 from './privateCombatQuestStaging846.mjs';
import {createGame3DPrivateQuestbookPresentation848}
 from './privateQuestbookPresentation848.mjs';

export async function createGame3DPrivateCombatQuestStaging848(options={}){
 if(options?.enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    typeof options.verifyAuthorizedReader!=='function'||
    !options.scope||typeof options.scope!=='object'||
    !options.serverRequestContext||typeof options.serverRequestContext!=='object')
  throw Error('84.8 requires explicit trusted, private read-model staging');
 const host=await createGame3DPrivateCombatQuestStaging846(options);
 try{
  return createGame3DPrivateQuestbookPresentation848({
   enabled:true,host,scope:options.scope,
   serverRequestContext:options.serverRequestContext,
   verifyAuthorizedReader:options.verifyAuthorizedReader,
   now:options.now??Date.now,
  });
 }catch(error){
  await host.shutdown();
  throw error;
 }
}
