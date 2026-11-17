import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {createCloneSkillTreePaths} from '../src/components/game3d/axe/skills/AXECloneSkillTreeModel.mjs';
import {companionCombatPaths,getUnassignedCompanionCombatSkills} from '../src/components/game3d/axe/services/AXECompanionSkillModel.mjs';
import {selectUniversalSkills,selectUniversalKind} from '../src/components/game3d/axe/services/AXEUniversalSkillModel.mjs';
import {WEAPON_SKILL_TIERS,weaponTierUnlocked,blankWeaponSkillPoints} from '../base44/shared/weaponSkillPoints.mjs';

const service=file=>readFileSync('src/components/game3d/axe/services/'+file,'utf8');
const registry=file=>readFileSync('src/components/game3d/skills/'+file,'utf8');

test('Single, Multi and Aerial show registered attacks only above and actual passive stages below',()=>{
  const view=service('AXESkillPathHorizontal.jsx');
  const model=service('AXECloneSkillTreeWorkspace.jsx');
  for(const category of ['damage','range','defense']) {
    const paths=createCloneSkillTreePaths(category);
    assert.deepEqual(paths.map(p=>p.id),['single','three','aerial']);
    assert(paths.every(p=>p.active.length===3&&p.passives.length===2));
  }
  assert.match(view,/topCards=path\.active\.map/);
  assert.doesNotMatch(view,/\{passive:path\.passives\[0\],icon/);
  assert.match(view,/Skills · \{path\.label\}/);
  assert.match(view,/Passives · \{path\.label\} \(automatic\)/);
  assert.match(view,/WEAPON_SKILL_TIERS\.map\(\(cost,i\)=>/);
  assert.match(view,/weaponTierUnlocked\(points\.save,category,i\)/);
  assert.match(view,/investWeaponSkillPoint\(category,stageIndex,1\)/);
  assert.match(model,/onEquipSkill=\{equipFromTree\}/);
  assert.equal(WEAPON_SKILL_TIERS.length,5);
  assert.equal(weaponTierUnlocked(blankWeaponSkillPoints(),'damage',0),true);
  assert.equal(weaponTierUnlocked(blankWeaponSkillPoints(),'damage',1),false);
});

test('Universal is real weapon-independent skills, not the legacy all-weapon list',()=>{
  const samples=[
    {skill_id:'sword',weapon_type:'sword',skill_type:'ACTIVE_ATTACK'},
    {skill_id:'riposte',weapon_type:null,skill_type:'ACTIVE_BUFF'},
    {skill_id:'sprint',weapon_type:null,skill_type:'PASSIVE'},
    {skill_id:'invalid',weapon_type:null,skill_type:'ACTIVE_ATTACK'},
  ];
  assert.deepEqual(selectUniversalSkills(samples).map(s=>s.skill_id),['riposte','sprint']);
  assert.deepEqual(selectUniversalKind(samples,'buffs').map(s=>s.skill_id),['riposte']);
  assert.deepEqual(selectUniversalKind(samples,'passives').map(s=>s.skill_id),['sprint']);
  const hub=service('AXEUniversalSkillHub.jsx');
  assert.match(hub,/selectUniversalSkills\(allSkills\)/);
  assert.match(hub,/onDoubleClick=\{\(\)=>onEquip\?\.\(skill\)\}/);
  assert.match(hub,/onContextMenu=\{event=>\{event\.preventDefault\(\);onEquip\?\.\(skill\);\}\}/);
  assert.match(hub,/getSkillMastery\(selected\.skill_id\)/);
  assert.match(hub,/getSkillMastery/);
});

test('Companion combat groups every supported real attack; no invented speed or passive awards',()=>{
  const registrySource=registry('companionSkillRegistry.jsx');
  const existing=['companion_bite','companion_life_drain','companion_soul_triple',
    'companion_soul_wave','companion_teleport_dash'];
  existing.forEach(id=>assert(registrySource.includes(id),'missing registry id '+id));
  const skills=[
    {skill_id:'companion_bite',category:'combat'},
    {skill_id:'companion_life_drain',category:'combat'},
    {skill_id:'companion_soul_triple',category:'combat'},
    {skill_id:'companion_soul_wave',category:'combat'},
    {skill_id:'companion_teleport_dash',category:'mobility'},
  ];
  const paths=companionCombatPaths(skills);
  assert.deepEqual(paths.map(p=>p.id),['single','multi','area']);
  assert.deepEqual(paths.map(p=>p.skills.length),[2,1,1]);
  assert.equal(getUnassignedCompanionCombatSkills(skills).length,0);
  const future={skill_id:'companion_future',category:'combat'};
  assert.deepEqual(companionCombatPaths([...skills,future]).at(-1).skills,[future]);
  const hub=service('AXECompanionSkillHub.jsx');
  assert.match(hub,/companionCombatPaths\(registry\)/);
  assert.match(hub,/axe-sk-companion-tree/);
  assert.match(hub,/axe-sk-combat-connector/);
  assert.match(hub,/COMBAT_ICONS\[path\.id\]/);
  assert.match(hub,/Teleport Dash is the available repositioning ability/);
  assert.match(hub,/speed-increase buff is not yet implemented/);
  assert.doesNotMatch(hub,/awardSkillXp|equipPassive\(|grantSpeedBuff\(/);
});

test('Universal/Companion/Mounts redesign preserves 95.2 backend authority boundary',()=>{
  const book=service('AXECloneSkillTreeWorkspace.jsx');
  const mount=service('AXEOwnedMountsPanel.jsx');
  const overview=service('AXECompanionOverviewClone.jsx');
  assert.match(book,/modernCollection=companion\|\|category==='universal'/);
  assert.match(book,/<AXECompanionSkillHub/);
  assert.match(book,/<AXEUniversalSkillHub/);
  assert.match(book,/onQuickEquip\?\.\(skill\)/);
  assert.match(book,/onEquipActive\?\.\(index,skill\)/);
  assert.match(book,/onChoosePreset\(\(next\+3\)%3\)/);
  assert.match(mount,/buildOwnedMountRoster\(state\)/);
  assert.match(mount,/axe-mounts-roster/);
  assert.match(mount,/getAXENextMountGrowthBand\(selected\.totalXp\)/);
  assert.match(mount,/onOpenArmory/);
  assert.match(overview,/Search my companions/);
  for(const file of [book,mount,overview]){
    assert.doesNotMatch(file,/server\/game3d\/|grantReward\(|settleReceipt\(|writeLedger\(/);
  }
});
