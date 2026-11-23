import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASS_IDS, CLASSES, SPECIAL_MAX } from '../src/components/duelist/core/classes.mjs';
import { settleSpecialSpend } from '../src/components/duelist/sim/specialMeterSettlement.mjs';

test('all four class specials consume exactly their defined server-owned cost', () => {
  for (const id of CLASS_IDS) {
    const cost = CLASSES[id].special.cost;
    assert.ok(cost > 0 && cost <= SPECIAL_MAX, id);
    assert.equal(settleSpecialSpend(SPECIAL_MAX, cost), SPECIAL_MAX - cost, id);
    assert.equal(settleSpecialSpend(cost, cost), 0, id);
    assert.equal(settleSpecialSpend(0, cost), null, id);
  }
});

test('invalid effect costs cannot create NaN, negative charge or free meter', () => {
  for (const cost of [undefined, null, NaN, Infinity, -Infinity, -1, 0, 101, '10', {}, []]) {
    assert.equal(settleSpecialSpend(70, cost), null, String(cost));
  }
  for (const meter of [undefined, null, NaN, Infinity, -Infinity, -1, 101, '100', {}]) {
    assert.equal(settleSpecialSpend(meter, 10), null, String(meter));
  }
  assert.equal(settleSpecialSpend(70, 71), null);
  assert.equal(settleSpecialSpend(100, 33), 67);
  assert.equal(settleSpecialSpend(100, 100), 0);
  assert.equal(settleSpecialSpend(0, 0), null);
});

test('match settlement applies only to human class seats, never bots or legacy seats', () => {
  const match = readFileSync(new URL('../src/components/duelist/sim/match.mjs', import.meta.url), 'utf8');
  assert.match(match, /if \(s\?\.kind === 'player' && s\.classId\) \{/);
  assert.match(match, /const remaining = settleSpecialSpend\(s\.specialMeter, e\.cost\);/);
  assert.match(match, /if \(remaining !== null\) s\.specialMeter = remaining;/);
});
