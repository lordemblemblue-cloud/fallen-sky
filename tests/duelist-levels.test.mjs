// Regression: permanent class mastery and match-only combat boosts must never be conflated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLASS_IDS, MOVES, LEVEL_CAP, RANK_MAX, TIER_MAX, XP_CAP, MATCH_BOOST,
  abilityRank, specialTier, boostAt, cleanProgress, levelFromXp, xpForLevel,
  createFighter, moveFor, kitAt, passiveFor, evaluateSpecial, SPECIAL_MAX,
} from '../src/components/duelist/core/index.mjs';
import { createWorld, addFighter, bodyOf } from '../src/components/duelist/sim/world.mjs';
import { createMatch, stepMatch, matchView, joinMatch } from '../src/components/duelist/sim/match.mjs';
import { encodeOwn, applyOwn, PROTOCOL } from '../src/components/duelist/net/protocol.mjs';
import { createProgressStore } from '../server/duelist/progress.mjs';

const DT = 1 / 60;
const FIRST = { warrior: 'leapStrike', duelist: 'pull', assassin: 'cloak', healer: 'mend' };

test('permanent mastery is independent per class and caps at level 25', () => {
  assert.equal(LEVEL_CAP, 25);
  assert.equal(RANK_MAX, 4);
  assert.equal(TIER_MAX, 3);
  assert.equal(levelFromXp(xpForLevel(5) - 1).level, 4);
  assert.equal(levelFromXp(xpForLevel(5)).level, 5);
  assert.deepEqual(levelFromXp(XP_CAP + 3000), { level: 25, into: 0, need: 0, progress: 1, capped: true });
  assert.deepEqual(cleanProgress({ healer: 1e8, duelist: 320, warrior: -1, assassin: 'invalid' }, CLASS_IDS),
    { warrior: 0, duelist: 320, assassin: 0, healer: XP_CAP });
});

