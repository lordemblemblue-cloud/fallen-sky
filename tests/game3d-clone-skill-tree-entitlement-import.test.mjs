import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync('src/components/game3d/'+path,'utf8');

test('horizontal skill tree imports its entitlement helper from the actual store',()=>{
  const tree=read('axe/services/AXESkillPathHorizontal.jsx');
  const store=read('skills/weaponSkillPointsStore.jsx');
  const imported=tree.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/\.\.\/skills\/weaponSkillPointsStore['"]/);
  assert.ok(imported,'Weapon skill point store import missing');
  assert.match(imported[1],/\bisWeaponSkillUnlocked\b/);
  assert.match(store,/export function isWeaponSkillUnlocked\(skillId\)/);
  assert.match(tree,/const locked=skill\?!isWeaponSkillUnlocked\(skill\.skill_id\)/);
});

test('selected path UI, real upgrade and recovery stay in place after crash fix',()=>{
  const tree=read('axe/services/AXESkillPathHorizontal.jsx');
  const wrapper=read('axe/services/AXECloneSkillTreeWorkspace.jsx');
  assert.match(tree,/Single, Multi and Aerial paths/);
  assert.match(tree,/investWeaponSkillPoint\(category,stageIndex,1\)/);
  assert.match(wrapper,/<AXESkillTreeErrorBoundary/);
  assert.match(wrapper,/<AXESkillPathHorizontal/);
  assert.doesNotMatch(tree,/awardSkillXp\(/);
});
