// Duelist Adventure story missions: rooms (walls, doors, lines of sight, routes), the smugglers (no Veil,
// sidearms, alert only when they notice), the mission engine (interactions, updating objectives, wipes and
// retries, crews of up to four), and Contraband played start to finish by piloted crew members.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel, resolveCircle, clearLine, rayDistance, setDoor, nextStep } from '../src/components/duelist/sim/level.mjs';
import { createWorld, addFighter, step, bodyOf, BODY_RADIUS } from '../src/components/duelist/sim/world.mjs';
import { createEnemy, thinkEnemy, ENEMY_TYPES } from '../src/components/duelist/sim/enemies.mjs';
import { createMission, stepMission, missionView, joinMission, leaveMission, SHOOTERS_AT_ONCE, RETRY_SECONDS } from '../src/components/duelist/sim/mission.mjs';
import { createAutopilot, thinkAutopilot } from '../src/components/duelist/sim/autopilot.mjs';
import { MOVES, VITALS } from '../src/components/duelist/core/index.mjs';

const DT = 1 / 60;
const run = (world, seconds, script = () => ({})) => { const fx = []; for (let i = 0; i < Math.round(seconds / DT); i++) fx.push(...step(world, DT, script(world.time))); return fx; };
// a room 20 x 10 split by a wall at x = 0 with a door in it
const twoRooms = (open = false) => createLevel({
  walls: [{ x0: -10, x1: 10, z0: -5.3, z1: -4.7 }, { x0: -10, x1: 10, z0: 4.7, z1: 5.3 }, { x0: -10.3, x1: -9.7, z0: -5, z1: 5 }, { x0: 9.7, x1: 10.3, z0: -5, z1: 5 },
    { x0: -0.3, x1: 0.3, z0: -5, z1: -1.5 }, { x0: -0.3, x1: 0.3, z0: 1.5, z1: 5 }],
  doors: [{ id: 'mid', x0: -0.3, x1: 0.3, z0: -1.5, z1: 1.5, open }],
  nav: { nodes: { west: { x: -5, z: 0 }, doorW: { x: -1.2, z: 0 }, doorE: { x: 1.2, z: 0 }, east: { x: 5, z: 0 } },
    edges: [['west', 'doorW'], ['doorW', 'doorE', 'mid'], ['doorE', 'east']] },
});

test('rooms: bodies stop at walls, lines and shots are blocked, a door opens the way and the route', () => {
  const level = twoRooms(false);
  const body = { x: -0.5, z: 3 };
  assert.ok(resolveCircle(level, body, BODY_RADIUS));
  assert.ok(body.x <= -0.3 - BODY_RADIUS + 1e-9, 'pushed out of the wall');
  assert.equal(clearLine(level, { x: -5, z: 0 }, { x: 5, z: 0 }), false, 'the closed door blocks the line');
  assert.ok(Math.abs(rayDistance(level, { x: -5, z: 0 }, { x: 1, z: 0 }, 20) - 4.7) < 1e-6);
  assert.equal(nextStep(level, { x: -5, z: 3 }, { x: 5, z: 3 }), null, 'no way through a closed door');
  setDoor(level, 'mid', true);
  assert.equal(clearLine(level, { x: -5, z: 0 }, { x: 5, z: 0 }), true);
  const next = nextStep(level, { x: -5, z: 3 }, { x: 5, z: 3 });
  assert.ok(next && next.x < 0 && Math.abs(next.z) < 0.01, 'the route goes to the door first');
});

test('in rooms: nobody walks, dashes or strikes through a wall; a shot stops at it', () => {
  const w = createWorld({ level: twoRooms(false) });
  addFighter(w, { id: 'a', x: -3, z: 3, yaw: Math.PI / 2 });
  const b = addFighter(w, { id: 'b', x: 1.2, z: 3, yaw: -Math.PI / 2 });
  run(w, 1.5, () => ({ a: { move: { x: 1, z: 0 }, run: true, face: Math.PI / 2 } }));
  assert.ok(bodyOf(w, 'a').x <= -0.3 - BODY_RADIUS + 1e-6, 'walked into the wall and stopped');
  run(w, 0.5, (t) => (t < 1.52 ? { a: { move: { x: 1, z: 0 }, presses: ['dash'] } } : {}));
  assert.ok(bodyOf(w, 'a').x < 0, 'a dash does not pass through');
  // 1.9 m apart with the wall between: a heavy strike reaches nothing
  const fx = run(w, MOVES.swordHeavy.duration + 0.1, (t) => (t < 2.02 ? { a: { presses: ['heavy'], face: Math.PI / 2 } } : {}));
  assert.ok(!fx.some((e) => e.type === 'impact'));
  assert.equal(b.vitals.shield, VITALS.shield);
  // a sidearm shot ends at the wall
  const v = createWorld({ level: twoRooms(false) });
  addFighter(v, { id: 'g', team: 'depot', weapon: 'sidearm', x: -6, z: 0, yaw: Math.PI / 2, vitals: ENEMY_TYPES.gunner.vitals });
  const target = addFighter(v, { id: 'p', team: 'crew', x: 6, z: 0 });
  const shots = run(v, 1.2, (t) => (t < 0.02 ? { g: { presses: ['light'] } } : {}));
  assert.ok(shots.some((e) => e.type === 'projectile'), 'fired');
  assert.ok(shots.some((e) => e.type === 'projectileEnd' && e.hit === null), 'stopped by the door');
  assert.equal(target.vitals.shield, VITALS.shield);
});

