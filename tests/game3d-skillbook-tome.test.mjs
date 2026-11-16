import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  skillBelongsToCategory, skillMarkedLocked, skillLabelType,
  formatSkillStat, skillMatchesBookFilter,
} from '../src/components/game3d/axe/services/AXESkillBookModel.mjs';

const bow={skill_id:'ranged_double_shot',skill_name:'Double Shot',
  skill_type:'ACTIVE_ATTACK',weapon_type:'ranged',hit_count:2,
  description:'Fires two arrows.'};
const sword={skill_id:'sword_heavy_strike',skill_name:'Heavy Strike',
  skill_type:'ACTIVE_ATTACK',weapon_type:'sword',hit_count:1};
const buff={skill_id:'aegis_shield',skill_name:'AEGIS Shield',
  skill_type:'ACTIVE_BUFF',weapon_type:null};
const passive={skill_id:'sprint',skill_name:'Sprint',
  skill_type:'PASSIVE',weapon_type:null};
test('Bow browsing isolates actual ranged registry skills without changing equipment',()=>{
  assert.equal(skillBelongsToCategory(bow,'bow'),true);
  assert.equal(skillBelongsToCategory(sword,'bow'),false);
  assert.equal(skillBelongsToCategory(buff,'bow'),false);
  assert.equal(skillBelongsToCategory(sword,'sword'),true);
  assert.equal(skillBelongsToCategory(passive,'passive'),true);
  assert.equal(skillBelongsToCategory(buff,'universal'),true);
  assert.equal(skillBelongsToCategory(passive,'universal'),false);
});
test('Mastery scaling preserves real percentage multiplier and absolute chance',()=>{
  assert.equal(formatSkillStat('damage_pct',1.30),'130.0%');
  assert.equal(formatSkillStat('damage_pct',2.45),'245.0%');
  assert.equal(formatSkillStat('reflect_chance',0.07),'7.0%');
  assert.equal(formatSkillStat('crit_chance_flat',25),'25');
  assert.equal(formatSkillStat('hit_count',5),'5');
  assert.equal(formatSkillStat('damage_pct',NaN),'—');
});
test('Skill cards never fake unlock state from lack of equip or mastery rank',()=>{
  assert.equal(skillMarkedLocked(bow),false);
  assert.equal(skillMarkedLocked({...bow,masteryLevel:1}),false);
  assert.equal(skillMarkedLocked({...bow,locked:true}),true);
  assert.equal(skillMarkedLocked({...bow,unlock_status:'locked'}),true);
  assert.equal(skillLabelType(bow),'Multi-Hit');
  assert.equal(skillLabelType({...bow,aoe_radius:6}),'AOE');
  assert.equal(skillLabelType(passive),'Passive');
  assert.equal(skillLabelType(buff),'Buff');
});
test('Search and view filters are read-only and reflect actual skill types',()=>{
  assert.equal(skillMatchesBookFilter(bow,{search:'arrows'}),true);
  assert.equal(skillMatchesBookFilter(bow,{search:'nonexistent'}),false);
  assert.equal(skillMatchesBookFilter(bow,{filter:'active'}),true);
  assert.equal(skillMatchesBookFilter(bow,{filter:'passive'}),false);
  assert.equal(skillMatchesBookFilter(buff,{view:'buffs'}),true);
  assert.equal(skillMatchesBookFilter(bow,{view:'buffs'}),false);
  assert.equal(skillMatchesBookFilter(bow,{filter:'locked'}),false);
  assert.equal(skillMatchesBookFilter({...bow,locked:true},{filter:'locked'}),true);
});
test('Skill Book uses existing transactions, source registry, and viewport HUD isolation',()=>{
  const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const container=file('src/components/game3d/axe/services/AXESkillBookWorkspace.jsx');
  const view=file('src/components/game3d/axe/services/AXESkillBookRedesign.jsx');
  const style=file('src/components/game3d/axe/services/AXESkillBookRedesign.css');
  assert.match(container,/equipActive\(/);
  assert.match(container,/equipPassive\(/);
  assert.match(container,/selectSkillPreset\(/);
  assert.match(container,/switchAXEInventoryWeapon\(/);
  assert.match(view,/getAllSkills\(/);
  assert.match(view,/getSkillMastery\(/);
  assert.match(view,/Search skills/);
  assert.match(style,/jade-combat-hud/);
  assert.match(style,/jade-services-navigation/);
  assert.doesNotMatch(view,/setSkillMastery|setPlayerXP|grantReward|spendSkillPoints/);
});
