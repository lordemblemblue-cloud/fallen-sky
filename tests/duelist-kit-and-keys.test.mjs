// Duelist Adventure: what every fighter shares (run, dash, roll, jump) and what only its class has (its four
// abilities and its special), and the keys they are on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, CLASSES, CLASS_IDS, CLASS_ABILITIES, SPECIAL_MAX, createFighter, press, blockedReason, isClientCommand } from '../src/components/duelist/core/index.mjs';
import { createWorld, addFighter, step, bodyOf } from '../src/components/duelist/sim/world.mjs';
import { sanitizeInput } from '../src/components/duelist/net/protocol.mjs';
import { ACTIONS, DEFAULT_KEYS, keysFrom, helpLine } from '../src/components/duelist/client/bindings.mjs';

const DT = 1 / 60;
const idle = { move: { x: 0, z: 0 }, face: 0, presses: [] };

test('the keys: Shift runs, Alt dashes, C rolls, Space jumps; older saved keys move with them', () => {
  assert.deepEqual({ sprint: DEFAULT_KEYS.sprint, dash: DEFAULT_KEYS.dash, roll: DEFAULT_KEYS.roll, jump: DEFAULT_KEYS.jump },
    { sprint: 'ShiftLeft', dash: 'AltLeft', roll: 'KeyC', jump: 'Space' });
  assert.ok(ACTIONS.some((a) => a.id === 'jump' && a.kind === 'press'));
  const line = helpLine(DEFAULT_KEYS);
  for (const part of ['Shift sprint', 'Space jump', 'C roll', 'Alt dash']) assert.ok(line.includes(part), part);
  // saved before the jump existed: the roll on Space and the dash on Ctrl were only the defaults of the day
  const old = keysFrom({ forward: 'KeyW', roll: 'Space', dash: 'ControlLeft', heavy: 'KeyG' });
  assert.deepEqual({ jump: old.jump, roll: old.roll, dash: old.dash, heavy: old.heavy }, { jump: 'Space', roll: 'KeyC', dash: 'AltLeft', heavy: 'KeyG' });
  // a player who had put the roll somewhere of their own keeps it there
  assert.equal(keysFrom({ roll: 'KeyV', dash: 'KeyX' }).roll, 'KeyV');
  // and choices made since (the save has a jump) stand, even Space for the roll
  const since = keysFrom({ ...DEFAULT_KEYS, roll: 'Space', jump: 'KeyC' });
  assert.deepEqual({ roll: since.roll, jump: since.jump }, { roll: 'Space', jump: 'KeyC' });
  const all = keysFrom({});
  assert.equal(new Set(Object.values(all)).size, ACTIONS.length, 'no two actions share a key');
});

test('a jump lifts the body and sets it down again, keeping the speed it had', () => {
  const w = createWorld();
  const a = addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  const stamina = a.vitals.stamina;
  step(w, DT, { a: { ...idle, presses: ['jump'] } });
  assert.equal(a.action.id, 'jump');
  assert.ok(a.vitals.stamina < stamina, 'a jump costs stamina');
  let top = 0;
  for (let i = 0; i < 75; i++) { step(w, DT, { a: idle }); top = Math.max(top, bodyOf(w, 'a').y); } // about 1.07 s in the air
  assert.ok(top > 2.4 && top < 2.8, `rose ${top.toFixed(2)} m (owner, 2026-11-22: 2.6 m a jump)`);
  assert.equal(bodyOf(w, 'a').y, 0, 'back on the ground');
  assert.ok(Math.hypot(bodyOf(w, 'a').x, bodyOf(w, 'a').z) < 0.05, 'from a standstill it goes straight up');
  // at a run: the jump carries on the way the fighter was going
  const run = { move: { x: 0, z: 1 }, face: 0, run: true, presses: [] };
  for (let i = 0; i < 30; i++) step(w, DT, { a: run });
  const from = bodyOf(w, 'a').z;
  step(w, DT, { a: { ...run, presses: ['jump'] } });
  for (let i = 0; i < 40; i++) step(w, DT, { a: idle });
  const carried = bodyOf(w, 'a').z - from;
  assert.ok(carried > 2 && carried < 3.2, `a running jump covered ${carried.toFixed(2)} m`);
  // winded, there is no jump
  a.vitals.stamina = 0; a.vitals.winded = true;
  step(w, DT, { a: { ...idle, presses: ['jump'] } });
  assert.notEqual(a.action?.id, 'jump');
  assert.ok(isClientCommand('jump') && sanitizeInput({ s: 1, p: ['jump'] }).presses.includes('jump'), 'a browser may ask for it');
});

