// Duelist Adventure arena simulation: reach and arcs, roll and lunge root motion, knockback from Telekinesis,
// the grip holding a body in the air and throwing it, arrows in flight, teams, and the arena's edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, step, bodyOf, BODY_RADIUS, GRIP_HOLD, PROJECTILE_SPEED } from '../src/components/duelist/sim/world.mjs';
import { MOVES, VITALS, KNOCKDOWN, travelAt, blockedReason, isInvulnerable } from '../src/components/duelist/core/index.mjs';

const DT = 1 / 60;
// run the world; `script(t)` returns the inputs for that step
function run(world, seconds, script = () => ({})) {
  const effects = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) effects.push(...step(world, DT, script(world.time)));
  return effects;
}
const once = (id, command) => { let sent = false; return () => (sent ? {} : (sent = true, { [id]: { presses: [command] } })); };
const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

test('a sword strike reaches a duelist in front and in range, not one behind or too far', () => {
  const w = createWorld();
  const a = addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  const front = addFighter(w, { id: 'front', x: 0, z: 1.8 });
  const behind = addFighter(w, { id: 'behind', x: 0, z: -1.5 });
  const far = addFighter(w, { id: 'far', x: 0.3, z: 6 });
  const effects = run(w, MOVES.swordLight1.duration + 0.05, once('a', 'light'));
  const impacts = effects.filter((e) => e.type === 'impact');
  assert.deepEqual(impacts.map((e) => e.defender), ['front']);
  assert.ok(front.vitals.will < VITALS.will || front.vitals.shield < VITALS.shield, 'its protection took the hit');
  assert.equal(behind.vitals.shield, VITALS.shield);
  assert.equal(far.vitals.shield, VITALS.shield);
  assert.equal(a.vitals.stamina, VITALS.stamina, 'a sword strike no longer costs stamina');
});

test('a roll carries the body its full distance in the stick direction; a heavy strike lunges as its clip does', () => {
  const w = createWorld();
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  let sent = false;
  run(w, MOVES.roll.duration + 0.1, () => (sent ? {} : (sent = true, { a: { move: { x: 1, z: 0 }, presses: ['roll'] } })));
  const b = bodyOf(w, 'a');
  assert.ok(Math.abs(b.x - MOVES.roll.rootMotion) < 0.25 && Math.abs(b.z) < 0.05, `rolled to ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`);
  const v = createWorld();
  addFighter(v, { id: 'h', x: 0, z: 0, yaw: 0 });
  run(v, MOVES.swordHeavy.duration + 0.1, once('h', 'heavy'));
  const clipLunge = travelAt('swordHeavy', MOVES.swordHeavy.duration).forward;
  assert.ok(clipLunge > 0.8, `the heavy's clip lunges ${clipLunge.toFixed(2)} m`);
  const h = bodyOf(v, 'h');
  assert.ok(Math.abs(h.z - clipLunge) < 0.05 && Math.abs(h.x) < 0.15, `lunged ${h.z.toFixed(2)} m (x ${h.x.toFixed(2)})`);
});

test('push throws everyone in its cone back; pull drags the nearest one in', () => {
  const w = createWorld();
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  addFighter(w, { id: 'b', x: -0.6, z: 4 });
  addFighter(w, { id: 'c', x: 0.6, z: 5 });
  run(w, 1.2, once('a', 'push'));
  assert.ok(bodyOf(w, 'b').z > 5 && bodyOf(w, 'c').z > 6, `pushed to ${bodyOf(w, 'b').z.toFixed(1)} and ${bodyOf(w, 'c').z.toFixed(1)}`);
  const v = createWorld();
  addFighter(v, { id: 'a', x: 0, z: 0, yaw: 0 });
  addFighter(v, { id: 'near', x: 0, z: 7 });
  addFighter(v, { id: 'farther', x: 0.4, z: 10 });
  run(v, 1.2, once('a', 'pull'));
  assert.ok(bodyOf(v, 'near').z < 5, `pulled to ${bodyOf(v, 'near').z.toFixed(1)}`);
  assert.ok(Math.abs(bodyOf(v, 'farther').z - 10) < 0.05, 'pull takes one');
});

test('the grip lifts its target in front of the holder, crushes it, and throws it on release', () => {
  const w = createWorld();
  const a = addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  const b = addFighter(w, { id: 'b', x: 0, z: 6 });
  b.vitals.shield = 0; b.vitals.will = 0; b.vitals.collapsed = true; b.vitals.collapsedAt = 0;
  run(w, 0.5, once('a', 'grip'));
  assert.equal(b.heldBy, 'a');
  const held = bodyOf(w, 'b');
  assert.ok(Math.abs(held.z - GRIP_HOLD.distance) < 0.05 && held.y > 0.5, `hangs at ${held.z.toFixed(2)} m, ${held.y.toFixed(2)} m up`);
  const hp = b.vitals.hp;
  run(w, 0.4);
  assert.ok(b.vitals.hp < hp, 'crushed while held');
  const effects = run(w, 1, once('a', 'release'));
  assert.equal(b.heldBy, null);
  assert.ok(effects.some((e) => e.type === 'impact' && e.move === 'gripThrow'), 'thrown');
  assert.ok(bodyOf(w, 'b').z > GRIP_HOLD.distance + 2 && bodyOf(w, 'b').y === 0, `landed at ${bodyOf(w, 'b').z.toFixed(1)} m`);
  assert.ok(a.vitals.will < VITALS.will - MOVES.grip.will);
});

