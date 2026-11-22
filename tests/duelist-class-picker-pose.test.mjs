import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { CLASS_IDS } from '../src/components/duelist/core/classes.mjs';
import { correctSpreadArms, idleCandidates } from '../src/components/duelist/menu/idlePreview.mjs';

const file = (path) => readFileSync(new URL(`../src/components/duelist/${path}`, import.meta.url), 'utf8');

function testRig(spread = true) {
  const model = new THREE.Group();
  for (const side of ['Left', 'Right']) {
    const upper = new THREE.Bone();
    upper.name = `mixamorig${side}Arm`;
    upper.position.set(side === 'Left' ? -0.48 : 0.48, 1.45, 0);
    const forearm = new THREE.Bone();
    forearm.name = `mixamorig${side}ForeArm`;
    forearm.position.set(spread ? (side === 'Left' ? -0.5 : 0.5) : 0, spread ? 0 : -0.5, 0);
    upper.add(forearm);
    model.add(upper);
  }
  model.updateMatrixWorld(true);
  return model;
}

test('idle correction lowers both visibly horizontal arms without depending on local Euler axes', () => {
  const model = testRig(true);
  assert.equal(correctSpreadArms(model), 2);
  for (const side of ['Left', 'Right']) {
    const upper = model.getObjectByName(`mixamorig${side}Arm`);
    const elbow = model.getObjectByName(`mixamorig${side}ForeArm`);
    const direction = elbow.getWorldPosition(new THREE.Vector3())
      .sub(upper.getWorldPosition(new THREE.Vector3())).normalize();
    assert.ok(direction.y < -0.85, `${side} upper arm should point down, not sideways`);
    assert.ok(Math.abs(direction.x) < 0.4, `${side} elbow should stay near the body`);
  }
  assert.equal(correctSpreadArms(model), 0, 'subsequent animation frames cannot accumulate joint rotations');
});

test('already-relaxed poses remain untouched and all four class idle sources are kept', () => {
  const model = testRig(false);
  assert.equal(correctSpreadArms(model), 0);
  for (const classId of CLASS_IDS) assert.ok(idleCandidates(classId).length >= 1);
});

test('class selection is vertically stacked and only the central Select button submits a request', () => {
  const picker = file('client/ClassPicker.jsx');
  const game = file('client/DuelistGame.jsx');
  assert.match(picker, /CLASS_IDS\.map/);
  assert.match(picker, /className="dcp-class-stack"/);
  assert.match(picker, /data-testid=\{`duelist-class-\$\{id\}`\}/);
  assert.match(picker, /onClick=\{\(\) => setPreviewId\(id\)\}/);
  assert.match(picker, /aria-pressed=\{chosen === id\}/);
  assert.doesNotMatch(picker, /onClick=\{\(\) => onPick\(id\)\}/);
  assert.match(picker, /data-testid="duelist-class-select"/);
  assert.match(picker, /onClick=\{\(\) => onPick\?\.\(chosen\)\}/);
  assert.equal((picker.match(/onPick\?\.\(chosen\)/g) || []).length, 1);
  assert.match(picker, /pending === chosen && pending !== current/);
  assert.match(picker, /kitAt\(chosen, at\.level, matchBoost\)/);
  assert.match(picker, /kit\.abilities\.map/);
  assert.match(picker, /kit\.special\.name/);
  assert.match(game, /<ClassPicker current=\{current\} pending=\{classAnswer\?\.ok \? classAnswer\.pending : null\} fighter=\{youBody\}/);
});

test('the three-column screen reserves 18 percent for classes, 57 for live model, 25 for skills', () => {
  const picker = file('client/ClassPicker.jsx');
  const css = file('client/duelistClassPicker.css');
  assert.match(picker, /data-layout="three-column"/);
  assert.match(picker, /className="dcp-classes"/);
  assert.match(picker, /className="dcp-model"/);
  assert.match(picker, /className="dcp-details"/);
  assert.match(picker, /className="dcp-model-view" data-testid="duelist-class-3d-preview"/);
  assert.match(picker, /<DuelistCharacterPreview fighter=\{fighter\} classId=\{chosen\} compact \/>/);
  assert.match(picker, /className="dcp-model-footer"/);
  assert.match(css, /grid-template-columns: 18% minmax\(0, 57%\) minmax\(0, 25%\)/);
  assert.match(css, /\.dcp-classes::after, \.duelist-game \.dcp-details::before/);
  assert.match(css, /linear-gradient\(to bottom, transparent 0%, rgba\(175, 209, 237, \.5\) 50%, transparent 100%\)/);
  assert.match(css, /\.dcp-model-footer \{ position: absolute; bottom: 16px;/);
  assert.match(css, /\.dcp-select \{/);
  assert.match(css, /@media \(max-width: 780px\)/);
});

test('home and character match previews continue to share the corrected AFK stance', () => {
  const idle = file('menu/idlePreview.mjs');
  const home = file('menu/DuelistHangarStage.jsx');
  const character = file('menu/DuelistCharacterPreview.jsx');
  assert.match(idle, /mixer\?\.update\(dt\); correctSpreadArms\(model\)/);
  assert.match(home, /await prepareIdlePreview/);
  assert.match(character, /await prepareIdlePreview/);
});
