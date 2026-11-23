// Duelist Adventure: the sword's cuts by direction in three modes (core/cuts.mjs; clips from
// tools/duelist/blender/cut_grid.py). Nine lines a mode, each with a clip of its own made to the rules' seconds; a
// cut that follows another carries on from where the blade is; the mode key goes round swift, balanced, heavy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, FLOW, MOVE_MOTION, MOTION_CLIPS, CUT_MODES, CUT_LINES, CUT_DIRECTIONS, CUT_TIMING, CUT_IDS, CUT_POINTS, REVERSE_LINE, cutId, cutLead,
  stickDirection, createFighter, press, update, takeEvents, isClientCommand } from '../src/components/duelist/core/index.mjs';
import { createWorld, addFighter, bodyOf } from '../src/components/duelist/sim/world.mjs';
import { encodeOwn, applyOwn } from '../src/components/duelist/net/protocol.mjs';

const STEP = 1 / 120;
const run = (f, t, seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) { t += STEP; update(f, STEP, t); takeEvents(f); } return t; };

test('nine lines in each of three modes, each a sword strike with a clip of its own made to the same seconds', () => {
  assert.equal(CUT_IDS.length, 27);
  for (const mode of CUT_MODES) {
    const t = CUT_TIMING[mode];
    const total = t.wind + t.cut + t.hold + t.rec;
    for (const direction of ['stand', ...CUT_DIRECTIONS]) {
      const id = cutId(direction, mode);
      const move = MOVES[id];
      assert.equal(move?.weapon, 'sword', id);
      assert.deepEqual(move.cut, { direction, mode, from: CUT_LINES[direction].from, to: CUT_LINES[direction].to });
      assert.ok(Math.abs(move.duration - total) < 1e-6, `${id}: lasts the mode's seconds`);
      const clip = MOTION_CLIPS[id];
      assert.equal(clip?.source, 'blender', `${id}: a clip of that name, made for it`);
      assert.ok(Math.abs(clip.duration - total) < 1 / 60 + 1e-6, `${id}: the clip is as long as the move (${clip.duration} s, ${total.toFixed(3)} s)`);
      assert.equal(MOVE_MOTION[id].segments[0].clip, id);
      // the sword hand is fastest while the blade is in front: inside the move's active part, give or take a frame
      // (up to the end of the follow-through: a quick mode may come back to its stance faster still)
      const peak = clip.peaks.filter((p) => p.hand[0] === 'r' && p.t < move.startup + move.active + 0.06).sort((a, b) => b.speed - a.speed)[0];
      assert.ok(peak.t > move.startup - 1 / 30 && peak.t < move.startup + move.active + 1 / 30, `${id}: the hand peaks at ${peak.t} s, contact from ${move.startup} s`);
    }
  }
  // the modes differ as they should: swift is the quickest and lightest, heavy the slowest and hardest
  const [swift, balanced, heavy] = CUT_MODES.map((mode) => MOVES[cutId('forward', mode)]);
  assert.ok(swift.startup < balanced.startup && balanced.startup < heavy.startup);
  assert.ok(swift.damage < balanced.damage && balanced.damage < heavy.damage);
  assert.equal(heavy.stamina, 0, 'even heavy attacks cost no stamina');
  assert.equal(balanced.stamina, 0, 'balanced attacks cost no stamina');
  assert.ok(heavy.knockback > balanced.knockback);
});

