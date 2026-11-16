import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCloneSkillTreePaths } from '../src/components/game3d/axe/skills/AXECloneSkillTreeModel.mjs';
import { WEAPON_SKILL_TIERS, weaponTierUnlocked, blankWeaponSkillPoints } from '../base44/shared/weaponSkillPoints.mjs';

const read = file => readFileSync('src/components/game3d/axe/services/'+file,'utf8');

test('only the selected Single, Multi or Aerial skill path is rendered',()=>{
  const main=read('AXECloneSkillTreeWorkspace.jsx');
  const horizontal=read('AXESkillPathHorizontal.jsx');
  assert.match(main,/useState\('single'\)/);
  assert.match(main,/<AXESkillPathHorizontal category=\{category\} paths=\{paths\}/);
  assert.match(main,/activePathId=\{activePathId\} onChangePath=\{changePath\}/);
  assert.doesNotMatch(main,/paths\.map\(path=><BranchLane/);
  assert.match(horizontal,/const path=paths\.find\(item=>item\.id===activePathId\)\|\|paths\[0\]/);
  assert.match(horizontal,/aria-label="Single, Multi and Aerial paths"/);
  assert.match(horizontal,/viewport\.addEventListener\('wheel',onWheel,\{passive:false\}\)/);
  assert.match(horizontal,/horizontalSkillWheelOffset\(event\.deltaY,event\.deltaX\)/);
  assert.match(horizontal,/event\.key==='ArrowDown'/);
  assert.match(horizontal,/onClick=\{\(\)=>onChangePath\(entry\.id\)\}/);
  assert.equal(createCloneSkillTreePaths('range').length,3);
});

test('reference composition uses horizontal root-to-active and root-to-passive fork',()=>{
  const horizontal=read('AXESkillPathHorizontal.jsx');
  const css=read('AXESkillPathHorizontal.css');
  for(const label of [
    'axe-hp-feature','axe-hp-wheel','axe-hp-fork-lines','axe-hp-tree-root',
    'axe-hp-tree-branches','axe-hp-track-caption','Skills / Buffs & Passives',
    'Progression · Upgrade Strength','axe-hp-info','Skill Information','Passive Gain (Path)',
    'Next Level','Upgrade','Equipped',
  ]) assert(horizontal.includes(label)||css.includes(label),'missing feature: '+label);
  assert.match(css,/\.axe-hp-tree-branches\s*\{/);
  assert.match(css,/scrollbar-width:none/);
  assert.match(css,/\.axe-hp-tree-track \{/);
  assert.match(css,/\.axe-hp-wheel::after/);
  assert.doesNotMatch(css,/background-image:\s*url\(/);
  assert.doesNotMatch(horizontal,/<img\b/);
  for(const title of ['Details','Progression','Enhance','Passive Effect','Path Bonus']){
    assert(!horizontal.includes('>'+title+'</button>'),'extra tabs unexpectedly reintroduced: '+title);
  }
});

test('Upgrade spends the actual weapon points, while mastery XP remains combat-earned',()=>{
  const horizontal=read('AXESkillPathHorizontal.jsx');
  const skillBook=read('AXECloneSkillTreeWorkspace.jsx');
  assert.match(horizontal,/getWeaponSkillPoints/);
  assert.match(horizontal,/investWeaponSkillPoint\(category,stageIndex,1\)/);
  assert.match(horizontal,/subscribeWeaponSkillPoints\(setPoints\)/);
  assert.match(horizontal,/subscribeSkillMastery/);
  assert.match(horizontal,/WEAPON_SKILL_TIERS\.map/);
  assert.match(horizontal,/weaponTierUnlocked\(points\.save,category,i\)/);
  assert.match(horizontal,/disabled=\{!canUpgrade\}/);
  assert.match(horizontal,/onSelect\(\{kind,id,tier,stageIndex,lane:path\.id,category\}\)/);
  assert.match(skillBook,/onEquipActive\?\.\(index,skill\)/);
  assert.match(skillBook,/onSavePreset\?\.\(\)/);
  assert.match(skillBook,/onChoosePreset\(\(next\+3\)%3\)/);
  assert.doesNotMatch(horizontal,/awardSkillXp|award\(|fakeSkillPoints|mockPoints/);
  assert.equal(WEAPON_SKILL_TIERS.length,5);
  const blank=blankWeaponSkillPoints();
  assert.equal(weaponTierUnlocked(blank,'range',0),true);
  assert.equal(weaponTierUnlocked(blank,'range',1),false);
});

test('other Services and companion or universal skill pages stay wired',()=>{
  const main=read('AXECloneSkillTreeWorkspace.jsx');
  const css=read('AXECloneSkillTree.css');
  assert.match(main,/\{!collection && <SkillDetails/);
  assert.match(main,/onChangeView\?\.\(id\)/);
  assert.match(main,/companionCategories/);
  assert.match(main,/onPageChange\?\.\(id\)/);
  assert.match(main,/onRemoveActive\?\.\(i\)/);
  assert.match(css,/\.jade-services-navigation/);
  assert.match(css,/data-service-extent="viewport-top"/);
});
