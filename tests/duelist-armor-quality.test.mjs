import test from 'node:test';
import assert from 'node:assert/strict';
import { armorPolicy, armorQualityFor, normalizeArmorQuality, showAttachedArmor } from '../src/components/duelist/client/armorQuality.mjs';

test('performance default for new and existing settings without armor fields', () => {
  for (const value of [undefined, null, '', 'invalid', 'constructor', {}]) assert.equal(normalizeArmorQuality(value), 'hidden');
  assert.equal(armorQualityFor({}, true), 'hidden');
  assert.equal(armorQualityFor({}, false), 'hidden');
});
test('separate personal and remote visual preferences', () => {
  const prefs = { armorQuality: 'full', otherArmorQuality: 'low' };
  assert.equal(armorQualityFor(prefs, true), 'full');
  assert.equal(armorQualityFor(prefs, false), 'low');
});
test('hidden skips attachment, low reduces detail, full restores shadows', () => {
  assert.deepEqual(armorPolicy('hidden'), { quality:'hidden', simplified:true, attachedArmor:false, armorShadows:false });
  assert.deepEqual(armorPolicy('low'), { quality:'low', simplified:true, attachedArmor:true, armorShadows:false });
  assert.deepEqual(armorPolicy('full'), { quality:'full', simplified:false, attachedArmor:true, armorShadows:true });
});

test('remote low detail culls only distant armor with hysteresis', () => {
  assert.equal(showAttachedArmor('low', false, 31 ** 2, true), false);
  assert.equal(showAttachedArmor('low', false, 27 ** 2, false), false);
  assert.equal(showAttachedArmor('low', false, 27 ** 2, true), true);
  assert.equal(showAttachedArmor('low', false, 23 ** 2, false), true);
  assert.equal(showAttachedArmor('low', true, 99 ** 2), true);
  assert.equal(showAttachedArmor('full', false, 99 ** 2), true);
  assert.equal(showAttachedArmor('hidden', true, 0), false);
});