test('smugglers: no Veil, a grip holds them, they act only once they notice you, and their shots drain a Veil', () => {
  const w = createWorld({ level: twoRooms(true) });
  const guard = addFighter(w, { id: 'g', team: 'depot', weapon: 'sidearm', x: 6, z: 0, yaw: Math.PI / 2, vitals: ENEMY_TYPES.gunner.vitals });
  const player = addFighter(w, { id: 'p', team: 'crew', x: -6, z: 0, yaw: Math.PI / 2 });
  assert.equal(guard.vitals.collapsed, true, 'no Will, no Veil');
  const enemy = createEnemy('g', 'gunner', { seed: 4 });
  // it faces away (east): the player behind it is not seen
  for (let i = 0; i < 60; i++) step(w, DT, { g: thinkEnemy(w, enemy, ['p']) });
  assert.equal(enemy.alerted, false);
  // turned to face the door, it sees, wakes and shoots
  bodyOf(w, 'g').yaw = -Math.PI / 2;
  let fired = 0;
  let willBefore = player.vitals.will;
  for (let i = 0; i < 60 * 8; i++) fired += step(w, DT, { g: thinkEnemy(w, enemy, ['p']) }).filter((e) => e.type === 'projectile').length;
  assert.equal(enemy.alerted, true);
  assert.ok(fired >= 2, `${fired} shots in 8 s`);
  assert.ok(player.vitals.shield < VITALS.shield || player.vitals.will < willBefore, 'the shots land on shield and Veil');
  // Telekinesis takes hold of someone with no Veil
  bodyOf(w, 'p').x = 1;
  bodyOf(w, 'g').x = 5;
  run(w, MOVES.grip.startup + 0.1, (t) => ({ p: { presses: t < w.time + 1 ? ['grip'] : [], face: Math.PI / 2 } }));
  assert.equal(guard.heldBy, 'p');
});

test('a crew of up to four; whoever leaves is gone; the mission tells the HUD what to show', () => {
  const m = createMission({ players: [{ id: 'a', name: 'Ada' }], seed: 2 });
  assert.equal(joinMission(m, { id: 'b', name: 'Ben' }).ok, true);
  joinMission(m, { id: 'c' });
  joinMission(m, { id: 'd' });
  assert.deepEqual(joinMission(m, { id: 'e' }), { ok: false, reason: 'full' });
  assert.ok(leaveMission(m, 'd'));
  assert.equal(m.seats.size, 3);
  stepMission(m, DT, {});
  const v = missionView(m, 'a');
  assert.equal(v.stage.index, 0);
  assert.match(v.stage.text, /0\/3/);
  assert.equal(v.markers.length, 3);
  assert.equal(v.comms.speaker, 'Ione');
  assert.equal(v.people.length, 3);
});

test('an objective is done by standing at it and holding the key; letting go loses the progress', () => {
  const m = createMission({ players: [{ id: 'a' }], seed: 2 });
  for (const id of [...m.enemies.keys()]) m.world.fighters.get(id).vitals.dead = true; // an empty dock for this test
  const crate = m.interactables.get('crateA');
  Object.assign(bodyOf(m.world, 'a'), { x: crate.x + 1.2, z: crate.z });
  for (let i = 0; i < 30; i++) stepMission(m, DT, { a: { interact: true } });
  assert.ok(missionView(m, 'a').prompt.progress > 0.2);
  for (let i = 0; i < 60; i++) stepMission(m, DT, { a: {} });
  assert.equal(crate.progress, 0, 'letting go resets it');
  const events = [];
  for (let i = 0; i < 60 * 2; i++) events.push(...stepMission(m, DT, { a: { interact: true } }).events);
  assert.ok(events.some((e) => e.type === 'interacted' && e.id === 'crateA'));
  assert.match(missionView(m, 'a').stage.text, /1\/3/);
});

