import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src = name => readFileSync(new URL('../src/components/game3d/axe/services/'+name,import.meta.url),'utf8');
const tree = src('AXECloneSkillTreeWorkspace.jsx');
const page = src('AXESkillPathHorizontal.jsx');
const treeCss = src('AXECloneSkillTree.css');
const pathCss = src('AXESkillPathHorizontal.css');
const controller = src('AXESkillBookWorkspace.jsx');

test('actual clone Skill Book, not the legacy Base44 tome, renders the simplified design',()=>{
  assert.match(controller,/SkillBookView = cloneClassic \? AXESkillBookRedesign : AXECloneSkillTreeWorkspace/);
  assert.match(controller,/ActiveSkillBookView = companion \? AXECloneSkillTreeWorkspace : SkillBookView/);
  assert.match(tree,/data-skillbook-layout="simplified"/);
  assert.match(tree,/Learn, equip and master your combat skills/);
  assert.match(treeCss,/\.axe-clone-skill-root\[data-progression-panel="skills_character"\]\[data-skillbook-layout="simplified"\]/);
  assert.match(treeCss,/border:0;\s*border-radius:0;\s*background:transparent/);
  assert.match(treeCss,/border-bottom:1px solid rgba\(240,202,140,\.65\)/);
});
test('Damage, Range, Defense and the right-hand interactive tree keep their real owners',()=>{
  assert.match(tree,/aria-label="Weapon Category"/);
  assert.match(tree,/displayCategories\.map/);
  assert.match(tree,/AXESkillPathHorizontal category=\{category\} paths=\{paths\}/);
  assert.match(tree,/AXECompanionSkillHub/);
  assert.match(tree,/AXEUniversalSkillHub/);
  assert.match(tree,/aria-label="Equipped skills"/);
  assert.match(tree,/onEquipSkill=\{equipFromTree\}/);
  assert.match(tree,/onActivateWeapon=\{onActivateWeapon\}/);
  assert.match(tree,/onSavePreset\?\.\(\)/);
  assert.match(treeCss,/grid-template-columns:clamp\(116px,12%,176px\) minmax\(0,1fr\)/);
});
test('no repeated Single/Bow header or duplicate copy of first skill consumes the branch area',()=>{
  assert.doesNotMatch(page,/className="axe-hp-feature"/);
  assert.doesNotMatch(page,/className="axe-hp-feature-selected"/);
  assert.doesNotMatch(page,/className="axe-hp-tree-root"/);
  assert.doesNotMatch(page,/className="axe-hp-fork-lines"/);
  assert.match(page,/topCards=path\.active\.map/);
  assert.match(page,/className="axe-hp-tree-track"/);
  assert.match(page,/className="axe-hp-tree-track axe-hp-track-passive"/);
  assert.match(page,/title=\{skill\?\.skill_name\|\|name\} subtitle=\{subtitle\}/);
  assert.doesNotMatch(page,/subtitle=\{sub\}/);
  assert.match(pathCss,/grid-template-columns:minmax\(0,1fr\) clamp\(238px,28%,360px\)/);
  assert.match(pathCss,/\.axe-hp-fork-tree \{\s*grid-template-columns:minmax\(0,1fr\)/);
});
test('level, charge stats, upgrade and weapon activation move to actual Skill Information',()=>{
  assert.match(page,/className="axe-hp-info" aria-label="Selected skill information"/);
  assert.match(page,/className="axe-hp-info-identity"/);
  assert.match(page,/<h2>\{displayTitle\}<\/h2>/);
  assert.match(page,/Lv\. \{level\.level\} \/ \{level\.maxLevel\}/);
  assert.match(page,/className="axe-hp-info-actions"/);
  assert.match(page,/\{points\.available\} skill points available/);
  assert.match(page,/onClick=\{handleUpgrade\}/);
  assert.match(page,/investWeaponSkillPoint\(category,stageIndex,1\)/);
  assert.match(page,/onActivateWeapon\?\.\(category\)/);
  assert.match(page,/<h3><BookOpen size=\{17\}\/> Skill Information<\/h3>/);
  assert.match(page,/<dt>Hits<\/dt>/);
  assert.match(page,/<dt>Cooldown<\/dt>/);
  assert.match(page,/<dt>Stage<\/dt>/);
  assert.match(page,/<dt>Points<\/dt>/);
  assert.match(page,/getSkillMastery\(activeSkill\.skill_id\)/);
});
test('existing Game 3D Services navigation and accessibility are not replaced',()=>{
  assert.match(treeCss,/--axe-service-navigation-actual-bottom/);
  assert.match(treeCss,/\.jade-services-navigation \{/);
  assert.match(tree,/aria-label="Skill owner"/);
  assert.match(tree,/aria-label="Close Skill Book"/);
  assert.match(page,/aria-label="Shared horizontal skill progression/);
  assert.match(page,/onDoubleClick=\{skill\?\(\)=>onEquipSkill\?\.\(skill\.skill_id\):undefined\}/);
  assert.match(page,/onKeyDown=\{event=>\{/);
});
