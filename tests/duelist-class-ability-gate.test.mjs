import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateClassAbility } from '../src/components/duelist/core/classAbilityGate.mjs';
import { CLASSES } from '../src/components/duelist/core/classes.mjs';

const seat = (classId = 'assassin') => ({ kind: 'player', classId });
const fighter = () => ({ vitals: { hp: 100, dead: false } });
const request = (overrides = {}) => ({ seat: seat(), fighter: fighter(), slot: 0, first: 0, now: 10, cooldowns: {}, ...overrides });

test('every class has four accessible ability intents but none falsely activates', () => {
  for (const classId of Object.keys(CLASSES)) {
    const seen = new Set();
    for (let first = 0; first < 4; first++) for (let slot = 0; slot < 3; slot++) {
      const result = evaluateClassAbility(request({ seat: seat(classId), first, slot }));
      assert.equal(result.allowed, false);
      assert.equal(result.reason, 'not-implemented');
      seen.add(result.abilityId);
    }
    assert.equal(seen.size, 4, classId);
  }
});
test('rejects bot, legacy, invalid class and dead actor', () => {
  for (const s of [null, {kind:'bot',classId:'assassin'}, seat(null), seat('__proto__')]) {
    assert.equal(evaluateClassAbility(request({ seat:s })).reason, 'no-active-class');
  }
  for (const f of [null, {vitals:{hp:0,dead:false}}, {vitals:{hp:100,dead:true}}]) {
    assert.equal(evaluateClassAbility(request({fighter:f})).reason, 'actor-defeated');
  }
});
test('rejects forged slots, offsets, clocks and cooldown data', () => {
  for (const slot of [-1,3,1.2,'0',null]) assert.equal(evaluateClassAbility(request({slot})).reason,'invalid-context');
  for (const first of [-1,4,'1']) assert.equal(evaluateClassAbility(request({first})).reason,'invalid-context');
  for (const now of [NaN,Infinity,-1]) assert.equal(evaluateClassAbility(request({now})).reason,'invalid-context');
  for (const cooldowns of [null, [], {'stealth':NaN}]) assert.equal(evaluateClassAbility(request({cooldowns})).reason, cooldowns?.stealth !== undefined ? 'invalid-cooldown' : 'invalid-context');
});
test('cooldown is authoritative and does not produce an animation', () => {
  assert.deepEqual(evaluateClassAbility(request({cooldowns:{stealth:11}})), {allowed:false,reason:'cooldown'});
  assert.equal(evaluateClassAbility(request({cooldowns:{stealth:10}})).reason,'not-implemented');
});
