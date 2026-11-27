// New enemy-only timelines use the proven bow attachment channels, retimed and
// recolored by existing effect styles. No damage is assigned by animation.
import {ACTIONS} from './battleRules.mjs';
const SPECS=Object.freeze({
 spiritBolt:{base:'quickShot',time:1.15,scale:1.16,style:'radiant'},
 sentinelWard:{base:'guard',time:1.12},
 mistBarrage:{base:'volley',time:.92,scale:.92,style:'silver'},
 celestialLance:{base:'chargedShot',time:1.14,scale:1.55,style:'radiant'},
 starfall:{base:'volley',time:1.32,scale:1.21,style:'radiant'},
 eclipseRay:{base:'chargedShot',time:1.44,scale:1.9,style:'radiant'},
 celestialWard:{base:'guard',time:1.22}
});
export function enemySkillLibrary(baseSkills){
 return Object.entries(SPECS).map(([id,spec])=>{
  const source=baseSkills.find(s=>s.id===spec.base);if(!source)throw Error('Missing enemy base animation '+spec.base);
  const k=spec.time;
  return {...source,id,name:ACTIONS[id].name,hotkey:undefined,totalDuration:source.totalDuration*k,
   blendInTime:(source.blendInTime||0)*k,blendOutTime:source.blendOutTime*k,cancelWindowStart:source.cancelWindowStart*k,
   keyframes:source.keyframes.map(f=>({...f,time:f.time*k})),
   events:source.events.map(e=>({...e,time:e.time*k,...(e.type==='onHitFrame'?{activeFor:e.activeFor*k}:{}),
    ...(e.type==='spawnArrow'?{arrow:{...e.arrow,scale:(e.arrow.scale||1)*spec.scale},trail:{...e.trail,style:spec.style}}:{})}))
  };
 });
}
