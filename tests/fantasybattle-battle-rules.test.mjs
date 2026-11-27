// Fantasy Battle round rules: actions and Focus, initiative, damage, guard, multi-arrow volleys, knock-outs and the
// opponent's choices. All deterministic from the battle's seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, MAX_FOCUS, createBattle, legalActions, isLegal, computeDamage, turnOrder, resolveRound, chooseAiAction, unitById,
} from '../src/components/fantasybattle/core/battleRules.mjs';

const UNITS = [
  { id: 'hero', name: 'Silver Archer', team: 'player', maxHp: 120, atk: 12, def: 10, spd: 11 },
  { id: 'rival', name: 'Shade Archer', team: 'enemy', maxHp: 120, atk: 11, def: 10, spd: 10 },
];
const fresh = (seed = 42, units = UNITS) => createBattle({ seed, units });

test('a new battle: full health, 1 Focus, choosing; bad setups are refused', () => {
  const b = fresh();
  assert.equal(b.phase, 'choose');
  assert.equal(b.round, 1);
  for (const u of b.units) { assert.equal(u.hp, u.maxHp); assert.equal(u.focus, 1); }
  assert.throws(() => createBattle({ units: [UNITS[0]] }));
  assert.throws(() => createBattle({ units: [UNITS[0], { ...UNITS[1], team: 'player' }] }));
  assert.throws(() => createBattle({ units: [UNITS[0], { ...UNITS[1], spd: 0 }] }));
});

test('Focus gates the charged shot and the volley', () => {
  const b = fresh();
  const legal = Object.fromEntries(legalActions(b, 'hero').map((a) => [a.id, a]));
  assert.equal(legal.quickShot.enabled, true);
  assert.equal(legal.volley.enabled, true);
  assert.equal(legal.guard.enabled, true);
  assert.equal(legal.chargedShot.enabled, false);
  assert.match(legal.chargedShot.reason, /2 Focus/);
  assert.throws(() => resolveRound(b, { hero: 'chargedShot', rival: 'quickShot' }), /cannot use/);
  assert.throws(() => resolveRound(b, { hero: 'quickShot' }), /no action for rival/);
});

test('damage: power scaled by attack/defence, variance x0.9..x1.1, crits x1.5, guard halves', () => {
  assert.equal(computeDamage({ power: 20, atk: 10, def: 10, variance: 0.5 }), 20);
  assert.equal(computeDamage({ power: 20, atk: 10, def: 10, variance: 0 }), 18);
  assert.equal(computeDamage({ power: 20, atk: 10, def: 10, variance: 0.999999 }), 22);
  assert.equal(computeDamage({ power: 20, atk: 10, def: 10, variance: 0.5, crit: true }), 30);
  assert.equal(computeDamage({ power: 20, atk: 10, def: 10, variance: 0.5, guarded: true }), 10);
  assert.equal(computeDamage({ power: 20, atk: 40, def: 10, variance: 0.5 }), 40);
  assert.equal(computeDamage({ power: 1, atk: 1, def: 100, variance: 0, guarded: true }), 1, 'never below 1');
});

test('initiative: guard, then quick, then volley, then the charged shot; speed breaks ties', () => {
  const b = fresh();
  assert.deepEqual(turnOrder(b, { hero: 'chargedShot', rival: 'guard' }).order, ['rival', 'hero']);
  assert.deepEqual(turnOrder(b, { hero: 'volley', rival: 'quickShot' }).order, ['rival', 'hero']);
  assert.deepEqual(turnOrder(b, { hero: 'quickShot', rival: 'quickShot' }).order, ['hero', 'rival'], 'faster unit first');
  assert.ok(ACTIONS.guard.priority > ACTIONS.quickShot.priority && ACTIONS.quickShot.priority > ACTIONS.volley.priority && ACTIONS.volley.priority > ACTIONS.chargedShot.priority);
});