test('only a few guards wind up a shot at once', () => {
  const m = createMission({ players: [{ id: 'a' }, { id: 'b' }], seed: 6 });
  const pilots = [createAutopilot('a', { seed: 1 }), createAutopilot('b', { seed: 2 })];
  let most = 0;
  for (let i = 0; i < 60 * 40; i++) {
    stepMission(m, DT, Object.fromEntries(pilots.map((p) => [p.id, thinkAutopilot(m, p)])));
    let n = 0;
    for (const e of m.enemies.values()) {
      const a = m.world.fighters.get(e.id)?.action;
      if (a && a.move.damageKind === 'projectile' && a.t < a.move.startup + a.move.active) n += 1;
    }
    most = Math.max(most, n);
  }
  assert.ok(most >= 1 && most <= SHOOTERS_AT_ONCE + 1, `at most ${most} at once`);
});

test('a wipe sends the crew back to the checkpoint; a room they cleared stays cleared', () => {
  const m = createMission({ players: [{ id: 'a' }], seed: 3 });
  const pilot = createAutopilot('a', { seed: 9 });
  // clear the dock
  for (let i = 0; i < 60 * 60 && [...m.enemies.values()].some((e) => !m.world.fighters.get(e.id).vitals.dead); i++) stepMission(m, DT, { a: thinkAutopilot(m, pilot) });
  assert.ok(m.flags['cleared:dock'], 'dock cleared');
  const stage = m.stageIndex;
  // then the player falls
  const f = m.world.fighters.get('a');
  f.vitals.hp = 0;
  f.vitals.dead = true;
  m.phase = 'failed';
  m.phaseUntil = m.world.time + RETRY_SECONDS;
  const events = [];
  for (let i = 0; i < 60 * (RETRY_SECONDS + 1); i++) events.push(...stepMission(m, DT, {}).events);
  assert.ok(events.some((e) => e.type === 'retry'));
  assert.equal(m.phase, 'live');
  assert.equal(m.stageIndex, stage);
  assert.equal(m.world.fighters.get('a').vitals.dead, false);
  assert.equal([...m.enemies.values()].filter((e) => e.group === 'dock' && !m.world.fighters.get(e.id)?.vitals.dead).length, 0, 'the dock stays empty');
});

test('Contraband, start to finish, by a piloted crew of two: every objective in order, and Arden yields', () => {
  const m = createMission({ players: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Ben' }], seed: 3 });
  const pilots = [createAutopilot('a', { seed: 30 }), createAutopilot('b', { seed: 31 })];
  const stages = [];
  const named = [];
  const speakers = new Set();
  let texts = [];
  for (let i = 0; i < 60 * 60 * 15 && m.phase !== 'complete'; i++) {
    const { events } = stepMission(m, DT, Object.fromEntries(pilots.map((p) => [p.id, thinkAutopilot(m, p)])));
    for (const e of events) {
      if (e.type === 'stage') { stages.push(e.index); texts.push(missionView(m, 'a').stage.title); }
      if (e.type === 'enemyDown' && e.named) named.push(e.name);
      if (e.type === 'comms') speakers.add(e.speaker);
    }
  }
  assert.equal(m.phase, 'complete', `finished (reached stage ${m.stageIndex} in ${m.world.time.toFixed(0)} s)`);
  assert.deepEqual(stages, [1, 2, 3, 4, 5, 6], 'every objective in order');
  assert.deepEqual([...new Set(texts)], ['Find who is behind it', 'Get the evidence out', 'There is someone above them', 'Arden Vale']);
  for (const who of ['Quartermaster Dask', 'Perrin, the broker', 'Chief Rooke']) assert.ok(named.includes(who), `${who} was beaten`);
  assert.equal(m.counters.cores, 3);
  for (const s of ['Ione', 'Dask', 'Perrin', 'Rooke', 'Arden (recording)', 'Arden']) assert.ok(speakers.has(s), `${s} speaks`);
  // never an execution: the teacher is alive, and out of the fight
  const arden = [...m.enemies.values()].find((e) => e.tag === 'arden');
  assert.equal(arden.yielded, true);
  assert.equal(m.world.fighters.get(arden.id).vitals.dead, false);
  assert.match(missionView(m, 'a').ending, /evidence is out/);
});
