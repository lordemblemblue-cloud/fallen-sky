import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, step, bodyOf } from '../src/components/duelist/sim/world.mjs';
import { JUMP, SPRINT, VITALS } from '../src/components/duelist/core/index.mjs';
import { encodeInput, sanitizeInput, encodeOwn, applyOwn, PROTOCOL } from '../src/components/duelist/net/protocol.mjs';
import { keysFrom, rebind, actionFor, bindable } from '../src/components/duelist/client/bindings.mjs';
import { createFighter } from '../src/components/duelist/core/fighter.mjs';

const DT = 1 / 60;
function arc(hold) {
  const world = createWorld({ arenaRadius: 100 });
  const fighter = addFighter(world, { id: 'me' });
  const body = bodyOf(world, 'me');
  let apex = 0;
  for (let tick = 0; tick < 180; tick++) {
    const input = { jumpHeld: hold && tick < 25, presses: tick === 0 || tick === 12 ? ['jump'] : [] };
    step(world, DT, { me: input });
    apex = Math.max(apex, body.y);
  }
  return { apex, body, fighter };
}

test('Space jumps, Alt rolls, Shift sprints, and remapping accepts extended mouse buttons', () => {
  const keys = keysFrom({});
  assert.equal(keys.jump, 'Space');
  assert.equal(keys.roll, 'AltLeft');
  assert.equal(keys.sprint, 'ShiftLeft');
  assert.equal(actionFor(keys, 'Space'), 'jump');
  assert.equal(actionFor(keys, 'AltRight'), 'roll');
  assert.ok(bindable('Mouse7'));
  const changed = rebind(keys, 'jump', 'Mouse7');
  assert.equal(changed.keys.jump, 'Mouse7');
  assert.equal(actionFor(changed.keys, 'Mouse7'), 'jump');
  assert.equal(keysFrom({ roll: 'Space' }).roll, 'AltLeft', 'old saved Space roll migrates to Alt');
});

test('holding jump creates a higher arc than tapping, without spending stamina or Will', () => {
  const tap = arc(false);
  const hold = arc(true);
  assert.ok(tap.apex > 0.7 && tap.apex < 1.8, `tap apex ${tap.apex.toFixed(2)} m`);
  assert.ok(hold.apex > tap.apex + 0.8, `hold apex ${hold.apex.toFixed(2)} m vs tap ${tap.apex.toFixed(2)} m`);
  assert.ok(hold.apex < 6, 'jump height is capped');
  assert.equal(tap.fighter.vitals.stamina, VITALS.stamina);
  assert.equal(hold.fighter.vitals.stamina, VITALS.stamina);
  assert.equal(hold.fighter.vitals.will, VITALS.will);
  assert.equal(tap.body.y, 0);
  assert.equal(hold.body.y, 0);
});

test('a jump cannot restart in midair and unlimited sprint does not spend stamina', () => {
  const w = createWorld({ arenaRadius: 100 });
  const fighter = addFighter(w, { id: 'me' });
  const b = bodyOf(w, 'me');
  step(w, DT, { me: { presses: ['jump'], jumpHeld: true } });
  const vy = b.vy;
  step(w, DT, { me: { presses: ['jump'], jumpHeld: true } });
  assert.ok(b.vy < vy + JUMP.holdAcceleration * DT, 'second press cannot reset vertical speed');
  for (let i = 0; i < 90; i++) step(w, DT, { me: { move: { x: 1, z: 0 }, sprint: true } });
  assert.equal(fighter.vitals.stamina, VITALS.stamina);
  assert.equal(SPRINT.staminaPerSec, 0);
});

test('held jump is validated on the wire and reconciled in prediction snapshots', () => {
  assert.ok(PROTOCOL >= 6);
  const input = sanitizeInput(encodeInput(5, { move: { x: 0, z: 1 }, jumpHeld: true, presses: ['jump'] }));
  assert.equal(input.jumpHeld, true);
  assert.deepEqual(input.presses, ['jump']);
  const w = createWorld();
  const f = addFighter(w, { id: 'me' });
  step(w, DT, { me: input });
  const b = bodyOf(w, 'me');
  const own = encodeOwn(f, b, w.time);
  const cloneF = createFighter({ id: 'me' });
  const cloneB = { x: 0, y: 0, z: 0, yaw: 0 };
  applyOwn(cloneF, cloneB, own);
  assert.equal(cloneB.jumpHeld, b.jumpHeld);
  assert.ok(Math.abs(cloneB.jumpBoostLeft - b.jumpBoostLeft) < 0.00001);
  assert.equal(cloneB.vy, b.vy);
});