test('a round resolves the same way every time for the same seed and choices', () => {
  const a = resolveRound(fresh(7), { hero: 'volley', rival: 'quickShot' });
  const b = resolveRound(fresh(7), { hero: 'volley', rival: 'quickShot' });
  assert.deepEqual(a, b);
  const outcomes = new Set();
  for (let seed = 1; seed <= 40; seed += 1) outcomes.add(JSON.stringify(resolveRound(fresh(seed), { hero: 'volley', rival: 'quickShot' }).round.steps.map((s) => s.hits.map((h) => h.damage))));
  assert.ok(outcomes.size > 5, 'different seeds roll differently');
});

test('the volley rolls three arrows; Focus is paid and gained, capped at the maximum', () => {
  const { battle, round } = resolveRound(fresh(3), { hero: 'volley', rival: 'guard' });
  const heroStep = round.steps.find((s) => s.actor === 'hero');
  assert.equal(heroStep.hits.length, 3);
  for (const h of heroStep.hits) if (h.hit) assert.equal(h.guarded, true, 'the rival guarded first');
  assert.deepEqual(heroStep.focus, [1, 0]);
  assert.equal(unitById(battle, 'rival').focus, MAX_FOCUS);
  const hpLost = 120 - unitById(battle, 'rival').hp;
  assert.equal(hpLost, heroStep.hits.reduce((s, h) => s + h.damage, 0));
  for (const u of battle.units) assert.equal(u.guarding, false, 'guard ends with the round');
  assert.equal(battle.round, 2);
});

test('guarding halves the incoming damage', () => {
  // the rival's quick shot: 16 x sqrt(11/10) x 0.9..1.1 (x1.5 on a crit) = 15..28 open, 8..14 into a guard
  let guardedHits = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const open = resolveRound(fresh(seed), { hero: 'quickShot', rival: 'quickShot' }).round.steps.find((st) => st.actor === 'rival');
    const guarded = resolveRound(fresh(seed), { hero: 'guard', rival: 'quickShot' }).round.steps.find((st) => st.actor === 'rival');
    for (const h of open.hits) if (h.hit) { assert.equal(h.guarded, false); assert.ok(h.damage >= 15 && h.damage <= 28, `open ${h.damage}`); }
    for (const h of guarded.hits) if (h.hit) { guardedHits += 1; assert.equal(h.guarded, true); assert.ok(h.damage >= 8 && h.damage <= 14, `guarded ${h.damage}`); }
  }
  assert.ok(guardedHits > 30);
});

test('a knock-out ends the battle and the fallen archer does not shoot back', () => {
  const units = [{ ...UNITS[0] }, { ...UNITS[1], hp: 5 }];
  let found = false;
  for (let seed = 1; seed < 50 && !found; seed += 1) {
    const { battle, round } = resolveRound(createBattle({ seed, units }), { hero: 'quickShot', rival: 'quickShot' });
    const first = round.steps[0];
    if (first.actor !== 'hero' || !first.hits[0].hit) continue;
    found = true;
    assert.equal(first.hits[0].ko, true);
    assert.equal(round.steps[1].skipped, 'down');
    assert.equal(battle.phase, 'over');
    assert.equal(battle.winner, 'player');
    assert.equal(legalActions(battle, 'hero').every((a) => !a.enabled), true);
    assert.throws(() => resolveRound(battle, { hero: 'quickShot' }), /over/);
  }
  assert.ok(found, 'some seed lands the finishing shot');
});

test('the opponent only picks legal actions, and a whole battle finishes', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    let b = fresh(seed);
    let rounds = 0;
    while (b.phase === 'choose' && rounds < 60) {
      const rival = chooseAiAction(b, 'rival');
      const hero = chooseAiAction({ ...b, rng: b.rng ^ 0x55 }, 'hero');
      assert.ok(isLegal(b, 'rival', rival), `seed ${seed}: rival picked ${rival}`);
      b = resolveRound(b, { hero, rival }).battle;
      rounds += 1;
    }
    assert.equal(b.phase, 'over', `seed ${seed} finished in ${rounds} rounds`);
    assert.ok(rounds >= 3, 'a fight lasts a few rounds');
  }
});
