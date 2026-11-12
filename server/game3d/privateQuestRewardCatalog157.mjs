// Game 3D Quest 15.7: server-controlled reward PLAN, not a grant.
// These quantities mirror the first two authored AXE quests; settlement is
// intentionally absent until canonical XP/points/reputation authorities exist.
export const PRIVATE_QUEST_REWARD_REVISION_157='axe-private-pve-rewards-157-v1';
const reward=(xp,points,contribution,reputation)=>Object.freeze({
 xp,points,contribution,reputation,
 // No item SKU or wallet ledger is implemented by this contract.
 items:Object.freeze([]),currency:0,
});
export const PRIVATE_QUEST_REWARDS_157=Object.freeze({
 axe_q_first_patrol:reward(80,1,10,5),
 axe_q_first_elite:reward(140,2,20,10),
});
export function getPrivateQuestReward157(questId){
 return typeof questId==='string'&&Object.hasOwn(PRIVATE_QUEST_REWARDS_157,questId)
  ?PRIVATE_QUEST_REWARDS_157[questId]:null;
}
