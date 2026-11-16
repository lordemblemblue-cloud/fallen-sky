// Owner progression, 2026-11-15. These are item REQUIREMENT milestones,
// not mutually exclusive level brackets: rare and elite drops intentionally
// coexist from level 110; rare itemLevel 120 unlocks at 120.
export const AXE_FARMING_EQUIPMENT_TIERS=Object.freeze({
  rare:Object.freeze([50,80,120]),
  elite:Object.freeze([110,120,130,140]),
  legendary:Object.freeze([135]),
});
export const AXE_FARMING_STAGE_CAP=4;
export function getAXEFarmingGearLevel(rarity,monsterLevel){
  const tiers=AXE_FARMING_EQUIPMENT_TIERS[String(rarity||'').toLowerCase()];
  const level=Number(monsterLevel);
  if(!tiers||!Number.isFinite(level))return null;
  const match=tiers.filter(min=>level>=min);
  return match.length?match[match.length-1]:null;
}
export function isAXEFarmingRarity(rarity){
  return Object.hasOwn(AXE_FARMING_EQUIPMENT_TIERS,String(rarity||'').toLowerCase());
}
export const AXE_FARMING_ASCENDED_VISUALS=Object.freeze({
  rare:Object.freeze({title:'Rare Elite',primary:'#8d71ee',secondary:'#4dabf0',effect:'violet_cyan_arc'}),
  elite:Object.freeze({title:'Elite Legendary',primary:'#996aff',secondary:'#ffa447',effect:'violet_amber_flame'}),
  legendary:Object.freeze({title:'Legendary Ascended',primary:'#ffa447',secondary:'#ffe8ad',effect:'solar_gold_arc'}),
});
export function getAXEFarmingAscendedIdentity(item,rank){
  const rarity=String(item?.rarity||'').toLowerCase();
  const style=AXE_FARMING_ASCENDED_VISUALS[rarity];
  if(!style||Number(rank)<AXE_FARMING_STAGE_CAP)return null;
  const base=String(item?.name||'Equipment')
    .replace(/^(Rare Elite|Elite Legendary|Legendary Ascended)\s+/i,'')
    .replace(/^(Rare|Elite|Legendary)\s+/i,'');
  return {...style,displayName:style.title+' '+base,rarity,ascensionRank:AXE_FARMING_STAGE_CAP};
}
