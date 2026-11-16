import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=filename=>readFileSync('src/components/game3d/axe/services/'+filename,'utf8');

test('Game 3D isolates the horizontal Skill Tree without hiding other Services or equipped bar',()=>{
  const tree=source('AXECloneSkillTreeWorkspace.jsx');
  const boundary=source('AXESkillTreeErrorBoundary.jsx');
  const css=source('AXESkillPathHorizontal.css');
  assert.match(tree,/import AXESkillTreeErrorBoundary from '\.\/AXESkillTreeErrorBoundary'/);
  assert.match(tree,/<AXESkillTreeErrorBoundary resetKey=\{category\+':'\+activePathId\}>/);
  assert.match(tree,/<AXESkillPathHorizontal/);
  assert.match(tree,/<div className="axe-ct-equipped"/);
  assert.match(tree,/<\/AXESkillTreeErrorBoundary>/);
  assert.match(boundary,/static getDerivedStateFromError\(error\)/);
  assert.match(boundary,/componentDidCatch\(error, info\)/);
  assert.match(boundary,/Retry Skill Tree/);
  assert.match(boundary,/this\.setState\(previous => \(\{ error: null, retries: previous\.retries \+ 1 \}\)\)/);
  assert.match(css,/\.axe-hp-boundary-body/);
  assert.match(css,/\.axe-hp-recovery/);
});

test('both progression rows share one reverse-direction scroll surface and point spending is recoverable',()=>{
  const sourceText=source('AXESkillPathHorizontal.jsx');
  assert.match(sourceText,/useRef\(null\)/);
  assert.match(sourceText,/viewport\.addEventListener\('wheel',onWheel,\{passive:false\}\)/);
  assert.match(sourceText,/horizontalSkillWheelOffset\(event\.deltaY,event\.deltaX\)/);
  assert.match(sourceText,/try \{\s*const result=investWeaponSkillPoint\(category,stageIndex,1\)/);
  assert.match(sourceText,/catch\(error\)/);
  assert.match(sourceText,/onFeedback\?\.\('Could not upgrade this stage/);
  assert.doesNotMatch(sourceText,/awardSkillXp|award\(/);
});

test('the default game Skill Book still uses the approved horizontal design and original controller',()=>{
  const controller=source('AXESkillBookWorkspace.jsx');
  const tree=source('AXECloneSkillTreeWorkspace.jsx');
  assert.match(controller,/const SkillBookView = cloneClassic \? AXESkillBookRedesign : AXECloneSkillTreeWorkspace/);
  assert.match(tree,/onEquipActive\?\.\(index,skill\)/);
  assert.match(tree,/onChoosePreset\(\(next\+3\)%3\)/);
  assert.match(tree,/subscribeWeaponSkillPoints/);
});
