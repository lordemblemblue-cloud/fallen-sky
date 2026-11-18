// The nine basic katana strikes and the combos built from them
// (weapons/katanaTechniques.mjs): the data agrees with the reference video,
// and the authored keys cut the way the video's arrows point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KATANA_STRIKES, KATANA_COMBOS, KATANA_DEFAULT_COMBO, katanaStrike, katanaCombo, katanaStrikeMoves,
  katanaComboMoves, katanaCapturedMove, katanaCapturedMoves, swordMovesForWeapon } from '../src/components/game3d/weapons/katanaTechniques.mjs';
import { KATANA_CAPTURED_MOVES } from '../src/components/game3d/weapons/katanaCapturedMoves.mjs';

/* global URL */
const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
// Where the point of a 0.75 m blade is for a key, in the swordsman's own [right, up]
// (wrist relative to the right shoulder, plus the blade).
const point = (k, reach = 0.75) => [k.r.arm[2] + k.r.blade[2] / Math.hypot(...k.r.blade) * reach,
  k.r.arm[1] + k.r.blade[1] / Math.hypot(...k.r.blade) * reach];
const keyAt = (strike, t) => strike.keys.find((k) => Math.abs(k.t - t) < 1e-9);

test('nine strikes, in the order and direction the reference video shows them', () => {
  assert.deepEqual(KATANA_STRIKES.map((s) => s.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(KATANA_STRIKES.map((s) => s.id)).size, 9);
  // Read off the video's arrows, mirrored: the swordsman faces the camera.
  // [right, up] of where the point starts and where it ends.
  const video = { 1: [[0, 1], [0, -1]], 2: [[-1, 1], [1, -1]], 3: [[1, 1], [-1, -1]], 4: [[-1, 0], [1, 0]], 5: [[1, 0], [-1, 0]],
    6: [[-1, -1], [1, 1]], 7: [[1, -1], [-1, 1]], 8: [[1, -1], [0, 1]], 9: [[-1, -1], [0, 1]] };
  let clock = 0;
  for (const strike of KATANA_STRIKES) {
    assert.deepEqual([strike.cut.from, strike.cut.to], video[strike.number], 'strike ' + strike.number + ' direction');
    assert.ok(strike.video[0] >= clock - 0.11 && strike.video[1] > strike.video[0] && strike.video[1] <= 9.6, 'strike ' + strike.number + ' video seconds');
    clock = strike.video[1];
    assert.equal(katanaStrike(strike.number), strike);
  }
  assert.equal(katanaStrike(10), null);
});

test('every strike is a quick two-handed cut that starts and ends in the same guard', () => {
  for (const strike of KATANA_STRIKES) {
    const keys = strike.keys, last = keys.at(-1);
    assert.equal(keys[0].t, 0);
    assert.ok(keys.every((k, i) => i === 0 || k.t > keys[i - 1].t), strike.name + ': keys in time order');
    assert.ok(last.t >= 0.6 && last.t <= 0.85, strike.name + ' lasts ' + last.t + ' s');
    assert.ok(strike.sweep[0] < strike.hit && strike.hit < strike.sweep[1] && strike.sweep[1] <= strike.cancel && strike.cancel < last.t,
      strike.name + ': chamber, hit, follow-through, then the next hit may start');
    assert.ok(keyAt(strike, strike.sweep[0]) && keyAt(strike, strike.hit) && keyAt(strike, strike.sweep[1]), strike.name + ': a key at each beat');
    const guardIn = { ...keys[0], t: 0 }, guardOut = { ...last, t: 0 };
    assert.deepEqual(guardIn, guardOut, strike.name + ' returns to the guard it left');
    for (const k of keys) {
      assert.ok(k.r.arm.length === 3 && k.r.blade.length === 3 && Math.hypot(...k.r.blade) > 0.5, strike.name + ': right hand carries the blade');
      assert.ok(k.l.hilt > 0.08 && k.l.hilt < 0.22 && !k.l.arm, strike.name + ': left hand on the hilt');
      assert.ok(Math.abs(k.hips[1]) <= 16, strike.name + ': hips stay facing the opponent');
      // A long blade must not be chambered point-down: the baker would lift the hands over the head.
      assert.ok(k.r.blade[1] / Math.hypot(...k.r.blade) > -0.7, strike.name + ': blade not point-down at ' + k.t);
    }
  }
});

test('the authored keys cut the way the video\'s arrows point', () => {
  for (const strike of KATANA_STRIKES) {
    const from = point(keyAt(strike, strike.sweep[0])), to = point(keyAt(strike, strike.sweep[1]));
    const moved = [to[0] - from[0], to[1] - from[1]];
    const want = [strike.cut.to[0] - strike.cut.from[0], strike.cut.to[1] - strike.cut.from[1]];
    for (const axis of [0, 1]) {
      const label = strike.number + ' ' + strike.name + (axis ? ' up/down ' : ' right/left ') + moved[axis].toFixed(2) + ' m';
      if (want[axis] === 0) assert.ok(Math.abs(moved[axis]) < 0.35, label + ' should stay level');
      // a cut that starts or ends on the centre line travels half as far sideways as one that crosses the body
      else assert.ok(Math.sign(moved[axis]) === Math.sign(want[axis])
        && Math.abs(moved[axis]) > (strike.cut.from[axis] && strike.cut.to[axis] ? 0.45 : 0.3), label);
    }
    // Where the cut starts and ends, side and height.
    for (const [at, where] of [[from, strike.cut.from], [to, strike.cut.to]]) {
      if (where[0]) assert.equal(Math.sign(at[0] + 0.17), where[0], strike.name + ': side of the body ' + at[0].toFixed(2));
      if (where[1]) assert.equal(Math.sign(at[1] + 0.1), where[1], strike.name + ': height ' + at[1].toFixed(2));
    }
  }
});

test('combos chain three hits, each starting where the last one ended', () => {
  assert.ok(KATANA_COMBOS.length >= 7);
  assert.ok(katanaCombo(KATANA_DEFAULT_COMBO));
  const used = new Set();
  for (const combo of KATANA_COMBOS) {
    assert.ok(combo.reads.length > 20);
    assert.equal((combo.strikes || combo.moves).length, 3, combo.name);
    const moves = katanaComboMoves(combo.id);
    assert.deepEqual(moves.map((m) => m.name), ['swordCombo1', 'swordCombo2', 'swordCombo3'], combo.name);
    if (!combo.strikes) continue;
    combo.strikes.forEach((n) => used.add(n));
    for (let i = 0; i + 1 < combo.strikes.length; i++) {
      const before = katanaStrike(combo.strikes[i]), after = katanaStrike(combo.strikes[i + 1]);
      const end = keyAt(before, before.sweep[1]).r.arm, start = keyAt(after, after.sweep[0]).r.arm;
      const gap = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
      assert.ok(gap < 0.3, combo.name + ': hands travel ' + gap.toFixed(2) + ' m from strike ' + before.number + ' to strike ' + after.number);
    }
  }
  assert.equal(used.size, 8, 'the authored combos between them use eight of the nine strikes');
  assert.deepEqual(katanaComboMoves('kesaFlow').map((m) => m.technique), ['diagonalDownFromRight', 'straightUpLeft', 'straightDown']);
  assert.equal(katanaComboMoves('nope'), null);
  assert.deepEqual(katanaStrikeMoves().map((m) => m.name), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => 'katanaStrike' + n));
});

