import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  buildCompanionSkillBranches,companionSkillBranch,companionSkillCanCast,companionSkillMetrics,
} from '../src/components/game3d/axe/services/AXECompanionSkillBranches.mjs';
const read=name=>readFileSync('src/components/game3d/axe/services/'+name,'utf8');

test('companion tree groups every existing ability into only Damage and Assist',()=>{
  const skills=[
    {skill_id:'companion_bite',category:'combat',skill_name:'Bite',damage:22},
    {skill_id:'companion_heal',category:'support',skill_name:'Heal',heal:40},
    {skill_id:'companion_teleport_dash',category:'mobility',skill_name:'Dash',damage:35},
    {skill_id:'companion_deity_fusion',category:'fusion',skill_name:'Deity Fusion'},
    {skill_id:'future_attack',category:'combat',skill_name:'Future Attack'},
  ];
  const groups=buildCompanionSkillBranches([...skills,skills[0]]);
  assert.deepEqual(groups.map(group=>group.id),['damage','assist']);
  assert.deepEqual(groups[0].skills.map(skill=>skill.skill_id),['companion_bite','future_attack']);
  assert.deepEqual(groups[1].skills.map(skill=>skill.skill_id),
    ['companion_heal','companion_teleport_dash','companion_deity_fusion']);
  assert.equal(companionSkillBranch({category:'mobility',damage:99}),'assist');
});

test('only abilities connected to a real companion cast handler are equip-ready',()=>{
  const ids=['bite','heal','teleport_dash'];
  assert.equal(companionSkillCanCast({legacy_id:'bite'},ids),true);
  assert.equal(companionSkillCanCast({legacy_id:'teleport_dash'},ids),true);
  assert.equal(companionSkillCanCast({skill_id:'companion_deity_fusion'},ids),false);
  assert.equal(companionSkillCanCast({legacy_id:'unimplemented_ability'},ids),false);
  assert.deepEqual(companionSkillMetrics({cooldown:8,heal:40,requiresTarget:false}),[
    ['Cooldown','8s'],['Heal','40'],['Target','Not required'],
  ]);
});

test('companion redesign keeps existing Z/X/V/B loadout and isolated character tree',()=>{
  const hub=read('AXECompanionSkillHub.jsx');
  const clone=read('AXECloneSkillTreeWorkspace.jsx');
  const controller=read('AXESkillBookWorkspace.jsx');
  assert.match(hub,/buildCompanionSkillBranches\(registry\)/);
  assert.match(hub,/companionCombatPaths\(registry\)/);
  assert.match(hub,/COMPANION_ABILITIES/);
  assert.match(hub,/onEquip\?\.\(skill\)/);
  assert.match(hub,/axe-sk-companion-tree/);
  assert.match(hub,/axe-sk-combat-connector/);
  assert.match(clone,/onEquip=\{equipFromModernHub\}/);
  assert.match(clone,/targetEquipSlot=\{targetEquipSlot\}/);
  assert.match(controller,/const ActiveSkillBookView = companion \? AXECloneSkillTreeWorkspace : SkillBookView/);
  for(const source of [hub,clone]){
    assert.doesNotMatch(source,/awardSkillXp\(|grantSpeedBuff\(|equipPassive\(/);
  }
});
