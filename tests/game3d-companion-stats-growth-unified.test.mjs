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
