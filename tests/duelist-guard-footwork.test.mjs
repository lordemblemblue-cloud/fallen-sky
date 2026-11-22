// Visual guard footwork for the four original combat forms. The game simulation
// owns movement and block validity; only the lower-body pose is blended here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFighter } from '../src/components/duelist/core/fighter.mjs';
import { createFighterAnimator, LAYERED, STANCES } from '../src/components/duelist/client/animator.mjs';

const FORMS = [
  ['warrior', 'sword', 'swordBlock'],
  ['healer', 'sword', 'swordBlock'],
  ['duelist', 'dualBlades', 'bladesGuard'],
  ['assassin', 'staff', 'staffGuard'],
];

function sampleClip(name) {
  return new THREE.AnimationClip(name, 1, [
    new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 0, 0, 0, 0, 0]),
    new THREE.QuaternionKeyframeTrack('mixamorigSpine.quaternion', [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
}

function rigFor(stance) {
  const model = new THREE.Group();
  const hips = new THREE.Bone(); hips.name = 'mixamorigHips';
  const spine = new THREE.Bone(); spine.name = 'mixamorigSpine';
  hips.add(spine); model.add(hips);
  const names = new Set(['walk', 'jog', 'sprint', STANCES[stance].idle, STANCES[stance].guard]);
  const pack = Object.fromEntries([...names].map(name => [name, sampleClip(name)]));
  return { model, clips: { pack, walk: pack.walk } };
}

function weight(animator, clip) {
  const action = animator.mixer._actions.find(a => a.getClip().name === clip);
  assert.ok(action, `missing mixer layer ${clip}`);
  return action.getEffectiveWeight();
}

test('every class guard has independent body and legs layers; executions stay full-body', () => {
  for (const [, , guard] of FORMS) assert.equal(LAYERED.test(guard), true, guard);
  for (const id of ['swordCutStandHeavy', 'swordCutStandSwift', 'bladesCutStand', 'staffCutStand'])
    assert.equal(LAYERED.test(id), true, id);
  for (const id of ['execution', 'shadowExecution', 'roll', 'Front_Roll', 'jumpLand', 'death'])
    assert.equal(LAYERED.test(id), false, id);
});

test('standing guards keep original planted legs; moving guards retain arms while giving feet to locomotion', () => {
  for (const [classId, stance, guard] of FORMS) {
    const rig = rigFor(stance);
    const animator = createFighterAnimator({ ...rig, stance });
    const fighter = createFighter({ id: classId, classId,
      weapon: classId === 'duelist' ? 'dualBlades' : classId === 'assassin' ? 'staff' : 'sword' });
    fighter.guard = true;

    animator.update(0.2, { fighter, body: { y: 0, speed: 0 }, now: 0 });
    assert.equal(animator.current(), guard, `${classId} uses its form's guard`);
    assert.ok(weight(animator, `${guard}:body`) > 0.95, `${classId} holds upper-body guard`);
    assert.ok(weight(animator, `${guard}:legs`) > 0.95, `${classId} has guard foot plant when stationary`);

    animator.update(0.2, { fighter, body: { y: 0, speed: 2 }, now: 0.2 });
    assert.ok(weight(animator, `${guard}:body`) > 0.95, `${classId} keeps defensive arms while moving`);
    assert.ok(weight(animator, `${guard}:legs`) < 0.01, `${classId} frees lower-body for walking`);
    assert.ok(weight(animator, 'walk:legs') > 0.65,
      `${classId} retains locomotion footwork instead of skating on stationary guard legs`);

    animator.update(0.2, { fighter, body: { y: 0, speed: 0 }, now: 0.4 });
    assert.ok(weight(animator, `${guard}:legs`) > 0.95, `${classId} returns feet to stationary guard`);
    animator.dispose();
  }
});

test('guard blending only animates a mesh; no server ability or hit window is changed', () => {
  const fighter = createFighter({ id: 'warrior', classId: 'warrior', weapon: 'sword' });
  const old = { guard: fighter.guard, meter: fighter.meter,
    stamina: fighter.vitals.stamina, will: fighter.vitals.will };
  const animator = createFighterAnimator({ ...rigFor('sword'), stance: 'sword' });
  fighter.guard = true; // simulation-owned outcome provided to the animator
  animator.update(0.2, { fighter, body: { y: 0, speed: 3.5 }, now: 0 });
  assert.equal(fighter.meter, old.meter);
  assert.equal(fighter.vitals.stamina, old.stamina);
  assert.equal(fighter.vitals.will, old.will);
  assert.equal(old.guard, null, 'fighters begin out of guard');
  assert.equal(fighter.guard, true, 'visual rendering did not cancel server-owned guard');
  animator.dispose();
});
