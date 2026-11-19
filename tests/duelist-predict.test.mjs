// Prediction of the player's own fighter (src/components/duelist/net/predict.mjs) against a server that
// answers late: the browser's replay must land exactly where the server does, what only the server knows (a
// hit) must be eased into the picture, and a shown action must stay one action through every correction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, step } from '../src/components/duelist/sim/world.mjs';
import { createFighter, stagger } from '../src/components/duelist/core/index.mjs';
import { createPredictor, PREDICTION } from '../src/components/duelist/net/predict.mjs';
import { TICK_HZ, encodeInput, sanitizeInput, encodeOwn, applyOwn } from '../src/components/duelist/net/protocol.mjs';

const STEP = 1 / TICK_HZ;
const wire = (x) => JSON.parse(JSON.stringify(x)); // what crosses the network

// A player's session, tick by tick: the server uses one waiting input a tick (as server/duelist does) and
// sends the player's own state every third tick; inputs take `up` ticks to arrive, snapshots `down`.
function session({ ticks, up = 4, down = 3, script, disturb = null }) {
  const server = createWorld({ arenaRadius: 18 });
  addFighter(server, { id: 'me', team: 'a', x: 0, z: -6 });
  const sf = server.fighters.get('me');
  const sb = server.bodies.get('me');
  const predictor = createPredictor({ id: 'me', arenaRadius: 18 });
  const shown = createFighter({ id: 'me' });
  const shownBody = { x: 0, y: 0, z: -6, yaw: 0 };
  const toServer = [];
  const toClient = [];
  const waiting = [];
  let held = {};
  let usedSeq = -1;
  const serverAfter = new Map(); // input number -> the server's fighter after using it
  const clientAfter = new Map(); // input number -> the browser's fighter after playing it
  const frames = []; // what was shown each tick
  const state = (f, b, time) => ({ x: b.x, y: b.y, z: b.z, yaw: b.yaw, action: f.action ? f.action.id : null, t: f.action ? f.action.t : 0,
    stamina: f.vitals.stamina, will: f.vitals.will, guard: !!f.guard, time });
  for (let tick = 0; tick < ticks; tick++) {
    // the server's tick
    while (toServer.length && toServer[0].at <= tick) waiting.push(sanitizeInput(toServer.shift().message));
    const next = waiting.shift();
    let input;
    if (next) { const { seq, presses, ...rest } = next; held = rest; usedSeq = seq; input = { ...rest, presses }; } else input = { ...held, presses: [] };
    disturb?.(tick, server, sf, sb);
    step(server, STEP, { me: input });
    if (next) serverAfter.set(next.seq, state(sf, sb, server.time));
    if (tick % 3 === 2) toClient.push({ at: tick + down, own: wire(encodeOwn(sf, sb, server.time)), ack: usedSeq });
    // the browser's frame
    while (toClient.length && toClient[0].at <= tick) { const snap = toClient.shift(); predictor.reconcile(snap.own, snap.ack, []); }
    const message = wire(encodeInput(tick, script(tick)));
    toServer.push({ at: tick + up, message });
    predictor.advance(tick, sanitizeInput(message), []);
    if (predictor.active) {
      clientAfter.set(tick, state(predictor.fighter, predictor.body, predictor.world.time));
      predictor.present(shown, shownBody, predictor.world.time - 0.1, STEP);
      frames.push({ tick, x: shownBody.x, z: shownBody.z, action: shown.action, stats: predictor.stats() });
    }
  }
  return { serverAfter, clientAfter, frames, predictor };
}

// a player who keeps changing their mind: moving, sprinting, striking, rolling, pushing, guarding, gripping
function restless(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let move = { x: 0, z: 1 };
  let sprint = false;
  let face = null;
  let until = 0;
  let guard = false;
  let chain = -1;
  return (tick) => {
    const presses = [];
    if (tick === chain) presses.push('light');
    if (tick >= until) {
      const a = rnd() * Math.PI * 2;
      move = rnd() < 0.15 ? { x: 0, z: 0 } : { x: Math.sin(a), z: Math.cos(a) };
      sprint = rnd() < 0.3;
      face = rnd() < 0.5 ? a : null;
      until = tick + 15 + Math.floor(rnd() * 40);
      const p = rnd();
      if (p < 0.2) { presses.push('light'); if (rnd() < 0.6) chain = tick + 14; }
      else if (p < 0.3) presses.push('heavy');
      else if (p < 0.42) presses.push('roll');
      else if (p < 0.52) presses.push('push');
      else if (p < 0.58) presses.push('dash');
      else if (p < 0.66) { presses.push(guard ? 'blockUp' : 'blockDown'); guard = !guard; }
      else if (p < 0.72) presses.push('grip');
      else if (p < 0.78) presses.push('release');
      else if (p < 0.84) presses.push('pull');
    }
    const moving = Math.hypot(move.x, move.z) > 0.01;
    return { move, run: true, sprint, face: face ?? (moving ? Math.atan2(move.x, move.z) : null), strafe: false, presses };
  };
}

