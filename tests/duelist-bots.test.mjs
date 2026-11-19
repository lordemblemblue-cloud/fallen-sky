// Practice bots play by the player's rules: they close in, strike, defend, use Telekinesis, and break out of
// a grip; they cannot exceed cooldowns or costs because they only send commands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, step, bodyOf } from '../src/components/duelist/sim/world.mjs';
import { createBot, think, BOT_LEVELS } from '../src/components/duelist/sim/bots.mjs';
import { VITALS, MOVES } from '../src/components/duelist/core/index.mjs';

const DT = 1 / 60;

test('a bot closes the distance and lands strikes on a standing target', () => {
  const w = createWorld();
  addFighter(w, { id: 'bot', x: 0, z: -8 });
  const dummy = addFighter(w, { id: 'dummy', x: 0, z: 4 });
  const bot = createBot('bot', { level: 'master', seed: 3 });
  let impacts = 0;
  for (let i = 0; i < 60 * 12; i++) {
    const effects = step(w, DT, { bot: think(w, bot) });
    impacts += effects.filter((e) => e.type === 'impact' && e.defender === 'dummy').length;
  }
  assert.ok(Math.hypot(bodyOf(w, 'bot').x - bodyOf(w, 'dummy').x, bodyOf(w, 'bot').z - bodyOf(w, 'dummy').z) < 4, 'closed in');
  assert.ok(impacts >= 3, `${impacts} hits in 12 s`);
  assert.ok(dummy.vitals.shield < VITALS.shield || dummy.vitals.will < VITALS.will);
});

test('two bots duel to a finish without breaking the rules', () => {
  const w = createWorld();
  const a = addFighter(w, { id: 'a', x: 0, z: -3 });
  const b = addFighter(w, { id: 'b', x: 0, z: 3 });
  const ba = createBot('a', { level: 'duelist', seed: 11 });
  const bb = createBot('b', { level: 'master', seed: 23 });
  const starts = { a: [], b: [] };
  for (let i = 0; i < 60 * 120 && !a.vitals.dead && !b.vitals.dead; i++) {
    const before = { a: a.action?.id, b: b.action?.id };
    step(w, DT, { a: think(w, ba), b: think(w, bb) });
    for (const [id, f] of [['a', a], ['b', b]]) if (f.action && f.action.id !== before[id] && f.action.t < DT * 1.5) starts[id].push({ id: f.action.id, at: w.time });
  }
  assert.ok(a.vitals.dead || b.vitals.dead, `someone falls within two minutes (hp ${a.vitals.hp.toFixed(0)} / ${b.vitals.hp.toFixed(0)})`);
  // no power ever started again inside its cooldown
  for (const list of Object.values(starts)) {
    for (const power of ['push', 'pull', 'grip', 'breach']) {
      const times = list.filter((s) => s.id === power).map((s) => s.at);
      for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= MOVES[power].cooldown - 1e-6, `${power} respected its cooldown`);
    }
  }
});

test('a held bot resists as soon as its Will allows', () => {
  const w = createWorld();
  addFighter(w, { id: 'p', x: 0, z: 0, yaw: 0 });
  const held = addFighter(w, { id: 'bot', x: 0, z: 5 });
  const bot = createBot('bot', { level: 'trainee' });
  step(w, DT, { p: { presses: ['grip'] } });
  let freed = false;
  for (let i = 0; i < 60; i++) {
    step(w, DT, { bot: think(w, bot) });
    if (held.heldBy === null && w.time > MOVES.grip.startup + 0.05) { freed = true; break; }
  }
  assert.ok(freed, 'broke the grip');
  assert.ok(Object.keys(BOT_LEVELS).length === 3);
});
