// Original Duelist Adventure combat motions. The four crystal forms borrow only the broad
// swordplay vocabulary of older games; clips and frame data are generated for this game.
// They must never substitute a single-sword strike for a staff or twin-blade execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_IDS, CLASSES, classAtSpawn, MOVES, FLOW, MOTION_CLIPS,
  MOVE_MOTION, clipAt, travelAt, createFighter, press,
} from '../src/components/duelist/core/index.mjs';

const FORM = Object.freeze({
  warrior: { weapon: 'sword', mode: 'heavy', opening: 'swordCutStandHeavy', heavy: 'swordHeavy', color: 0xff4a3d },
  healer: { weapon: 'sword', mode: 'swift', opening: 'swordCutStandSwift', heavy: 'swordHeavy', color: 0x6cc8ff },
  duelist: { weapon: 'dualBlades', mode: 'balanced', opening: 'bladesCutStand', heavy: 'bladesHeavy', color: 0xffcf6a },
  assassin: { weapon: 'staff', mode: 'balanced', opening: 'staffCutStand', heavy: 'staffHeavy', color: 0xb779ff },
});

test('the four canonical classes spawn into their own weapon forms and sword stances', () => {
  assert.deepEqual([...CLASS_IDS].sort(), Object.keys(FORM).sort());
  for (const [id, expected] of Object.entries(FORM)) {
    const def = CLASSES[id];
    assert.equal(def.weapon, expected.weapon, id);
    assert.equal(def.color, expected.color, id);
    assert.equal(classAtSpawn({ currentClass: id }).weapon, expected.weapon, id);
    const fighter = createFighter({ id, team: 'crew', classId: id, weapon: expected.weapon });
    assert.equal(fighter.mode, expected.mode, id);
    assert.equal(fighter.classId, id);
    assert.equal(press(fighter, 'light', 0).id, expected.opening, id);
    assert.equal(fighter.action.id, expected.opening);
    assert.equal(clipAt(fighter.action.id, 0).clip, expected.opening,
      `${id}: opening animation matches server-authorized action`);
    assert.equal(MOTION_CLIPS[expected.opening].source, 'blender',
      `${id}: first strike uses an original clip, not legacy binaries`);
  }
});

test('single-blade blue and red forms have distinct strike timing and class-locked stance', () => {
  const heavy = MOVES.swordCutStandHeavy;
  const swift = MOVES.swordCutStandSwift;
  assert.ok(heavy.startup > swift.startup, 'heavy wind-up is visibly telegraphed');
  assert.ok(heavy.duration > swift.duration, 'swift is more responsive');
  assert.ok(heavy.damage > swift.damage, 'slower heavy stroke hits harder');
  for (const id of ['warrior', 'healer']) {
    const f = createFighter({ id, classId: id, weapon: 'sword' });
    assert.deepEqual(press(f, 'mode', 0), { accepted: false, reason: 'class-stance' },
      'players cannot change a locked class to the other sword stance');
  }
});

test('twin blades and staff use their own original directional attacks and recovery windows', () => {
  for (const [id, weapon, prefix] of [
    ['duelist', 'dualBlades', 'blades'],
    ['assassin', 'staff', 'staff'],
  ]) {
    const flow = FLOW[weapon];
    assert.ok(flow.chain.length >= 3);
    assert.ok(flow.chain.every(moveId => moveId.startsWith(prefix) && MOVES[moveId]?.weapon === weapon),
      `${id}: chain never silently plays single-sword attacks`);
    for (const id of ['stand', 'left', 'right', 'forward', 'back']) {
      // The neutral strike is the first chain entry; directional inputs have explicit lookups.
      const moveId = id === 'stand' ? flow.chain[0] : flow.modes.balanced[id];
      assert.equal(MOVES[moveId].weapon, weapon);
      const { clip } = clipAt(moveId, 0);
      assert.equal(clip, moveId);
      assert.equal(MOTION_CLIPS[clip].source, 'blender');
      assert.ok(MOVES[moveId].active > 0 && MOVES[moveId].startup > 0);
    }
  }
});

test('execution animations follow their own class weapon, not a generic sword attack', () => {
  const dual = MOVE_MOTION.execution;
  const staff = MOVE_MOTION.shadowExecution;
  assert.ok(dual.segments.every(s => s.clip === 'bladesHeavy'));
  assert.ok(staff.segments.every(s => s.clip === 'staffHeavy'));
  assert.equal(dual.settle.clip, 'bladesHeavy');
  assert.equal(staff.settle.clip, 'staffHeavy');
  assert.equal(MOTION_CLIPS[staff.settle.clip].source, 'blender');
  assert.ok(MOTION_CLIPS[staff.settle.clip].duration > staff.settle.from,
    'the staff has a real follow-through, not a frozen attack frame');
  for (const id of ['execution', 'shadowExecution']) {
    const move = MOVES[id];
    const intro = clipAt(id, move.startup - 0.001);
    const contact = clipAt(id, move.startup + move.active / 2);
    const recovery = clipAt(id, move.startup + move.active + 0.001);
    assert.equal(intro.clip, contact.clip);
    assert.equal(contact.clip, recovery.clip);
    assert.ok(intro.time < contact.time && contact.time < recovery.time,
      `${id} advances through anticipation, contact and recovery`);
    for (const t of [0, move.startup, move.startup + move.active, move.duration]) {
      assert.deepEqual(travelAt(id, t), { forward: 0, right: 0 },
        `${id}: execution motion may not change server-authorized range or position`);
    }
  }
  const peak = MOTION_CLIPS.staffHeavy.peaks.find(p => p.hand === 'right');
  const begin = clipAt('shadowExecution', MOVES.shadowExecution.startup).time;
  const end = clipAt('shadowExecution', MOVES.shadowExecution.startup + MOVES.shadowExecution.active).time;
  assert.ok(peak.t >= begin && peak.t <= end, 'staff contact peak aligns with execution active frames');
});
