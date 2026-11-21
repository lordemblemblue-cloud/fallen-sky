// Duelist Adventure: class levels. A class goes from level 1 to 20; every fifth level adds a rank to all four of
// its abilities (so they are maxed at level 20); the special improves at level 10 and again at 20; the passive
// grows with the rank. The match awards the EXP, and whoever keeps a player's progress decides its level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MOVES, CLASSES, CLASS_IDS, LEVEL_CAP, RANK_MAX, XP, XP_CAP, GROWTH, SPECIAL_MAX, SPECIAL_TIERS, abilityRank, specialTier, levelFromXp,
  xpForLevel, moveFor, kitAt, createFighter, damageFor, rollReach, selfMend, evaluateSpecial,
} from '../src/components/duelist/core/index.mjs';
import { createWorld, addFighter, step, bodyOf } from '../src/components/duelist/sim/world.mjs';
import { createMatch, stepMatch, matchView } from '../src/components/duelist/sim/match.mjs';
import { encodeOwn, applyOwn } from '../src/components/duelist/net/protocol.mjs';
import { createProgressStore } from '../server/duelist/progress.mjs';

const DT = 1 / 60;
const idle = { move: { x: 0, z: 0 }, face: 0, presses: [] };

test('a class levels from 1 to 20: a rank for its abilities every fifth level, a better special at 10 and at 20', () => {
  assert.deepEqual([1, 4, 5, 9, 10, 14, 15, 19, 20].map(abilityRank), [1, 1, 2, 2, 3, 3, 4, 4, 5]);
  assert.deepEqual([1, 9, 10, 19, 20].map(specialTier), [1, 1, 2, 2, 3]);
  assert.deepEqual([abilityRank(0), abilityRank(NaN), abilityRank(99), specialTier(99)], [1, 1, RANK_MAX, 3]);
  assert.equal(levelFromXp(xpForLevel(5) - 1).level, 4);
  assert.equal(levelFromXp(xpForLevel(5)).level, 5);
  assert.deepEqual(levelFromXp(XP_CAP + 5000), { level: LEVEL_CAP, into: 0, need: 0, progress: 1, capped: true });
  assert.ok(XP_CAP / (XP.win + XP.played + 6 * XP.elimination) > 30, 'level 20 is many matches away');
});

test('a rank makes every ability of every kit stronger or sooner; its timings and its costs stay as written', () => {
  for (const classId of CLASS_IDS) {
    for (const { id } of CLASSES[classId].abilities) {
      assert.ok(GROWTH[id], `${id} grows`);
      const first = moveFor({ classId, level: 1 }, id);
      assert.equal(first, MOVES[id], `${id}: level 1 is the move as written`);
      let before = first;
      for (const level of [5, 10, 15, 20]) {
        const now = moveFor({ classId, level }, id);
        assert.equal(now.rank, abilityRank(level), `${id} at level ${level}`);
        for (const key of ['startup', 'active', 'recovery', 'duration', 'will', 'stamina']) assert.equal(now[key], first[key], `${id} ${key}`);
        assert.ok(now.cooldown <= before.cooldown, `${id}: never slower to come back`);
        for (const key of ['damage', 'range', 'effectSeconds', 'heal', 'aura', 'charges']) {
          if (first[key] !== undefined) assert.ok(now[key] >= before[key], `${id} ${key} at level ${level}`);
        }
        assert.notDeepEqual({ ...now, rank: 0 }, { ...before, rank: 0 }, `${id} changes at level ${level}`);
        before = now;
      }
      assert.equal(moveFor({ classId, level: 19 }, id), moveFor({ classId, level: 15 }, id), 'nothing changes between the fifth levels');
    }
  }
  // the follow-up moves grow with their ability; another class's ability, or no class at all, never ranks
  assert.ok(moveFor({ classId: 'duelist', level: 20 }, 'counterStrike').damage > MOVES.counterStrike.damage);
  assert.ok(moveFor({ classId: 'warrior', level: 20 }, 'gripThrow').damage > MOVES.gripThrow.damage);
  assert.equal(moveFor({ classId: 'warrior', level: 20 }, 'mend'), MOVES.mend);
  assert.equal(moveFor({ classId: 'duelist', level: 20 }, 'gripThrow'), MOVES.gripThrow);
  assert.equal(moveFor({ classId: null, level: 20 }, 'push'), MOVES.push);
  // and the words say the numbers of the level
  const kit = kitAt('healer', 20);
  assert.deepEqual([kit.rank, kit.tier, kit.abilities.length], [5, 3, 4]);
  assert.ok(kit.abilities[0].text.includes('48 HP') && kitAt('healer', 1).abilities[0].text.includes('30 HP'));
  assert.ok(kit.special.text.includes('8 m') && kit.passive.text.includes('2 HP'));
});

