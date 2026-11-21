// Duelist Adventure: the moves' clips. Every mapped clip exists in the motion pack, each segment's clip time
// stays inside its clip, the strike's fastest swing lands in the move's active window, and the clip's travel
// moves the body smoothly (no jumps between frames).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, MOTION_CLIPS, MOVE_MOTION, clipAt, travelAt } from '../src/components/duelist/core/index.mjs';

test('every move clip is in the pack and its times stay inside the clip', () => {
  for (const [id, { segments, settle }] of Object.entries(MOVE_MOTION)) {
    assert.ok(MOVES[id], `${id} is a move`);
    for (const s of segments) {
      const info = MOTION_CLIPS[s.clip];
      assert.ok(info, `${id}: ${s.clip} is in the pack`);
      assert.ok(s.from[1] >= 0 && s.to[1] <= info.duration + 1e-6, `${id}: ${s.clip} ${s.from[1]}-${s.to[1]} inside ${info.duration}`);
      assert.ok(s.to[0] >= s.from[0], `${id}: segment runs forward`);
    }
    assert.ok(Math.abs(segments[segments.length - 1].to[0] - MOVES[id].duration) < 1e-9, `${id}: the clip covers the whole move`);
    if (settle) assert.ok(MOTION_CLIPS[settle.clip], `${id}: settle ${settle.clip} is in the pack`);
  }
});

test("a strike's fastest swing falls in its move's active window", () => {
  for (const id of ['swordLight1', 'swordLight2', 'swordLight3', 'swordHeavy']) {
    const move = MOVES[id];
    const { clip } = clipAt(id, 0);
    const peak = MOTION_CLIPS[clip].peaks.filter((p) => p.hand === 'right').sort((a, b) => b.speed - a.speed)[0];
    const atStart = clipAt(id, move.startup - 0.02).time;
    const atEnd = clipAt(id, move.startup + move.active + 0.02).time;
    assert.ok(peak.t >= atStart && peak.t <= atEnd, `${id}: swing at ${peak.t}s of ${clip}, active shows ${atStart.toFixed(2)}-${atEnd.toFixed(2)}`);
  }
});

test('travel is smooth and ends where the clip says', () => {
  for (const id of Object.keys(MOVE_MOTION)) {
    const d = MOVES[id].duration;
    let prev = travelAt(id, 0);
    assert.ok(Math.abs(prev.forward) < 1e-9 && Math.abs(prev.right) < 1e-9, `${id} starts in place`);
    for (let t = 1 / 120; t <= d; t += 1 / 120) {
      const now = travelAt(id, t);
      const step = Math.hypot(now.forward - prev.forward, now.right - prev.right);
      assert.ok(step < 0.12, `${id}: ${step.toFixed(3)} m in one 120 Hz step at ${t.toFixed(3)}s`);
      prev = now;
    }
  }
  assert.ok(travelAt('swordLight1', MOVES.swordLight1.duration).forward > 0.4, 'the first cut steps in');
  assert.ok(Math.abs(travelAt('swordLight2', MOVES.swordLight2.duration).forward) < 0.05, 'the second cut stays');
});

// ---- the class weapons' own clips (made in Blender: tools/duelist/blender/weapon_clips.py)
const CLASS_STRIKES = {
  bladesLight1: 'left', bladesLight2: 'right', bladesLight3: 'right', bladesLight4: 'right', bladesHeavy: 'right',
  staffLight1: 'right', staffLight3: 'right', staffHeavy: 'right',
};

test('the twin blades and the staff play clips of their own, not the sword\'s', () => {
  for (const id of Object.keys(MOVES).filter((m) => /^(blades|staff)/.test(m))) {
    const { segments, settle } = MOVE_MOTION[id];
    for (const s of segments) assert.equal(MOTION_CLIPS[s.clip].source, 'blender', `${id} plays ${s.clip}`);
    assert.equal(settle.clip, segments[0].clip, `${id} settles in its own clip`);
    assert.ok(MOTION_CLIPS[settle.clip].duration - settle.from > 0.3, `${id}: the clip runs on into a recovery`);
  }
});

test("a class strike's fastest swing falls in its move's active window, in the hand that strikes", () => {
  for (const [id, hand] of Object.entries(CLASS_STRIKES)) {
    const move = MOVES[id];
    const { clip } = clipAt(id, 0);
    const peak = MOTION_CLIPS[clip].peaks.filter((p) => p.hand === hand).sort((a, b) => b.speed - a.speed)[0];
    assert.ok(peak, `${id}: ${clip} has a ${hand} hand swing`);
    const atStart = clipAt(id, move.startup - 0.02).time;
    const atEnd = clipAt(id, move.startup + move.active + 0.02).time;
    assert.ok(peak.t >= atStart && peak.t <= atEnd, `${id}: swing at ${peak.t}s of ${clip}, active shows ${atStart.toFixed(2)}-${atEnd.toFixed(2)}`);
  }
  // the twin blades open with the left hand: its swing is the fast one there, the right's in the next link
  const fastest = (clip) => [...MOTION_CLIPS[clip].peaks].sort((a, b) => b.speed - a.speed)[0].hand;
  assert.equal(fastest('bladesA'), 'left');
  assert.equal(fastest('bladesB'), 'right');
});

test('every stance has its idle and its guard in the pack', async () => {
  const { STANCES } = await import('../src/components/duelist/client/animator.mjs');
  for (const [name, form] of Object.entries(STANCES)) {
    assert.ok(MOTION_CLIPS[form.idle]?.loop, `${name}: ${form.idle} loops`);
    assert.ok(MOTION_CLIPS[form.guard], `${name}: ${form.guard}`);
    assert.ok(MOTION_CLIPS[form.guard].duration > 0.5, `${name}: the guard is held at 0.36 s and breathes`);
  }
});
