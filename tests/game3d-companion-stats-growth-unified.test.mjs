import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCompanionGrowthView } from '../src/components/game3d/axe/progression/AXECompanionGrowthView.mjs';

const read = file => readFileSync(new URL('../src/components/game3d/axe/services/'+file, import.meta.url),'utf8');
const equipment = read('AXEGlassLoadoutPane.jsx');
const companion = read('AXECompanionWorkspace.jsx');
const overview = read('AXECompanionUnifiedInsights.jsx');
const styles = read('AXEGlassLoadoutPane.css');
const originalPanels = read('AXECompanionInsights.jsx');

test('the actual Companion Equipment / Stats & Growth toggle shows ONE combined panel', () => {
  assert.match(companion, /<AXEGlassLoadoutPane actor="companion"/);
  assert.match(equipment, /setInsightsOpen\(value=>!value\)/);
  assert.match(equipment, /insightsOpen \? <AXECompanionUnifiedInsights mount=\{selectedMount\} snapshot=\{mounts\}/);
  assert.match(equipment, /\(isPlayer \|\| !insightsOpen\) && <aside/);
  assert.doesNotMatch(equipment, /<CompanionAttributesPanel|<CompanionGrowthPanel/);
  assert.match(overview, /data-companion-insight="unified"/);
});

test('one overview shows selected companion, level, XP and live HP/Attack/Defense', () => {
  assert.match(overview, /getAXEMountDefinition\(mount.definitionId\)/);
  assert.match(overview, /getCompanionGrowthView\(mount\?\.totalXp \|\| 0\)/);
  assert.match(overview, /applyCompanionGrowthBonus\(base, mount.totalXp \|\| 0\)/);
  assert.match(overview, /applyCompanionRoleBonus/);
  for (const label of ['HP','Attack','Defense']) assert(overview.includes("label: '"+label+"'"));
  assert.match(overview, /aria-label="Companion level progress"/);
  assert.match(overview, /growth.currentLevelXP/);
  assert.match(overview, /growth.levelXPRequired/);
});

test('existing detailed attributes and growth share one scrollable card with a divider', () => {
  assert.match(overview, /axe-comp-unified-detail-groups/);
  assert.match(overview, /<CompanionAttributesPanel mount=\{mount\} snapshot=\{snapshot\}/);
  assert.match(overview, /<CompanionGrowthPanel mount=\{mount\} snapshot=\{snapshot\}/);
  assert.match(styles, /\.axe-comp-unified-detail-groups>\.axe-comp-insights-card\+\.axe-comp-insights-card/);
  assert.match(styles, /\.axe-comp-unified-scroll\s*\{[\s\S]*?overflow-x:hidden;overflow-y:auto/);
  assert.match(styles, /grid-column:3 \/ 5/);
  assert.match(styles, /@media\(max-width:980px\)/);
  assert.match(styles, /@media\(max-width:590px\)/);
  assert.match(originalPanels, /Earned Experience/);
  assert.match(originalPanels, /Current &amp; Next Milestone/);
});

test('the Companion Skill Tree and independent Mastery tab remain outside this stat sheet', () => {
  assert.match(companion, /const TABS=\['Equipment','Mastery','Vanity','Imbuement'\]/);
  assert.match(companion, /<AXECompanionMasteryPanel/);
  assert.doesNotMatch(overview, /<AXECompanionMasteryPanel|<SkillTree|onUpgradeSkill|equipCompanionSkill/);
  assert.match(originalPanels, /50% of the XP you actually receive/);
});

test('growth readout follows recorded XP, with no fabricated level grants', () => {
  assert.equal(getCompanionGrowthView(0).level,1);
  assert.equal(getCompanionGrowthView(0).cycle,1);
  assert.equal(getCompanionGrowthView(5000).completedCycles,1);
  assert.equal(getCompanionGrowthView(20000).maxed,true);
});

const circleRail = read('AXECompanionMountCircleRail.jsx');
const circleStyles = read('AXECompanionMountCircleRail.css');
const mastery = read('AXECompanionMasteryPanel.jsx');
const masteryStyles = read('AXECompanionProfileRedesign.css');

test('Companion Equipment and Mastery use one shared Variety-style circular owned-mount picker', () => {
  assert.match(equipment, /<AXECompanionMountCircleRail/);
  assert.match(mastery, /<AXECompanionMountCircleRail/);
  assert.match(circleRail, /mounts\.map\(mount =>/);
  assert.match(circleRail, /getAXEMountDefinition\(mount.definitionId\)/);
  assert.match(circleRail, /getCompanionGrowthView\(mount.totalXp\|\|0\)/);
  assert.match(circleRail, /data-companion-roster-layout="circles"/);
  assert.match(circleStyles, /border-radius:50%/);
  assert.match(equipment, /onSelect=\{id=>\{setSelectedMountId\(id\)/);
  assert.match(mastery, /onSelect=\{id=>\{setSelectedId\(id\)/);
  assert.doesNotMatch(equipment, /rosterQuery|rosterFocused|Search companions|axe-comp-owned-roster--classic/);
  assert.doesNotMatch(mastery, /Find mount|<Search/);
});

test('three real gear slots plus All Gear action occupy all four 3D viewer corners', () => {
  assert.match(equipment, /className="axe-comp-viewer-corners"/);
  assert.match(equipment, /displaySlots\.map\(\(\[slot,index\],position\)=>/);
  assert.match(equipment, /\['top-left','top-right','bottom-left','bottom-right'\]/);
  assert.match(equipment, /displaySlots\.length<4&&<button/);
  assert.match(equipment, /aria-label="Show all companion gear in inventory"/);
  assert.match(equipment, /onClick=\{\(\)=>\{setInsightsOpen\(false\);setFilter\('All'\)/);
  assert.match(equipment, /axe-comp-viewer-mount-actions/);
  assert.match(styles, /\.axe-comp-viewer-corner--top-left/);
  assert.match(styles, /\.axe-comp-viewer-corner--top-right/);
  assert.match(styles, /\.axe-comp-viewer-corner--bottom-left/);
  assert.match(styles, /\.axe-comp-viewer-corner--bottom-right/);
  assert.match(styles, /min-height:95px/);
});

test('Mastery shows Damage, Defense, Range vertically and a separate broad stats detail pane', () => {
  assert.match(mastery, /COMPANION_MASTERY_PATHS\.map\(path=>/);
  assert.match(mastery, /className="axe-mastery-role-list"/);
  assert.match(mastery, /className="axe-mastery-stat-breakdown"/);
  assert.match(mastery, /className="axe-mastery-workbench"/);
  assert.match(mastery, /progress\.nextXp-progress\.xp/);
  assert.match(mastery, /getCompanionMasteryProgress\(mount,role\)/);
  assert.match(mastery, /activateAXEMount\(mount.instanceId\)/);
  assert.match(mastery, /onClick=\{onMyCompanion\}/);
  assert.match(masteryStyles, /\.axe-mastery-workbench\s*\{[\s\S]*?grid-template-columns:minmax\(155px,26%\) minmax\(0,1fr\)/);
  assert.match(masteryStyles, /border-right:2px solid #e1c38e91/);
  assert.match(masteryStyles, /@media\(max-width:760px\)/);
  assert.doesNotMatch(mastery, /axe-mastery-role-card|axe-mastery-hero/);
});
