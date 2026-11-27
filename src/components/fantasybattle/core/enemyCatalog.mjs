// Enemy formations and tactics; individual visual rigs retain ranged skill compatibility.
import {enemyVisualId} from './enemyVisuals.mjs';
export function enemyFormation(encounter,partySize=1){
 const n=Math.max(1,Math.min(4,partySize)), elite=encounter?.category==='Elite',boss=encounter?.category==='Boss';
 const strategy=boss?'boss':elite?'warden':/scout|mist|waterfall/.test((encounter?.id||'')+' '+(encounter?.label||'').toLowerCase())?'scout':'balanced';
 const scale=boss?1.65:elite?1.25:1;
 const units=[{id:'rival',team:'enemy',name:encounter?.label||'Shade Archer',visualId:enemyVisualId(encounter),maxHp:Math.round(120*scale*(1+.18*(n-1))),atk:Math.round(11*scale),def:Math.round(10*scale),spd:10,tint:boss?0xef91ba:elite?0xe8c78b:0xb9a6e8,strategy}];
 if(n>=3||((boss||elite)&&n>=2))units.push({id:'rivalGuard',team:'enemy',name:'Shade Guard',visualId:'canopy',maxHp:90,atk:8,def:13,spd:8,tint:0x92a9dc,strategy:'warden'});
 if(boss&&n===4)units.push({id:'rivalScout',team:'enemy',name:'Shade Scout',visualId:'scout',maxHp:70,atk:10,def:8,spd:14,tint:0xbab2ff,strategy:'scout'});
 return units;
}
export const tacticFor=s=>({boss:'Guards every third round starting on round one, then spends Focus on Radiant Shot.',warden:'Guards on odd rounds and uses Triple Volley when Focus permits.',scout:'Uses Triple Volley when Focus permits; otherwise Quick Shot.',balanced:'Alternates attacks and defensive actions based on Focus and health.'}[s]||'Unknown tactic.');
