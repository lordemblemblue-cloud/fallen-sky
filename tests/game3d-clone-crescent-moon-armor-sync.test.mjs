import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileInventoryArmorOverrides,
  withEquippedArmor,
} from '../src/components/game3d/armor/armorEquipCore.js';

const slots = ['helmet', 'chest', 'pants', 'gloves', 'boots', 'cape'];
const armor = slots.map((slot) => ({
  id: `crescent_moon_${slot}`,
  slot,
  gender: 'female',
  rig_id: 'fused-female-v1',
  binding: 'skinned',
  file_url: `/models/characters/fused/armor/crescent_moon/female_${slot}.glb`,
}));

test('stale Crescent Moon visuals clear when a piece is unequipped outside Game 3D', () => {
  const saved = { helmet: 'crescent_moon_helmet', chest: 'crescent_moon_chest' };
  const resolved = reconcileInventoryArmorOverrides(saved, {});
  assert.deepEqual(resolved, { helmet: '', chest: '' });
  assert.equal(saved.helmet, 'crescent_moon_helmet', 'source persistence is not mutated');
});

test('inventory ownership and equip state win over the previous stored appearance', () => {
  const saved = { helmet: 'crescent_moon_helmet', chest: '' };
  const worn = { chest: 'crescent_moon_chest', cape: 'crescent_moon_cape' };
  assert.deepEqual(reconcileInventoryArmorOverrides(saved, worn), {
    helmet: '', chest: 'crescent_moon_chest', cape: 'crescent_moon_cape',
  });
});

test('a different actually equipped armor piece replaces a stale Crescent Moon piece', () => {
  assert.deepEqual(
    reconcileInventoryArmorOverrides({ helmet: 'crescent_moon_helmet' }, { helmet: 'nightscale_helmet' }),
    { helmet: 'nightscale_helmet' },
  );
});

test('unrelated character creator armor stays untouched when no inventory armor is equipped', () => {
  assert.deepEqual(
    reconcileInventoryArmorOverrides({ helmet: 'creator_helmet', cape: '', hair: 'custom_hair' }, {}),
    { helmet: 'creator_helmet', cape: '', hair: 'custom_hair' },
  );
});

test('Eve sees only owned, equipped Crescent Moon layers and original assets remain selectable', () => {
  const appearance = { gender: 'female', selected_assets: { hair: 'custom_hair' },
    customization_assets: [{ id: 'custom_hair', slot: 'hair' }] };
  const saved = { helmet: 'crescent_moon_helmet', chest: 'crescent_moon_chest' };
  const current = { chest: 'crescent_moon_chest', boots: 'crescent_moon_boots' };
  const resolved = reconcileInventoryArmorOverrides(saved, current);
  const next = withEquippedArmor(appearance, resolved, armor, slots);
  assert.deepEqual(next.selected_assets, {
    hair: 'custom_hair', chest: 'crescent_moon_chest', boots: 'crescent_moon_boots',
  });
  assert.equal(next.customization_assets.find(a => a.slot === 'chest').file_url,
    '/models/characters/fused/armor/crescent_moon/female_chest.glb');
  assert.equal(next.customization_assets.find(a => a.slot === 'boots').file_url,
    '/models/characters/fused/armor/crescent_moon/female_boots.glb');
});

test('Adam receives no fitted Crescent Moon assets when the manifest supplies no male pieces', () => {
  const appearance = { gender: 'male', selected_assets: {}, customization_assets: [] };
  const next = withEquippedArmor(appearance,
    reconcileInventoryArmorOverrides({}, { helmet: 'crescent_moon_helmet' }), [], slots);
  assert.deepEqual(next.selected_assets, {});
  assert.deepEqual(next.customization_assets, []);
});
