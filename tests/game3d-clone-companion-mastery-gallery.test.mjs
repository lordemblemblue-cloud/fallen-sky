import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  getCompanionMasteryProgress,getCompanionMasteryRank,
} from '../src/components/game3d/axe/progression/AXECompanionRoleMastery.mjs';
import {getCompanionGrowthView} from '../src/components/game3d/axe/progression/AXECompanionGrowthView.mjs';

const read=path=>readFileSync(new URL('../src/components/game3d/axe/services/'+path,import.meta.url),'utf8');
const panel=read('AXECompanionMasteryPanel.jsx');
const galleryStyles=read('AXECompanionMasteryGallery.css');
const styles=read('AXECompanionProfileRedesign.css');
const circle=read('AXECompanionMountCircleRail.jsx');
const circleStyles=read('AXECompanionMountCircleRail.css');
const workspace=read('AXECompanionWorkspace.jsx');

test('mastery keeps the selected mount in the real skinned 3D companion viewer',()=>{
  assert.match(panel,/getCompanionById\(def.modelRef\)/);
  assert.match(panel,/CompanionPreview3D key=\{linkedModel.id\} companionId=\{linkedModel.id\}/);
  assert.match(panel,/className="axe-mastery-portrait"/);
  assert.match(panel,/axe-mastery-portrait-stage/);
  assert.match(panel,/data-companion-page="role-mastery"/);
  assert.match(galleryStyles,/\.axe-mastery-portrait-stage/);
  assert.doesNotMatch(panel,/setActiveCompanion\(/);
});

test('mastery reuses the same Variety-style circular owned-mount selector as Equipment',()=>{
  assert.match(panel,/<AXECompanionMountCircleRail mounts=\{mounts\}/);
  assert.match(panel,/onSelect=\{id=>\{setSelectedId\(id\)/);
  assert.match(circle,/data-companion-roster-layout="circles"/);
  assert.match(circle,/getAXEMountDefinition\(mount.definitionId\)/);
  assert.match(circleStyles,/border-radius:50%/);
  assert.doesNotMatch(panel,/<h3>My Companion<\/h3>|Find mount|rosterQuery/);
});

test('compact Damage Defense Range choices show real rank progress beside detailed increases',()=>{
  assert.match(panel,/COMPANION_MASTERY_PATHS\.map\(path=>/);
  assert.match(panel,/getCompanionMasteryProgress\(mount,path.id\)/);
  assert.match(panel,/className="axe-mastery-role-list"/);
  assert.match(panel,/className="axe-mastery-role-row"/);
  assert.match(panel,/className="axe-mastery-stat-breakdown"/);
  assert.match(panel,/className="axe-mastery-stat-numbers"/);
  assert.match(panel,/progress.nextXp-progress.xp/);
  assert.match(panel,/p.rank\*2/);
  assert.match(panel,/activeRole===path.id/);
  const mount={roleMastery:{damage:{xp:90}}};
  const p=getCompanionMasteryProgress(mount,'damage');
  assert.equal(p.rank,getCompanionMasteryRank(90));
  assert.equal(p.nextXp-p.xp,60);
});

test('preserves mastery eligibility, current/next contributions and active mount switching',()=>{
  assert.match(panel,/getCompanionGrowthView\(mount\?\.totalXp\|\|0\)/);
  assert.match(panel,/growth.completedCycles>=1/);
  assert.match(panel,/getAXEMountBonuses\(mount\)/);
  assert.match(panel,/activateAXEMount\(mount.instanceId\)/);
  assert.match(panel,/className="axe-mastery-inspector"/);
  assert.match(panel,/No .*bonus recorded for this mount/);
  assert.equal(getCompanionGrowthView(4999).completedCycles,0);
  assert.equal(getCompanionGrowthView(5000).completedCycles,1);
});

test('compact gallery remains responsive without changing Equipment or Variety styles',()=>{
  assert.match(styles,/\.axe-mastery-rebuild--compact/);
  assert.match(styles,/grid-template-columns:minmax\(70px,84px\) minmax\(200px,29%\) minmax\(0,1fr\)/);
  assert.match(styles,/\.axe-mastery-workbench/);
  assert.match(styles,/@media\(max-width:760px\)/);
  assert.match(styles,/\.axe-mastery-rebuild--compact>\.axe-mastery-portrait/);
  assert.doesNotMatch(styles,/\.axe-comp-style-layout/);
  assert.match(workspace,/const TABS=\['Equipment','Mastery','Vanity','Imbuement'\]/);
  assert.match(workspace,/tab==='Mastery'\?<div/);
});
