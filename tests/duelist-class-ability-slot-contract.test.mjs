import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS, CLASSES, classAbilityMove, visibleClassAbilities } from '../src/components/duelist/core/classes.mjs';

test('all four classes map every server ability slot to their own configured move', () => {
  for (const classId of CLASS_IDS) {
    const abilities = CLASSES[classId].abilities;
    assert.equal(abilities.length, 4);
    for (let slot = 0; slot < abilities.length; slot++) {
      assert.equal(classAbilityMove(classId, slot), abilities[slot].id, `${classId} slot ${slot}`);
      assert.equal(abilities[slot].implemented, true);
      assert.match(abilities[slot].animation, /^class\.power\./);
    }
  }
});

test('invalid ability slots and class identifiers never resolve to a move', () => {
  for (const classId of [...CLASS_IDS, 'unknown', '__proto__', 'constructor', null]) {
    for (const slot of [-1, 4, 999, 1.5, NaN, Infinity, '0', null, undefined, {}, []]) {
      assert.equal(classAbilityMove(classId, slot), null);
    }
  }
  assert.equal(classAbilityMove('unknown', 0), null);
});

test('rotated three-button HUD selection maps to authoritative slot indices without changing class moves', () => {
  for (const classId of CLASS_IDS) {
    for (let first = -4; first <= 8; first++) {
      const visible = visibleClassAbilities(classId, first);
      assert.equal(visible.length, 3);
      for (let index = 0; index < visible.length; index++) {
        const slot = (((first + index) % 4) + 4) % 4;
        assert.equal(visible[index].id, classAbilityMove(classId, slot));
      }
    }
  }
});

test('class animation identifiers are stable, class-scoped, and immutable metadata', () => {
  const animationIds = new Set();
  for (const classId of CLASS_IDS) {
    const def = CLASSES[classId];
    assert.equal(Object.isFrozen(def), true);
    assert.equal(Object.isFrozen(def.abilities), true);
    assert.equal(Object.isFrozen(def.animationSlots), true);
    assert.equal(Object.isFrozen(def.special), true);
    for (const [slot, animation] of Object.entries(def.animationSlots)) {
      assert.match(animation, new RegExp('^class\\.' + classId + '\\.'));
      assert.equal(animationIds.has(animation), false, classId + ' ' + slot);
      animationIds.add(animation);
    }
    assert.match(def.special.animation, new RegExp('^class\\.' + classId + '\\.special\\.'));
    for (const ability of def.abilities) {
      assert.equal(Object.isFrozen(ability), true);
      assert.equal(ability.animation, 'class.power.' + ability.id);
    }
  }
});