test('in a fight a level-20 Healer mends more, and is ready again sooner, than a level-1 one', () => {
  const mended = {};
  for (const level of [1, 20]) {
    const w = createWorld();
    const healer = addFighter(w, { id: 'h', team: 'blue', x: 0, z: 0, yaw: 0, classId: 'healer', level });
    const ally = addFighter(w, { id: 'ally', team: 'blue', x: 0, z: 3, yaw: 0 });
    ally.vitals.hp = 30;
    step(w, DT, { h: { ...idle, presses: ['ability1'] } });
    assert.equal(healer.action.id, 'mend');
    assert.equal(healer.action.move, moveFor(healer, 'mend'), 'the move in hand is the one of its rank');
    const ready = healer.cooldowns.mend - w.time;
    for (let i = 0; i < 60 * 4.2; i++) step(w, DT, { h: idle });
    mended[level] = { hp: ally.vitals.hp - 30, ready };
  }
  assert.ok(Math.abs(mended[1].hp - 30) < 1 && Math.abs(mended[20].hp - 48) < 1, `mended ${mended[1].hp.toFixed(1)} and ${mended[20].hp.toFixed(1)} HP`);
  assert.ok(Math.abs(mended[1].ready - 8) < 0.05 && Math.abs(mended[20].ready - 6.72) < 0.05, `ready after ${mended[1].ready.toFixed(2)} s and ${mended[20].ready.toFixed(2)} s`);
});

test('the specials improve at level 10 and again at level 20', () => {
  // Rage lasts longer; Sanctuary is wider, lasts longer and heals more
  for (const [level, seconds, radius] of [[1, 5, 6], [10, 6, 7], [20, 7, 8]]) {
    const w = createWorld();
    const warrior = addFighter(w, { id: 'a', x: 0, z: 0, classId: 'warrior', level });
    warrior.meter = SPECIAL_MAX;
    step(w, DT, { a: { ...idle, presses: ['special'] } });
    while (!warrior.effects.rage) step(w, DT, { a: idle });
    assert.ok(Math.abs(warrior.effects.rage.until - w.time - seconds) < 0.05, `Rage at level ${level}: ${seconds} s`);
    const healer = addFighter(w, { id: 'h', x: 9, z: 0, classId: 'healer', level });
    healer.meter = SPECIAL_MAX;
    step(w, DT, { h: { ...idle, presses: ['special'] } });
    while (!w.zones.length) step(w, DT, { h: idle });
    assert.deepEqual([w.zones[0].radius, w.zones[0].heal, Math.round(w.zones[0].until - w.time)], [radius, SPECIAL_TIERS.sanctuary.healPerSecond[specialTier(level) - 1], seconds]);
  }
  // the Duelist's Execution reaches healthier targets
  const actor = { id: 'a', team: 'blue', hp: 100, position: { x: 0, z: 0 } };
  const foe = (hp, at = { x: 0, z: 1.5, yaw: 0 }) => ({ id: 'f', team: 'red', hp, maxHp: 100, position: at });
  const execute = (level, hp) => evaluateSpecial({ classId: 'duelist', meter: SPECIAL_MAX, actor, target: foe(hp), level }).reason || 'allowed';
  assert.deepEqual([execute(1, 25), execute(1, 28), execute(10, 28), execute(10, 33), execute(20, 33), execute(20, 36)],
    ['allowed', 'target-too-healthy', 'allowed', 'target-too-healthy', 'allowed', 'target-too-healthy']);
  // the Assassin's Shadow Execution takes a wider angle behind the target, from farther
  const behind = (level, degreesOff, distance = 2) => {
    const a = (degreesOff * Math.PI) / 180; // the target faces +z: straight behind it is -z
    const position = { x: Math.sin(a) * distance, z: -Math.cos(a) * distance };
    return evaluateSpecial({ classId: 'assassin', meter: SPECIAL_MAX, actor: { ...actor, position }, target: foe(100, { x: 0, z: 0, yaw: 0 }), level }).reason || 'allowed';
  };
  assert.deepEqual([behind(1, 50), behind(1, 70), behind(10, 70), behind(10, 85), behind(20, 85)], ['allowed', 'not-behind', 'allowed', 'not-behind', 'allowed']);
  assert.deepEqual([behind(1, 0, 2.4), behind(10, 0, 2.4), behind(10, 0, 2.6), behind(20, 0, 2.6)], ['out-of-range', 'allowed', 'out-of-range', 'allowed']);
});

