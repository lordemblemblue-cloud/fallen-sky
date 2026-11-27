import {ACTIONS} from './battleRules.mjs';
// Prototype weapon-specific timelines; no bow events. Each impact consumes one resolved hit.
function meleeSkill(id, times, duration, heavy=false){
  const frames=[{time:0,phase:'anticipation',params:{meleeAngle:-35},bones:{bowArm:{rotation:20},bowForearm:{rotation:45}}}];
  for(const time of times){
    frames.push({time:time-0.1,phase:'anticipation',easing:'easeInOutQuad',params:{meleeAngle:-65},bones:{spine:{rotation:7},bowArm:{rotation:15},bowForearm:{rotation:100}}});
    frames.push({time,phase:'active',expression:'attackShout',params:{meleeAngle:-110},bones:{spine:{rotation:-12},bowArm:{rotation:85},bowForearm:{rotation:15},drawArm:{rotation:45},drawForearm:{rotation:30}}});
    frames.push({time:time+0.08,phase:'recovery',params:{meleeAngle:-45},bones:{spine:{rotation:-3},bowArm:{rotation:35},bowForearm:{rotation:45}}});
  }
  frames.push({time:duration,phase:'recovery',params:{meleeAngle:-35}});
  return {id,name:ACTIONS[id].name,totalDuration:duration,blendInTime:0.12,blendOutTime:0.18,cancelWindowStart:duration,keyframes:frames,events:times.map(time=>({time,type:'spawnEffect',effect:'meleeImpact',heavy}))};
}
export const MELEE_SKILLS=Object.freeze([
  meleeSkill('swordSlash',[0.36],0.82),meleeSkill('shieldBash',[0.48],0.98,true),
  meleeSkill('swordFlurry',[0.36,0.64],1.08),meleeSkill('daggerJab',[0.30],0.68),
  meleeSkill('daggerLunge',[0.44],0.90,true),meleeSkill('daggerFlurry',[0.30,0.54,0.78],1.18)
]);
export const isMeleeSkill=id=>MELEE_SKILLS.some(s=>s.id===id);
// Travel to contact, then retreat. All game damage still comes from resolveRound.
export function approachWeight(t,duration){return Math.max(0,Math.min(1,t/0.19,(duration-t)/0.25));}
