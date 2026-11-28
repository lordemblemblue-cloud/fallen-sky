// Existing exploration markers only. No new terrain, coordinates or reward authority from artwork.
const reward=(id,count)=>Object.freeze({id,count});
const cache=(label,region,bonus,ore=2)=>Object.freeze({label,region,loot:Object.freeze([reward('recoveryTonic',1),reward('sapphireOre',ore),reward(bonus,1)])});
export const TREASURES=Object.freeze({
 disc_pilgrimage:cache('Hidden Reliquary (Upper Walkway)','wilds_sec_1','groveVest'),
 disc_cave:cache('Submerged Crystal Shrine (Side Chamber)','wilds_sec_3','wardMantle'),
 disc_overlook:cache('Sky Blossom Overlook (Upper Terrace)','wilds_sec_4','sapphirePlate'),
 disc_moonveil:cache('Moonveil Reliquary (Garden Alcove)','wilds_sec_6','astralRing',3),
 disc_astral:cache('Astral Archive (Ruined Alcove)','wilds_sec_7','astralPendant',3)
});
export const TREASURE_IDS=Object.freeze(Object.keys(TREASURES));
export const treasureFor=id=>Object.hasOwn(TREASURES,id)?TREASURES[id]:null;
export const treasureProgress=p=>({found:TREASURE_IDS.filter(id=>p?.world?.discoveries?.includes(id)).length,collected:TREASURE_IDS.filter(id=>p?.rewardedDiscoveries?.includes(id)).length,total:TREASURE_IDS.length});