test('the stick has eight ways; each is a line between two points and the blade travels toward the key', () => {
  assert.deepEqual([stickDirection(1, 0), stickDirection(1, 1), stickDirection(0, 1), stickDirection(-1, 1), stickDirection(-1, 0), stickDirection(-1, -1), stickDirection(0, -1), stickDirection(1, -1)],
    ['forward', 'forwardRight', 'right', 'backRight', 'back', 'backLeft', 'left', 'forwardLeft']);
  assert.equal(stickDirection(0.3, 0.3), null, 'a light touch is no direction');
  const side = (p) => (p.includes('L') ? 'left' : p.includes('R') ? 'right' : 'middle');
  const height = (p) => (p.includes('T') ? 'top' : p.includes('B') ? 'bottom' : 'level');
  for (const d of CUT_DIRECTIONS) {
    const { from, to } = CUT_LINES[d];
    assert.ok(CUT_POINTS.includes(from) && CUT_POINTS.includes(to) && from !== to);
    if (/left/i.test(d)) assert.equal(side(to), 'left', `${d} ends on the left`);
    if (/right/i.test(d)) assert.equal(side(to), 'right', `${d} ends on the right`);
    if (d.startsWith('forward')) assert.equal(height(to), 'bottom', `${d} cuts downward`);
    if (d.startsWith('back')) assert.equal(height(to), 'top', `${d} cuts upward`);
    // the return cut runs the same line the other way
    assert.deepEqual([CUT_LINES[REVERSE_LINE[d]].from, CUT_LINES[REVERSE_LINE[d]].to], [to, from]);
  }
  assert.deepEqual([CUT_LINES.stand.from, CUT_LINES.stand.to], ['R', 'L'], 'standing still: a flat cut to the left');
});

test('a cut that follows another carries on from where the blade is: straight back is about half again as quick', () => {
  const at = (d, mode = 'balanced') => MOVES[cutId(d, mode)];
  assert.equal(cutLead(at('left'), at('right')), cutLead(at('forward'), at('back')));
  assert.ok(cutLead(at('left'), at('right')) > cutLead(at('left'), at('forward')), 'the nearer the start, the more is skipped');
  assert.equal(cutLead(at('left'), at('left')), 0, 'the same cut again starts from the far side: nothing skipped');
  assert.equal(cutLead(MOVES.swordHeavy, at('left')), 0, 'only after a cut');
  for (const mode of CUT_MODES) {
    const ratio = at('right', mode).startup / (at('right', mode).startup - cutLead(at('left', mode), at('right', mode)));
    assert.ok(ratio > 1.35 && ratio < 1.75, `${mode}: the return lands ${ratio.toFixed(2)} times sooner`);
  }
  // in a fight: a cut to the left, then one to the right in its window, starts part-way in and lands sooner
  const f = createFighter({ id: 'a', weapon: 'sword' });
  press(f, 'light', 0, { direction: 'left' });
  assert.equal(f.action.t, 0);
  const t = run(f, 0, f.action.move.chain.from + 0.02);
  assert.equal(press(f, 'light', t, { direction: 'right' }).id, 'swordCutRightBalanced');
  assert.equal(f.action.t, cutLead(at('left'), at('right')));
  assert.equal(takeEvents(f).find((e) => e.type === 'start').lead, f.action.t);
});

test('the mode key goes round swift, balanced, heavy; the next strike is made in the new mode, and it travels over the wire', () => {
  assert.ok(isClientCommand('mode'));
  const w = createWorld();
  const f = addFighter(w, { id: 'a' });
  assert.equal(f.mode, 'balanced');
  assert.deepEqual(press(f, 'mode', 0), { accepted: true, mode: 'heavy' });
  assert.equal(takeEvents(f).find((e) => e.type === 'mode').mode, 'heavy');
  assert.equal(press(f, 'light', 0, { direction: 'forward' }).id, 'swordCutDownHeavy');
  // changed mid-strike: the strike in hand is as it was, the one that follows is in the new mode
  press(f, 'mode', 0.1);
  assert.equal(f.mode, 'swift');
  assert.equal(f.action.id, 'swordCutDownHeavy');
  const t = run(f, 0, f.action.move.chain.from + 0.02);
  assert.equal(press(f, 'light', t, { direction: 'left' }).id, 'swordCutLeftSwift');
  const other = createWorld();
  const copy = addFighter(other, { id: 'a' });
  applyOwn(copy, bodyOf(other, 'a'), JSON.parse(JSON.stringify(encodeOwn(f, bodyOf(w, 'a'), t))));
  assert.equal(copy.mode, 'swift');
  assert.equal(copy.action.id, 'swordCutLeftSwift');
  press(f, 'mode', t);
  assert.equal(f.mode, 'balanced', 'and round again');
  // every mode's table has all nine, and the sword's old strikes still count as the sword's
  for (const mode of CUT_MODES) assert.equal(new Set([...FLOW.sword.modes[mode].chain, ...CUT_DIRECTIONS.map((d) => FLOW.sword.modes[mode][d])]).size, 9);
  assert.ok(FLOW.sword.strikes.has('swordLight1') && FLOW.sword.strikes.has('swordCutUpLeftHeavy'));
});

