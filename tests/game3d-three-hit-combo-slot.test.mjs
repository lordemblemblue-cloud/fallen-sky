import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THREE_HIT_SWORD_SKILL_ID, THREE_HIT_PREFERRED_SLOT, placeThreeHitSwordCombo,
} from '../src/components/game3d/skills/defaultComboSlot.mjs';

test('three-hit sword combo uses hotbar key 3 when available', () => {
  const original = Array(10).fill(null);
  const result = placeThreeHitSwordCombo(original);
  assert.equal(result[THREE_HIT_PREFERRED_SLOT], THREE_HIT_SWORD_SKILL_ID);
  assert.equal(original[THREE_HIT_PREFERRED_SLOT], null, 'existing save is not mutated');
});

test('occupied key 3 uses the first free slot without replacing equipped abilities', () => {
  const original = ['aegis_shield', null, 'focus', null, ...Array(6).fill(null)];
  const result = placeThreeHitSwordCombo(original);
  assert.equal(result[1], THREE_HIT_SWORD_SKILL_ID);
  assert.equal(result[2], 'focus');
  assert.equal(result[0], 'aegis_shield');
});

test('full loadouts stay intact and the combo is not duplicated', () => {
  const full = Array.from({length: 10}, (_, i) => 'skill_' + i);
  assert.equal(placeThreeHitSwordCombo(full), full);
  const alreadyEquipped = ['sword_triple_slash', ...Array(9).fill(null)];
  assert.equal(placeThreeHitSwordCombo(alreadyEquipped), alreadyEquipped);
});

test('malformed input is ignored without inventing slots', () => {
  assert.equal(placeThreeHitSwordCombo(null), null);
  assert.deepEqual(placeThreeHitSwordCombo([]), []);
});
