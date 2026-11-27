// R146: imports actual shared production rules, never a live service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getAXEReinforcementCap, reinforcementSuccessChance, reinforcementFailurePercent, previewReinforcement, resolveReinforcement, resolveOverEnchant, getAXEEnhancementStatMultiplier } from '../../../base44/shared/axeItemEnhancement.ts';

test('regular and future rarity ceilings', () => {
  for (const rarity of ['rare', 'elite', 'legendary', 'chosen']) assert.equal(getAXEReinforcementCap({ rarity }), 200);
  assert.equal(getAXEReinforcementCap({ rarity: 'mythic' }), 120);
  assert.equal(getAXEReinforcementCap({ rarity: 'mystical' }), 120);
});
test('safe reinforcement and decreasing odds after 40 percent', () => {
  for (let p = 0; p <= 40; p++) assert.equal(reinforcementSuccessChance(p), 1);
  for (let p = 41; p <= 200; p++) {
    assert.ok(reinforcementSuccessChance(p) <= reinforcementSuccessChance(p - 1));
    assert.ok(reinforcementSuccessChance(p) >= 0.28);
  }
  assert.ok(Math.abs(reinforcementSuccessChance(200) - 0.28) < 1e-12);
});
test('success adds five and clamps to the current item cap', () => {
  assert.equal(resolveReinforcement({ percent: 45 }, { roll: 0 }).record.percent, 50);
  assert.equal(resolveReinforcement({ percent: 198 }, { roll: 0 }).record.percent, 200);
  assert.equal(resolveReinforcement({ percent: 118 }, { roll: 0, item: { rarity: 'mythic' } }).record.percent, 120);
  assert.equal(resolveReinforcement({ percent: 200 }, { roll: 0 }).reason, 'max_reinforcement');
});
test('failed reinforcement loses three points without destruction', () => {
  const original = { percent: 100, marker: 'preserve' };
  const result = resolveReinforcement(original, { roll: 0.999 });
  assert.equal(result.outcome, 'downgrade');
  assert.deepEqual(result.record, { percent: 97, marker: 'preserve' });
  assert.equal(Boolean(result.destroyed), false);
  assert.equal(original.percent, 100);
  assert.equal(reinforcementFailurePercent(2), 0);
});
test('stabilizer prevents downgrade on failed reinforcement', () => {
  const record = { percent: 100 };
  const r = resolveReinforcement(record, { roll: 0.999, protectedAttempt: true });
  assert.equal(r.outcome, 'protected');
  assert.deepEqual(r.record, record);
});
test('preview and actual roll agree at the success threshold', () => {
  const record = { percent: 80 };
  const p = previewReinforcement(record);
  assert.equal(resolveReinforcement(record, { roll: p.successChance }).record.percent, p.nextPercent);
  assert.equal(resolveReinforcement(record, { roll: p.successChance + 0.0001 }).record.percent, p.failurePercent);
});
test('over-enchant failure, fracture, protection and cap', () => {
  assert.equal(resolveOverEnchant({ level: 3 }, { roll: 0.999 }).outcome, 'no_change');
  assert.deepEqual(resolveOverEnchant({ level: 4 }, { roll: 0.999 }).record, { level: 3, fractured: true });
  assert.deepEqual(resolveOverEnchant({ level: 4 }, { roll: 0.999, protectedAttempt: true }).record, { level: 4 });
  assert.deepEqual(resolveOverEnchant({ level: 4, fractured: true }, { roll: 0 }).record, { level: 5, fractured: false });
  assert.equal(resolveOverEnchant({ level: 10 }, { roll: 0 }).reason, 'max_over_enchant');
});
test('enhancement stat shares are additive, not compounded', () => {
  assert.ok(Math.abs(getAXEEnhancementStatMultiplier({ reinforcement: { percent: 100 }, enchantments: [10, 10, 10, 10], overEnchant: { level: 10 } }) - 2.65) < 1e-12);
});