test('one click is one cut: a press too early is dropped, a press in the strike waits its turn, and a chain ends', () => {
  const f = createFighter({ id: 'a', weapon: 'sword' });
  press(f, 'light', 0);
  // pressed again early in the wind-up (but not hard on the first: that is the whirl, below): it waits a moment
  // only, and is gone before the window opens
  let t = run(f, 0, 0.18);
  assert.equal(press(f, 'light', t).reason, 'buffered');
  f.buffer.at = t - 0.26; // as if it had been waiting longer than a press is kept
  t = run(f, t, 1 / 60);
  assert.equal(f.buffer, null, 'dropped: the press came too early to count');
  assert.equal(f.action.id, 'swordCutStandBalanced');
  // let alone, the cut runs out into the stance and the same cut may be made again
  t = run(f, t, 0.5);
  assert.equal(f.action, null);
  assert.equal(press(f, 'light', t).id, 'swordCutStandBalanced');
  // three in a chain, then the next waits for the recovery
  t = run(f, t, f.action.move.chain.from + 0.02);
  press(f, 'light', t, { direction: 'forward' });
  t = run(f, t, f.action.move.chain.from + 0.02);
  press(f, 'light', t, { direction: 'left' });
  assert.equal(f.action.link, 3);
  t = run(f, t, f.action.move.chain.from + 0.02);
  assert.equal(press(f, 'light', t, { direction: 'right' }).reason, 'buffered');
});

test('a second press hard on the first turns the cut into the whirl, the cross or the backhand; one cooldown for all three', async () => {
  const { SNAP, SNAP_COOLDOWN, SNAP_IDS, SNAP_TIMING } = await import('../src/components/duelist/core/index.mjs');
  const start = (first, second, at = 0.05, mode = null) => {
    const f = createFighter({ id: 'a', weapon: 'sword' });
    while (mode && f.mode !== mode) press(f, 'mode', 0);
    press(f, 'light', 0, { direction: first });
    const t = run(f, 0, at);
    return { f, t, res: press(f, 'light', t, { direction: second }) };
  };
  assert.equal(start(null, null).res.id, 'swordWhirlBalanced', 'a double click standing still: the whirl');
  assert.equal(start('forward', 'forward').res.id, 'swordWhirlBalanced', 'the same way again');
  assert.equal(start('forward', 'left').res.id, 'swordCrossBalanced', 'to one side of the cut');
  assert.equal(start('forward', 'back').res.id, 'swordBackhandBalanced', 'back the way it came');
  assert.equal(start('left', 'right', 0.05, 'heavy').res.id, 'swordBackhandHeavy', 'in the fighter\'s mode');
  assert.equal(start('forward', 'left', SNAP + 0.03).res.reason, 'buffered', 'too late for it: the press waits its turn');
  // it takes the cut's place in the chain, and one cooldown covers all three
  const { f, t } = start('forward', 'left');
  assert.deepEqual([f.action.id, f.action.chainedFrom, f.action.link], ['swordCrossBalanced', 'swordCutDownBalanced', 1]);
  let now = run(f, t, 1.2);
  assert.equal(f.action, null);
  press(f, 'light', now, { direction: 'forward' });
  now = run(f, now, 0.05);
  assert.equal(press(f, 'light', now, { direction: 'forward' }).reason, 'buffered', 'no second one inside the cooldown: an ordinary press');
  now = run(f, now, SNAP_COOLDOWN);
  press(f, 'light', now);
  now = run(f, now, 0.05);
  assert.equal(press(f, 'light', now).id, 'swordWhirlBalanced', 'ready again');
  // each is a sword strike with frame data, a chain window and a clip in the pack
  assert.equal(SNAP_IDS.length, 9);
  for (const id of SNAP_IDS) {
    const move = MOVES[id];
    assert.equal(move.weapon, 'sword', id);
    assert.ok(FLOW.sword.strikes.has(id) && move.chain.from > move.startup && move.cooldown === SNAP_COOLDOWN, id);
    const first = MOVE_MOTION[id].segments[0];
    assert.ok(MOTION_CLIPS[first.clip], `${id}: its clip ${first.clip} is in the pack`);
    // each has a clip of its own name, made for it to the rules' seconds (the whirl and the cross as well)
    const t = SNAP_TIMING[move.snap.kind][move.snap.mode];
    assert.equal(first.clip, id);
    assert.equal(MOTION_CLIPS[id].source, 'blender', `${id}: made for it`);
    assert.ok(Math.abs(MOTION_CLIPS[id].duration - (t.wind + t.cut + t.hold + t.rec)) < 1 / 60 + 1e-6, `${id}: as long as the move`);
    assert.ok(Math.abs(move.duration - (t.wind + t.cut + t.hold + t.rec)) < 1e-6);
    assert.ok(MOVE_MOTION[id].segments.at(-1).to[1] <= MOTION_CLIPS[first.clip].duration + 1e-6, `${id}: inside its clip`);
  }
  assert.equal(MOVES.swordWhirlBalanced.arc, 360, 'the whirl cuts all round');
});

