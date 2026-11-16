import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { horizontalSkillWheelOffset } from '../src/components/game3d/axe/services/AXESkillWheel.mjs';
import { WEAPON_SKILL_TIERS } from '../base44/shared/weaponSkillPoints.mjs';

const read = name => readFileSync('src/components/game3d/axe/services/'+name,'utf8');

test('one reverse horizontal wheel drives both skill rows in the requested direction',()=>{
  assert.equal(horizontalSkillWheelOffset(120,0),-120,'wheel down goes left');
  assert.equal(horizontalSkillWheelOffset(-80,0),80,'wheel up goes right');
  assert.equal(horizontalSkillWheelOffset(0,90),-90,'horizontal touchpad delta matches the wheel');
  assert.equal(horizontalSkillWheelOffset(0,-60),60);
  assert.equal(horizontalSkillWheelOffset(0,0),0);
  const tree=read('AXESkillPathHorizontal.jsx');
  const css=read('AXESkillPathHorizontal.css');
  assert.match(tree,/const sharedScrollRef=useRef\(null\)/);
  assert.match(tree,/ref=\{sharedScrollRef\} className="axe-hp-tree-branches"/);
  assert.match(tree,/viewport\.addEventListener\('wheel',onWheel,\{passive:false\}\)/);
  assert.match(tree,/viewport\.scrollLeft\+=offset/);
  assert.match(tree,/viewport\.scrollLeft=Math\.max\(0,\(viewport\.scrollWidth-viewport\.clientWidth\)\/2\)/);
  assert.doesNotMatch(tree,/lastWheelAt/);
  assert.match(css,/\.axe-hp-tree-branches::-webkit-scrollbar/);
  assert.match(css,/\.axe-hp-tree-track \{[\s\S]*?width:max-content/);
  assert.match(css,/scrollbar-width:none/);
});

test('upper row shows registered skills and linked buffs; lower row has five paid strengthening stages',()=>{
  const tree=read('AXESkillPathHorizontal.jsx');
  assert.match(tree,/Skills \/ Buffs & Passives/);
  assert.match(tree,/Progression · Upgrade Strength/);
  assert.match(tree,/const topCards=\[/);
  assert.match(tree,/\{skillId:path\.active\[0\]/);
  assert.match(tree,/\{skillId:path\.active\[1\]/);
  assert.match(tree,/\{skillId:path\.active\[2\]/);
  assert.match(tree,/\{passive:path\.passives\[0\]/);
  assert.match(tree,/\{passive:path\.passives\[1\]/);
  assert.match(tree,/WEAPON_SKILL_TIERS\.map\(\(cost,i\)=>/);
  assert.match(tree,/Math\.round\(100\*allocated\/cost\)/);
  assert.equal(WEAPON_SKILL_TIERS.length,5);
  assert.match(tree,/investWeaponSkillPoint\(category,stageIndex,1\)/);
});

test('right-click and double-click equip only real skill icons into a selected or next free skill slot',()=>{
  const tree=read('AXESkillPathHorizontal.jsx');
  const book=read('AXECloneSkillTreeWorkspace.jsx');
  const controller=read('AXESkillBookWorkspace.jsx');
  assert.match(tree,/onDoubleClick=\{onDoubleClick\} onContextMenu=\{onContextMenu\}/);
  assert.match(tree,/onDoubleClick=\{\(\)=>onEquipSkill\?\.\(path\.active\[0\]\)\}/);
  assert.match(tree,/onContextMenu=\{event=>\{event\.preventDefault\(\);onEquipSkill\?\.\(path\.active\[0\]\);\}\}/);
  assert.match(tree,/onDoubleClick=\{skill\?\(\)=>onEquipSkill\?\.\(skill\.skill_id\):undefined\}/);
  assert.match(tree,/onContextMenu=\{skill\?event=>\{event\.preventDefault\(\);onEquipSkill\?\.\(skill\.skill_id\);\}:undefined\}/);
  assert.match(book,/onEquipSkill=\{equipFromTree\}/);
  assert.match(book,/equipSkill\(skill,targetEquipSlot\)/);
  assert.match(book,/if\(index===null\) onQuickEquip\?\.\(skill\)/);
  assert.match(book,/else onEquipActive\?\.\(index,skill\)/);
  assert.match(book,/targetEquipSlot===i\?'axe-ct-equipped-target'/);
  assert.match(book,/onEquipSkill=\{equipFromCatalog\}/);
  assert.match(book,/onDoubleClick=\{\(\)=>onEquipSkill\?\.\(skill\.skill_id\)\}/);
  assert.match(book,/onContextMenu=\{event=>\{event\.preventDefault\(\);onEquipSkill\?\.\(skill\.skill_id\);\}\}/);
  assert.match(book,/skill\.skill_type===SKILL_TYPE\.PASSIVE\?null:targetEquipSlot/);
  assert.match(book,/onClick=\{\(\)=>clickEquipSlot\(i\)\}/);
  assert.match(controller,/onQuickEquip=\{quickEquip\} onEquipActive=\{placeActive\}/);
  assert.match(controller,/const slot = activeIds\.indexOf\(null\)/);
  assert.doesNotMatch(tree,/equipActive\(|equipPassive\(|awardSkillXp\(/);
});