test('everyone can strike, guard, roll, dash, jump, breach and resist', () => {
  for (const classId of [...CLASS_IDS, null]) {
    for (const command of ['light', 'heavy', 'roll', 'dash', 'jump', 'breach']) {
      const f = createFighter({ id: 'a', weapon: classId ? CLASSES[classId].weapon : 'sword', classId });
      assert.equal(press(f, command, 0).accepted, true, `${classId || 'no class'}: ${command}`);
    }
    const f = createFighter({ id: 'a', classId });
    assert.equal(press(f, 'blockDown', 0).accepted, true);
    assert.equal(blockedReason(f, 'resist', 0), null);
  }
});

test('a class has its own four abilities and its own special, and none of another class', () => {
  const everyAbility = new Set([...CLASS_ABILITIES, 'push', 'pull', 'grip']);
  const specials = CLASS_IDS.map((c) => CLASSES[c].special.id);
  for (const classId of CLASS_IDS) {
    const def = CLASSES[classId];
    const own = new Set(def.abilities.map((a) => a.id));
    assert.equal(own.size, 4, classId);
    // keys 1-4 start the four of the kit, in order
    def.abilities.forEach((ability, slot) => {
      const f = createFighter({ id: 'a', weapon: def.weapon, classId });
      assert.deepEqual(press(f, `ability${slot + 1}`, 0), { accepted: true, id: ability.id }, `${classId} key ${slot + 1}`);
    });
    for (const id of everyAbility) {
      const f = createFighter({ id: 'a', weapon: def.weapon, classId });
      const mine = own.has(id);
      assert.equal(blockedReason(f, id, 0), mine ? null : 'class', `${classId}: ${id}`);
      // asked for by its move id (the rules' own callers): the same answer
      assert.equal(press(f, '#' + id, 0).accepted, mine, `${classId}: #${id}`);
      // the first build's power commands only work where the kit has that power
      if (['push', 'pull', 'grip'].includes(id)) assert.equal(press(createFighter({ id: 'b', weapon: def.weapon, classId }), id, 0).accepted, mine, `${classId}: ${id} command`);
    }
    for (const special of specials) {
      const f = createFighter({ id: 'a', weapon: def.weapon, classId });
      f.meter = SPECIAL_MAX;
      assert.equal(blockedReason(f, special, 0), special === def.special.id ? null : 'class', `${classId}: ${special}`);
    }
  }
  // a fighter without a class (the story crews) has the first build's powers and no class ability
  const plain = createFighter({ id: 'a' });
  for (const id of CLASS_ABILITIES) assert.equal(blockedReason(plain, id, 0), 'class', id);
  for (const id of ['push', 'pull', 'grip']) assert.equal(blockedReason(plain, id, 0), null, id);
});

test('a browser cannot ask for a move by name, and the special key is only ever the class\'s own', () => {
  const asked = sanitizeInput({ s: 1, p: ['#cloak', '#rage', 'cloak', 'rage', 'mend', 'ability2', 'special'] }).presses;
  assert.deepEqual(asked, ['ability2', 'special']);
  for (const classId of CLASS_IDS) {
    const w = createWorld();
    const a = addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0, classId, weapon: CLASSES[classId].weapon });
    addFighter(w, { id: 'foe', x: 0, z: 1.4, yaw: 0 }).vitals.hp = 10; // in reach, back turned, nearly down
    a.meter = SPECIAL_MAX;
    step(w, DT, { a: { ...idle, presses: ['special'] } });
    assert.equal(a.action?.id, CLASSES[classId].special.id, classId);
    assert.ok(MOVES[a.action.id].special);
  }
});
