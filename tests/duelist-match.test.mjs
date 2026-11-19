// Duelist Adventure matches: duel rounds, free for all and team deathmatch scoring, respawns with spawn
// protection, capture the flag (taking, carrying, dropping, returning, capturing), and seats (a player takes
// a bot's place; a bot takes a leaving player's).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, joinMatch, leaveMatch, matchView, MODES, CTF, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';
import { bodyOf } from '../src/components/duelist/sim/world.mjs';
import { isInvulnerable, knockDown } from '../src/components/duelist/core/index.mjs';

const DT = 1 / 60;
function play(match, seconds, inputs = () => ({}), until = null) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const out = stepMatch(match, DT, inputs(match));
    events.push(...out.events);
    if (until && until(match, out)) break;
  }
  return events;
}

test('a duel between two bots is fought in rounds until one has three', () => {
  const m = createMatch({ mode: 'duel', seed: 5, botLevel: 'master' });
  assert.equal(m.seats.size, 2);
  assert.equal(matchView(m).phase, 'countdown');
  const events = play(m, 900, undefined, (x) => x.phase === 'over');
  assert.equal(m.phase, 'over', 'the duel ends');
  assert.equal(m.roundWins[m.winner], MODES.duel.rounds);
  assert.ok(events.filter((e) => e.type === 'roundOver').length >= 3);
});

test('free for all: defeats score, the fallen come back after the delay, protected as they arrive', () => {
  const m = createMatch({ mode: 'ffa', seed: 9, botLevel: 'master' });
  assert.equal(m.seats.size, MODES.ffa.seats);
  let protectedOnArrival = 0;
  let respawns = 0;
  play(m, 120, () => ({}), (x, out) => {
    for (const e of out.events) {
      if (e.type !== 'respawn') continue;
      respawns += 1;
      if (isInvulnerable(x.world.fighters.get(e.id), x.world.time)) protectedOnArrival += 1;
    }
    return false;
  });
  const total = Object.values(m.scores).reduce((s, x) => s + x.defeats, 0);
  assert.ok(total >= 3, `${total} defeats in two minutes`);
  assert.ok(respawns >= 3 && protectedOnArrival === respawns, `${respawns} respawns, ${protectedOnArrival} protected`);
});

test('team deathmatch counts defeats per team', () => {
  const m = createMatch({ mode: 'tdm', seed: 4, botLevel: 'duelist' });
  const teams = [...m.seats.values()].map((s) => s.team);
  assert.equal(teams.filter((t) => t === 'red').length, MODES.tdm.seats / 2);
  play(m, 90);
  const { red, blue } = m.teamScores;
  const defeats = Object.values(m.scores).reduce((s, x) => s + x.defeats, 0);
  assert.equal(red + blue, defeats, 'every defeat is a team point');
  assert.ok(defeats > 0);
});

test('capture the flag: take theirs, drop it when knocked down, a team mate returns it, carry it home to score', () => {
  const m = createMatch({ mode: 'ctf', seed: 2, players: [{ id: 'r', team: 'red' }, { id: 'b', team: 'blue' }, { id: 'r2', team: 'red' }], seats: 3 });
  play(m, COUNTDOWN + 0.1);
  const { world } = m;
  const put = (id, at) => Object.assign(bodyOf(world, id), { x: at.x, z: at.z });
  put('b', { x: 8, z: 0 });
  // red takes the blue flag
  put('r', m.flags.blue.home);
  play(m, 0.1);
  assert.equal(m.flags.blue.carrier, 'r');
  // knocked down: the flag falls where the carrier was
  knockDown(world.fighters.get('r'), world.time);
  play(m, 0.05);
  assert.equal(m.flags.blue.state, 'dropped');
  // blue touches its own dropped flag: home again
  put('b', { x: m.flags.blue.x, z: m.flags.blue.z });
  play(m, 0.1);
  assert.equal(m.flags.blue.state, 'home');
  put('b', { x: 8, z: 0 });
  // the other red fighter takes it and carries it to the red base
  put('r2', m.flags.blue.home);
  play(m, 0.1);
  assert.equal(m.flags.blue.carrier, 'r2');
  put('r2', m.flags.red.home);
  const events = play(m, 0.1);
  assert.ok(events.some((e) => e.type === 'captured' && e.team === 'red'));
  assert.equal(m.teamScores.red, 1);
  assert.equal(m.flags.blue.state, 'home');
  // a dropped flag left alone goes home by itself
  put('r2', m.flags.blue.home);
  play(m, 0.1);
  assert.equal(m.flags.blue.carrier, 'r2');
  put('r2', { x: -5, z: 0 });
  knockDown(world.fighters.get('r2'), world.time);
  play(m, 0.05);
  assert.equal(m.flags.blue.state, 'dropped');
  for (const id of ['r', 'r2', 'b']) put(id, { x: id === 'b' ? 10 : -10, z: id === 'r' ? 6 : -6 });
  play(m, CTF.autoReturn + 0.5, () => {
    for (const id of ['r', 'r2', 'b']) put(id, { x: id === 'b' ? 10 : -10, z: id === 'r' ? 6 : -6 });
    return {};
  });
  assert.equal(m.flags.blue.state, 'home');
});

test('bots play capture the flag: they take flags and score', () => {
  const m = createMatch({ mode: 'ctf', seed: 11, botLevel: 'duelist' });
  const events = play(m, 240, undefined, (x) => x.phase === 'over');
  const taken = events.filter((e) => e.type === 'flagTaken').length;
  assert.ok(taken >= 1, `${taken} flags taken`);
});

test('a player takes a bot\'s seat (the team that needs one); a leaving player is replaced by a bot', () => {
  const m = createMatch({ mode: 'tdm', seed: 7 });
  const size = m.seats.size;
  const joined = joinMatch(m, { id: 'p1', name: 'Ada' });
  assert.ok(joined.ok && joined.replaced, 'took a bot\'s place');
  assert.equal(m.seats.size, size);
  assert.equal(m.seats.get('p1').kind, 'player');
  const second = joinMatch(m, { id: 'p2', name: 'Lin' });
  assert.notEqual(second.team, joined.team, 'players spread over the teams');
  assert.ok(leaveMatch(m, 'p1'));
  assert.equal(m.seats.size, size);
  assert.equal([...m.seats.values()].filter((s) => s.kind === 'bot').length, size - 1);
  // a match of players only has no seat to give
  const full = createMatch({ mode: 'duel', players: [{ id: 'a' }, { id: 'b' }] });
  assert.deepEqual(joinMatch(full, { id: 'c' }), { ok: false, reason: 'full' });
});

test('the view tells a HUD everything: clock, scores, the player, the feed', () => {
  const m = createMatch({ mode: 'ffa', seed: 3, players: [{ id: 'me', name: 'Me' }] });
  play(m, COUNTDOWN + 5);
  const v = matchView(m, 'me');
  assert.equal(v.phase, 'live');
  assert.ok(v.clockLeft > 0 && v.clockLeft < MODES.ffa.clock);
  assert.equal(v.people.length, MODES.ffa.seats);
  assert.equal(v.me.id, 'me');
  assert.ok(Array.isArray(v.feed));
});
