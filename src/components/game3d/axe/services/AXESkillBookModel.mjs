// Pure clone Skill Book presentation model. No game state mutation.
export const SKILL_BOOK_CATEGORY_WEAPONS=Object.freeze({
  sword:'sword', bow:'ranged', defense:'guardian',
});
export function skillBelongsToCategory(skill,category,companion=false){
  if(!skill)return false;
  if(companion)return skill.category===category;
  if(category==='passive')return skill.skill_type==='PASSIVE';
  if(category==='universal')return skill.weapon_type==null&&skill.skill_type!=='PASSIVE';
  const weapon=SKILL_BOOK_CATEGORY_WEAPONS[category];
  return !!weapon&&skill.weapon_type===weapon;
}
export function skillMarkedLocked(skill){
  // The current registry does NOT define mastery-point unlocks for most skills.
  // Do not fabricate locks based on initial mastery level or missing hotbar slots.
  return skill?.locked===true||skill?.unlock_status==='locked';
}
export function skillLabelType(skill){
  if(skill?.skill_type==='PASSIVE')return 'Passive';
  if(skill?.skill_type==='ACTIVE_BUFF')return 'Buff';
  if((Number(skill?.aoe_radius)||0)>0)return 'AOE';
  if((Number(skill?.hit_count)||0)>1)return 'Multi-Hit';
  return 'Single-Hit';
}
export function formatSkillStat(key,value){
  if(!Number.isFinite(value))return '—';
  const stat=String(key||'');
  if(stat.includes('pct')||stat.includes('reflect')||
     (stat.includes('chance')&&!stat.includes('flat')))
    return (value*100).toFixed(1)+'%';
  return Number(value).toFixed(Number.isInteger(value)?0:2);
}
export function skillMatchesBookFilter(skill,{view='skills',filter='all',search='',companion=false}={}){
  if(!skill)return false;
  if(!companion&&view==='buffs'&&skill.skill_type!=='ACTIVE_BUFF'&&skill.skill_type!=='PASSIVE')
    return false;
  if(!companion&&filter==='active'&&skill.skill_type!=='ACTIVE_ATTACK')return false;
  if(!companion&&filter==='passive'&&skill.skill_type!=='PASSIVE')return false;
  if(!companion&&filter==='buff'&&skill.skill_type!=='ACTIVE_BUFF')return false;
  if(filter==='locked'&&!skillMarkedLocked(skill))return false;
  const text=String(search).trim().toLowerCase();
  return !text||String(skill.skill_name+' '+(skill.description||'')).toLowerCase().includes(text);
}
