// Pure rule checks: no authored map or character assets are needed to verify
// capture/contest scoring and the 100% win condition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL, makeControlPoints, stepControlPoints, controlPointView } from '../src/components/duelist/sim/control.mjs';
import { createMatch, stepMatch, matchView } from '../src/components/duelist/sim/match.mjs';

function arena() {
  const match = createMatch({
    mode: 'control', seed: 72,
    players: [{ id: 'red-player', name: 'Red', team: 'red' }, { id: 'blue-player', name: 'Blue', team: 'blue' }],
  });
  match.phase = 'live';
  // Keep all other fighters out of every capture zone, so individual occupancy
  // is deterministic and independent of AI behavior.
  for (const body of match.world.bodies.values()) { body.x = 0; body.z = 0; }
  return match;
}

function put(match, id, pointId) {
  const p = match.controlPoints.find(point => point.id === pointId);
  assert.ok(p);
  const body = match.world.bodies.get(id);
  body.x = p.x;
  body.z = p.z;
  body.y = p.y ?? 0;
}

test('Three-Point Control initializes three neutral points and a 100% objective', () => {
  const match = arena();
  assert.equal(match.def.scoreToWin, 100);
  assert.equal(match.capacity, 8);
  assert.deepEqual(match.controlPoints.map(point => point.id), ['A', 'B', 'C']);
  assert.ok(match.controlPoints.every(point => point.owner === null));
  assert.deepEqual(match.teamScores, { red: 0, blue: 0 });
  assert.ok(match.controlPoints.every(point => Math.hypot(point.x, point.z) < match.def.arena));
});

test('uncontested occupation captures a point, but one point earns no score', () => {
  const m = arena();
  put(m, 'red-player', 'A');
  stepControlPoints(m, CONTROL.captureSeconds / 2);
  assert.equal(m.controlPoints[0].owner, null);
  assert.equal(m.controlPoints[0].capturing, 'red');
  assert.equal(controlPointView(m.controlPoints)[0].progress, 0.5);
  stepControlPoints(m, CONTROL.captureSeconds / 2);
  assert.equal(m.controlPoints[0].owner, 'red');
  assert.equal(m.teamScores.red, 0);
  assert.equal(m.events[0].type, 'pointCaptured');
  stepControlPoints(m, 5);
  assert.equal(m.teamScores.red, 0, 'holding one point never scores');
});

test('contested points pause capture and cannot flip ownership', () => {
  const m = arena();
  put(m, 'red-player', 'A');
  stepControlPoints(m, 2);
  put(m, 'blue-player', 'A');
  stepControlPoints(m, 8);
  assert.equal(m.controlPoints[0].contested, true);
  assert.equal(m.controlPoints[0].progress, 2, 'contested progress is frozen');
  assert.equal(m.controlPoints[0].owner, null);
  // Once red leaves, the blue team must perform a complete capture.
  m.world.bodies.get('red-player').x = 0;
  m.world.bodies.get('red-player').z = 0;
  stepControlPoints(m, 3.99);
  assert.equal(m.controlPoints[0].owner, null);
  stepControlPoints(m, 0.02);
  assert.equal(m.controlPoints[0].owner, 'blue');
});

test('ownership persists after leaving, and an attacker needs four seconds to take it', () => {
  const m = arena();
  put(m, 'red-player', 'C');
  stepControlPoints(m, CONTROL.captureSeconds);
  assert.equal(m.controlPoints[2].owner, 'red');
  m.world.bodies.get('red-player').x = 0;
  m.world.bodies.get('red-player').z = 0;
  stepControlPoints(m, 10);
  assert.equal(m.controlPoints[2].owner, 'red', 'a captured point stays owned while empty');
  put(m, 'blue-player', 'C');
  stepControlPoints(m, 3);
  assert.equal(m.controlPoints[2].owner, 'red');
  stepControlPoints(m, 1);
  assert.equal(m.controlPoints[2].owner, 'blue');
});

test('dead players do not capture objectives', () => {
  const m = arena();
  put(m, 'red-player', 'A');
  m.world.fighters.get('red-player').vitals.dead = true;
  stepControlPoints(m, 10);
  assert.equal(m.controlPoints[0].owner, null);
});

test('exactly two points award 1% per second; three award 2%, clamped at 100%', () => {
  const m = arena();
  m.controlPoints[0].owner = 'red';
  m.controlPoints[1].owner = 'red';
  stepControlPoints(m, 3);
  assert.equal(m.teamScores.red, 3);
  assert.equal(m.teamScores.blue, 0);
  m.controlPoints[2].owner = 'red';
  stepControlPoints(m, 3);
  assert.equal(m.teamScores.red, 9, 'all three award 2 per second');
  m.teamScores.red = 99.99;
  stepMatch(m, 1 / 60, {});
  assert.equal(m.teamScores.red, 100);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, 'red');
  const view = matchView(m, 'red-player');
  assert.equal(view.controlPoints.length, 3);
  assert.equal(view.teamScores.red, 100);
  assert.equal(view.scoreToWin, 100);
});

test('map authors can replace all three positions without touching match logic', () => {
  const custom = [{ x: -6, z: -5 }, { x: 1, z: 7 }, { x: 7, z: -4 }];
  const m = createMatch({ mode: 'control', seed: 6, controlLayout: custom });
  assert.deepEqual(m.controlPoints.map(point => [point.x, point.z]), custom.map(point => [point.x, point.z]));
  assert.deepEqual(makeControlPoints(m.def.arena, [{ x: Infinity, z: 0 }, custom[1], custom[2]])[1].x, 1);
});
