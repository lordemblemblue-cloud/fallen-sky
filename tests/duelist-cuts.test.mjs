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
      const peak = clip.peaks.filter((p) => p.hand[0] === 'r').sort((a, b) => b.speed - a.speed)[0];
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
  // mashed at once: it waits a moment only, and is gone before the window opens
  assert.equal(press(f, 'light', 0.01).reason, 'buffered');
  let t = run(f, 0, f.action.move.chain.from - 0.01);
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
