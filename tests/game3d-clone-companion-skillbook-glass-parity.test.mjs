import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../src/components/game3d/axe/services/'+name, import.meta.url), 'utf8');
const tree = read('AXECloneSkillTreeWorkspace.jsx');
const outer = read('AXECloneSkillTree.css');
const companion = read('AXECompanionSkillTree.css');
const hub = read('AXECompanionSkillHub.jsx');
const controller = read('AXESkillBookWorkspace.jsx');

test('Character and Companion share the same simplified Skillbook glass shell', () => {
  assert.match(tree, /data-progression-panel=\{currentPage\}/);
  assert.match(tree, /data-skillbook-layout="simplified"/);
  assert.match(tree, /className=\{'axe-ct-main'/);
  assert.match(outer, /data-progression-panel="skills_character"/);
  assert.match(outer, /data-progression-panel="skills_companion"/);
  assert.match(outer, /\.axe-ct-main--collection\{\s*border:0;border-radius:0;background:rgba\(10,25,40,\.17\)/);
  assert.match(companion, /--comp-skill-surface:rgba\(10,25,40,\.17\)/);
  assert.match(companion, /--comp-skill-ivory:#f5e9d7/);
  assert.match(companion, /--comp-skill-gold:rgba\(242,210,147,\.76\)/);
});

test('Companion skill tree overrides the old opaque navy palette with faint Character glass', () => {
  const final = companion.slice(companion.indexOf('/* Companion Skillbook: Character-matched mineral glass palette'));
  assert.ok(final.length > 1000);
  assert.match(final, /\.axe-comp-tree-map \{\s*background:var\(--comp-skill-panel\);/);
  assert.match(final, /--comp-skill-panel:rgba\(22,38,52,\.17\)/);
  assert.match(final, /backdrop-filter:blur\(7px\)/);
  assert.match(final, /\.axe-sk-companion-tree \{\s*background:transparent/);
  assert.match(final, /\.axe-comp-tree-node \{\s*background:var\(--comp-skill-node\)/);
  assert.match(final, /--comp-skill-node:rgba\(28,45,63,\.14\)/);
  assert.match(final, /\.axe-comp-tree-inspector \{\s*background:var\(--comp-skill-surface\);/);
  assert.match(final, /rgba\(214,171,99,\.16\)/);
  assert.doesNotMatch(final, /#09223aee|#102c42cf|#1b354b|#102538/);
});

test('Companion Z/X/V/B equipped bar uses Character exact shared slot palette and sizing', () => {
  const final = outer.slice(outer.indexOf('/* Companion lower loadout: share Character'));
  assert.ok(final.length > 600);
  const baseSlots = outer.match(/\.axe-ct-equipped-slots>button\s*\{[^}]*\}/)?.[0] ?? '';
  const companionSlots = final.match(/\.axe-ct-equipped-slots>button\s*\{[^}]*\}/)?.[0] ?? '';
  for (const token of ['border:1px solid #a8a2a0','border-radius:8px',
      'background:linear-gradient(140deg,#233c52,#122234)','color:#edd7ae','min-height:57px']) {
    assert.ok(baseSlots.includes(token), 'Character base missing: '+token);
    assert.ok(companionSlots.includes(token), 'Companion parity missing: '+token);
  }
  assert.match(final, /\.axe-ct-equipped-slots \{\s*background:transparent;/);
  assert.match(final, /\.axe-ct-equipped-heading>button \{\s*border:1px solid #ba8e56/);
  assert.match(final, /\.axe-ct-equipped-heading>\.axe-ct-save-preset \{/);
  assert.match(final, /\.axe-ct-equipped-slots>button\.axe-ct-equipped-target/);
  assert.match(final, /@media\(max-width:620px\)/);
});

test('Companion skill registry and all four real hotbar interactions are unchanged', () => {
  assert.match(controller, /ActiveSkillBookView = companion \? AXECloneSkillTreeWorkspace : SkillBookView/);
  assert.match(hub, /buildCompanionSkillBranches\(registry\)/);
  assert.match(hub, /companionSkillCanCast\(skill,RUNTIME_IDS\)/);
  assert.match(tree, /<AXECompanionSkillHub activeIds=\{activeIds\} targetEquipSlot=\{targetEquipSlot\}/);
  assert.match(tree, /activeIds\.map\(\(id,i\)=>/);
  assert.match(tree, /COMPANION_SLOT_KEYS\[i\]/);
  assert.match(tree, /onSavePreset\?\.\(\)/);
  assert.match(tree, /onRemoveActive\?\.\(i\)/);
  assert.match(tree, /onClick=\{\(\)=>clickEquipSlot\(i\)\}/);
  assert.doesNotMatch(companion, /onQuickEquip|equipCompanionSkill|awardSkillXp/);
});