test('arrows fly at their speed and hit the first body on their line; sniper shots break shields', () => {
  const w = createWorld({ arenaRadius: 40 });
  addFighter(w, { id: 'archer', weapon: 'bow', x: 0, z: -15, yaw: 0 });
  const first = addFighter(w, { id: 'first', x: 0.2, z: 5 });
  const second = addFighter(w, { id: 'second', x: 0, z: 15 });
  const effects = run(w, MOVES.bowShot.startup + 0.05 + 20 / PROJECTILE_SPEED.bowShot + 0.05, once('archer', 'light'));
  const end = effects.find((e) => e.type === 'projectileEnd');
  assert.equal(end?.hit, 'first');
  assert.ok(first.vitals.shield < VITALS.shield && second.vitals.shield === VITALS.shield);
  const v = createWorld({ arenaRadius: 60 });
  addFighter(v, { id: 's', weapon: 'bow', x: 0, z: -30, yaw: 0 });
  const t = addFighter(v, { id: 't', x: 0, z: 30 });
  run(v, MOVES.sniperShot.startup + 0.2 + 60 / PROJECTILE_SPEED.sniperShot, once('s', 'heavy'));
  assert.equal(t.vitals.shield, 0, 'a sniper shot takes the whole shield');
});

test('teammates are never hit; bodies keep apart; nobody leaves the arena', () => {
  const w = createWorld({ arenaRadius: 6 });
  addFighter(w, { id: 'a', team: 'red', x: 0, z: 0, yaw: 0 });
  const mate = addFighter(w, { id: 'mate', team: 'red', x: 0, z: 1.6 });
  run(w, 0.6, once('a', 'heavy'));
  assert.equal(mate.vitals.shield, VITALS.shield);
  const b = bodyOf(w, 'mate');
  assert.ok(Math.hypot(b.x - bodyOf(w, 'a').x, b.z - bodyOf(w, 'a').z) >= BODY_RADIUS * 2 - 1e-6);
  run(w, 3, () => ({ a: { move: { x: 0, z: 1 }, sprint: true }, mate: { move: { x: 0, z: 1 }, run: true } }));
  for (const id of ['a', 'mate']) assert.ok(Math.hypot(bodyOf(w, id).x, bodyOf(w, id).z) <= 6 - BODY_RADIUS + 1e-6, `${id} stays inside`);
});

test('a strike tracks the new aim while moving, with a rate limit during its active frames', () => {
  const w = createWorld();
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  addFighter(w, { id: 't', x: 3, z: 0 });
  const target = facing(bodyOf(w, 'a'), bodyOf(w, 't'));
  step(w, DT, { a: { face: target } });
  assert.ok(Math.abs(bodyOf(w, 'a').yaw - target) < 1e-9, 'free facing before the swing');
  step(w, DT, { a: { presses: ['heavy'] } });
  run(w, MOVES.swordHeavy.startup + 0.02, () => ({ a: { face: target } }));
  step(w, DT, { a: { face: 0, move: { x: -1, z: 0 }, run: true } });
  const turned = bodyOf(w, 'a').yaw;
  assert.ok(turned < target && turned > target - 12 * DT - 1e-9,
    'the attacking body starts following camera aim but cannot snap its hit arc 180 degrees');
  run(w, 0.13, () => ({ a: { face: 0, move: { x: -1, z: 0 }, run: true } }));
  assert.ok(bodyOf(w, 'a').yaw < turned, 'the ongoing strike keeps aiming while the feet strafe');
});

test('a committed roll still retains its travel heading despite changes to the camera aim', () => {
  const w = createWorld({ arenaRadius: 40 });
  addFighter(w, { id: 'a', yaw: 0 });
  step(w, DT, { a: { presses: ['roll'], move: { x: 1, z: 0 }, face: Math.PI / 2 } });
  const started = bodyOf(w, 'a').yaw;
  run(w, 0.25, () => ({ a: { face: 0, move: { x: 0, z: 1 } } }));
  assert.ok(Math.abs(bodyOf(w, 'a').yaw - started) < 1e-6,
    'roll still faces the original movement direction rather than snapping to aim');
});

test('a hard push knocks the body down: nothing reaches it and it cannot act until it stands again', () => {
  const w = createWorld();
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  const b = addFighter(w, { id: 'b', x: 0, z: 2, yaw: Math.PI });
  const effects = run(w, MOVES.push.startup + MOVES.push.active + 0.05, once('a', 'push'));
  assert.ok(effects.some((e) => e.type === 'knockdown' && e.defender === 'b'), 'knocked down');
  assert.equal(blockedReason(b, 'swordLight1', w.time), 'down');
  assert.equal(isInvulnerable(b, w.time), true);
  // a strike on the fallen body is evaded
  const lying = bodyOf(w, 'b');
  addFighter(w, { id: 'c', x: lying.x, z: lying.z - 1.6, yaw: 0 });
  const later = run(w, MOVES.swordLight1.duration, once('c', 'light'));
  assert.ok(!later.some((e) => e.type === 'impact' && e.defender === 'b'), 'no hits on a fallen fighter');
  run(w, KNOCKDOWN.lie + KNOCKDOWN.rise);
  assert.equal(blockedReason(b, 'swordLight1', w.time), null, 'stands and fights again');
  assert.equal(isInvulnerable(b, w.time), false);
});

test('a pull drags the target into reach on its feet: no knockdown', () => {
  const w = createWorld();
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  const b = addFighter(w, { id: 'b', x: 0, z: 7, yaw: Math.PI });
  const effects = run(w, MOVES.pull.duration, once('a', 'pull'));
  assert.ok(effects.some((e) => e.type === 'knockback' && e.defender === 'b'), 'pulled');
  assert.ok(!effects.some((e) => e.type === 'knockdown'), 'not knocked down');
  assert.notEqual(blockedReason(b, 'swordLight1', w.time + 1), 'down');
});
