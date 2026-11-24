import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS, CLASSES } from '../src/components/duelist/core/classes.mjs';
import { createFighter, press } from '../src/components/duelist/core/fighter.mjs';
import { moveFor } from '../src/components/duelist/core/ranks.mjs';

for (const classId of CLASS_IDS) {
  for (const [slot, ability] of CLASSES[classId].abilities.entries()) {
    test(classId + ' slot ' + (slot + 1) + ': ' + ability.id + ' pays once and respects cooldown', () => {
      const f = createFighter({ id: 'actor', classId });
      const move = moveFor(f, ability.id);
      assert.ok(move);
      const before = { will: f.vitals.will, stamina: f.vitals.stamina };
      const command = 'ability' + (slot + 1);
      assert.deepEqual(press(f, command, 10), { accepted: true, id: ability.id });
      assert.equal(f.action.id, ability.id);
      assert.equal(f.vitals.will, before.will - move.will);
      assert.equal(f.vitals.stamina, before.stamina - move.stamina);
      if (move.cooldown > 0) {
        assert.equal(f.cooldowns[ability.id], 10 + move.cooldown);
        assert.equal(press(f, command, 10).reason, 'cooldown');
        assert.equal(f.vitals.will, before.will - move.will);
        assert.equal(f.vitals.stamina, before.stamina - move.stamina);
      }
      if (move.will > 0) {
        const exhausted = createFighter({ id: 'exhausted', classId });
        exhausted.vitals.will = 0;
        assert.equal(press(exhausted, command, 10).reason, 'will');
        assert.equal(exhausted.action, null);
        assert.deepEqual(exhausted.cooldowns, {});
      }
    });
  }
  test(classId + ' rejects foreign class moves even through internal move dispatch', () => {
    const own = new Set(CLASSES[classId].abilities.map(a => a.id));
    const foreign = new Set(CLASS_IDS.flatMap(id => CLASSES[id].abilities.map(a => a.id)).filter(id => !own.has(id)));
    for (const id of foreign) {
      const f = createFighter({ id: 'actor', classId });
      const before = { ...f.vitals };
      assert.deepEqual(press(f, '#' + id, 10), { accepted: false, reason: 'class' });
      assert.equal(f.action, null);
      assert.deepEqual(f.vitals, before);
      assert.deepEqual(f.cooldowns, {});
    }
  });
}