test('own state crosses the wire whole: a fighter rebuilt from it carries on exactly like the original', () => {
  const world = createWorld({ arenaRadius: 18 });
  addFighter(world, { id: 'a', x: 1, z: 2 });
  const script = restless(11);
  for (let tick = 0; tick < 500; tick++) step(world, STEP, { a: sanitizeInput(wire(encodeInput(tick, script(tick)))) });
  const copy = createWorld({ arenaRadius: 18 });
  addFighter(copy, { id: 'a' });
  applyOwn(copy.fighters.get('a'), copy.bodies.get('a'), wire(encodeOwn(world.fighters.get('a'), world.bodies.get('a'), world.time)));
  copy.time = world.time;
  for (let tick = 500; tick < 900; tick++) {
    const input = sanitizeInput(wire(encodeInput(tick, script(tick))));
    step(world, STEP, { a: input });
    step(copy, STEP, { a: { ...input, presses: [...input.presses] } });
    const [f, g] = [world.fighters.get('a'), copy.fighters.get('a')];
    const [b, c] = [world.bodies.get('a'), copy.bodies.get('a')];
    assert.equal(g.action?.id ?? null, f.action?.id ?? null, `the same action at tick ${tick}`);
    assert.ok(Math.hypot(b.x - c.x, b.z - c.z) < 1e-4, `the same place at tick ${tick}`);
    assert.ok(Math.abs(f.vitals.stamina - g.vitals.stamina) < 1e-3 && Math.abs(f.vitals.will - g.vitals.will) < 1e-3, `the same reserves at tick ${tick}`);
  }
});

test('the browser plays each input at once and lands exactly where the server lands seven ticks later', () => {
  const { serverAfter, clientAfter, predictor } = session({ ticks: 1500, up: 4, down: 3, script: restless(7) });
  let compared = 0;
  let actions = 0;
  for (const [seq, mine] of clientAfter) {
    const theirs = serverAfter.get(seq);
    if (!theirs) continue; // still on its way when the session ended
    // The first inputs are still on their way while the server already ticks: until it has used one, its
    // clock runs ahead of the replay's count (the same as a tick with no input waiting). It settles at once.
    if (seq < 30) continue;
    compared += 1;
    if (mine.action) actions += 1;
    assert.ok(Math.hypot(mine.x - theirs.x, mine.z - theirs.z) < 1e-4, `input ${seq}: ${Math.hypot(mine.x - theirs.x, mine.z - theirs.z)} m apart`);
    assert.equal(mine.action, theirs.action, `input ${seq}: the same action`);
    assert.ok(Math.abs(mine.t - theirs.t) < 1e-9, `input ${seq}: at the same moment of it`);
    assert.equal(mine.guard, theirs.guard, `input ${seq}: the same guard`);
    assert.ok(Math.abs(mine.time - theirs.time) < 1e-9, `input ${seq}: the same clock`);
    assert.ok(Math.abs(mine.stamina - theirs.stamina) < 1e-3 && Math.abs(mine.will - theirs.will) < 1e-3, `input ${seq}: the same reserves`);
  }
  assert.ok(compared > 1400, `${compared} inputs compared`);
  assert.ok(actions > 250, `${actions} of them in the middle of a strike, a power or a roll`);
  const stats = predictor.stats();
  assert.ok(stats.pending >= 6 && stats.pending <= 9, `${stats.pending} inputs ahead of the server`);
  assert.ok(stats.correction < 1e-4, 'nothing to correct when both follow the same rules');
});

test('what only the server knows (a hit) reaches the picture eased, and the two agree again', () => {
  const forward = () => ({ move: { x: 0, z: 1 }, run: true, face: 0, presses: [] });
  // at tick 120 the server's fighter is struck: staggered and knocked back
  const disturb = (tick, world, f, b) => { if (tick === 120) { stagger(f, 0.5, world.time); b.kz = -9; } };
  const { serverAfter, clientAfter, frames } = session({ ticks: 400, up: 4, down: 3, script: forward, disturb });
  // the browser could not know: for a few ticks it walks on while the server's fighter reels
  const apart = (seq) => Math.hypot(clientAfter.get(seq).x - serverAfter.get(seq).x, clientAfter.get(seq).z - serverAfter.get(seq).z);
  assert.ok(apart(121) > 0.2, `apart by ${apart(121).toFixed(2)} m right after the hit`);
  for (let seq = 150; seq < 380; seq++) assert.ok(apart(seq) < 1e-4, `in agreement again at input ${seq}`);
  // the picture: one large correction, shown as a slide rather than a jump
  const largest = Math.max(...frames.map((f) => f.stats.correction));
  assert.ok(largest > 0.4, `a correction of ${largest.toFixed(2)} m`);
  let jump = 0;
  for (let i = 1; i < frames.length; i++) jump = Math.max(jump, Math.hypot(frames[i].x - frames[i - 1].x, frames[i].z - frames[i - 1].z));
  assert.ok(jump < largest * 0.45, `the largest step shown in one frame is ${jump.toFixed(2)} m of a ${largest.toFixed(2)} m correction`);
  assert.ok(frames[frames.length - 1].stats.easing < 0.01, 'and the easing has run out');
});

test('a shown action stays one action through every correction; the next one is a new action', () => {
  const script = (tick) => ({ move: { x: 0, z: 0 }, run: true, face: 0, presses: tick === 40 || tick === 54 || tick === 140 ? ['light'] : [] });
  const { frames } = session({ ticks: 240, up: 5, down: 4, script });
  const seen = [];
  for (const f of frames) if (f.action && !seen.includes(f.action)) seen.push(f.action);
  assert.deepEqual(seen.map((a) => a.id), ['swordLight1', 'swordLight2', 'swordLight1'], 'two strikes of a chain, then a fresh one: three actions, three objects');
  // it shows in the frame of the press, not when the server gets to it
  assert.equal(frames.find((f) => f.action)?.tick, 40);
  assert.ok(PREDICTION.sameActionSeconds < 0.2);
});
