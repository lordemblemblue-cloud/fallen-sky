// Automatic leader passives. No spendable points or additional mutable save state.
export const PASSIVES=Object.freeze({
 steadyAim:Object.freeze({name:'Steady Aim',level:2,stat:'atk',amount:1,summary:'Permanently grants +1 Attack.'}),
 ironResolve:Object.freeze({name:'Iron Resolve',level:3,stat:'def',amount:1,summary:'Permanently grants +1 Defense.'}),
 windstep:Object.freeze({name:'Windstep',level:4,stat:'spd',amount:1,summary:'Permanently grants +1 Speed.'})
});
export const PASSIVE_IDS=Object.freeze(Object.keys(PASSIVES));
export const learnedPassives=level=>PASSIVE_IDS.filter(id=>Number.isFinite(level)&&level>=PASSIVES[id].level);
export function applyPassives(stats,level){
 const next={...stats};
 for(const id of learnedPassives(level)){const skill=PASSIVES[id];next[skill.stat]+=skill.amount;}
 return next;
}
