import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  getCompanionMasteryProgress,getCompanionMasteryRank,
} from '../src/components/game3d/axe/progression/AXECompanionRoleMastery.mjs';
import {getCompanionGrowthView} from '../src/components/game3d/axe/progression/AXECompanionGrowthView.mjs';

const read=path=>readFileSync(new URL('../src/components/game3d/axe/services/'+path,import.meta.url),'utf8');
const panel=read('AXECompanionMasteryPanel.jsx');
const styles=read('AXECompanionMasteryGallery.css');
const workspace=read('AXECompanionWorkspace.jsx');

test('mastery previews the selected owned mount in the existing real 3D component',()=>{
  assert.match(panel,/getCompanionById\(def\.modelRef\)/);
  assert.match(panel,/CompanionPreview3D key=\{linkedModel\.id\} companionId=\{linkedModel\.id\}/);
  assert.match(panel,/data-mastery-layout="portrait-3d-guided"/);
  assert.match(panel,/setSelectedId\(entry\.instanceId\)/);
  assert.doesNotMatch(panel,/setActiveCompanion\(/);
});
test('mastery uses a circular owned-mount rail, not another large My Companion box',()=>{
  assert.match(panel,/className="axe-mastery-avatar-rail"/);
  assert.match(panel,/className="axe-mastery-avatar"/);
  assert.doesNotMatch(panel,/<h3>My Companion<\/h3>/);
  assert.match(styles,/\.axe-mastery-avatar\s*\{[\s\S]*?border-radius:50%/);
});
test('Damage, Defense and Range explain actual ranks, remaining XP and active weapon',()=>{
  assert.match(panel,/COMPANION_MASTERY_PATHS\.map\(path=>/);
  assert.match(panel,/getCompanionMasteryProgress\(mount,path\.id\)/);
  assert.match(panel,/progress\.nextXp-progress\.xp/);
  assert.match(panel,/masterySummary\[path\.id\]/);
  assert.match(panel,/p\.rank\*2/);
  assert.match(panel,/axe-mastery-active-pill/);
  const mount={roleMastery:{damage:{xp:90}}};
  const p=getCompanionMasteryProgress(mount,'damage');
  assert.equal(p.rank,getCompanionMasteryRank(90));
  assert.equal(p.nextXp-p.xp,60);
});
test('preserves actual growth prerequisite, right inspector and activation transaction',()=>{
  assert.match(panel,/getCompanionGrowthView\(mount\?\.totalXp\|\|0\)/);
  assert.match(panel,/level\.completedCycles>=1/);
  assert.match(panel,/getAXEMountBonuses\(mount\)/);
  assert.match(panel,/activateAXEMount\(mount\.instanceId\)/);
  assert.match(panel,/className="axe-mastery-inspector"/);
  assert.equal(getCompanionGrowthView(4999).completedCycles,0);
  assert.equal(getCompanionGrowthView(5000).completedCycles,1);
});
test('scoped responsive Mastery CSS leaves Equipment and Variety unchanged',()=>{
  assert.match(styles,/\.axe-mastery-rebuild--gallery/);
  assert.match(styles,/@media\(max-width:960px\)/);
  assert.match(styles,/@media\(max-width:650px\)/);
  assert.doesNotMatch(styles,/\.axe-comp-style-layout/);
  assert.match(workspace,/const TABS=\['Equipment','Mastery','Vanity','Imbuement'\]/);
  assert.match(workspace,/tab==='Mastery'\?<div/);
});
