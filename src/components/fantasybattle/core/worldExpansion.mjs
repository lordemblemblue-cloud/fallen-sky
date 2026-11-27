// Shared coordinate bounds and allow-listed encounter routing; saves retain their original schema.
export const WORLD_MAX_X=300;
export const WORLD_END_X=302;
export const EXTRA_REGIONS=Object.freeze([
 Object.freeze({id:'wilds_sec_6',idx:6,name:'7. Moonveil Gardens',minX:220,maxX:260}),
 Object.freeze({id:'wilds_sec_7',idx:7,name:'8. Astral Ruins',minX:260,maxX:302})
]);
export const ARENAS=Object.freeze({
 sapphire_sanctuary:Object.freeze({title:'Sapphire Sanctuary',theme:'sanctuary'}),
 moonveil_court:Object.freeze({title:'Moonveil Court',theme:'garden'}),
 crystal_hollow:Object.freeze({title:'Crystal Hollow',theme:'crystal'}),
 astral_observatory:Object.freeze({title:'Astral Observatory',theme:'astral'})
});
export const EXTRA_ENCOUNTERS=Object.freeze([
 Object.freeze({id:'wilds_moonveil_01',x:234,z:0,category:'Normal',label:'Moonveil Spirit (Normal)',color:'#92e4d4',visualId:'grove',archetype:'spirit',battleMapId:'moonveil_court',triggerRadius:2}),
 Object.freeze({id:'wilds_moonveil_elite',x:251,z:0,category:'Elite',label:'Moonveil Keeper (Elite)',color:'#d6ba84',visualId:'heights',archetype:'sentinel',battleMapId:'moonveil_court',triggerRadius:2.2}),
 Object.freeze({id:'wilds_astral_01',x:273,z:0,category:'Normal',label:'Astral Wraith (Normal)',color:'#b8a6ef',visualId:'wraith',archetype:'spirit',battleMapId:'crystal_hollow',triggerRadius:2}),
 Object.freeze({id:'wilds_astral_elite',x:289,z:0,category:'Elite',label:'Astral Vanguard (Elite)',color:'#d6ba84',visualId:'vanguard',archetype:'sentinel',battleMapId:'astral_observatory',triggerRadius:2.2})
]);
const LEGACY_ARENAS=Object.freeze({wilds_grove_01:'moonveil_court',wilds_pilgrimage_01:'astral_observatory',wilds_pilgrimage_02:'astral_observatory',wilds_waterfall_01:'crystal_hollow',wilds_cave_01:'crystal_hollow',wilds_heights_01:'moonveil_court',wilds_heights_02:'moonveil_court',wilds_heights_elite:'moonveil_court',wilds_sanctuary_guard:'sapphire_sanctuary',wilds_sanctuary_boss:'sapphire_sanctuary'});
export function arenaForEncounter(id){return EXTRA_ENCOUNTERS.find(e=>e.id===id)?.battleMapId||(Object.hasOwn(LEGACY_ARENAS,id)?LEGACY_ARENAS[id]:'sapphire_sanctuary');}
export function extraHeight(x){const cx=Math.max(220,Math.min(WORLD_END_X,x));if(cx<260){const t=(cx-220)/40;return 11.64+1.6*t+Math.sin(t*Math.PI)*.45;}const t=(cx-260)/42;return 13.24+2.1*t+Math.sin(t*Math.PI)*.32;}
export function regionForX(regions,x){return regions.find(r=>x>=r.minX&&x<r.maxX)||regions.at(-1);}
