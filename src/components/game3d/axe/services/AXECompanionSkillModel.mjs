// Presentation-only groupings of real companion combat registry IDs.
// They never create abilities, write loadouts, grant passives, or change XP.
export const COMPANION_COMBAT_PATHS = Object.freeze([
  Object.freeze({ id:'single', label:'Single', ids:['companion_bite','companion_life_drain'] }),
  Object.freeze({ id:'multi', label:'Multi', ids:['companion_soul_triple'] }),
  Object.freeze({ id:'area', label:'Area', ids:['companion_soul_wave'] }),
]);
export function companionCombatPaths(skills=[]) {
  const byId=new Map(skills.filter(skill=>skill?.category==='combat')
    .map(skill=>[skill.skill_id,skill]));
  return COMPANION_COMBAT_PATHS.map(path=>({
    ...path,skills:path.ids.map(id=>byId.get(id)).filter(Boolean),
  }));
}
export function getUnassignedCompanionCombatSkills(skills=[]) {
  const covered=new Set(COMPANION_COMBAT_PATHS.flatMap(path=>path.ids));
  return skills.filter(skill=>skill?.category==='combat'&&!covered.has(skill.skill_id));
}
