import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../src/components/game3d/axe/services/'+name,import.meta.url),'utf8');
const jsx = read('AXESkillBookRedesign.jsx');
const css = read('AXESkillBookRedesign.css');
const nav = read('AXEServicesNavigation.jsx');

test('opening Skill Book keeps the actual World Services navigation accessible above the book',()=>{
  assert.match(css,/\.game3d-view:has\(\.axe-service-workspace--skills\) \.jade-hud \{\s*z-index:170 !important;/);
  assert.match(css,/\.jade-services-navigation \{\s*visibility:visible !important;\s*pointer-events:auto !important;/);
  assert.match(css,/\.jade-services-navigation button \{\s*pointer-events:auto !important;/);
  assert.match(css,/--axe-service-navigation-actual-bottom/);
  assert.match(nav,/onClick: \(\) => onSelectGroup\?\.\(group\.id\)/);
});
test('the combat HUD and resource bars stay behind the open Skill Book, rather than overlapping it',()=>{
  assert.match(css,/\.jade-combat-hud,\s*\.game3d-view:has\(\.axe-service-workspace--skills\) \.jade-status-bars/);
  assert.match(css,/\.jade-hud > :not\(\.jade-services-navigation\)/);
});
test('Skill Book layout puts a compact weapon sidebar, wide list and smaller inspector under Services',()=>{
  assert.match(css,/grid-template-columns:minmax\(144px,17%\) minmax\(330px,54%\) minmax\(255px,1fr\)/);
  assert.match(css,/\.axe-tome-rail \{\s*border:0;/);
  assert.match(jsx,/name:'Damage'/);
  assert.match(jsx,/name:'Range'/);
  assert.match(jsx,/name:'Defense'/);
  assert.match(jsx,/className="axe-tome-skill-list"/);
  assert.doesNotMatch(jsx,/className="axe-tome-toolbar"/);
});
test('Character and Companion live inside Weapon Category; search and filters are inside skill list',()=>{
  assert.match(jsx,/aria-label="Skill Book character or companion"/);
  assert.match(jsx,/<option value="skills_character">Character<\/option>/);
  assert.match(jsx,/<option value="skills_companion">Companion<\/option>/);
  assert.match(jsx,/className="axe-tome-tools"/);
  assert.match(jsx,/aria-label="Filter skills"/);
  assert.match(jsx,/placeholder="Search skills…"/);
  assert.match(jsx,/<option value="advance">Advance<\/option>/);
});
test('equipped hotbar pages without modifying the original slot indices or weapon activation',()=>{
  assert.match(jsx,/const visibleSlotCount=5/);
  assert.match(jsx,/aria-label="Previous equipped skills"/);
  assert.match(jsx,/aria-label="Next equipped skills"/);
  assert.match(jsx,/const i=currentSlotPage\*visibleSlotCount\+j/);
  assert.match(jsx,/onEquipActive\(i,current\)/);
  assert.match(jsx,/onActivateWeapon\(equipMode\)/);
});
test('skill-point progression still works and updates the lock filter after investment',()=>{
  assert.match(jsx,/AXEWeaponSkillPointsPanel/);
  assert.match(jsx,/subscribeWeaponSkillPoints/);
  assert.match(jsx,/!isWeaponSkillUnlocked\(skill\.skill_id\)/);
  assert.match(jsx,/filter!=='locked'/);
  assert.match(jsx,/getAllSkills\(\)/);
  assert.match(jsx,/getSkillMastery\(/);
});
