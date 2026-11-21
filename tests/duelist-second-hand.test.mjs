// Duelist Adventure: the staff's second hand. The pack says, clip by clip, when the left hand is on the shaft; the
// solver puts it there on any body, exactly, and as much as it is told.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MOTION_CLIPS } from '../src/components/duelist/core/index.mjs';
import { createSecondHand, secondHandAt } from '../src/components/duelist/client/secondHand.mjs';
import { STAFF_HANDS, STAFF_MIDDLE } from '../src/components/duelist/client/classWeapons.mjs';

test('the stance and the guard hold the staff in both hands; a sweep lets go and takes hold again as it settles', () => {
  for (const clip of ['staffIdle', 'staffGuard']) {
    assert.ok(MOTION_CLIPS[clip].secondHand.on.every((w) => w >= 0.99), `${clip}: both hands all the way`);
    assert.equal(secondHandAt(clip, 0.4), 1);
  }
  for (const clip of ['staffA', 'staffB', 'staffC', 'staffHeavy']) {
    const { on, step } = MOTION_CLIPS[clip].secondHand;
    assert.ok(on.filter((w) => w === 0).length * step > 0.25, `${clip}: one hand through the sweep`);
    assert.equal(on[on.length - 1], 1, `${clip}: both hands again at the end`);
    assert.equal(secondHandAt(clip, MOTION_CLIPS[clip].duration), 1);
    for (let i = 1; i < on.length; i++) assert.ok(Math.abs(on[i] - on[i - 1]) <= 0.95, `${clip}: no snap at ${(i * step).toFixed(2)}s`);
  }
  assert.ok(secondHandAt('staffA', 0) > 0.9, 'the first sweep leaves from the stance');
  assert.equal(secondHandAt('staffA', 0.3), 0);
  assert.equal(secondHandAt('swordA', 0.2), 0, 'only the staff has a second hand');
  assert.equal(secondHandAt('nothing', 0), 0);
  assert.equal(STAFF_HANDS, STAFF_MIDDLE * 2, 'the staff balances between the hands');
});

// a left arm on a chest, and a staff held somewhere in front of it
function rig({ upperLength = 0.27, foreLength = 0.25, shoulder = [0.18, 0.12, 0] } = {}) {
  const model = new THREE.Group();
  const bone = (name, parent, at) => { const b = new THREE.Bone(); b.name = name; b.position.fromArray(at); parent.add(b); return b; };
  const chest = bone('mixamorigSpine2', model, [0, 1.3, 0]);
  const upper = bone('mixamorigLeftArm', chest, shoulder);
  const fore = bone('mixamorigLeftForeArm', upper, [upperLength, 0, 0]);
  const hand = bone('mixamorigLeftHand', fore, [foreLength, 0, 0]);
  upper.rotation.set(0.2, -0.4, -0.9); // hanging forward and down, as a clip might leave it
  fore.rotation.set(0, -0.7, 0.1);
  const weapon = new THREE.Group();
  weapon.position.set(0.0, 1.0, 0.3);
  weapon.rotation.set(0.15, 0, -0.6);
  model.add(weapon);
  const grip = { position: [0.08, -0.02, 0.012], quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.1, 1.2)).toArray() };
  model.updateMatrixWorld(true);
  return { model, upper, fore, hand, weapon, grip };
}

function gripOf({ model, hand, weapon, grip }) {
  model.updateMatrixWorld(true);
  const at = hand.localToWorld(new THREE.Vector3().fromArray(grip.position));
  const origin = new THREE.Vector3().setFromMatrixPosition(weapon.matrixWorld);
  const shaft = new THREE.Vector3().setFromMatrixColumn(weapon.matrixWorld, 1).normalize();
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().fromArray(grip.quaternion)).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
  return { off: at.distanceTo(origin.clone().addScaledVector(shaft, STAFF_HANDS)), along: axis.dot(shaft) };
}

test('the second hand closes on the shaft, on arms of any length', () => {
  for (const body of [{}, { upperLength: 0.31, foreLength: 0.28 }, { upperLength: 0.24, foreLength: 0.22, shoulder: [0.21, 0.1, 0.02] }]) {
    const r = rig(body);
    const before = gripOf(r);
    assert.ok(before.off > 0.1, 'the clip alone leaves the hand off the shaft');
    createSecondHand({ ...r, along: STAFF_HANDS }).apply(1);
    const after = gripOf(r);
    assert.ok(after.off < 1e-4, `the grip is on the shaft (${after.off.toFixed(5)} m off)`);
    assert.ok(after.along > 0.9999, 'the hand lies along the shaft, thumb up it');
    assert.ok(Math.abs(r.fore.position.length() - (body.upperLength ?? 0.27)) < 1e-9, 'bones turn, they do not stretch');
  }
});

test('half on the shaft is halfway there; off it, the clip is left alone; out of reach, the arm stretches toward it', () => {
  const half = rig();
  const start = gripOf(half).off;
  createSecondHand({ ...half, along: STAFF_HANDS }).apply(0.5);
  const mid = gripOf(half).off;
  assert.ok(mid > 0.02 && mid < start * 0.8, `partly there (${start.toFixed(3)} -> ${mid.toFixed(3)})`);
  const none = rig();
  const kept = none.upper.quaternion.clone();
  createSecondHand({ ...none, along: STAFF_HANDS }).apply(0);
  assert.deepEqual(none.upper.quaternion.toArray(), kept.toArray());
  const far = rig();
  far.weapon.position.set(-1.2, 1.0, 0.6);
  far.model.updateMatrixWorld(true);
  createSecondHand({ ...far, along: STAFF_HANDS }).apply(1);
  for (const b of [far.upper, far.fore, far.hand]) assert.ok(b.quaternion.toArray().every(Number.isFinite), 'no broken rotations');
  assert.equal(createSecondHand({ model: new THREE.Group(), weapon: far.weapon, grip: far.grip, along: 0.38 }), null, 'a body without the arm has no second hand');
});
