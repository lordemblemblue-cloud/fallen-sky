// Combat 10.8 — server-owned skill family / mastery definitions.
// Rules reflect the Game 3D single-hit, triple-hit, AOE and buff contract.
export const MASTERY_POLICY_VERSION='game3d-mastery-v1';
export const MAX_SKILL_RANK=10;
export const MIN_CHARGE_MS=1000;
const SKILLS=Object.freeze({
 single_hit:Object.freeze({family:'single',maxTargets:1,chargeable:true}),
 triple_hit:Object.freeze({family:'multi',maxTargets:1,chargeable:true,hits:3}),
 area_hit:Object.freeze({family:'aoe',maxTargets:12,chargeable:false}),
 battle_buff:Object.freeze({family:'buff',maxTargets:1,chargeable:false}),
});
export function getGame3DSkillPolicy(skillId){return SKILLS[skillId]??null;}
export function inspectMasteredCharge({skillId,rank,holdMs}={}){
 const skill=getGame3DSkillPolicy(skillId);
 if(!skill||!Number.isSafeInteger(rank)||rank<1||rank>MAX_SKILL_RANK||
    !Number.isSafeInteger(holdMs)||holdMs<0||holdMs>5000)
  return {ok:false,code:'invalid_skill_mastery'};
 const ready=skill.chargeable&&rank===MAX_SKILL_RANK&&holdMs>=MIN_CHARGE_MS;
 return {ok:true,skillId,rank,chargeReady:ready,
  chargeOnlyFinalTripleHit:ready&&skillId==='triple_hit',
  mayChainSingleAfterFinalHit:ready&&skillId==='triple_hit',
  // This is a policy preview, NEVER evidence of authenticated mastery.
  serverMasteryAttested:false,clientCanAuthorizeDamage:false,
  policyVersion:MASTERY_POLICY_VERSION};
}
