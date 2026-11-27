// R146: real shared advancement and resource-cost rules with deterministic rolls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AXE_COMBINE_CONFIG, validateCombine, resolveCombineRecord, combineSuccessChance, validateAXEAscensionDonor, resolveAscensionRecord, ascensionSuccessChance, getAXEAscensionBonusFraction, resolveRefine, resolveUltimate } from '../../../base44/shared/axeItemAdvancement.ts';
import { getAXECombineCost, getAXEAscensionCost, getAXEReinforcementCost, getAXEOverEnchantCost, getAXEServiceInventoryCost } from '../../../base44/shared/axeServiceEconomy.ts';

const item = (patch = {}) => ({ instanceId: 'a', templateId: 'sword-a', rarity: 'rare', slot: 'weapon', masteryWeaponId: 'sword', itemLevel: 80, ...patch });
const donor = (patch = {}) => item({ instanceId: 'b', templateId: 'sword-b', ...patch });

test('Combine accepts different templates of same grade, level and subtype', () => {
  assert.deepEqual(validateCombine(item(), donor()), { ok: true });
  for (const [patch, reason] of [[{ rarity: 'elite' }, 'GRADE_MISMATCH'], [{ itemLevel: 79 }, 'LEVEL_MISMATCH'], [{ slot: 'ring' }, 'SLOT_MISMATCH'], [{ masteryWeaponId: 'bow' }, 'SUBTYPE_MISMATCH'], [{ instanceId: 'a' }, 'SAME_INSTANCE']]) assert.equal(validateCombine(item(), donor(patch)).reason, reason);
});
test('protected donors are rejected in Combine and Ascension', () => {
  for (const flag of ['equipped', 'locked', 'favorite', 'favorited', 'isFavorite', 'vanityOnly']) {
    assert.equal(validateCombine(item(), donor({ [flag]: true })).reason, 'DONOR_PROTECTED');
    assert.equal(validateAXEAscensionDonor(item(), donor({ [flag]: true })).reason, 'DONOR_PROTECTED');
  }
});
test('Combine consumes donor only on success and caps at 12', () => {
  const record = { count: 11 };
  const success = resolveCombineRecord(record, item(), donor(), { roll: 0 });
  assert.equal(success.record.count, 12); assert.equal(success.donorConsumed, true);
  const failure = resolveCombineRecord(record, item(), donor(), { roll: 0.999 });
  assert.deepEqual(failure.record, record); assert.equal(failure.donorConsumed, false);
  assert.equal(resolveCombineRecord({ count: 12 }, item(), donor(), { roll: 0 }).reason, 'MAX_COMBINE');
  assert.equal(record.count, 11);
});
test('Combine current probability curve, stat share and fee', () => {
  assert.equal(combineSuccessChance(0), 0.9);
  for (let i = 1; i <= 12; i++) assert.ok(combineSuccessChance(i) <= combineSuccessChance(i - 1));
  assert.ok(Math.abs(combineSuccessChance(12) - 0.35) < 1e-12);
  assert.equal(AXE_COMBINE_CONFIG.statPerStage, 0.02); assert.deepEqual(getAXECombineCost(), {});
});
test('Ascension donor can be lower level, but not higher or wrong rarity', () => {
  assert.equal(validateAXEAscensionDonor(item(), donor({ itemLevel: 60 })).ok, true);
  assert.equal(validateAXEAscensionDonor(item(), donor({ itemLevel: 81 })).reason, 'DONOR_LEVEL_TOO_HIGH');
  assert.equal(validateAXEAscensionDonor(item(), donor({ rarity: 'elite' })).reason, 'ASCENSION_RARITY_MISMATCH');
  assert.equal(validateAXEAscensionDonor(item(), null).reason, 'DONOR_REQUIRED');
  assert.equal(validateAXEAscensionDonor(item({ rarity: 'mythic' }), donor({ rarity: 'mythic' })).reason, 'ASCENSION_RARITY_NOT_ELIGIBLE');
});
test('Ascension odds and success/failure semantics through rank four', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(ascensionSuccessChance), [1, 0.8, 0.65, 0.5, null]);
  let record = { rank: 0 };
  for (let i = 0; i < 4; i++) {
    const result = resolveAscensionRecord(record, item(), donor(), { roll: ascensionSuccessChance(i) });
    assert.equal(result.record.rank, i + 1); assert.equal(result.donorConsumed, true);
    if (i > 0) { const fail = resolveAscensionRecord(record, item(), donor(), { roll: 0.999 }); assert.deepEqual(fail.record, record); assert.equal(fail.donorConsumed, false); }
    record = result.record;
  }
  assert.equal(resolveAscensionRecord(record, item(), donor(), { roll: 0 }).reason, 'MAX_STAGE');
});
test('current rarity-specific bonuses and Chosen legacy path', () => {
  for (const [rarity, bonus] of [['rare', 0.15], ['elite', 0.75], ['legendary', 1], ['chosen', 0]]) assert.equal(getAXEAscensionBonusFraction(item({ rarity }), 4), bonus);
  assert.equal(getAXEAscensionBonusFraction(item(), 3), 0.1125);
  const chosen = resolveAscensionRecord({ rank: 0 }, item({ rarity: 'chosen' }), null, { roll: 0.999 });
  assert.equal(chosen.record.rank, 1); assert.equal(chosen.donorConsumed, false);
});
test('configured Ascension cost and Chosen legacy materials', () => {
  for (const success of [undefined, false, true]) assert.deepEqual(getAXEAscensionCost({ success, item: item() }), {});
  assert.deepEqual(getAXEAscensionCost({ item: item({ rarity: 'chosen' }), advancement: { stage: { rank: 2 } } }), { evo_upgrade_stone: 3 });
});
test('reinforcement, over-enchant and protection costs use existing catalog', () => {
  assert.deepEqual(getAXEReinforcementCost(40, { protectedAttempt: true }), { mat_reinforce: 3, mat_protection: 1 });
  assert.deepEqual(getAXEOverEnchantCost(4, { protectedAttempt: true }), { mat_over_enchant: 3, mat_protection: 1 });
  assert.deepEqual(getAXEServiceInventoryCost('refine', { advancement: { refine: { level: 6 } }, protectedAttempt: true }), { mat_reinforce: 3, mat_protection: 1 });
});
test('Refine failure and protection follow distinct rules from Enchant', () => {
  assert.equal(resolveRefine({ level: 7 }, { roll: 0.999 }).outcome, 'no_change');
  assert.equal(resolveRefine({ level: 8 }, { roll: 0.999 }).record.level, 7);
  assert.equal(resolveRefine({ level: 12 }, { roll: 0.999 }).destroyed, true);
  assert.equal(resolveRefine({ level: 12 }, { roll: 0.999, protectedAttempt: true }).outcome, 'protected');
  assert.equal(resolveRefine({ level: 15 }, { roll: 0 }).reason, 'MAX_REFINE');
});
test('Ultimate rarity, sealing, protection and recovery', () => {
  assert.equal(resolveUltimate(item(), { level: 4 }, { roll: 0 }).reason, 'RARITY_NOT_ELIGIBLE');
  const gear = item({ rarity: 'legendary' });
  assert.equal(resolveUltimate(gear, { level: 4 }, { roll: 0.999 }).record.sealed, true);
  assert.equal(resolveUltimate(gear, { level: 4 }, { roll: 0.999, protectedAttempt: true }).outcome, 'protected');
  assert.deepEqual(resolveUltimate(gear, { level: 4, sealed: true }, { roll: 0 }).record, { level: 5, sealed: false });
});
