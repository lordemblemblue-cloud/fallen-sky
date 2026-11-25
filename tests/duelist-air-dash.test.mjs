// Server-owned movement in the air (owner, 2026-11-22): a jump, then Dash dashes (one per jump, as far as a roll),
// then Jump jumps again (as high as the first) and gives another dash: jump, dash, jump, dash. No extra cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, respawnFighter, step, bodyOf, AIR_DASH } from '../src/components/duelist/sim/world.mjs';
import { CLASS_IDS } from '../src/components/duelist/core/index.mjs';
import { encodeOwn, applyOwn, sanitizeInput, PROTOCOL } from '../src/components/duelist/net/protocol.mjs';

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
  assert.equal(PROTOCOL, 17);
  assert.deepEqual(sanitizeInput({ s: 1, p: ['#airDash', 'airDash', 'dash'], m: [1, 0] }).presses, ['dash']);
});

test('all four classes: one press dashes in the air, as far as a roll, once for the jump, at no cost', () => {
  for (const classId of CLASS_IDS) {
    const world = createWorld({ arenaRadius: 30 });
    const fighter = addFighter(world, { id: 'hero', classId });
    jump(world);
    const body = bodyOf(world, 'hero');
    const { hp, will, stamina } = fighter.vitals;
    const beforeX = body.x;
    const effects = tick(world, ['dash'], { x: 1, z: 0 });
    assert.equal(fighter.action.id, 'airDash', `${classId}: one press`);
    assert.equal(effects.filter((e) => e.type === 'airDash').length, 1);
    assert.equal(body.airDashReady, false);
    assert.equal(fighter.vitals.hp, hp);
    assert.ok(fighter.vitals.will >= will - 1e-5 && fighter.vitals.stamina >= stamina - 1e-5, 'no Will, no stamina');
    steps(world, 18);
    assert.ok(Math.abs(body.x - beforeX - AIR_DASH.distance) < 0.25, `${classId}: ${(body.x - beforeX).toFixed(2)} m`);
    assert.ok(body.y > 0, 'it hangs through the burst instead of dropping');
    const extra = tick(world, ['dash'], { x: 1, z: 0 });
    assert.equal(extra.some((e) => e.type === 'airDash'), false, 'one dash for the jump');
    steps(world, 120);
    assert.equal(body.y, 0);
    assert.equal(body.jumped, false);
    assert.equal(body.airDashReady, false);
    tick(world, ['jump']);
    assert.equal(fighter.action.id, 'jump', 'landing restores the jump');
    assert.equal(body.airDashReady, true, 'and its dash');
  }
});

test('jump, dash, jump again, dash again: the second jump is as high as the first and gives a second dash', () => {
  const world = createWorld({ arenaRadius: 40 });
  addFighter(world, { id: 'hero', classId: 'duelist', weapon: 'dualBlades' });
  const body = bodyOf(world, 'hero');
  const presses = { dash: 0, airJump: 0 };
  const count = (effects) => { for (const e of effects) { if (e.type === 'airDash') presses.dash++; if (e.type === 'airJump') presses.airJump++; } };
  count(tick(world, ['jump']));
  steps(world, 10);
  count(tick(world, ['dash'], { x: 1, z: 0 }));
  steps(world, 18);
  const lowBeforeSecond = body.y;
  count(tick(world, ['jump']));
  let peak = 0;
  for (let i = 0; i < 40; i++) { tick(world); peak = Math.max(peak, body.y); }
  assert.ok(peak - lowBeforeSecond > 2.2, `the second jump rises again (${(peak - lowBeforeSecond).toFixed(2)} m)`);
  count(tick(world, ['dash'], { x: 0, z: 1 }));
  steps(world, 18);
  count(tick(world, ['dash'], { x: 0, z: 1 }));
  count(tick(world, ['jump']));
  assert.deepEqual(presses, { dash: 2, airJump: 1 }, 'two dashes, one second jump, nothing more');
  assert.ok(body.x > 6 && body.z > 6, `both dashes carried the body (${body.x.toFixed(1)}, ${body.z.toFixed(1)})`);
  for (let i = 0; i < 300 && body.y > 0; i++) tick(world);
  assert.equal(body.y, 0, 'down again');
});

test('the dash goes the way the stick points at the press', () => {
  const world = createWorld({ arenaRadius: 30 });
  addFighter(world, { id: 'hero' });
  jump(world);
  tick(world, ['dash'], { x: -1, z: 0 });
  assert.equal(world.fighters.get('hero').action.id, 'airDash');
  steps(world, 18);
  assert.ok(bodyOf(world, 'hero').x < -6, `left (${bodyOf(world, 'hero').x.toFixed(2)})`);
});

test('prediction snapshots carry the jump and the dash it has left', () => {
  const server = createWorld({ arenaRadius: 30 });
  const fighter = addFighter(server, { id: 'hero' });
  jump(server);
  const original = bodyOf(server, 'hero');
  const own = JSON.parse(JSON.stringify(encodeOwn(fighter, original, server.time)));
  assert.equal(own.ad[0], 1);
  assert.equal(own.ad[1], 1);
  const mirror = createWorld({ arenaRadius: 30 });
  const copy = addFighter(mirror, { id: 'hero' });
  applyOwn(copy, bodyOf(mirror, 'hero'), own);
  mirror.time = own.at;
  assert.equal(bodyOf(mirror, 'hero').airDashReady, true);
  tick(server, ['dash'], { x: 0, z: -1 });
  tick(mirror, ['dash'], { x: 0, z: -1 });
  assert.equal(fighter.action.id, 'airDash');
  assert.equal(copy.action.id, 'airDash');
  assert.equal(bodyOf(mirror, 'hero').airDashReady, false);
  steps(server, 7);
  steps(mirror, 7);
  assert.ok(Math.abs(bodyOf(server, 'hero').z - bodyOf(mirror, 'hero').z) < 0.005);
  respawnFighter(server, 'hero');
  assert.equal(bodyOf(server, 'hero').airDashReady, false);
});
