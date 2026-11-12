// Combat 8.0: quest completion EVIDENCE, NOT completed-quest authority.
// Read-only. Existing schema row cannot certify a real world simulation.
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function checkQuestCompletionEvidence({row,ownerId,characterId,questId,instanceId}={}){
 if(!row||!who(ownerId)||!who(characterId)||!key(questId)||!key(instanceId)||
 row.owner_id!==ownerId||row.character_id!==characterId||
 row.quest_id!==questId||row.instance_id!==instanceId||
 !hex(row.journal_digest)||!hex(row.objective_digest)||
 !key(row.quest_policy_version)||
 row.source_authenticity!=='pending_simulation_attestation')
 return {ok:false,code:'invalid_quest_evidence',completedQuestAuthorized:false};
 return {ok:true,ownerId,characterId,questId,instanceId,
  source:'postgres-quest-completion-candidate',
  journalDigest:row.journal_digest,objectiveDigest:row.objective_digest,
  policyVersion:row.quest_policy_version,
  completedQuestAuthorized:false,prerequisiteAuthorized:false,
  xpAllowed:false,itemRewardsAllowed:false};
}
