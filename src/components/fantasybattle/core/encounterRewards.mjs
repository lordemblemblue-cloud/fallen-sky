// Fixed first-victory income. Preserve legacy category defaults for generic encounters.
const reward=(xp,gold,ore)=>Object.freeze({xp,gold,ore});
export const ENCOUNTER_REWARDS=Object.freeze({
 wilds_grove_01:reward(25,25,1),
 wilds_pilgrimage_01:reward(35,30,1),
 wilds_pilgrimage_02:reward(35,35,1),
 wilds_waterfall_01:reward(40,40,2),
 wilds_cave_01:reward(35,30,2),
 wilds_heights_01:reward(45,40,2),
 wilds_heights_02:reward(45,45,2),
 wilds_heights_elite:reward(60,55,3),
 wilds_sanctuary_guard:reward(75,65,3),
 wilds_sanctuary_boss:reward(100,80,3),
 wilds_moonveil_01:reward(50,50,2),
 wilds_moonveil_elite:reward(75,65,3),
 wilds_astral_01:reward(60,60,3),
 wilds_astral_elite:reward(90,85,3)
});
const NORMAL=reward(25,25,1),ELITE=reward(50,45,2),BOSS=reward(100,80,3),NONE=reward(0,0,0);
export function encounterReward(encounter){
 if(!encounter?.id||encounter.practice)return NONE;
 return Object.hasOwn(ENCOUNTER_REWARDS,encounter.id)?ENCOUNTER_REWARDS[encounter.id]:encounter.category==='Boss'?BOSS:encounter.category==='Elite'?ELITE:NORMAL;
}

// Limited first-victory field supplies, no new item types or repeat farming.
const RECOVERY_SUPPLY=Object.freeze({wilds_pilgrimage_02:2,wilds_waterfall_01:2,wilds_heights_02:2,wilds_sanctuary_guard:3,wilds_sanctuary_boss:2,wilds_astral_01:2});
export function encounterRecoverySupply(encounter){return !encounter?.practice&&Object.hasOwn(RECOVERY_SUPPLY,encounter?.id)?RECOVERY_SUPPLY[encounter.id]:0;}
