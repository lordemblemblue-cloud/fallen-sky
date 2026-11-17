// Companion Skillbook: two presentation-only lanes built from live registered skills.
export const COMPANION_SKILL_BRANCHES=Object.freeze([
  Object.freeze({id:'damage',label:'Damage',description:'Target strikes, multi-hit attacks and frontal damage.'}),
  Object.freeze({id:'assist',label:'Assist',description:'Healing, movement and future utility abilities.'}),
]);
const DISPLAY_ORDER=Object.freeze({
  companion_bite:0,companion_life_drain:1,companion_soul_triple:2,
  companion_soul_wave:3,companion_heal:0,companion_teleport_dash:1,
  companion_deity_fusion:2,
});
const ASSIST_CATEGORIES=new Set(['support','mobility','fusion']);
export function companionSkillBranch(skill) {
  if(ASSIST_CATEGORIES.has(skill?.category))return 'assist';
  if(skill?.category==='combat')return 'damage';
  return Number(skill?.damage)>0?'damage':'assist';
}
export function buildCompanionSkillBranches(skills=[]) {
  const unique=new Map();
  for(const skill of skills)if(skill&&typeof skill.skill_id==='string'&&!unique.has(skill.skill_id))
    unique.set(skill.skill_id,skill);
  return COMPANION_SKILL_BRANCHES.map(branch=>({
    ...branch,
    skills:[...unique.values()].filter(skill=>companionSkillBranch(skill)===branch.id)
      .sort((a,b)=>(DISPLAY_ORDER[a.skill_id]??100)-(DISPLAY_ORDER[b.skill_id]??100)
        ||String(a.skill_name||a.skill_id).localeCompare(String(b.skill_name||b.skill_id))),
  }));
}
// Do not expose skills as equippable until an actual runtime handler exists.
export function companionSkillCanCast(skill,runtimeAbilityIds=[]) {
  return Boolean(skill?.legacy_id&&runtimeAbilityIds.includes(skill.legacy_id));
}
export function companionSkillMetrics(skill) {
  if(!skill)return [];
  const metrics=[['Cooldown',Number(skill.cooldown||0)+'s']];
  if(Number.isFinite(skill.damage))metrics.push(['Damage',String(skill.damage)]);
  if(Number.isFinite(skill.heal))metrics.push(['Heal',String(skill.heal)]);
  if(Number.isFinite(skill.manaHeal))metrics.push(['MP restoration',String(skill.manaHeal)]);
  if(Number.isFinite(skill.hit_count))metrics.push(['Hits',String(skill.hit_count)]);
  if(Number.isFinite(skill.aoe_radius))metrics.push(['Radius',String(skill.aoe_radius)+'m']);
  if(Number.isFinite(skill.duration))metrics.push(['Duration',String(skill.duration)+'s']);
  metrics.push(['Target',skill.requiresTarget?'Required':'Not required']);
  return metrics;
}
