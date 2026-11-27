// Stable bow IDs. Enhancements are profile unlocks per weapon type, not per inventory copy.
const bow=(name,atk,buy,sell,rarity,requiredLevel)=>Object.freeze({name,kind:'weapon',atk,buy,sell,rarity,requiredLevel});
export const WEAPONS=Object.freeze({
 starterBow:bow('Silver Archer Bow',0,0,0,'Common',1),
 sapphireBow:bow('Sapphire Longbow',4,90,40,'Common',1),
 pilgrimBow:bow('Pilgrim Recurve',6,100,40,'Rare',2),
 moonveilBow:bow('Moonveil Longbow',9,155,62,'Elite',3),
 astralBow:bow('Astral Starbow',12,220,88,'Legendary',4)
});
export const WEAPON_IDS=Object.freeze(Object.keys(WEAPONS));
export const LEGACY_WEAPONS=Object.freeze(['starterBow','sapphireBow']);
export const MAX_ENHANCEMENT=5;
export const enhancementLevel=(p,id)=>Object.hasOwn(WEAPONS,id)&&Object.hasOwn(p?.enhancements||{},id)?p.enhancements[id]:0;
export const weaponEligible=(p,id)=>Object.hasOwn(WEAPONS,id)&&1+Math.floor((p?.xp||0)/100)>=WEAPONS[id].requiredLevel;
export const weaponMetadata=id=>Object.hasOwn(WEAPONS,id)?WEAPONS[id].rarity+' · Level '+WEAPONS[id].requiredLevel:null;
export function validWeapons(p){
 const e=p.enhancements;
 return Boolean(e&&typeof e==='object'&&!Array.isArray(e)&&LEGACY_WEAPONS.every(id=>Object.hasOwn(e,id))&&Object.entries(e).every(([id,n])=>Object.hasOwn(WEAPONS,id)&&Number.isInteger(n)&&n>=0&&n<=MAX_ENHANCEMENT)&&weaponEligible(p,p.equipped)&&(p.inventory?.[p.equipped]||0)>0);
}
export const cleanEnhancements=p=>Object.fromEntries(WEAPON_IDS.filter(id=>Object.hasOwn(p.enhancements,id)).map(id=>[id,p.enhancements[id]]));