test('the backhand reaches a foe behind the sword shoulder, and not one in front on the other side', async () => {
  const { step } = await import('../src/components/duelist/sim/world.mjs');
  const w = createWorld();
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 }); // faces +z: its right hand side is -x
  const behind = addFighter(w, { id: 'b', x: -1.1, z: -1.0, yaw: 0 });
  const front = addFighter(w, { id: 'c', x: 1.3, z: 0.9, yaw: Math.PI });
  const left = (f) => f.vitals.hp + f.vitals.will + f.vitals.shield;
  const before = { b: left(behind), c: left(front) };
  const idle = { move: { x: 0, z: 0 }, face: 0, presses: [] };
  step(w, 1 / 60, { a: { move: { x: 0, z: 1 }, face: 0, presses: ['light'] } });
  step(w, 1 / 60, { a: idle });
  step(w, 1 / 60, { a: { move: { x: 0, z: -1 }, face: 0, presses: ['light'] } });
  assert.equal(w.fighters.get('a').action.id, 'swordBackhandBalanced');
  for (let i = 0; i < 50; i++) step(w, 1 / 60, { a: idle });
  assert.ok(left(behind) < before.b - 1, `the one behind is hit (${before.b} to ${left(behind).toFixed(1)})`);
  assert.ok(left(front) >= before.c - 1e-6, 'the one in front on the other side is not');
});

test('a class fights in one mode: the Healer swift, the Warrior heavy; a fighter with no class keeps the mode key', async () => {
  const { CLASS_MODE, modeOf } = await import('../src/components/duelist/core/index.mjs');
  assert.deepEqual(CLASS_MODE, { healer: 'swift', warrior: 'heavy' });
  const healer = createFighter({ id: 'h', weapon: 'sword', classId: 'healer' });
  const warrior = createFighter({ id: 'w', weapon: 'sword', classId: 'warrior' });
  assert.equal(press(healer, 'light', 0, { direction: 'forward' }).id, 'swordCutDownSwift');
  assert.equal(press(warrior, 'light', 0, { direction: 'left' }).id, 'swordCutLeftHeavy');
  assert.deepEqual(press(warrior, 'mode', 0), { accepted: false, reason: 'class-stance' });
  assert.equal(modeOf(warrior), 'heavy');
  // the second press hard on the first is made in the class's mode as well
  const t = run(warrior, 0, 0.05);
  assert.equal(press(warrior, 'light', t, { direction: 'left' }).id, 'swordWhirlHeavy');
  const plain = createFighter({ id: 'p', weapon: 'sword' });
  assert.equal(modeOf(plain), 'balanced');
  assert.equal(press(plain, 'mode', 0).mode, 'heavy');
});

