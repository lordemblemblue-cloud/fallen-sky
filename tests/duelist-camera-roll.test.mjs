// Regression: moving sideways/back must not redirect a blade away from camera aim;
// the smaller roll has the same class scaling and iframe/cancel timing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, bodyOf, step } from '../src/components/duelist/sim/world.mjs';
import { CLASSES, CLASS_IDS, MOVES, rollReach } from '../src/components/duelist/core/index.mjs';
import { createControls } from '../src/components/duelist/client/controls.mjs';

const DT = 1 / 60;
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) < tolerance;

test('roll distance is reduced by at least 35%, without changing its iframes or cancel timing', () => {
  assert.ok(MOVES.roll.rootMotion <= 10.8 * 0.65 + 1e-9);
  assert.ok(near(MOVES.roll.rootMotion, 7.02));
  assert.deepEqual(MOVES.roll.iframes, [0.06, 0.32]);
  assert.equal(MOVES.roll.cancelFrom, 0.3);
});

test('all four classes keep their passive-scaled shorter roll in their intended travel direction', () => {
  for (const classId of CLASS_IDS) {
    const world = createWorld({ arenaRadius: 60 });
    const fighter = addFighter(world, { id: 'a', classId, weapon: CLASSES[classId].weapon, yaw: 0 });
    const expected = MOVES.roll.rootMotion * rollReach(fighter);
    step(world, DT, { a: { move: { x: 1, z: 0 }, face: Math.PI / 2, presses: ['roll'] } });
    for (let i = 0; i < Math.ceil(MOVES.roll.duration / DT) + 3; i++) {
      step(world, DT, { a: { move: { x: 0, z: 1 }, face: 0 } });
    }
    const body = bodyOf(world, 'a');
    assert.ok(near(body.x, expected, 0.18), `${classId}: rolled ${body.x}m, expected ${expected}m`);
    assert.ok(Math.abs(body.z) < 0.2, `${classId}: changing camera angle did not steer the roll`);
  }
});

test('all four classes turn their attack hit arcs toward the camera while the feet strafe', () => {
  for (const classId of CLASS_IDS) {
    const world = createWorld({ arenaRadius: 50 });
    const fighter = addFighter(world, { id: 'a', classId, weapon: CLASSES[classId].weapon, yaw: 0 });
    step(world, DT, { a: { face: 0, presses: ['heavy'], move: { x: -1, z: 0 }, run: true } });
    assert.equal(fighter.action?.move?.kind, 'attack', `${classId} has begun a heavy strike`);
    const moving = { a: { face: Math.PI / 2, move: { x: -1, z: 0 }, run: true } };
    step(world, DT, moving);
    const first = bodyOf(world, 'a').yaw;
    assert.ok(first > 0 && first <= 12 * DT + 1e-9, `${classId} turns at bounded rate, first ${first}`);
    for (let n = 0; n < 5; n++) step(world, DT, moving);
    assert.ok(bodyOf(world, 'a').yaw > first + 0.1, `${classId} follows the camera during the strike`);
  }
});

test('keyboard strafing is independent of mouse direction for a held or ongoing attack', () => {
  const win = new EventTarget();
  const canvas = new EventTarget();
  globalThis.window = win;
  globalThis.document = { pointerLockElement: canvas, exitPointerLock() {} };
  const key = (type, code) => win.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat: false }));
  const controls = createControls(canvas);
  try {
    controls.setYaw(0); // facing north; pressing A travels east
    key('keydown', 'KeyA');
    const ordinary = controls.read();
    assert.ok(ordinary.move.x > 0.9 && Math.abs(ordinary.move.z) < 0.01);
    assert.ok(near(ordinary.face, Math.PI / 2), 'without an attack, the body turns toward walking');
    const attacking = controls.read({ aimWhileAttacking: true });
    assert.equal(attacking.face, 0, 'ongoing swing keeps aiming ahead instead of turning into the strafe');
    controls.setYaw(Math.PI / 2); // cursor/mouse changes attack direction
    assert.ok(near(controls.read({ aimWhileAttacking: true }).face, Math.PI / 2));
    const locked = controls.read({ aimWhileAttacking: true, faceYaw: -Math.PI / 3, strafe: true });
    assert.ok(near(locked.face, -Math.PI / 3), 'lock-on opponent overrides free camera aim');
    assert.equal(locked.strafe, true);
  } finally {
    controls.dispose();
    delete globalThis.window;
    delete globalThis.document;
  }
});
