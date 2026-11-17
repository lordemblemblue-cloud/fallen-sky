// Real Game 3D clone combat Skill Tree layout. All active node IDs are
// registered skills; the branch nicknames are presentation labels only.
// The weapon skill point store, not this model, determines unlock eligibility.
export const CLONE_SKILL_TREE_CATEGORIES = Object.freeze([
  { id:'damage', label:'Damage', icon:'single' },
  { id:'range', label:'Range', icon:'ranged' },
  { id:'defense', label:'Defense', icon:'shield' },
  { id:'universal', label:'Universal', icon:'burst' },
]);

const roles = Object.freeze({ damage:'offensive', range:'ranged', defense:'defensive' });
const art = (role,index) => 'axe_'+role+'_skill_'+index;
const aerial = role => 'axe_'+role+'_a_skill';

const lanes = Object.freeze([
  {
    id:'single', label:'Single Hit', icon:'single',
    titles:['Single Hit','Heavy Slash','Execution Cut'],
    passiveTitles:['Precision I','Precision II'],
    passiveIcon:'precision',
    roleIds:role=>[
      role==='offensive'?'sword_heavy_strike':
        role==='defensive'?'guardian_crushing_blow':art(role,2),
      art(role,4), art(role,6),
    ],
  },
  {
    id:'three', label:'Three-Hit', icon:'triple',
    titles:['Three-Hit','Rising Flurry','Storm Flurry'],
    passiveTitles:['Combo Speed I','Combo Speed II'],
    passiveIcon:'momentum',
    roleIds:role=>[
      role==='offensive'?'sword_triple_slash':
        role==='defensive'?'guardian_twin_fang':'ranged_double_shot',
      art(role,5), art(role,10),
    ],
  },
  {
    id:'aerial', label:'Aerial Effect', icon:'aerial',
    titles:['Aerial Effect','Sky Burst','Heaven Crash'],
    passiveTitles:['Lift Force I','Lift Force II'],
    passiveIcon:'aerial-passive',
    roleIds:role=>[art(role,3),aerial(role),art(role,8)],
  },
]);
export function createCloneSkillTreePaths(category='damage') {
  const role=roles[category]||'offensive';
  return lanes.map(lane=>({
    id:lane.id,
    label:lane.id==='three'&&category!=='damage'?'Multi-Hit':lane.label,
    icon:lane.icon,
    titles:lane.id==='three'
      ? [category==='damage' ? 'Triple Slash' : 'Multi-Hit', ...lane.titles.slice(1)]
      : lane.titles,
    active:lane.roleIds(role),
    passives:lane.passiveTitles.map((label,i)=>({
      id:role+'_'+lane.id+'_linked_passive_'+(i+1),
      label,
      icon:lane.passiveIcon,
      tier:i+2,
      // Read-only visual marker for the game's existing paid-tier passive.
      // The shared weapon point store already applies the real charged bonus.
      bonusPct:0.01,
    })),
  }));
}
export function resolveCloneSkillTreeTier(path,tier,isUnlocked) {
  const skillId=path?.active?.[tier-1];
  if(!skillId)return {unlocked:false,requiredSkillId:null,requiredLevel:null};
  return {
    unlocked: typeof isUnlocked==='function' ? !!isUnlocked(skillId) : false,
    requiredSkillId:tier>1?path.active[tier-2]:null,
    requiredLevel:null,
  };
}
export function cloneSkillTreeIsAvailable(skillId,isUnlocked) {
  return typeof isUnlocked==='function' ? !!isUnlocked(skillId) : false;
}
