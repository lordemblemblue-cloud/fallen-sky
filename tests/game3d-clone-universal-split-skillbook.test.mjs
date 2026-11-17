import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectUniversalSkills,selectUniversalKind} from '../src/components/game3d/axe/services/AXEUniversalSkillModel.mjs';
const src=name=>readFileSync(new URL('../src/components/game3d/axe/services/'+name,import.meta.url),'utf8');
const universal=src('AXEUniversalSkillHub.jsx');
const css=src('AXESkillCollections.css');
const companionCss=src('AXECompanionSkillTree.css');
const tree=src('AXECloneSkillTreeWorkspace.jsx');
const service=src('AXESkillBookWorkspace.jsx');

test('Universal has one combined Buffs+Passives library at 50% and a persistent information pane at 50%',()=>{
  assert.match(universal,/data-universal-layout="split-detail"/);
  assert.match(universal,/className="axe-sk-universal-library"/);
  assert.match(universal,/className="axe-sk-universal-workspace"/);
  assert.match(universal,/className="axe-sk-universal-columns"/);
  assert.match(universal,/UniversalSkillsColumn title="Buffs" kind="buffs"/);
  assert.match(universal,/UniversalSkillsColumn title="Passives" kind="passives"/);
  assert.match(universal,/<aside className="axe-sk-universal-detail" aria-label="Selected universal skill details">/);
  assert.match(universal,/Skill Information/);
  assert.match(universal,/Choose a skill/);
  assert.doesNotMatch(universal,/detailOpen|setDetailOpen/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/position:static;inset:auto;width:auto;max-width:none;max-height:none/);
  assert.match(css,/border:0;border-radius:0;\s*background:rgba\(10,25,40,\.17\)/);
});

test('Universal retains actual registered search, selection, mastery and equipping',()=>{
  assert.match(universal,/selectUniversalSkills\(allSkills\)/);
  assert.match(universal,/getSkillMastery\(selected\.skill_id\)/);
  assert.match(universal,/subscribeSkillMastery\(/);
  assert.match(universal,/onSelected\?\.\(skill\)/);
  assert.match(universal,/onDoubleClick=\{\(\)=>onEquip\?\.\(skill\)\}/);
  assert.match(universal,/onContextMenu=\{event=>\{event\.preventDefault\(\);onEquip\?\.\(skill\);\}\}/);
  assert.match(universal,/onClick=\{\(\)=>onEquip\?\.\(selected\)\}/);
  assert.match(universal,/isWeaponSkillUnlocked\(selected\.skill_id\)/);
  assert.match(universal,/activeIds\.includes\(selected\.skill_id\)\|\|passiveIds\.includes\(selected\.skill_id\)/);
  assert.match(universal,/value=\{query\} onChange=\{event=>setQuery\(event\.target\.value\)\}/);
  assert.match(tree,/onEquip=\{equipFromModernHub\}/);
  assert.match(tree,/AXEUniversalSkillHub/);
  const catalog=[
    {skill_id:'buff',weapon_type:null,skill_type:'ACTIVE_BUFF'},
    {skill_id:'passive',weapon_type:null,skill_type:'PASSIVE'},
    {skill_id:'sword',weapon_type:'sword',skill_type:'ACTIVE_ATTACK'},
  ];
  assert.deepEqual(selectUniversalSkills(catalog).map(x=>x.skill_id),['buff','passive']);
  assert.deepEqual(selectUniversalKind(catalog,'buffs').map(x=>x.skill_id),['buff']);
  assert.deepEqual(selectUniversalKind(catalog,'passives').map(x=>x.skill_id),['passive']);
});

test('Universal matches gold-glass treatment; no floating blue details box remains',()=>{
  assert.match(css,/background:linear-gradient\(135deg,rgba\(18,37,54,\.17\),rgba\(30,46,61,\.12\)\)/);
  assert.match(css,/border-right:1px solid rgba\(229,186,126,\.35\)/);
  assert.match(css,/Skill Information/);
  assert.match(css,/--universal-gold:rgba\(242,210,147,\.76\)/);
  assert.match(css,/--universal-ivory:#f5e9d7/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css,/right:9px;bottom:8px/);
  assert.doesNotMatch(css,/background:linear-gradient\(145deg,#183248f5,#0b1e31f5\)/);
});

test('Companion gains only a faint tinted surface behind its skill tree, preserving its current UI',()=>{
  assert.match(companionCss,/Companion skill tree soft tint/);
  assert.match(companionCss,/\.axe-comp-skillbook\[data-companion-skill-layout="compact-gold"\] \.axe-comp-tree-map\{\s*background:linear-gradient\(135deg,rgba\(18,36,52,\.29\),rgba\(27,43,57,\.19\)\)/);
  assert.match(companionCss,/\.axe-comp-skillbook\[data-companion-skill-layout="compact-gold"\] \.axe-sk-companion-tree\{\s*border-radius:9px/);
  assert.match(companionCss,/rgba\(11,27,41,\.22\),rgba\(24,42,57,\.13\)/);
  assert.match(companionCss,/\.axe-comp-tree-info-title h2/);
  assert.match(tree,/AXECompanionSkillHub/);
});

test('No new game logic: server authority, Companion Z/X/V/B, and Character categories are unchanged',()=>{
  assert.match(tree,/onEquip=\{equipFromModernHub\}/);
  assert.match(tree,/aria-label="Weapon Category"/);
  assert.match(tree,/AXESkillPathHorizontal category=\{category\}/);
  assert.match(tree,/COMPANION_SLOT_KEYS\[i\]/);
  assert.match(tree,/onSavePreset\?\.\(\)/);
  assert.doesNotMatch(universal,/grantSkillPoints|awardSkillXp|settleReceipt|writeLedger/);
  assert.doesNotMatch(companionCss,/position:fixed/);
});
