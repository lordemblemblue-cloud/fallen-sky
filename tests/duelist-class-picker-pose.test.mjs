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

test('class picker is a compact single-detail selector rather than four full cards', () => {
  const picker = file('client/ClassPicker.jsx');
  const css = file('client/duelistClassPicker.css');
  assert.match(picker, /CLASS_IDS\.map/);
  assert.match(picker, /data-testid=\{`duelist-class-\$\{id\}`\}/);
  assert.match(picker, /onClick=\{\(\) => onPick\(id\)\}/);
  assert.match(picker, /aria-pressed=\{chosen === id\}/);
  assert.match(picker, /pending && pending !== current/);
  assert.match(picker, /kitAt\(chosen, at\.level, matchBoost\)/);
  assert.match(picker, /kit\.abilities\.map/);
  assert.match(picker, /kit\.special\.name/);
  assert.doesNotMatch(picker, /duelist-classcard/);
  assert.match(css, /\.duelist-game \.duelist-classpick\.dcp-root/);
  assert.match(css, /max-height: calc\(100% - 160px\)/);
  assert.match(css, /width: min\(352px/);
});

test('home and character match previews continue to share the corrected AFK stance', () => {
  const idle = file('menu/idlePreview.mjs');
  const home = file('menu/DuelistHangarStage.jsx');
  const character = file('menu/DuelistCharacterPreview.jsx');
  assert.match(idle, /mixer\?\.update\(dt\); correctSpreadArms\(model\)/);
  assert.match(home, /await prepareIdlePreview/);
  assert.match(character, /await prepareIdlePreview/);
});
