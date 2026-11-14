import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the real local upgrade entry points with an unowned item. Isolating
// each small function lets us check its early-exit behavior without booting the
// browser, loot store, or backend. The legitimate purchase flow still needs E2E.
const code = fs.readFileSync('src/components/game3d/equipment/enchantmentStore.jsx', 'utf8');

function unownedUpgrade(name) {
  const prefix = `export const ${name} = `;
  const start = code.indexOf(prefix);
  assert.notEqual(start, -1, `Missing ${name} upgrade entry point`);
  const end = code.indexOf('\n};', start);
  assert.notEqual(end, -1, `Could not isolate ${name}`);
  const declaration = code.slice(start, end + 3).replace(/^export const /, 'const ');
  return new Function('getAXEEquipmentItem', 'ENCH_SLOTS', `${declaration}\nreturn ${name};`)(() => null, 4);
}

test('Crescent Moon Blacksmith must reject a missing item before any material debit', () => {
  assert.deepEqual(unownedUpgrade('reinforceItem')('dev_crescent_moon_chest'), {
    ok: false, reason: 'item_not_owned',
  });
  assert.deepEqual(unownedUpgrade('overEnchantItem')('dev_crescent_moon_chest'), {
    ok: false, reason: 'item_not_owned',
  });
  assert.deepEqual(unownedUpgrade('enchantSlot')('dev_crescent_moon_chest', 0), {
    ok: false, reason: 'item_not_owned',
  });
});

test('a delayed server reply cannot reintroduce enhancement state for a deleted item', () => {
  const start = code.indexOf('export function setServerUpgradeRecord(');
  const end = code.indexOf('\n}\n\nexport const reinforceItem', start);
  assert.ok(start >= 0 && end > start, 'Cannot locate server-upgrade record adapter');
  const declaration = code.slice(start, end + 2).replace(/^export /, '');
  const setServerUpgradeRecord = new Function(
    'getAXEEquipmentItem', `${declaration}\nreturn setServerUpgradeRecord;`,
  )(() => null);
  assert.equal(setServerUpgradeRecord('reinforcement', 'unowned', { percent: 5 }), false);
  assert.equal(setServerUpgradeRecord('over_enchant', 'unowned', { level: 1 }), false);
});
