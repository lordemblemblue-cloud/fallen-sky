// Weapon-independent abilities registered by Game 3D. No new gameplay values.
export function selectUniversalSkills(skills=[]) {
  return skills.filter(skill=>skill?.weapon_type===null
    &&(skill.skill_type==='ACTIVE_BUFF'||skill.skill_type==='PASSIVE'));
}
export function selectUniversalKind(skills=[],kind='all') {
  return selectUniversalSkills(skills).filter(skill=>
    kind==='all'
    ||(kind==='buffs'&&skill.skill_type==='ACTIVE_BUFF')
    ||(kind==='passives'&&skill.skill_type==='PASSIVE'));
}
