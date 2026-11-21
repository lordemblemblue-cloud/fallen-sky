// Server-owned air dash: two distinct Dash presses during a regular jump,
 // one 4.5 m burst per airtime, with no extra cost or double-jumping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, respawnFighter, step, bodyOf, AIR_DASH } from '../src/components/duelist/sim/world.mjs';
import { MOVES, CLASS_IDS } from '../src/components/duelist/core/index.mjs';
import { encodeOwn, applyOwn, sanitizeInput, PROTOCOL } from '../src/components/duelist/net/protocol.mjs';
import { createFighter } from '../src/components/duelist/core/fighter.mjs';

const DT = 1 / 60;
const tick = (world, presses = [], move = null) =>
  step(world, DT, { hero: { presses, ...(move ? { move } : {}) } });
const steps = (world, n) => { for (let i = 0; i < n; i++) tick(world); };
const jump = (world) => {
  tick(world, ['jump']);
  steps(world, 7);
  assert.ok(bodyOf(world, 'hero').y > AIR_DASH.minHeight);
};

test('ground Dash is still a single press and the air-only move cannot be invoked from a packet', () => {
  const ground = createWorld({ arenaRadius: 30 });
  const fighter = addFighter(ground, { id: 'hero' });
  tick(ground, ['dash'], { x: 1, z: 0 });
  assert.equal(fighter.action.id, 'dash');
  assert.equal(bodyOf(ground, 'hero').y, 0);
  assert.equal(PROTOCOL, 11);
  assert.deepEqual(sanitizeInput({ s: 1, p: ['#airDash', 'airDash', 'dash'], m: [1, 0] }).presses, ['dash']);
});

test('all four classes air dash only after two separate midair Dash presses', () => {
  for (const classId of CLASS_IDS) {
    const world = createWorld({ arenaRadius: 30 });
    const fighter = addFighter(world, { id: 'hero', classId });
    jump(world);
    const body = bodyOf(world, 'hero');
    const hp = fighter.vitals.hp;
    const willBefore = fighter.vitals.will;
    tick(world, ['dash', 'dash'], { x: 1, z: 0 });
    assert.equal(fighter.action.id, 'jump', 'duplicate presses in one tick are not a double-tap');
    assert.equal(body.airDashUsed, false);
    steps(world, 7);
    const beforeX = body.x;
    const effects = tick(world, ['dash'], { x: 1, z: 0 });
    assert.equal(fighter.action.id, 'airDash');
    assert.equal(effects.filter(e => e.type === 'airDash').length, 1);
    assert.equal(body.airDashUsed, true);
    assert.equal(fighter.vitals.hp, hp);
    assert.ok(fighter.vitals.will >= willBefore - 1e-5, 'air dash spends no Will');
    steps(world, 18);
    assert.ok(Math.abs(body.x - AIR_DASH.distance) < 0.20,
      `${classId}: burst displacement ${(body.x - beforeX).toFixed(2)} m, total ${body.x.toFixed(2)} m`);
    assert.ok(body.y > 0, 'the dash suspends flight briefly instead of landing immediately');
    assert.equal(body.airDashUsed, true);
    const extra = tick(world, ['dash', 'dash'], { x: 1, z: 0 });
    assert.equal(extra.some(e => e.type === 'airDash'), false);
    steps(world, 85);
    assert.equal(body.y, 0);
    assert.equal(body.jumped, false);
    assert.equal(body.airDashUsed, false);
    tick(world, ['jump']);
    assert.equal(fighter.action.id, 'jump', 'landing restores the next jump and its air dash');
    assert.equal(body.jumped, true);
  }
});

test('the second tap direction determines the airborne burst and a late second press does not trigger it', () => {
  const world = createWorld({ arenaRadius: 30 });
  addFighter(world, { id: 'hero' });
  jump(world);
  tick(world, ['dash'], { x: 0, z: 1 });
  steps(world, 6);
  tick(world, ['dash'], { x: -1, z: 0 });
  assert.equal(world.fighters.get('hero').action.id, 'airDash');
  steps(world, 18);
  assert.ok(bodyOf(world, 'hero').x < -4.0, 'left input moves left regardless of first tap direction');

  const late = createWorld({ arenaRadius: 30 });
  addFighter(late, { id: 'hero' });
  jump(late);
  tick(late, ['dash']);
  steps(late, 21);
  tick(late, ['dash']); // 22 frames = .367s, outside .32 window
  assert.equal(late.fighters.get('hero').action.id, 'jump');
  assert.equal(bodyOf(late, 'hero').airDashUsed, false);
});

test('prediction snapshots preserve double-tap timing and available air-dash charge', () => {
  const server = createWorld({ arenaRadius: 30 });
  const fighter = addFighter(server, { id: 'hero' });
  jump(server);
  tick(server, ['dash']);
  const original = bodyOf(server, 'hero');
  const own = JSON.parse(JSON.stringify(encodeOwn(fighter, original, server.time)));
  assert.equal(own.ad[0], 1);
  assert.equal(own.ad[1], 0);
  const mirror = createWorld({ arenaRadius: 30 });
  const copy = addFighter(mirror, { id: 'hero' });
  applyOwn(copy, bodyOf(mirror, 'hero'), own);
  mirror.time = own.at;
  assert.equal(bodyOf(mirror, 'hero').airDashTapAt, original.airDashTapAt);
  steps(server, 7);
  steps(mirror, 7);
  tick(server, ['dash'], { x: 0, z: -1 });
  tick(mirror, ['dash'], { x: 0, z: -1 });
  assert.equal(fighter.action.id, 'airDash');
  assert.equal(copy.action.id, 'airDash');
  assert.equal(bodyOf(mirror, 'hero').airDashUsed, true);
  assert.ok(Math.abs(bodyOf(server, 'hero').z - bodyOf(mirror, 'hero').z) < 0.005);
  respawnFighter(server, 'hero');
  assert.equal(bodyOf(server, 'hero').airDashUsed, false);
});
