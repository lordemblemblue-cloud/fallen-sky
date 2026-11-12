// Game 3D 84.6 — opt-in private composition; no HTTP listener or worker.
// Uses the ORIGINAL 84.5 -> 84.4 -> 18.5 -> 15.3/13.8 world chain.
import {createGame3DPrivateCombatQuestStaging845}
 from './privateCombatQuestAdmission845.mjs';
import {createGame3DPrivateGameplayHost846}
 from './privateCombatQuestHost846.mjs';

export async function createGame3DPrivateCombatQuestStaging846(options={}){
 if(options?.enabled!==true||
    process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !options.scope||typeof options.scope!=='object')
  throw Error('84.6 requires explicitly enabled private gameplay staging');
 const admission=await createGame3DPrivateCombatQuestStaging845(options);
 try{
  return createGame3DPrivateGameplayHost846({
   enabled:true,admission,scope:options.scope,
  });
 }catch(error){
  await admission.shutdown();
  throw error;
 }
}
