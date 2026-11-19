import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, MODES } from '../src/components/duelist/sim/match.mjs';
import { FOOTBALL } from '../src/components/duelist/sim/football.mjs';

test('Football starts with balanced teams, bot seats and a stationary ball', () => {
  const match = createMatch({ mode: 'football', seed: 11 });
  assert.equal(match.mode, 'football');
  assert.equal(match.seats.size, MODES.football.seats);
  assert.equal(match.ball.x, 0);
  assert.equal(match.ball.z, 0);
  const red = [...match.seats.values()].filter(s => s.team === 'red').length;
  const blue = [...match.seats.values()].filter(s => s.team === 'blue').length;
  assert.equal(red, blue);
});

test('a player dribbles and power-kicks via the shared authoritative football simulation', () => {
  const m = createMatch({ mode: 'football', seed: 3, players: [{ id: 'you', name: 'You', team: 'red' }] });
  m.phase = 'live';
  const at = m.world.bodies.get('you');
  at.x = 0;
  at.z = 0;
  const r = stepMatch(m, 1 / 60, { you: { move: { x: 0, z: 1 }, face: 0, run: true, interact: true, presses: [] } });
  assert.equal(r.events.some(e => e.type === 'goal'), false);
  assert.ok(m.ball.vz > 14, 'F makes the ball move toward the opponent goal');
  assert.ok(m.ball.z > 0, 'a real ball position is simulated');
});

test('goals are authoritative, update team score and reset the ball', () => {
  const m = createMatch({ mode: 'football', seed: 8 });
  m.phase = 'live';
  m.ball.x = 0;
  m.ball.z = m.def.arena - FOOTBALL.goalInset - 0.05;
  m.ball.vz = 15;
  const { events } = stepMatch(m, 1 / 60);
  assert.equal(m.teamScores.red, 1);
  assert.equal(m.teamScores.blue, 0);
  assert.ok(events.some(e => e.type === 'goal' && e.team === 'red'));
  assert.equal(m.ball.x, 0);
  assert.equal(m.ball.z, 0);
});
