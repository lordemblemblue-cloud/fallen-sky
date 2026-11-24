import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS, classAbilityMove } from '../src/components/duelist/core/classes.mjs';
import { parseClassAbilityIntent, resolveClassAbilityIntent } from '../src/components/duelist/sim/classAbilityIntentBoundary.mjs';

const intent = slot => ({ type: 'class.ability', slot });

test('four server class kits map all four ability slots without client move names', () => {
  for (const classId of CLASS_IDS) for (let slot = 0; slot < 4; slot++) {
    assert.deepEqual(resolveClassAbilityIntent(intent(slot), classId), {
      ok: true, slot, moveId: classAbilityMove(classId, slot),
    });
  }
});

test('strict parser rejects forged identity, meter, class, move, target and state fields', () => {
  const invalid = [
    null, [], 'class.ability', {}, { type: 'class.ability' },
    { type: 'class.ability', slot: 0, seatId: 'victim' },
    { ...intent(1), classId: 'assassin' },
    { ...intent(2), moveId: 'rage' },
    { ...intent(3), specialMeter: 100 },
    { ...intent(0), targetId: 'victim' },
    { ...intent(0), dead: false },
    { ...intent(0), cooldown: 0 },
    ...[-1, 4, 0.5, NaN, Infinity, '1', null, true, 1n].map(intent),
    { type: 'class.special', slot: 0 },
  ];
  for (const packet of invalid) assert.equal(parseClassAbilityIntent(packet).ok, false);
});

test('inherited and accessor fields cannot inject an ability request', () => {
  const inherited = Object.create({ type: 'class.ability', slot: 0 });
  assert.equal(parseClassAbilityIntent(inherited).ok, false);
  const accessors = {};
  Object.defineProperty(accessors, 'type', { enumerable: true, get() { throw Error('untrusted getter'); } });
  Object.defineProperty(accessors, 'slot', { enumerable: true, value: 0 });
  assert.equal(parseClassAbilityIntent(accessors).ok, false);
  const nullPrototype = Object.assign(Object.create(null), intent(3));
  assert.deepEqual(parseClassAbilityIntent(nullPrototype), { ok: true, slot: 3 });
});

test('unknown or prototype-name classes cannot resolve client intents', () => {
  for (const id of [null, undefined, '__proto__', 'constructor', 'warrior ', 'made-up']) {
    assert.deepEqual(resolveClassAbilityIntent(intent(0), id), { ok: false, reason: 'unavailable-class-ability' });
  }
});


test('non-JSON fields and unreadable packets fail closed', () => {
  const hidden = Object.defineProperty(intent(0), 'seatId', { value: 'victim' });
  const symbol = { ...intent(0), [Symbol('meter')]: 100 };
  const nonEnumerableSlot = Object.defineProperty(intent(0), 'slot', { enumerable: false });
  const revoked = Proxy.revocable(intent(0), {});
  revoked.revoke();
  const hostile = new Proxy(intent(0), { ownKeys() { throw Error('unreadable'); } });
  for (const packet of [hidden, symbol, nonEnumerableSlot, revoked.proxy, hostile]) {
    assert.deepEqual(parseClassAbilityIntent(packet), { ok: false, reason: 'invalid-ability-request' });
  }
});
