// These sets stack their two- and four-piece tiers, and each threshold
// scales with the nth-most-ascended equipped member (not one overpowered item).
// Quantities below are *percentage points* where named Pct/crit keys are used.
export const AXE_FARMING_SET_PROFILES=Object.freeze([
  Object.freeze({id:'AXE_Set_RareStriker',name:'Storm Striker',rarity:'rare',
    thresholds:Object.freeze({2:Object.freeze({attackPct:8,critDamage:5}),
      4:Object.freeze({attackPct:7,critDamage:5})}),
    conditionalThresholds:Object.freeze({4:Object.freeze({virtualAbilityPoints:2})})}),
  Object.freeze({id:'AXE_Set_RareGuardian',name:'Iron Guardian',rarity:'rare',
    thresholds:Object.freeze({2:Object.freeze({defensePct:15,critDefense:3}),
      4:Object.freeze({defensePct:10,hpPct:10,evasion:5})}),
    conditionalThresholds:Object.freeze({4:Object.freeze({virtualAbilityPoints:2})})}),
  Object.freeze({id:'AXE_Set_RareRanger',name:'Moon Ranger',rarity:'rare',
    thresholds:Object.freeze({2:Object.freeze({critChance:5}),
      4:Object.freeze({critChance:5})}),
    conditionalThresholds:Object.freeze({2:Object.freeze({rangedDamagePct:8}),
      4:Object.freeze({rangedDamagePct:7,virtualAbilityPoints:2})})}),
  Object.freeze({id:'AXE_Set_EliteStriker',name:'Dusk Conqueror',rarity:'elite',
    thresholds:Object.freeze({2:Object.freeze({attackPct:12,critChance:4,critDamage:5}),
      4:Object.freeze({attackPct:8,critDamage:10,critDefense:4})})}),
  Object.freeze({id:'AXE_Set_EliteGuardian',name:'Eternal Bastion',rarity:'elite',
    thresholds:Object.freeze({2:Object.freeze({defensePct:15,hpPct:10,critDefense:5}),
      4:Object.freeze({defensePct:10,hpPct:10,critDamage:5,evasion:8})})}),
  Object.freeze({id:'AXE_Set_LegendaryAegis',name:'Legacy of the Ascendant',rarity:'legendary',
    thresholds:Object.freeze({2:Object.freeze({attackPct:10,defensePct:10,hpPct:10,chiPct:10}),
      4:Object.freeze({attackPct:10,defensePct:10,hpPct:10,critChance:5,critDamage:15,
        critDefense:8,strength:5,dexterity:5,constitution:5,focus:5})}),
    conditionalThresholds:Object.freeze({4:Object.freeze({virtualAbilityPoints:4,rangedDamagePct:10})})}),
]);
export const AXE_FARMING_SET_BY_GRADE=Object.freeze(Object.fromEntries(
  ['rare','elite','legendary'].map(grade=>[grade,Object.freeze(
    AXE_FARMING_SET_PROFILES.filter(set=>set.rarity===grade))])));
