// Combat / Quest 15.4 — deliberately small server-owned quest whitelist.
// Manually mirrored from AXEQuestFramework for private-beta integration.
// Must be versioned and compared to the client narrative catalog in CI;
// never hydrate this map from a browser-supplied quest object.
const objective=(id,type,count,tier=null)=>Object.freeze({
 id,type,count, ...(tier?{tier}:{})
});
const quest=(id,unlockLevel,requires,objectives)=>Object.freeze({
 id,unlockLevel,requires,repeatable:false,
 objectives:Object.freeze(objectives),
});
export const PRIVATE_QUEST_CATALOG_REVISION_154='axe-private-pve-154-v1';
export const PRIVATE_QUEST_CATALOG_154=Object.freeze({
 axe_q_first_patrol:quest('axe_q_first_patrol',1,null,[
  objective('patrol_kills','kill',3),
 ]),
 axe_q_first_elite:quest('axe_q_first_elite',1,'axe_q_first_patrol',[
  objective('elite_kill','kill_tier',1,'elite'),
 ]),
});
export function getPrivateQuestDefinition154(questId){
 if(typeof questId!=='string'||!Object.hasOwn(PRIVATE_QUEST_CATALOG_154,questId))
  return null;
 return PRIVATE_QUEST_CATALOG_154[questId];
}
