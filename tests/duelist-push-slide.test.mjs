// The push (owner, 2026-11-22; work package WP-DA-05): a harder hit (6.5 m, was 4.5), and the body it knocks down
// slides along the floor instead of hopping (sim/world.mjs SLIDE_DECAY). Other knockbacks keep their travel. The
// slide rides the player's own state, so client prediction slides the same way the server does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, step, bodyOf, SLIDE_DECAY, KNOCKBACK_DECAY } from '../src/components/duelist/sim/world.mjs';
import { MOVES, KNOCKDOWN, createFighter } from '../src/components/duelist/core/index.mjs';
import { encodeOwn, applyOwn } from '../src/components/duelist/net/protocol.mjs';

const DT = 1 / 60;
function pushed(command = 'push', gap = 2) {
  const w = createWorld({ arenaRadius: 40 });
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  const b = addFighter(w, { id: 'b', x: 0, z: gap, yaw: Math.PI });
  const track = []; // [time, z, y]
  const effects = [];
  let sent = false;
  for (let t = 0; t < 2.4; t += DT) {
    effects.push(...step(w, DT, sent ? {} : (sent = true, { a: { presses: [command] } })));
    const body = bodyOf(w, 'b');
    track.push([w.time, body.z, body.y]);
  }
  return { w, b, track, effects };
}

test('a push knocks the body down and slides it 6.5 m along the floor, never lifting it', () => {
  assert.equal(MOVES.push.knockback, 6.5);
  assert.ok(SLIDE_DECAY < KNOCKBACK_DECAY, 'a slide eases off more slowly than a knock');
  const { track, effects } = pushed();
  const slide = effects.find((e) => e.type === 'slide');
  assert.ok(slide && slide.target === 'b' && slide.by === 'a', 'a slide effect for the picture and the sound');
  assert.ok(Math.abs(slide.seconds - KNOCKDOWN.lie) < 1e-6, `it slides while it lies there (${slide.seconds} s)`);
  assert.ok(effects.some((e) => e.type === 'knockdown' && e.defender === 'b'), 'knocked down');
  assert.equal(Math.max(...track.map(([, , y]) => y)), 0, 'on the floor throughout: no hop');
  const end = track.at(-1)[1];
  assert.ok(Math.abs(end - 2 - 6.5) < 0.35, `slid ${(end - 2).toFixed(2)} m`);
  // still sliding well after the hit: a knock's travel is all but over within 0.3 s, a slide's is not
  const hitAt = track.find(([, z]) => z > 2.01)[0];
  const at = (t) => track.find(([time]) => time >= t)[1];
  const share = (at(hitAt + 0.3) - 2) / (end - 2);
  assert.ok(share > 0.5 && share < 0.8, `${Math.round(share * 100)}% of the way after 0.3 s`);
});

test('other knockbacks keep their travel: a pull still drags its target in at the old rate, with no slide', () => {
  const w = createWorld({ arenaRadius: 40 });
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  addFighter(w, { id: 'b', x: 0, z: 7, yaw: Math.PI });
  let sent = false;
  const effects = [];
  for (let t = 0; t < 1.2; t += DT) effects.push(...step(w, DT, sent ? {} : (sent = true, { a: { presses: ['pull'] } })));
  assert.ok(!effects.some((e) => e.type === 'slide'), 'no slide');
  assert.equal(bodyOf(w, 'b').slideUntil, -Infinity);
  assert.ok(bodyOf(w, 'b').z < 5, `pulled to ${bodyOf(w, 'b').z.toFixed(2)}`);
});

test("the slide rides the player's own state, so prediction eases it off the same way", () => {
  const { w } = pushed();
  const sliding = createWorld({ arenaRadius: 40 });
  const f = addFighter(sliding, { id: 'p', x: 0, z: 0 });
  const body = bodyOf(sliding, 'p');
  body.kx = 0; body.kz = 20; body.slideUntil = 3.25;
  const data = JSON.parse(JSON.stringify(encodeOwn(f, body, sliding.time)));
  const copy = { ...bodyOf(w, 'b'), slideUntil: -Infinity };
  applyOwn(createFighter({ id: 'p' }), copy, data);
  assert.equal(copy.slideUntil, 3.25);
  body.slideUntil = -Infinity;
  const still = JSON.parse(JSON.stringify(encodeOwn(f, body, sliding.time)));
  const copy2 = { ...bodyOf(w, 'b'), slideUntil: 9 };
  applyOwn(createFighter({ id: 'p' }), copy2, still);
  assert.equal(copy2.slideUntil, -Infinity);
});
