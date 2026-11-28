// Enemy formations and tactics; individual visual rigs retain ranged skill compatibility.
import {EXTRA_ENCOUNTERS} from './worldExpansion.mjs';
import {enemyVisualId} from './enemyVisuals.mjs';
const ARCHETYPES=Object.freeze({wilds_grove_01:'spirit',wilds_waterfall_01:'mist',wilds_cave_01:'spirit',wilds_heights_01:'mist',wilds_pilgrimage_01:'sentinel',wilds_pilgrimage_02:'sentinel',wilds_heights_02:'sentinel',wilds_heights_elite:'sentinel',wilds_sanctuary_guard:'sentinel',wilds_sanctuary_boss:'gatekeeper'});
// Fixed regional difficulty, not automatic player-level scaling. Stats are provisional and reviewed through seeded battles.
const tier=(hp,atk,def,spd,level,category='Normal')=>Object.freeze({hp,atk,def,spd,level,category});
export const ENCOUNTER_BALANCE=Object.freeze({
 wilds_grove_01:tier(86,9,9,9,1),
 wilds_pilgrimage_01:tier(125,11,11,10,1),
 wilds_pilgrimage_02:tier(140,12,12,10,1),
 wilds_waterfall_01:tier(160,13,12,12,1),
 wilds_cave_01:tier(170,14,13,12,2),
 wilds_heights_01:tier(180,15,13,13,2),
 wilds_heights_02:tier(200,16,15,12,2),
 wilds_heights_elite:tier(240,18,17,13,2,'Elite'),
 wilds_sanctuary_guard:tier(260,19,18,13,3,'Elite'),
 wilds_sanctuary_boss:tier(250,16,15,14,3,'Boss'),
 wilds_moonveil_01:tier(245,19,18,15,4),
 wilds_moonveil_elite:tier(280,18,18,15,4,'Elite'),
 wilds_astral_01:tier(280,21,20,16,4),
 wilds_astral_elite:tier(300,18,18,16,5,'Elite')
});
export const encounterBalance=id=>Object.hasOwn(ENCOUNTER_BALANCE,id)?ENCOUNTER_BALANCE[id]:null;
export function enemyFormation(encounter,partySize=1){
 const n=Number.isFinite(partySize)?Math.max(1,Math.min(4,Math.floor(partySize))):1, balance=encounter?.practice?null:encounterBalance(encounter?.id),category=balance?.category||encounter?.category,elite=category==='Elite',boss=category==='Boss';
 const extra=EXTRA_ENCOUNTERS.find(e=>e.id===encounter?.id);
 const strategy=boss?'boss':elite?'warden':/scout|mist|waterfall/.test((encounter?.id||'')+' '+(encounter?.label||'').toLowerCase())?'scout':'balanced';
 const scale=boss?1.65:elite?1.25:1;
 const units=[{id:'rival',team:'enemy',name:encounter?.label||'Shade Archer',visualId:extra?.visualId||enemyVisualId(encounter),archetype:extra?.archetype||ARCHETYPES[encounter?.id],maxHp:Math.round((balance?.hp??120*scale)*(1+.18*(n-1))),atk:balance?.atk??Math.round(11*scale),def:balance?.def??Math.round(10*scale),spd:balance?.spd??10,tint:boss?0xef91ba:elite?0xe8c78b:0xb9a6e8,strategy}];
 if(n>=3||((boss||elite)&&n>=2))units.push({id:'rivalGuard',team:'enemy',name:'Shade Guard',visualId:'canopy',archetype:'sentinel',maxHp:balance?Math.round(balance.hp*(boss ? .28 : .42)):90,atk:balance?Math.round(balance.atk*(boss ? .65 : .78)):8,def:balance?Math.round(balance.def*(boss ? .9 : 1.12)):13,spd:8,tint:0x92a9dc,strategy:'warden'});
 if(boss&&n===4)units.push({id:'rivalScout',team:'enemy',name:'Shade Scout',visualId:'scout',archetype:'mist',maxHp:balance?Math.round(balance.hp*.20):70,atk:balance?Math.round(balance.atk*.7):10,def:balance?Math.round(balance.def*.7):8,spd:14,tint:0xbab2ff,strategy:'scout'});
 return units;
}
export const tacticFor=(s,archetype)=>({gatekeeper:'Astral Watch above 65% HP; Falling Stars at 65% HP or below; Total Eclipse at 30% HP or below. Intents are shown before actions are selected.',spirit:'Alternates quick shots with Focus-powered Spirit Bolt.',sentinel:'Runic Ward on odd rounds when Focus permits; otherwise attacks.',mist:'Builds Focus for Mist Barrage.'}[archetype]||({boss:'Guards every third round starting on round one, then spends Focus on Radiant Shot.',warden:'Guards on odd rounds and uses Triple Volley when Focus permits.',scout:'Uses Triple Volley when Focus permits; otherwise Quick Shot.',balanced:'Alternates attacks and defensive actions based on Focus and health.'}[s]||'Unknown tactic.'));
