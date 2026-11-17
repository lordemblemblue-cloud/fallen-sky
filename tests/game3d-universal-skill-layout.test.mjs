import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLONE_SKILL_TREE_CATEGORIES } from '../src/components/game3d/axe/skills/AXECloneSkillTreeModel.mjs';
import { selectUniversalSkills, selectUniversalKind } from '../src/components/game3d/axe/services/AXEUniversalSkillModel.mjs';

const read = path => readFileSync(new URL('../src/components/game3d/axe/services/'+path, import.meta.url), 'utf8');
const hub = read('AXEUniversalSkillHub.jsx');
const clone = read('AXECloneSkillTreeWorkspace.jsx');
const css = read('AXESkillCollections.css');
const bookModel = read('AXESkillBookModel.mjs');

test('character Skillbook has one Universal category and no duplicate Passive page', () => {
  assert.deepEqual(CLONE_SKILL_TREE_CATEGORIES.map(c => c.id),
    ['damage', 'range', 'defense', 'universal']);
  assert.match(clone, /category==='universal'/);
  assert.doesNotMatch(clone, /passiveOnly=/);
  assert.doesNotMatch(clone, /category==='passive'/);
});

test('universal model uses actual weapon-independent buffs and passives', () => {
  const skills = [
    {skill_id:'buff',weapon_type:null,skill_type:'ACTIVE_BUFF'},
    {skill_id:'passive',weapon_type:null,skill_type:'PASSIVE'},
    {skill_id:'attack',weapon_type:'sword',skill_type:'ACTIVE_ATTACK'},
    {skill_id:'weaponbuff',weapon_type:'sword',skill_type:'ACTIVE_BUFF'},
  ];
  assert.deepEqual(selectUniversalSkills(skills).map(x=>x.skill_id), ['buff','passive']);
  assert.deepEqual(selectUniversalKind(skills,'buffs').map(x=>x.skill_id), ['buff']);
  assert.deepEqual(selectUniversalKind(skills,'passives').map(x=>x.skill_id), ['passive']);
  assert.match(bookModel, /skill.skill_type==='ACTIVE_BUFF'\|\|skill.skill_type==='PASSIVE'/);
});

test('Universal section is 50/50 with separate scrolling and no wasted Mastery hero', () => {
  assert.match(hub, /axe-sk-universal-columns/);
  assert.match(hub, /title="Buffs"/);
  assert.match(hub, /title="Passives"/);
  assert.match(css, /\.axe-sk-universal-columns\s*\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.axe-sk-universal-list\s*\{[\s\S]*?overflow-x:hidden;overflow-y:auto/);
  assert.doesNotMatch(hub, /Universal Mastery/);
  assert.doesNotMatch(hub, /axe-sk-hero/);
  assert.doesNotMatch(hub, /passiveOnly/);
});

test('equipping still goes through the canonical Skillbook callback', () => {
  assert.match(hub, /onEquip\?\.\(skill\)/);
  assert.match(hub, /onEquip\?\.\(selected\)/);
  assert.match(hub, /equippedIds=\{activeIds\}/);
  assert.match(hub, /equippedIds=\{passiveIds\}/);
  assert.match(clone, /onEquip=\{equipFromModernHub\}/);
  assert.match(clone, /skill.skill_type===SKILL_TYPE.PASSIVE\?null:targetEquipSlot/);
});

test('small viewports stack Universal sections vertically', () => {
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /grid-template-rows:minmax\(220px,1fr\) minmax\(220px,1fr\)/);
});
