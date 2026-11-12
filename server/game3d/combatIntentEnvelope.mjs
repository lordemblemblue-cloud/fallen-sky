// Combat 10.9 — bound game skill intents from authenticated server peers.
// Pure validation only. Actual damage/cooldown must remain server-derived.
import {getGame3DSkillPolicy} from './combatMasteryRules.mjs';
const actor=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
export function validateSkillIntentEnvelope({
  participantId,authorityEpoch,sequence,skillId,targetIds
}={}){
 if(!actor(participantId)||!key(authorityEpoch)||
    !Number.isSafeInteger(sequence)||sequence<1||
    !getGame3DSkillPolicy(skillId)||!Array.isArray(targetIds))
  return {ok:false,code:'malformed_skill_intent'};
 const policy=getGame3DSkillPolicy(skillId);
 if(targetIds.length>policy.maxTargets||
    new Set(targetIds).size!==targetIds.length||
    targetIds.some(x=>!actor(x)))
  return {ok:false,code:'invalid_skill_targets'};
 return {ok:true,participantId,authorityEpoch,sequence,skillId,
  targetIds:[...targetIds],serverMustVerifyTargetVisibility:true,
  damageTrusted:false,rankedRewardsEnabled:false};
}