test('a cut does not root the fighter: it moves on under it at the mode\'s share of the run; a heavy strike still plants the feet', async () => {
  const { step } = await import('../src/components/duelist/sim/world.mjs');
  const { CUT_PACE, MOVE_SPEED } = await import('../src/components/duelist/core/index.mjs');
  for (const [classId, mode] of [[null, 'balanced'], ['healer', 'swift'], ['warrior', 'heavy']]) {
    const w = createWorld();
    const f = addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0, classId, weapon: 'sword' });
    const held = { move: { x: 0, z: 1 }, run: true, face: 0, presses: [] };
    step(w, 1 / 60, { a: { ...held, presses: ['light'] } });
    assert.equal(f.action.move.cut.mode, mode);
    for (let i = 0; i < 6; i++) step(w, 1 / 60, { a: held });
    assert.ok(f.action.t < f.action.move.startup, 'still in the wind-up');
    assert.ok(Math.abs(bodyOf(w, 'a').speed - MOVE_SPEED.run * CUT_PACE[mode]) < 0.05, `${mode}: ${bodyOf(w, 'a').speed.toFixed(2)} m/s under the cut`);
    assert.ok(bodyOf(w, 'a').z > 0.15);
  }
  assert.ok(CUT_PACE.swift > CUT_PACE.balanced && CUT_PACE.balanced > CUT_PACE.heavy, 'the heavier the mode, the slower the feet');
  // the heavy strike (its own button) is a commitment as before
  const w = createWorld();
  addFighter(w, { id: 'a', x: 0, z: 0, yaw: 0 });
  step(w, 1 / 60, { a: { move: { x: 1, z: 0 }, run: true, face: 0, presses: ['heavy'] } });
  for (let i = 0; i < 6; i++) step(w, 1 / 60, { a: { move: { x: 1, z: 0 }, run: true, face: 0, presses: [] } });
  // (it follows its own clip, which leans a little; running would have carried it half a metre to the side)
  assert.equal(bodyOf(w, 'a').speed, 0, 'the stick does not move it through its wind-up');
  assert.ok(Math.abs(bodyOf(w, 'a').x) < 0.15, `it went ${bodyOf(w, 'a').x.toFixed(2)} m to the side`);
});

test('the twin blades and the staff cut the same nine lines, each in one mode, with clips of their own', async () => {
  const { FORM_CUT_IDS, FORM_TIMING, formCutId, snapFor } = await import('../src/components/duelist/core/index.mjs');
  assert.equal(FORM_CUT_IDS.length, 18);
  for (const [weapon, links] of [['dualBlades', 4], ['staff', 3]]) {
    const t = FORM_TIMING[weapon];
    const total = t.wind + t.cut + t.hold + t.rec;
    assert.equal(FLOW[weapon].chain.length, links);
    for (const direction of ['stand', ...CUT_DIRECTIONS]) {
      const id = formCutId(weapon, direction);
      const move = MOVES[id];
      assert.equal(move?.weapon, weapon, id);
      assert.deepEqual([move.cut.from, move.cut.to], [CUT_LINES[direction].from, CUT_LINES[direction].to]);
      assert.ok(move.mobile > 0, `${id}: the legs keep going under it`);
      assert.equal(MOTION_CLIPS[id]?.source, 'blender', `${id}: a clip of that name`);
      assert.ok(Math.abs(MOTION_CLIPS[id].duration - total) < 1 / 60 + 1e-6, `${id}: as long as the move`);
      const f = createFighter({ id: 'a', weapon });
      assert.equal(press(f, 'light', 0, { direction: direction === 'stand' ? null : direction }).id, id);
    }
    // the cut back along the line starts part-way in, as the sword's does
    assert.ok(cutLead(MOVES[formCutId(weapon, 'left')], MOVES[formCutId(weapon, 'right')]) > 0);
    // a second press hard on the first: three moves the form already had, one cooldown for all
    const f = createFighter({ id: 'a', weapon });
    press(f, 'light', 0, { direction: 'forward' });
    const snap = press(f, 'light', run(f, 0, 0.05), { direction: 'forward' });
    assert.equal(snap.id, snapFor(weapon, 'forward', 'forward'));
    assert.equal(MOVES[snap.id].weapon, weapon);
    assert.deepEqual(press(createFighter({ id: 'b', weapon }), 'mode', 0), { accepted: false, reason: 'weapon' }, 'one mode only: no mode key');
  }
  assert.ok(MOVES.bladesCutLeft.startup < MOVES.swordCutLeftBalanced.startup, 'the blades are quicker than the sword');
  assert.ok(MOVES.staffCutLeft.range > MOVES.swordCutLeftBalanced.range, 'the staff reaches farther');
  assert.ok(MOVES.bladesCutLeft.veilMultiplier > 1, 'the blades are hard on the Veil');
});
