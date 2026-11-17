import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  buildCompanionSkillBranches,companionSkillCanCast,companionSkillMetrics,
} from '../src/components/game3d/axe/services/AXECompanionSkillBranches.mjs';

const read=name=>readFileSync(new URL(
  '../src/components/game3d/axe/services/'+name,import.meta.url),'utf8');
const tree=read('AXECloneSkillTreeWorkspace.jsx');
const treeCss=read('AXECloneSkillTree.css');
const hub=read('AXECompanionSkillHub.jsx');
const css=read('AXECompanionSkillTree.css');
const controller=read('AXESkillBookWorkspace.jsx');

test('both owners share the compact gold Skill Book shell, without replacing the Character tree',()=>{
  assert.match(tree,/data-skillbook-layout="simplified"/);
  assert.match(tree,/Learn, equip and master your combat skills/);
  assert.match(treeCss,/\.axe-clone-skill-root\[data-progression-panel="skills_character"\]\[data-skillbook-layout="simplified"\]/);
  assert.match(treeCss,/\.axe-clone-skill-root\[data-progression-panel="skills_companion"\]\[data-skillbook-layout="simplified"\]/);
  assert.match(treeCss,/\.axe-ct-content--companion\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(treeCss,/\.axe-ct-content--collection \.axe-ct-main--collection\{\s*border:0/);
  assert.match(treeCss,/border-bottom:1px solid rgba\(240,202,140,\.65\)/);
  assert.match(tree,/AXESkillPathHorizontal category=\{category\}/);
  assert.match(tree,/onActivateWeapon=\{onActivateWeapon\}/);
  assert.match(controller,/ActiveSkillBookView = companion \? AXECloneSkillTreeWorkspace : SkillBookView/);
});

test('Companion keeps its real Assist and Damage branches in a spacious unboxed tree',()=>{
  assert.match(hub,/data-companion-skill-layout="compact-gold"/);
  assert.match(hub,/COMPANION_SKILL_BRANCHES\.map/);
  assert.match(hub,/buildCompanionSkillBranches\(registry\)/);
  assert.match(hub,/companionCombatPaths\(registry\)/);
  assert.match(hub,/axe-sk-companion-tree/);
  assert.match(hub,/axe-sk-combat-connector/);
  assert.match(hub,/axe-comp-tree-map/);
  assert.match(css,/\.axe-comp-skillbook\[data-companion-skill-layout="compact-gold"\] \.axe-comp-tree-map\{\s*min-height:0;gap:5px;padding:7px 8px 7px 2px;\s*border:0/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) clamp\(240px,30%,370px\)/);
  assert.match(css,/border-right:1px solid rgba\(229,186,126,\.35\)/);
  assert.match(css,/@media\(max-width:720px\)/);
});

test('skill card shows the skill name; information and numeric metrics belong in the right detail pane',()=>{
  assert.match(hub,/<strong>\{skill\.skill_name\}<\/strong>/);
  assert.doesNotMatch(hub,/axe-comp-tree-node-foot/);
  assert.match(hub,/axe-comp-tree-info-title/);
  assert.match(hub,/<h2><Sparkles size=\{17\}\/> Skill Information<\/h2>/);
  assert.match(hub,/<h3>\{selected\.skill_name\}<\/h3>/);
  assert.match(hub,/companionSkillMetrics\(selected\)\.map/);
  assert.match(hub,/axe-comp-tree-info-availability/);
  assert.match(css,/\.axe-sk-metrics span\{\s*padding:5px 1px;border:0/);
  assert.match(css,/background:transparent;color:#d3c3aa/);
  const metrics=companionSkillMetrics({cooldown:8,heal:40,requiresTarget:false});
  assert.deepEqual(metrics,[['Cooldown','8s'],['Heal','40'],['Target','Not required']]);
});

test('equip and selection gestures remain canonical, and unavailable future skills never cast',()=>{
  assert.match(tree,/targetEquipSlot=\{targetEquipSlot\}/);
  assert.match(tree,/onEquip=\{equipFromModernHub\}/);
  assert.match(hub,/onEquip\?\.\(skill\)/);
  assert.match(hub,/onSelected\?\.\(skill\)/);
  assert.match(hub,/onDoubleClick=\{\(\)=>equip\(skill\)\}/);
  assert.match(hub,/onContextMenu=\{event=>\{event\.preventDefault\(\);equip\(skill\);\}\}/);
  assert.match(hub,/companionSkillCanCast\(skill,RUNTIME_IDS\)/);
  assert.match(hub,/disabled=\{!canCast\|\|\(equipped&&selectedSlot===null\)\}/);
  assert.match(hub,/Equip to Next Free Slot/);
  assert.match(hub,/Z \/ X \/ V \/ B slot to equip/);
  assert.match(tree,/onSavePreset\?\.\(\)/);
  assert.match(tree,/onRemoveActive\?\.\(i\)/);
  assert.equal(companionSkillCanCast({legacy_id:'heal'},['heal']),true);
  assert.equal(companionSkillCanCast({skill_id:'companion_deity_fusion'},['heal']),false);
  for(const s of [tree,hub])assert.doesNotMatch(s,/awardSkillXp\(|grantSpeedBuff\(|settleReceipt\(/);
});

test('gold-glass styling keeps the existing Service navigation and reduced-motion behavior',()=>{
  assert.match(treeCss,/\.jade-services-navigation/);
  assert.match(treeCss,/--axe-service-navigation-actual-bottom/);
  assert.match(css,/--comp-skill-gold:rgba\(242,210,147,\.76\)/);
  assert.match(css,/--comp-skill-ivory:#f5e9d7/);
  assert.match(css,/background:linear-gradient\(95deg,#f2d398,#ffedc1 58%,#cda16b\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