test('each class has a passive that helps it, and it grows with the class', () => {
  const strike = MOVES.swordLight1;
  const at = (classId, level, extra = {}) => Object.assign(createFighter({ id: 'a', classId, weapon: CLASSES[classId].weapon, level }), extra);
  // Warrior, Heavy Stance: harder strikes, firmer on its feet
  assert.ok(Math.abs(damageFor(at('warrior', 1), strike, 10, { now: 0 }) - 11.5) < 1e-9);
  assert.ok(Math.abs(damageFor(at('warrior', 20), strike, 10, { now: 0 }) - 12.4) < 1e-9);
  assert.ok(kitAt('warrior', 20).passive.text.includes('35% less'));
  // Duelist, Twin Rhythm: every link of a chain hits harder than the one before
  const link = (level, n) => damageFor(at('duelist', level, { action: { link: n } }), MOVES.bladesLight1, 10, { now: 0 });
  assert.deepEqual([link(1, 1), link(1, 3), link(20, 4)].map((d) => +d.toFixed(2)), [10, 10.6, 12.1]);
  // Assassin, Shadow Step: more from behind, longer rolls
  assert.deepEqual([damageFor(at('assassin', 1), strike, 10, { now: 0, behind: true }), damageFor(at('assassin', 20), strike, 10, { now: 0, behind: true })].map((d) => +d.toFixed(2)), [11, 12.6]);
  assert.deepEqual([rollReach(at('assassin', 1)), rollReach(at('assassin', 20)), rollReach(at('warrior', 20))], [1.25, 1.38, 1]);
  // Healer, Swift Stance: left alone for four seconds, it mends itself
  const healer = at('healer', 1);
  healer.vitals.lastHurt = 10;
  assert.deepEqual([selfMend(healer, 13.9), selfMend(healer, 14), selfMend(at('healer', 20), 100), selfMend(at('warrior', 20), 100)], [0, 1, 2, 0]);
  const w = createWorld();
  const h = addFighter(w, { id: 'h', classId: 'healer', level: 20 });
  h.vitals.hp = 50;
  for (let i = 0; i < 60 * 5; i++) step(w, DT, { h: idle });
  assert.ok(Math.abs(h.vitals.hp - 60) < 0.2, `mended itself to ${h.vitals.hp.toFixed(1)} HP in five quiet seconds`);
  for (const id of CLASS_IDS) assert.ok(kitAt(id, 1).passive.text.length > 20 && kitAt(id, 1).passive.name, `${id} has a passive in words`);
});

// a duel against one bot, with the bot held still and open in front of the player
function duel(progress, classId = 'healer') {
  const match = createMatch({ mode: 'duel', seed: 3, players: [{ id: 'p1', classId, progress }] });
  const bot = [...match.seats.values()].find((s) => s.kind === 'bot');
  const events = [];
  const tick = (presses = []) => {
    const me = bodyOf(match.world, 'p1');
    const foe = bodyOf(match.world, bot.id);
    const f = match.world.fighters.get(bot.id);
    Object.assign(foe, { x: me.x, z: me.z + 1.5 });
    f.stunnedUntil = match.world.time + 1;
    Object.assign(f.vitals, { shield: 0, will: 0, collapsed: true, hp: Math.min(f.vitals.hp, 1) });
    events.push(...stepMatch(match, DT, { p1: { move: { x: 0, z: 0 }, face: 0, presses } }).events);
  };
  return { match, bot, events, tick };
}

test('a match gives its EXP to the class being played; a level reached shows at once and fights from the next spawn', () => {
  const { match, bot, events, tick } = duel({ healer: xpForLevel(5) - 10, warrior: 400 });
  const seat = match.seats.get('p1');
  assert.deepEqual([seat.level, match.world.fighters.get('p1').level, bot.level], [4, 4, 4], 'the player at its class level, the bot at the same');
  assert.equal(matchView(match, 'p1').me.xp, xpForLevel(5) - 10);
  while (match.phase !== 'live') tick();
  for (let i = 0; i < 90 && !events.some((e) => e.type === 'defeat'); i++) tick(i % 20 === 0 ? ['light'] : []);
  const defeat = events.find((e) => e.type === 'defeat');
  assert.ok(defeat && defeat.by === 'p1', 'the player won the exchange');
  const earned = events.filter((e) => e.type === 'xp' && e.id === 'p1');
  assert.ok(earned.length >= 1 && earned.every((e) => e.classId === 'healer' && e.amount > 0));
  assert.equal(earned[0].amount, XP.elimination);
  const total = xpForLevel(5) - 10 + earned.reduce((sum, e) => sum + e.amount, 0);
  assert.deepEqual([seat.progress.healer, seat.progress.warrior, matchView(match, 'p1').me.xp], [total, 400, total], 'only the class in use earns');
  assert.deepEqual(events.filter((e) => e.type === 'levelUp').map((e) => [e.id, e.classId, e.level]), [['p1', 'healer', 5]]);
  assert.equal(match.world.fighters.get('p1').level, 4, 'this life is fought out at the level it began with');
  // the next round: both spawn again, the player a level and a rank up, the bot with it
  for (let i = 0; i < 60 * 12 && match.round < 2; i++) tick();
  while (match.phase !== 'live') tick();
  const me = match.world.fighters.get('p1');
  assert.deepEqual([match.round, seat.level, me.level, abilityRank(me.level), bot.level], [2, 5, 5, 2, 5]);
  assert.ok(moveFor(me, 'mend').heal > MOVES.mend.heal);
  // nobody else's events, and nothing a browser sends, moves a level
  assert.equal(events.filter((e) => e.type === 'xp' && e.id !== 'p1').length, 0, 'bots earn nothing');
  stepMatch(match, DT, { p1: { move: { x: 0, z: 0 }, face: 0, presses: [], level: 20, xp: 99999, progress: { healer: 99999 } } });
  assert.equal(seat.progress.healer, matchView(match, 'p1').me.xp);
  assert.ok(seat.progress.healer < xpForLevel(6));
});

