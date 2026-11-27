// Enemy formations and tactics; individual visual rigs retain ranged skill compatibility.
import {EXTRA_ENCOUNTERS} from './worldExpansion.mjs';
import {enemyVisualId} from './enemyVisuals.mjs';
const ARCHETYPES=Object.freeze({wilds_grove_01:'spirit',wilds_waterfall_01:'mist',wilds_cave_01:'spirit',wilds_heights_01:'mist',wilds_pilgrimage_01:'sentinel',wilds_pilgrimage_02:'sentinel',wilds_heights_02:'sentinel',wilds_heights_elite:'sentinel',wilds_sanctuary_guard:'sentinel',wilds_sanctuary_boss:'gatekeeper'});
export function enemyFormation(encounter,partySize=1){
 const n=Math.max(1,Math.min(4,partySize)), elite=encounter?.category==='Elite',boss=encounter?.category==='Boss';
 const extra=EXTRA_ENCOUNTERS.find(e=>e.id===encounter?.id);
 const strategy=boss?'boss':elite?'warden':/scout|mist|waterfall/.test((encounter?.id||'')+' '+(encounter?.label||'').toLowerCase())?'scout':'balanced';
 const scale=boss?1.65:elite?1.25:1;
 const units=[{id:'rival',team:'enemy',name:encounter?.label||'Shade Archer',visualId:extra?.visualId||enemyVisualId(encounter),archetype:extra?.archetype||ARCHETYPES[encounter?.id],maxHp:Math.round(120*scale*(1+.18*(n-1))),atk:Math.round(11*scale),def:Math.round(10*scale),spd:10,tint:boss?0xef91ba:elite?0xe8c78b:0xb9a6e8,strategy}];
 if(n>=3||((boss||elite)&&n>=2))units.push({id:'rivalGuard',team:'enemy',name:'Shade Guard',visualId:'canopy',archetype:'sentinel',maxHp:90,atk:8,def:13,spd:8,tint:0x92a9dc,strategy:'warden'});
 if(boss&&n===4)units.push({id:'rivalScout',team:'enemy',name:'Shade Scout',visualId:'scout',archetype:'mist',maxHp:70,atk:10,def:8,spd:14,tint:0xbab2ff,strategy:'scout'});
 return units;
}
export const tacticFor=(s,archetype)=>({gatekeeper:'Astral Watch above 65% HP; Falling Stars at 65% HP or below; Total Eclipse at 30% HP or below. Intents are shown before actions are selected.',spirit:'Alternates quick shots with Focus-powered Spirit Bolt.',sentinel:'Runic Ward on odd rounds when Focus permits; otherwise attacks.',mist:'Builds Focus for Mist Barrage.'}[archetype]||({boss:'Guards every third round starting on round one, then spends Focus on Radiant Shot.',warden:'Guards on odd rounds and uses Triple Volley when Focus permits.',scout:'Uses Triple Volley when Focus permits; otherwise Quick Shot.',balanced:'Alternates attacks and defensive actions based on Focus and health.'}[s]||'Unknown tactic.'));