test('match-only boost tiers grow by shared time, not account level or a kill streak', () => {
  assert.deepEqual([...MATCH_BOOST.atSeconds], [60, 150, 240]);
  assert.deepEqual([-1, 0, 59.9, 60, 149.9, 150, 239.9, 240, 500].map(boostAt), [0, 0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([0, 1, 2, 3, 99].map(abilityRank), [1, 2, 3, 4, 4]);
  assert.deepEqual([0, 1, 2, 3].map(specialTier), [1, 1, 2, 3]);
});

test('mastery 25 cannot increase damage, healing, passives, cooldowns or special ranks at match start', () => {
  for (const id of CLASS_IDS) {
    const beginner = createFighter({ id: 'new', classId: id, level: 1 });
    const veteran = createFighter({ id: 'veteran', classId: id, level: 25 });
    assert.equal(moveFor(beginner, FIRST[id]), moveFor(veteran, FIRST[id]), id);
    assert.deepEqual(passiveFor(beginner), passiveFor(veteran), id);
    assert.equal(kitAt(id, 1).rank, 1);
    assert.equal(kitAt(id, 25).rank, 1);
    assert.equal(kitAt(id, 25).tier, 1);
    veteran.matchBoost = 3;
    assert.equal(moveFor(veteran, FIRST[id]).rank, 4);
    assert.equal(kitAt(id, 25, 3).rank, 4);
    assert.equal(kitAt(id, 25, 3).tier, 3);
  }
  assert.equal(moveFor(createFighter({ classId: 'healer', level: 25 }), 'mend'), MOVES.mend);
});

test('live match awards boost to all seats at the same time and new matches reset it', () => {
  const match = createMatch({ mode: 'practice', seed: 3, seats: 1,
    players: [{ id: 'player', classId: 'healer', progress: { healer: XP_CAP, warrior: 500 } }] });
  const seat = match.seats.get('player');
  assert.equal(seat.level, 25);
  assert.equal(seat.matchBoost, 0);
  while (match.phase !== 'live') stepMatch(match, DT, {});
  for (let i = 0; i < 61 * 60; i++) stepMatch(match, DT, {});
  assert.equal(seat.matchBoost, 1);
  assert.equal(matchView(match, 'player').me.matchBoost, 1);
  assert.equal(moveFor(match.world.fighters.get('player'), 'mend').rank, 2);
  assert.equal(matchView(match, 'player').me.xp, XP_CAP);
  // Boost is not written to the progress record; it resets even when mastery persists.
  const nextMatch = createMatch({ mode: 'practice', seats: 1,
    players: [{ id: 'player', classId: 'healer', progress: seat.progress }] });
  assert.equal(nextMatch.seats.get('player').level, 25);
  assert.equal(nextMatch.seats.get('player').matchBoost, 0);
  assert.equal(moveFor(nextMatch.world.fighters.get('player'), 'mend'), MOVES.mend);
});

test('joining mid-match inherits the current match tier but saved mastery gives no power', () => {
  const match = createMatch({ mode: 'practice', seats: 2, players: [{ id: 'one', classId: 'warrior' }] });
  while (match.phase !== 'live') stepMatch(match, DT, {});
  for (let i = 0; i < 151 * 60; i++) stepMatch(match, DT, {});
  assert.equal(match.boostTier, 2);
  const joined = joinMatch(match, { id: 'late', classId: 'healer', progress: { healer: XP_CAP } });
  assert.equal(joined.ok, true);
  assert.deepEqual([match.seats.get('late').level, match.seats.get('late').matchBoost], [25, 2]);
  assert.equal(match.world.fighters.get('late').matchBoost, 2);
  assert.equal(moveFor(match.world.fighters.get('late'), 'mend').rank, 3);
  const fresh = createMatch({ mode: 'practice', players: [{ id: 'late', classId: 'healer', progress: { healer: XP_CAP } }], seats: 1 });
  assert.equal(fresh.boostTier, 0);
  assert.equal(moveFor(fresh.world.fighters.get('late'), 'mend'), MOVES.mend);
});

test('execution threshold is a match-only special boost; fake saved level is ignored', () => {
  const actor = { id: 'player', team: 'blue', hp: 100, position: { x: 0, z: 0 } };
  const target = { id: 'enemy', team: 'red', hp: 30, maxHp: 100, position: { x: 0, z: 1.5, yaw: 0 } };
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: SPECIAL_MAX, actor, target, level: 25 }).allowed, false);
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: SPECIAL_MAX, actor, target, matchBoost: 3 }).allowed, true);
});

test('authoritative reconciliation keeps mastery and boost in separate fields', () => {
  assert.equal(PROTOCOL, 7);
  const world = createWorld();
  const f = addFighter(world, { id: 'player', classId: 'healer', level: 25, matchBoost: 2 });
  const own = JSON.parse(JSON.stringify(encodeOwn(f, bodyOf(world, 'player'), world.time)));
  const clone = createFighter({ id: 'player' });
  applyOwn(clone, { x: 0, y: 0, z: 0, yaw: 0 }, own);
  assert.deepEqual([clone.level, clone.matchBoost, moveFor(clone, 'mend').rank], [25, 2, 3]);
});

test('server store retains independent per-class XP but does not persist match boosts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duelist-progress-'));
  const file = join(dir, 'progress.json');
  try {
    const store = createProgressStore({ file });
    assert.equal(store.add('account', 'healer', 120), 120);
    assert.equal(store.add('account', 'duelist', 55), 55);
    store.add('guest-temporary', 'warrior', 80);
    store.flush();
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(saved.accounts), ['account']);
    assert.equal(saved.accounts.account.healer, 120);
    assert.equal(saved.accounts.account.duelist, 55);
    assert.equal(saved.accounts.account.matchBoost, undefined);
    const again = createProgressStore({ file });
    assert.deepEqual([again.get('account').healer, again.get('account').duelist, again.get('account').warrior], [120, 55, 0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