test('a new player starts every class at level 1; at the top a class earns no more', () => {
  const fresh = duel(null, 'assassin');
  assert.deepEqual([fresh.match.seats.get('p1').level, fresh.match.seats.get('p1').progress], [1, { warrior: 0, duelist: 0, assassin: 0, healer: 0 }]);
  const top = duel({ assassin: 9e9, healer: -4, duelist: 'lots' }, 'assassin');
  assert.deepEqual(top.match.seats.get('p1').progress, { warrior: 0, duelist: 0, assassin: XP_CAP, healer: 0 }, 'what comes in is made safe');
  assert.deepEqual([top.match.seats.get('p1').level, top.bot.level, specialTier(top.match.world.fighters.get('p1').level)], [20, 20, 3]);
  while (top.match.phase !== 'live') top.tick();
  for (let i = 0; i < 90 && !top.events.some((e) => e.type === 'defeat'); i++) top.tick(i % 20 === 0 ? ['light'] : []);
  assert.equal(top.match.seats.get('p1').progress.assassin, XP_CAP);
  assert.equal(top.events.filter((e) => e.type === 'levelUp').length, 0);
});

test('the level travels with a fighter over the wire, and its moves are read at that level', () => {
  const w = createWorld();
  const a = addFighter(w, { id: 'a', classId: 'healer', level: 15 });
  step(w, DT, { a: { ...idle, presses: ['ability1'] } });
  const other = createWorld();
  const copy = addFighter(other, { id: 'a' });
  applyOwn(copy, bodyOf(other, 'a'), JSON.parse(JSON.stringify(encodeOwn(a, bodyOf(w, 'a'), w.time))));
  assert.deepEqual([copy.classId, copy.level, copy.action.id, copy.action.move.rank], ['healer', 15, 'mend', 4]);
  assert.equal(copy.action.move, moveFor(a, 'mend'));
});

test('the match server keeps each account\'s EXP per class, in a file when it is given one; guests are not written down', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duelist-progress-'));
  const file = join(dir, 'deep', 'progress.json');
  try {
    const store = createProgressStore({ file, saveAfterMs: 5 });
    assert.deepEqual(store.get('ann'), { warrior: 0, duelist: 0, assassin: 0, healer: 0 });
    assert.equal(store.add('ann', 'healer', 120), 120);
    assert.equal(store.add('ann', 'healer', 30.9), 150);
    assert.equal(store.add('guest-abc123', 'warrior', 60), 60);
    for (const bad of [['ann', 'wizard', 10], ['ann', 'healer', -5], ['ann', 'healer', NaN], ['', 'healer', 10], [null, 'healer', 10]]) assert.equal(store.add(...bad), null);
    assert.equal(store.add('max', 'duelist', 9e9), XP_CAP, 'a class stops at the cap');
    const mine = store.get('ann');
    mine.healer = 99999; // a copy: changing it changes nothing
    assert.equal(store.get('ann').healer, 150);
    store.flush();
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(saved.accounts).sort(), ['ann', 'max']);
    const again = createProgressStore({ file });
    assert.deepEqual([again.get('ann').healer, again.get('max').duelist, again.get('guest-abc123').warrior], [150, XP_CAP, 0]);
    assert.deepEqual(createProgressStore().get('ann'), { warrior: 0, duelist: 0, assassin: 0, healer: 0 }, 'with no file, a new server starts empty');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