test('captured moves: real footwork and timing, in the baker\'s own keys', () => {
  assert.equal(KATANA_CAPTURED_MOVES.length, 9);
  assert.deepEqual(katanaCapturedMoves().map((m) => m.name), KATANA_CAPTURED_MOVES.map((m) => m.id));
  for (const move of KATANA_CAPTURED_MOVES) {
    const last = move.keys.at(-1).t;
    assert.ok(last > 0.4 && last < 1.4, move.id + ' lasts ' + last + ' s');
    assert.ok(move.hit > 0.15 && move.hit < last && move.cancel > move.hit && move.cancel <= last, move.id + ' timing');
    assert.ok(move.sweep[0] < move.hit && move.sweep[1] > move.hit && move.sweep[1] <= last, move.id + ' sweep');
    assert.equal(move.ease, 'linear');
    assert.ok(move.armLength > 0.4 && move.armLength < 0.7);
    assert.match(move.source.capture, /Katana_swords_training/);
    let before = -1;
    for (const k of move.keys) {
      assert.ok(k.t > before, move.id + ' keys in order'); before = k.t;
      assert.ok(k.t - Math.max(0, move.keys[move.keys.indexOf(k) - 1]?.t ?? k.t) < 0.11, move.id + ' keys at most a tenth of a second apart');
      assert.ok(Math.abs(Math.hypot(...k.r.blade) - 1) < 0.02, move.id + ' blade is a direction');
      assert.ok(k.hips[0] > -0.1 && k.hips[0] < 0.65 && Math.abs(k.hips[1]) <= 180, move.id + ' hips ' + k.hips);
      assert.ok(Math.hypot(k.hips[2], k.hips[3]) < 0.75, move.id + ' stays within a step of its spot');
      assert.ok(k.l.hilt ? k.l.hilt >= 0.1 && k.l.hilt <= 0.2 : k.l.arm.length === 3);
      for (const side of ['l', 'r']) {
        const [fwd, right, yaw, lift, knee] = k.feet[side];
        assert.ok(Math.hypot(fwd, right) < 1.2 && Math.abs(yaw) <= 180 && lift >= 0 && lift < 0.6 && knee.length === 3, move.id + ' foot ' + k.feet[side]);
      }
      // the feet stay either side of each other: the left foot is never to the right of the right foot by more than a crossing step
      assert.ok(k.feet.r[1] - k.feet.l[1] > -0.35, move.id + ' feet ' + k.feet.l[1] + ' / ' + k.feet.r[1]);
    }
    // both hands hold the hilt when the cut lands
    const landing = move.keys.reduce((best, k) => (Math.abs(k.t - move.hit) < Math.abs(best.t - move.hit) ? k : best));
    assert.ok(landing.l.hilt, move.id + ' lands two-handed');
  }
  // moves that follow each other in the capture start in the pose the last one ended in
  for (const combo of KATANA_COMBOS.filter((c) => c.moves)) {
    for (let i = 0; i + 1 < 3; i++) {
      const a = katanaCapturedMove(combo.moves[i]), b = katanaCapturedMove(combo.moves[i + 1]);
      if (Math.abs(a.source.seconds[1] - b.source.seconds[0]) > 1e-6) continue;
      const end = a.keys.at(-1), start = b.keys[0];
      assert.deepEqual([end.r, end.l, end.spine, end.feet], [start.r, start.l, start.spine, start.feet], combo.name + ': ' + a.id + ' into ' + b.id);
    }
    // as a combo, the first hit starts over the character's own spot and each next hit starts where the last one stood
    const hits = katanaComboMoves(combo.id);
    assert.deepEqual(hits[0].keys[0].hips.slice(2), [0, 0], combo.name + ' opens on the spot');
    for (let i = 0; i + 1 < 3; i++) assert.deepEqual(hits[i + 1].keys[0].hips.slice(2), hits[i].keys.at(-1).hips.slice(2), combo.name + ' hit ' + (i + 2) + ' starts where hit ' + (i + 1) + ' stood');
    for (const hit of hits) for (const k of hit.keys) assert.ok(Math.hypot(k.hips[2], k.hips[3]) < 0.9, combo.name + ' stays within a step of its spot: ' + k.hips);
  }
  for (const move of katanaCapturedMoves()) assert.deepEqual(move.keys[0].hips.slice(2), [0, 0], move.name + ' alone starts on the spot');
});

test('a long two-handed blade swings the katana combo; other swords keep their three hits', () => {
  assert.equal(swordMovesForWeapon({ id: 'fantasy_sword', cls: 'sword' }), null);
  assert.equal(swordMovesForWeapon({ id: 'energy_sword', cls: 'sword' }), null);
  assert.equal(swordMovesForWeapon(null), null);
  assert.deepEqual(swordMovesForWeapon({ id: 'odachi', cls: 'greatsword' }).map((m) => m.name), ['swordCombo1', 'swordCombo2', 'swordCombo3']);
  assert.ok(swordMovesForWeapon({ id: 'moon_katana', cls: 'sword' }));
  const baker = source('src/components/game3d/weapons/weaponComboClips.js');
  assert.match(baker, /Array\.isArray\(moves\) && moves\.length \? moves/);
  assert.match(baker, /Number\.isFinite\(spec\.hilt\)/);
  const binder = source('src/components/game3d/weapons/weaponComboBinder.js');
  assert.match(binder, /comboKind === 'swordCombo' \? swordMoves\(held\) : null/);
  assert.match(binder, /\(held && swordMovesForWeapon\(held\)\) \|\| SWORD_COMBO\)/);
});
